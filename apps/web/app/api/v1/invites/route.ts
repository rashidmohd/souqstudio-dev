import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { canAssignRole, requireOrgRole, requireShopAccess, toRole } from '@/lib/authz'
import { assertUserLimit } from '@/lib/billing'
import {
  inviteStatus,
  issueInvite,
  retryAfterSeconds,
  sendInviteEmail,
  toShopGrants,
} from '@/lib/invites'

/**
 * E2-03 — invite someone, and see who is still pending.
 */

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['manager', 'editor', 'viewer']),
  shopIds: z.array(z.string().min(1)).max(50).default([]),
})

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'manager')
  if (!gate.ok) return gate.response

  const invites = await prisma.invite.findMany({
    where: { organizationId: session.user.organizationId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      lastSentAt: true,
      resendCount: true,
    },
  })

  return ok({
    items: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: inviteStatus(invite),
      expiresAt: invite.expiresAt.toISOString(),
      retryAfterSeconds: retryAfterSeconds(invite),
    })),
    nextCursor: null,
  })
}

export async function POST(req: NextRequest) {
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Enter an email address and choose a role.', 422)
  }
  const { email, role, shopIds } = parsed.data

  // Nobody hands out their own rank or above. A manager inviting a manager
  // would widen their own blast radius without an owner deciding to, and
  // `owner` is not in the schema at all — signup is the only path to it.
  if (!canAssignRole(toRole(session.user.role), role)) {
    return fail('forbidden', `You cannot invite someone as a ${role}.`, 403)
  }

  // E3-01: the plan includes a number of people, and an outstanding invite is a
  // seat that is spoken for. Checked before the shop grants so the answer does
  // not depend on how many shops were named.
  const seats = await assertUserLimit(session.user.organizationId)
  if (!seats.ok) {
    return fail(
      'user_limit_reached',
      `Your plan covers ${seats.limit} people. Upgrade to invite another.`,
      409
    )
  }

  // Every shop named has to be one the inviter manages. An owner passes
  // trivially; a manager cannot hand out access to a branch they do not run.
  for (const shopId of shopIds) {
    const access = await requireShopAccess(session, shopId, 'manager', {
      allowInactive: true,
    })
    if (!access.ok) return access.response
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, organizationId: true, removedAt: true, role: true },
  })

  if (existing && existing.organizationId === session.user.organizationId) {
    if (!existing.removedAt) {
      return fail('already_member', 'They are already on your team.', 409)
    }

    // Previously removed, same organization. Re-inviting restores them rather
    // than sending a link to set a password they already have. Their sessions
    // stay dead until they log in again, which is correct — the removal did
    // that, and this is a new decision to let them back in.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: { removedAt: null, role },
      }),
      prisma.userShopAccess.deleteMany({ where: { userId: existing.id } }),
      prisma.userShopAccess.createMany({
        data: shopIds.map((shopId) => ({
          userId: existing.id,
          shopId,
          organizationId: session.user.organizationId,
          grantedById: session.user.id,
        })),
      }),
    ])

    return ok({ reactivated: true, userId: existing.id })
  }

  if (existing) {
    // Globally unique email. A consultant working with two chains cannot be in
    // both, and an address freed by a removal in one organization is still
    // claimed. A real product limit, surfaced honestly rather than as a
    // mysterious failure — see the plan's open questions.
    return fail(
      'email_in_use',
      'That email already belongs to a SouqStudio account. Ask them to use a different address.',
      409
    )
  }

  const outstanding = await prisma.invite.findUnique({
    where: { organizationId_email: { organizationId: session.user.organizationId, email } },
    select: { lastSentAt: true, resendCount: true },
  })
  const wait = retryAfterSeconds(outstanding)
  if (wait > 0) {
    return fail(
      'too_soon',
      `An invitation was just sent to that address. Try again in ${Math.ceil(wait / 60)} minutes.`,
      429,
      { 'Retry-After': String(wait) }
    )
  }

  const invite = await issueInvite({
    organizationId: session.user.organizationId,
    email,
    role,
    shopGrants: shopIds.map((shopId) => ({ shopId })),
    invitedById: session.user.id,
  })

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  })

  // Degrade rather than fail: the row is written and "resend" exists for
  // exactly this. Refusing the whole request would leave an invite they can
  // see but were told did not happen.
  let sent = true
  try {
    await sendInviteEmail({
      to: invite.email,
      token: invite.token,
      inviterName: session.user.name ?? session.user.email,
      organizationName: organization?.name ?? 'your organization',
      role,
    })
  } catch {
    sent = false
  }

  return ok(
    {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: 'pending',
        expiresAt: invite.expiresAt.toISOString(),
      },
      sent,
    },
    201
  )
}
