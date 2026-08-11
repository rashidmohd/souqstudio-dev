import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import type { Role } from '@souqstudio/types'
import type { NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { toBrandOverride, type BrandOverride } from '@/lib/brand-inheritance'
import type { VerifiedSession } from '@/lib/session'

/**
 * Who may do what, to which shop. E2-04.
 *
 * Every authorization decision in the product goes through this module. Before
 * it there were two hand-rolled `session.user.role !== 'owner'` checks and
 * nothing read `user_shop_access` at all, which was survivable only because
 * every organization had exactly one shop and one user. E2 ends that, and a
 * missing check here is a cross-tenant leak rather than a cosmetic bug.
 *
 * The file splits deliberately in two. The top half is pure — no prisma, no
 * session — and is what `authz.test.ts` covers. The bottom half are the gates
 * routes actually call, and they return `{ ok, response }` in the same shape as
 * `requireApiSession()` and `reauthenticate()` so route bodies keep reading the
 * same way down the page.
 */

export type Authorized = { ok: true } | { ok: false; response: NextResponse }
export type AuthorizedWith<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse }

// ─── Pure ─────────────────────────────────────────────────────────────────────

/** Higher includes every lower one. Rank, not identity — see canAssignRole. */
export const ROLE_RANK: Readonly<Record<Role, number>> = {
  viewer: 1,
  editor: 2,
  manager: 3,
  owner: 4,
}

const ROLES = Object.keys(ROLE_RANK) as Role[]

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value)
}

/**
 * A role read from the database, made safe. `role` is a plain String column, so
 * an unrecognised value has to resolve to *something*; `viewer` is the floor,
 * because the failure direction of a corrupt role must be less access, never
 * more.
 */
export function toRole(value: string | null | undefined): Role {
  return value && isRole(value) ? value : 'viewer'
}

export function atLeast(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

/**
 * The whole inheritance rule, in one function.
 *
 * E2-04 says the owner sees all shops automatically, and that manager, editor
 * and viewer are assigned to specific shops. So the owner is the only role with
 * implicit reach, and an org-level manager holding no grant row reaches
 * nothing. That is deliberate rather than an oversight: `users.role` is what
 * someone may be *made*, `user_shop_access` is where they may act.
 */
export function resolveRole(input: {
  orgRole: Role
  grant: { role: string | null } | null
}): Role | null {
  if (input.orgRole === 'owner') return 'owner'
  if (!input.grant) return null
  return input.grant.role ? toRole(input.grant.role) : input.orgRole
}

/**
 * Which roles an actor may hand out.
 *
 * Owner may grant anything below owner — there is exactly one path to owner and
 * it is signup. Manager may grant editor and viewer, which is E2-03's "invite
 * editors". Nobody may grant their own rank or above, so a manager cannot mint
 * a second manager and quietly widen their own blast radius.
 */
export function assignableRoles(actor: Role): Role[] {
  // Most privileged first. This list is what the role picker renders, and it
  // has to read the way the roles table in the spec does — owner, manager,
  // editor, viewer — rather than in whatever order the rank map is declared.
  return ROLES.filter((r) => r !== 'owner' && ROLE_RANK[r] < ROLE_RANK[actor]).sort(
    (a, b) => ROLE_RANK[b] - ROLE_RANK[a]
  )
}

export function canAssignRole(actor: Role, target: Role): boolean {
  return assignableRoles(actor).includes(target)
}

// ─── Gates ────────────────────────────────────────────────────────────────────

const FORBIDDEN = {
  owner: 'Only the organization owner can do that.',
  manager: 'You need to be a manager to do that.',
  editor: 'You do not have permission to do that.',
  viewer: 'You do not have permission to do that.',
} satisfies Record<Role, string>

export function requireOrgRole(session: VerifiedSession, minimum: Role): Authorized {
  if (atLeast(toRole(session.user.role), minimum)) return { ok: true }
  return { ok: false, response: fail('forbidden', FORBIDDEN[minimum], 403) }
}

export type ShopAccess = {
  shop: {
    id: string
    organizationId: string
    name: string
    location: string | null
    phone: string | null
    logoUrl: string | null
    brandKit: Prisma.JsonValue
    brandOverride: BrandOverride
    isActive: boolean
    archivedAt: Date | null
  }
  role: Role
}

/**
 * The whole editable identity of a shop, not just what a gate needs.
 *
 * `location` and `phone` are here because the shop settings form is populated
 * from this result. Omitting them does not fail — the form renders with empty
 * fields and then writes those empties back on save, silently clearing a
 * branch name and a phone number. Anything the settings screen can edit has to
 * come back from the gate that lets it in.
 */
const SHOP_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  location: true,
  phone: true,
  logoUrl: true,
  brandKit: true,
  brandOverride: true,
  isActive: true,
  archivedAt: true,
} satisfies Prisma.ShopSelect

