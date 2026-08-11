import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'

/**
 * E2-03 — withdraw a pending invitation.
 *
 * Revoked rather than deleted, so the link in the recipient's inbox stops
 * working and the fact that it was sent at all survives. Deleting the row would
 * also free the unique constraint, which is the one thing keeping "invite" and
 * "resend" a single code path.
 */

type Params = { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'manager')
  if (!gate.ok) return gate.response

  // Scoped by organization in the same query as the id — never look it up and
  // then compare, which is the shape that leaves a window for a mistake.
  const invite = await prisma.invite.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, acceptedAt: true },
  })
  if (!invite) {
    return fail('not_found', 'That invitation is not in your organization.', 404)
  }

  if (invite.acceptedAt) {
    return fail(
      'already_accepted',
      'They have already joined. Remove them from the team instead.',
      409
    )
  }

  await prisma.invite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  })

  return ok({ revoked: true, id: invite.id })
}
