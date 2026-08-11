import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { cancelSubscription, resumeSubscription } from '@/lib/subscription'

/**
 * E3-01 — cancelling, and changing your mind.
 *
 * Self-served in both directions, which is the point: "no call to cancel" is
 * only true if the undo is equally self-served. Nobody should have to email
 * support because they cancelled by accident on a Friday night.
 *
 * The cancellation is never immediate — access runs to the end of the paid
 * period. `lib/subscription.ts` explains why, and the confirmation screen says
 * so before this route is called.
 */

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  // Explicit confirmation, in the request rather than assumed from the method.
  // E3-01 requires a confirmation step with a consequence summary; this makes a
  // stray DELETE from a client that skipped that screen a 422 rather than a
  // cancelled subscription.
  if (req.nextUrl.searchParams.get('confirm') !== 'true') {
    return fail('confirmation_required', 'Confirm the cancellation to continue.', 422)
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const result = await cancelSubscription(organization)
  if (!result.ok) {
    return fail('no_subscription', 'There is no subscription to cancel.', 409)
  }

  return ok({ cancelAtPeriodEnd: true, accessUntil: result.accessUntil.toISOString() })
}

/** Undo a cancellation that has not taken effect yet. */
export async function POST() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const result = await resumeSubscription(organization)
  if (!result.ok) {
    return fail('no_subscription', 'There is no subscription to resume.', 409)
  }

  return ok({ cancelAtPeriodEnd: false, renewsOn: result.accessUntil.toISOString() })
}
