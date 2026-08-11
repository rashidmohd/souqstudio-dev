import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { reauthenticate } from '@/lib/reauth'
import { revokeOtherSessions } from '@/lib/session'
import { disableTwoFactor } from '@/lib/two-factor'

/**
 * E1-03 — turn two-factor off.
 *
 * POST rather than DELETE: it takes a body, no other route in this codebase
 * uses DELETE with one, and some proxies drop it.
 *
 * Needs the password *and* a live second factor. A stolen session plus a known
 * password is exactly the attack two-factor exists to survive, so switching it
 * off must cost more than the thing it protects against.
 */

const schema = z.object({
  password: z.string().min(1),
  method: z.enum(['totp', 'backup']),
  code: z.string().trim().min(1).max(64),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail(
      'invalid_input',
      'Enter your password and a code from your authenticator app or a backup code.',
      422
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  })
  if (!user?.twoFactorEnabled) {
    return fail('not_enabled', 'Two-factor authentication is not on for this account.', 409)
  }

  // The owner turned this on for everyone, themselves included. Exempting them
  // would make the one account that sets the policy the one account not bound
  // by it. They turn the policy off first — which is itself gated on a live
  // second factor.
  if (session.user.organizationRequiresTwoFactor) {
    return fail(
      'two_factor_required_by_org',
      'Your organization requires two-factor authentication, so it cannot be turned off.',
      403
    )
  }

  const reauth = await reauthenticate(session.user.id, parsed.data, {
    requireSecondFactor: true,
  })
  if (!reauth.ok) return reauth.response

  await disableTwoFactor(session.user.id)
  const otherSessionsRevoked = await revokeOtherSessions(session.user.id, session.sessionId)

  return ok({ enabled: false, otherSessionsRevoked })
}
