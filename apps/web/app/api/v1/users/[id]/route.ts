import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { canAssignRole, isLastOwner, requireOrgRole, toRole } from '@/lib/authz'
import { revokeAllSessions } from '@/lib/session'

/**
 * E2-03 — change someone's role, or remove them.
 *
 * Both are owner-only and both are guarded against the two ways an
 * organization can lock itself out: demoting the last owner, and an owner
 * acting on themselves. Neither has a self-served way back, and "self-served,
 * always" is the promise in the root CLAUDE.md.
 */

const patchSchema = z.object({ role: z.enum(['manager', 'editor', 'viewer']) })

type Params = { params: { id: string } }

async function loadTeammate(organizationId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, email: true, name: true, role: true, removedAt: true },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  if (params.id === session.user.id) {
    return fail(
      'cannot_change_own_role',
      'You cannot change your own role. Ask another owner to do it.',
      409
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail('invalid_input', 'Choose a role.', 422)

  const target = await loadTeammate(session.user.organizationId, params.id)
  if (!target || target.removedAt) {
    return fail('not_found', 'That teammate is not in your organization.', 404)
  }

  if (!canAssignRole(toRole(session.user.role), parsed.data.role)) {
    return fail('forbidden', `You cannot make someone a ${parsed.data.role}.`, 403)
  }

  if (await isLastOwner(session, target.id)) {
    return fail(
      'last_owner',
      'They are the only owner. Make someone else an owner first.',
      409
    )
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
    select: { id: true, email: true, name: true, role: true },
  })

  return ok({ user })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  if (params.id === session.user.id) {
    return fail(
      'cannot_remove_self',
      'You cannot remove yourself. Ask another owner to do it.',
      409
    )
  }

  const target = await loadTeammate(session.user.organizationId, params.id)
  if (!target || target.removedAt) {
    return fail('not_found', 'That teammate is not in your organization.', 404)
  }

  if (await isLastOwner(session, target.id)) {
    return fail(
      'last_owner',
      'They are the only owner. Make someone else an owner first.',
      409
    )
  }

  // Soft. Offer books, analytics and sessions reference this row, and a hard
  // delete would have to cascade through five tables to succeed.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { removedAt: new Date() },
    }),
    prisma.userShopAccess.deleteMany({ where: { userId: target.id } }),
  ])

  // Access ends now, not at their next login. `revokeAllSessions` bumps
  // tokenVersion as well as killing the rows, which is what makes it
  // impossible to miss one. getSession() also refuses a removed user, so this
  // is belt and braces on the one action where that is warranted.
  await revokeAllSessions(target.id)

  return ok({ removed: true, id: target.id })
}
