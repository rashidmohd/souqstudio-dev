import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { canAssignRole, requireShopAccess, toRole } from '@/lib/authz'

/**
 * E2-04 — who can reach this shop, and with what role.
 *
 * The mirror of `PUT /users/:id/shops`. Both write `user_shop_access`; they
 * differ in which side is fixed, which is also which authorization question
 * gets asked. This one fixes the shop, so the gate is "do you manage *this*
 * shop" — and that is what makes it the right route for the shop settings
 * screen, where a manager who runs one branch should be able to staff it
 * without being able to see the rest of the organization's grants.
 *
 * The submitted list is the complete membership of this shop. Anyone left out
 * loses access. That is safe here in a way it is not on the user-centric route,
 * because a manager of this shop can see every grant on it — there is nothing
 * outside their view to strip by accident.
 */

const schema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string().min(1),
        /** Absent means "use their organization role" — the column stays null. */
        role: z.enum(['manager', 'editor', 'viewer']).optional(),
      })
    )
    .max(200),
})

type Params = { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const access = await requireShopAccess(session, params.id, 'manager', {
    allowInactive: true,
  })
  if (!access.ok) return access.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Choose who can use this shop.', 422)
  }

  const members = parsed.data.members
  const ids = members.map((m) => m.userId)
  if (new Set(ids).size !== ids.length) {
    return fail('duplicate_member', 'Someone appears twice in that list.', 422)
  }

  // Everyone named must be a current member of this organization. One query,
  // scoped by organization — never look them up and compare afterwards.
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      organizationId: session.user.organizationId,
      removedAt: null,
    },
    select: { id: true, role: true },
  })
  if (users.length !== ids.length) {
    return fail('not_found', 'Someone on that list is not in your organization.', 404)
  }

  const actorRole = toRole(session.user.role)
  for (const member of members) {
    const user = users.find((u) => u.id === member.userId)
    // The owner reaches every shop implicitly and holds no grant row. Writing
    // one would be inert at best and misleading at worst.
    if (user && toRole(user.role) === 'owner') {
      return fail(
        'owner_has_all_shops',
        'The owner already has access to every shop.',
        409
      )
    }
    // A per-shop role is still a role being handed out, so the same ceiling
    // applies: nobody grants their own rank or above.
    if (member.role && !canAssignRole(actorRole, member.role)) {
      return fail('forbidden', `You cannot give someone the ${member.role} role.`, 403)
    }
  }

  await prisma.$transaction([
    prisma.userShopAccess.deleteMany({ where: { shopId: params.id } }),
    prisma.userShopAccess.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        shopId: params.id,
        organizationId: session.user.organizationId,
        ...(member.role ? { role: member.role } : {}),
        grantedById: session.user.id,
      })),
      skipDuplicates: true,
    }),
  ])

  const grants = await prisma.userShopAccess.findMany({
    where: { shopId: params.id },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true, role: true } },
    },
  })

  return ok({
    members: grants.map((grant) => ({
      userId: grant.userId,
      name: grant.user.name,
      email: grant.user.email,
      role: grant.role ? toRole(grant.role) : toRole(grant.user.role),
    })),
  })
}
