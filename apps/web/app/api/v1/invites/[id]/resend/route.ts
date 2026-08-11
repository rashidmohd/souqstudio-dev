import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole, toRole } from '@/lib/authz'
import { issueInvite, retryAfterSeconds, sendInviteEmail, toShopGrants } from '@/lib/invites'
import type { Role } from '@souqstudio/types'

/**
 * E2-03 — send the invitation again.
 *
 * Also the answer to "resend expired invite": `issueInvite` rotates the token
 * and resets the clock on the same row, so an invitation that lapsed over a
 * weekend is revived rather than recreated. One code path, one place for the
 * cooldown to live.
 */

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'manager')
  if (!gate.ok) return gate.response

  const invite = await prisma.invite.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: {
      id: true,
      email: true,
      role: true,
      shopGrants: true,
      acceptedAt: true,
      lastSentAt: true,
      resendCount: true,
      organization: { select: { name: true } },
    },
  })
  if (!invite) {
    return fail('not_found', 'That invitation is not in your organization.', 404)
  }

  if (invite.acceptedAt) {
    return fail('already_accepted', 'They have already joined.', 409)
  }

  const wait = retryAfterSeconds(invite)
  if (wait > 0) {
    return fail(
      'too_soon',
      `That invitation was just sent. Try again in ${Math.ceil(wait / 60)} minutes.`,
      429,
      { 'Retry-After': String(wait) }
    )
  }

  const role = toRole(invite.role)
  if (role === 'owner') {
    // Not reachable through the create route, which rejects owner outright.
    // Guarded anyway: this row could predate a schema change, and issuing an
    // owner invitation is the one mistake with no way back.
    return fail('invalid_role', 'That invitation cannot be resent.', 422)
  }

  const reissued = await issueInvite({
    organizationId: session.user.organizationId,
    email: invite.email,
    role: role as Exclude<Role, 'owner'>,
    shopGrants: toShopGrants(invite.shopGrants),
    invitedById: session.user.id,
  })

  try {
    await sendInviteEmail({
      to: reissued.email,
      token: reissued.token,
      inviterName: session.user.name ?? session.user.email,
      organizationName: invite.organization.name,
      role,
    })
  } catch {
    return fail(
      'send_failed',
      'The invitation could not be sent just now. Try again in a moment.',
      502
    )
  }

  return ok({
    invite: {
      id: reissued.id,
      email: reissued.email,
      role: reissued.role,
      status: 'pending',
      expiresAt: reissued.expiresAt.toISOString(),
    },
  })
}
