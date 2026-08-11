import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { accessibleShopIds, requireOrgRole, requireShopAccess, toRole } from '@/lib/authz'

/**
 * E2-04 — which shops someone can reach, and with what role in each.
 *
 * Separate from the role route because the gates differ: the organization role
 * is the owner's to set, per-shop access is delegable to a manager. One route
 * with both gates inside a single Zod object is where a role-escalation bug
 * lives, so they are two.
 *
 * Access changes take effect immediately — there is nothing cached and no
 * session to refresh, because `requireShopAccess` reads the grant on every
 * request.
 */

const schema = z.object({
  grants: z
    .array(
      z.object({
        shopId: z.string().min(1),
        role: z.enum(['manager', 'editor', 'viewer']).optional(),
      })
    )
    .max(100),
})

type Params = { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'manager')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return fail('invalid_input', 'Choose which shops they can use.', 422)

  const target = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId, removedAt: null },
    select: { id: true, role: true },
  })
  if (!target) {
    return fail('not_found', 'That teammate is not in your organization.', 404)
  }

  if (toRole(target.role) === 'owner') {
    return fail(
      'owner_has_all_shops',
      'The owner already has access to every shop.',
      409
    )
  }

  // Every shop being granted must be one the actor manages.
  for (const grant of parsed.data.grants) {
    const access = await requireShopAccess(session, grant.shopId, 'manager', {
      allowInactive: true,
    })
    if (!access.ok) return access.response
  }

  // **The replace is scoped to what the actor can see.** A manager submits the
  // shops they run; taking that as the whole truth would silently strip grants
  // an owner made for branches the manager cannot even list. So the delete
  // covers only their own scope, and an owner's scope is everything.
  const scope = await accessibleShopIds(session)

  await prisma.$transaction([
    prisma.userShopAccess.deleteMany({
      where: {
        userId: target.id,
        organizationId: session.user.organizationId,
        ...(scope === 'all' ? {} : { shopId: { in: scope } }),
      },
    }),
    prisma.userShopAccess.createMany({
      data: parsed.data.grants.map((grant) => ({
        userId: target.id,
        shopId: grant.shopId,
        organizationId: session.user.organizationId,
        ...(grant.role ? { role: grant.role } : {}),
        grantedById: session.user.id,
      })),
      skipDuplicates: true,
    }),
  ])

  const grants = await prisma.userShopAccess.findMany({
    where: { userId: target.id },
    select: { shopId: true, role: true, shop: { select: { name: true } } },
  })

  return ok({
    grants: grants.map((grant) => ({
      shopId: grant.shopId,
      name: grant.shop.name,
      role: grant.role ? toRole(grant.role) : toRole(target.role),
    })),
  })
}
