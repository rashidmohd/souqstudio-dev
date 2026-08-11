import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { findInviteByToken, inviteStatus, isRedeemable, toShopGrants } from '@/lib/invites'
import { completeLogin } from '@/lib/login'
import { hashPassword } from '@/lib/password'

/**
 * E2-03 — read an invitation, and accept it.
 *
 * **Both handlers are public.** Someone accepting an invitation has no account
 * and therefore no session; the token in the URL is the credential, and it is
 * the only one there can be. `/invite/` is in middleware's public list for the
 * same reason.
 */

const MIN_PASSWORD_LENGTH = 10

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(MIN_PASSWORD_LENGTH),
})

/** What the accept screen needs to say who invited them and to what. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return fail('invalid_input', 'That invitation link is incomplete.', 422)

  const invite = await findInviteByToken(token)
  // One answer for "no such token" and "token belongs to a revoked invite the
  // caller should not learn about". Distinguishing them turns this into an
  // oracle for guessing tokens.
  if (!invite) {
    return fail('not_found', 'That invitation link is not valid.', 404)
  }

  const status = inviteStatus(invite)
  if (status !== 'pending') {
    return fail(
      status === 'accepted' ? 'already_accepted' : 'invite_unusable',
      status === 'accepted'
        ? 'That invitation has already been used. Log in instead.'
        : status === 'expired'
          ? 'That invitation has expired. Ask for a new one.'
          : 'That invitation was withdrawn.',
      410
    )
  }

  return ok({
    organizationName: invite.organization.name,
    inviterName: invite.invitedBy.name ?? invite.invitedBy.email,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) {
    return fail(
      'invalid_input',
      `Enter your name and choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      422
    )
  }

  const invite = await findInviteByToken(parsed.data.token)
  if (!invite || !isRedeemable(invite)) {
    return fail('invite_unusable', 'That invitation is no longer valid.', 410)
  }

  // The address may have been claimed between the invitation and the click.
  const taken = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  })
  if (taken) {
    return fail(
      'email_taken',
      'An account already exists for that email address. Log in instead.',
      409
    )
  }

  const passwordHash = await hashPassword(parsed.data.password)
  const grants = toShopGrants(invite.shopGrants)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        organizationId: invite.organizationId,
        email: invite.email,
        name: parsed.data.name,
        passwordHash,
        role: invite.role,
        // Following the link *is* proof of address control — the token went to
        // that inbox and nowhere else. Sending them through E1's verification
        // flow afterwards would be asking them to prove it twice.
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    })

    if (grants.length > 0) {
      await tx.userShopAccess.createMany({
        data: grants.map((grant) => ({
          userId: created.id,
          shopId: grant.shopId,
          organizationId: invite.organizationId,
          ...(grant.role ? { role: grant.role } : {}),
          grantedById: invite.invitedById ?? null,
        })),
        // A grant for a shop archived since the invitation was sent would
        // otherwise fail the whole transaction and strand them outside an
        // organization that is expecting them.
        skipDuplicates: true,
      })
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })

    return created
  })

  // Through completeLogin, not issueSession. An account created a moment ago
  // cannot have two-factor on, so the check is a no-op today — but routing
  // around the one function that performs it is how a future path quietly
  // learns to skip the second factor.
  await completeLogin(user.id)

  return ok({ id: user.id, email: user.email }, 201)
}