/**
 * The only correct way to reach a shop by an id that came from a client.
 *
 * Loads by id **and** the session's organization, so a foreign id is a 404
 * rather than a leak — same answer as an id that does not exist, which is the
 * precedent already set by the teammate lookup in auth/2fa/reset. Then resolves
 * the effective role and compares it.
 *
 * `allowArchived` defaults false: an archived shop is readable through its own
 * detail route, and writable through nothing.
 */
export async function requireShopAccess(
  session: VerifiedSession,
  shopId: string,
  minimum: Role,
  options: { allowArchived?: boolean; allowInactive?: boolean } = {}
): Promise<AuthorizedWith<ShopAccess>> {
  const notFound = fail('not_found', 'That shop is not in your organization.', 404)

  const shop = await prisma.shop.findFirst({
    where: { id: shopId, organizationId: session.user.organizationId },
    select: SHOP_SELECT,
  })
  if (!shop) return { ok: false, response: notFound }

  const grant =
    session.user.role === 'owner'
      ? null
      : await prisma.userShopAccess.findUnique({
          where: { userId_shopId: { userId: session.user.id, shopId } },
          select: { role: true },
        })

  const role = resolveRole({ orgRole: toRole(session.user.role), grant })
  // No grant is indistinguishable from no shop, on purpose. Telling someone a
  // shop exists that they cannot reach is a disclosure with no upside.
  if (!role) return { ok: false, response: notFound }

  if (!atLeast(role, minimum)) {
    return { ok: false, response: fail('forbidden', FORBIDDEN[minimum], 403) }
  }

  if (shop.archivedAt && !options.allowArchived) {
    return {
      ok: false,
      response: fail('shop_archived', 'That shop has been removed.', 409),
    }
  }

  if (!shop.isActive && !options.allowInactive) {
    return {
      ok: false,
      response: fail(
        'shop_inactive',
        'That shop is deactivated. Reactivate it to make changes.',
        409
      ),
    }
  }

  return {
    ok: true,
    value: { shop: { ...shop, brandOverride: toBrandOverride(shop.brandOverride) }, role },
  }
}

/** No gate, just the answer. Null means no access at all. */
export async function effectiveRole(
  session: VerifiedSession,
  shopId: string
): Promise<Role | null> {
  if (session.user.role === 'owner') {
    const owned = await prisma.shop.count({
      where: { id: shopId, organizationId: session.user.organizationId },
    })
    return owned ? 'owner' : null
  }

  const grant = await prisma.userShopAccess.findFirst({
    where: {
      userId: session.user.id,
      shopId,
      shop: { organizationId: session.user.organizationId },
    },
    select: { role: true },
  })
  return resolveRole({ orgRole: toRole(session.user.role), grant })
}

/**
 * Every shop the session can act on.
 *
 * Returns `'all'` for an owner rather than a list, so callers build one `where`
 * clause instead of loading every id and passing it back in. `shopWhere()` is
 * what most callers actually want.
 */
export async function accessibleShopIds(
  session: VerifiedSession
): Promise<string[] | 'all'> {
  if (session.user.role === 'owner') return 'all'
  const grants = await prisma.userShopAccess.findMany({
    where: { userId: session.user.id, organizationId: session.user.organizationId },
    select: { shopId: true },
  })
  return grants.map((g) => g.shopId)
}

/**
 * The ready-made filter. Every shop list in the product goes through this, so
 * that "which shops can this person see" has exactly one implementation.
 */
export async function shopWhere(
  session: VerifiedSession,
  options: { includeArchived?: boolean; includeInactive?: boolean } = {}
): Promise<Prisma.ShopWhereInput> {
  const ids = await accessibleShopIds(session)
  return {
    organizationId: session.user.organizationId,
    ...(ids === 'all' ? {} : { id: { in: ids } }),
    // Archived is excluded by default and inactive is not, because they are
    // different statements. Archiving says "this is gone"; deactivating says
    // "this is paused" — and E2-02 puts an active/inactive badge in the shop
    // list, which it could not do if the list filtered inactive shops out.
    ...(options.includeArchived ? {} : { archivedAt: null }),
    ...(options.includeInactive === false ? { isActive: true } : {}),
  }
}

/**
 * Would removing or demoting this user leave the organization with no owner?
 *
 * Asked before every role change and every removal. An organization with no
 * owner has nobody who can pay the bill, add a shop, or invite a replacement —
 * and no self-served way back, which is the one outcome the product promises
 * cannot happen.
 */
export async function isLastOwner(
  session: VerifiedSession,
  userId: string
): Promise<boolean> {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId, removedAt: null },
    select: { role: true },
  })
  if (!target || target.role !== 'owner') return false

  const owners = await prisma.user.count({
    where: {
      organizationId: session.user.organizationId,
      role: 'owner',
      removedAt: null,
    },
  })
  return owners <= 1
}
