import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole, requireShopAccess } from '@/lib/authz'
import { syncShopQuantity } from '@/lib/billing'
import { BRAND_OVERRIDES } from '@/lib/brand-inheritance'
import { readEffectiveBrand } from '@/lib/brand-kit'

/**
 * E2-02 — one shop: read, edit, remove.
 *
 * "Remove" is an archive and never a delete. Published offer books reference
 * their shop and a viewer opening a shared link months later must still see a
 * page, so the row stays and `archivedAt` marks it gone.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).nullable(),
    phone: z.string().trim().max(40).nullable(),
    brandOverride: z.enum(BRAND_OVERRIDES),
  })
  .partial()

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  // Archived shops stay readable through their own route — the settings screen
  // has to be able to show what was removed and when.
  const access = await requireShopAccess(session, params.id, 'viewer', {
    allowArchived: true,
    allowInactive: true,
  })
  if (!access.ok) return access.response

  const { shop } = access.value
  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  return ok({
    shop: {
      id: shop.id,
      name: shop.name,
      isActive: shop.isActive,
      archivedAt: shop.archivedAt?.toISOString() ?? null,
      brandOverride: shop.brandOverride,
    },
    brand,
    role: access.value.role,
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const access = await requireShopAccess(session, params.id, 'manager')
  if (!access.ok) return access.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }

  // Two gates in one route, deliberately. Everything else here is a shop
  // detail a manager owns; `brandOverride` forks the organization's brand,
  // which is an organization-level decision and so an owner's.
  if (parsed.data.brandOverride !== undefined) {
    const gate = requireOrgRole(session, 'owner')
    if (!gate.ok) return gate.response
  }

  // Built key by key rather than spread wholesale: `exactOptionalPropertyTypes`
  // makes an explicit `undefined` different from an absent key, and Prisma's
  // update input accepts the second but not the first.
  const { name, location, phone, brandOverride } = parsed.data
  const shop = await prisma.shop.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(brandOverride !== undefined ? { brandOverride } : {}),
    },
    select: {
      id: true,
      name: true,
      location: true,
      phone: true,
      isActive: true,
      brandOverride: true,
    },
  })

  return ok({ shop })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const access = await requireShopAccess(session, params.id, 'owner', {
    allowInactive: true,
  })
  if (!access.ok) return access.response

  // An organization with no shops has nowhere to make an offer book and no
  // self-served way back — closing the account is E2-01's job, not a side
  // effect of removing the last branch.
  const remaining = await prisma.shop.count({
    where: {
      organizationId: session.user.organizationId,
      archivedAt: null,
      id: { not: params.id },
    },
  })
  if (remaining === 0) {
    return fail(
      'last_shop',
      'This is your only shop. Add another before removing this one.',
      409
    )
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.shop.update({
      where: { id: params.id },
      data: { archivedAt: now, isActive: false, deactivatedAt: now },
    }),
    // E2-02: offer books and analytics are retained but archived. This reaches
    // into E6's table on purpose — the epic requires it, and leaving published
    // books live under a removed shop would keep serving them.
    prisma.offerBook.updateMany({
      where: { shopId: params.id, status: { not: 'archived' } },
      data: { status: 'archived' },
    }),
  ])

  try {
    await syncShopQuantity(session.user.organizationId)
  } catch {
    // Deliberately swallowed — see lib/billing.ts.
  }

  return ok({ archived: true, id: params.id })
}
