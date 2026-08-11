import 'server-only'

import { prisma } from '@souqstudio/db'
import type { BrandKit, Role } from '@souqstudio/types'
import { cookies } from 'next/headers'
import { accessibleShopIds, resolveRole, toRole } from '@/lib/authz'
import { toBrandOverride, type BrandOverride } from '@/lib/brand-inheritance'
import { env } from '@/lib/env'
import type { VerifiedSession } from '@/lib/session'

/**
 * Which shop a session is acting on. E2-02, E2-04.
 *
 * This replaces `primaryShopFor()`, whose answer was "the organization's oldest
 * shop" — correct while every organization had exactly one, and silently wrong
 * the moment E2 lets someone add a second.
 *
 * **A cookie, deliberately, and not the alternatives.** Not a session row:
 * lib/session.ts is the sole writer to that table by policy, and switching
 * shops must not rewrite a session. Not zustand: the entire dashboard is server
 * components, which cannot read a client store. Not a URL segment: the shop
 * scope spans four rail destinations plus the editor, so putting it in the path
 * means rewriting every link in the product to carry it.
 *
 * The cookie is a *hint*, never an authorization. It is client-controlled, so
 * every read re-checks it against what the session can actually reach.
 */

export const ACTIVE_SHOP_COOKIE = 'sq_shop'

export type ActiveShop = {
  id: string
  organizationId: string
  name: string
  logoUrl: string | null
  brandKit: BrandKit
  brandOverride: BrandOverride
  isActive: boolean
  archivedAt: Date | null
  /** The session's effective role *on this shop*, already resolved. */
  role: Role
}

const SELECT = {
  id: true,
  organizationId: true,
  name: true,
  logoUrl: true,
  brandKit: true,
  brandOverride: true,
  isActive: true,
  archivedAt: true,
} as const

function shape(
  shop: {
    id: string
    organizationId: string
    name: string
    logoUrl: string | null
    brandKit: unknown
    brandOverride: string
    isActive: boolean
    archivedAt: Date | null
  },
  role: Role
): ActiveShop {
  return {
    ...shop,
    brandKit: (shop.brandKit ?? {}) as BrandKit,
    brandOverride: toBrandOverride(shop.brandOverride),
    role,
  }
}

/**
 * Resolve the active shop, or null when the session can reach none.
 *
 * Order: the cookie if it still points at something reachable, otherwise the
 * oldest non-archived shop the session can reach.
 *
 * **The fallback is byte-for-byte what `primaryShopFor()` returned** for a
 * single-shop organization with no cookie — same table, same `createdAt asc`
 * ordering. The only difference is that archived shops are excluded, and no
 * shop is archived until E2-02 ships. That equivalence is what lets onboarding,
 * the brand wizard, logo upload, the checklist and home switch over without
 * behaving differently for any account that exists today.
 */
export async function getActiveShop(session: VerifiedSession): Promise<ActiveShop | null> {
  const orgRole = toRole(session.user.role)
  const requested = cookies().get(ACTIVE_SHOP_COOKIE)?.value

  if (requested) {
    const shop = await prisma.shop.findFirst({
      where: {
        id: requested,
        organizationId: session.user.organizationId,
        archivedAt: null,
      },
      select: SELECT,
    })

    if (shop) {
      const grant =
        orgRole === 'owner'
          ? null
          : await prisma.userShopAccess.findUnique({
              where: { userId_shopId: { userId: session.user.id, shopId: shop.id } },
              select: { role: true },
            })
      const role = resolveRole({ orgRole, grant })
      // A stale or forged cookie falls through to the default rather than
      // erroring. Someone whose access to one branch was just revoked should
      // land on a branch they can use, not on a wall.
      if (role) return shape(shop, role)
    }
  }

  const ids = await accessibleShopIds(session)
  if (ids !== 'all' && ids.length === 0) return null

  const shop = await prisma.shop.findFirst({
    where: {
      organizationId: session.user.organizationId,
      archivedAt: null,
      ...(ids === 'all' ? {} : { id: { in: ids } }),
    },
    orderBy: { createdAt: 'asc' },
    select: SELECT,
  })
  if (!shop) return null

  const grant =
    orgRole === 'owner'
      ? null
      : await prisma.userShopAccess.findUnique({
          where: { userId_shopId: { userId: session.user.id, shopId: shop.id } },
          select: { role: true },
        })
  const role = resolveRole({ orgRole, grant })
  if (!role) return null

  return shape(shop, role)
}

/**
 * Point the session at a shop. Route handlers and server actions only — a
 * server component cannot write cookies.
 *
 * No expiry: this is a preference, not a credential, and it should survive a
 * browser restart the way the shop owner's mental model does. `httpOnly`
 * anyway, because nothing client-side needs to read it and the server is where
 * it is validated.
 */
export function setActiveShopCookie(shopId: string): void {
  cookies().set(ACTIVE_SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  })
}

export function clearActiveShopCookie(): void {
  cookies().delete(ACTIVE_SHOP_COOKIE)
}
