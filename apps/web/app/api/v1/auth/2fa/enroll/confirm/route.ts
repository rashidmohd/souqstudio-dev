import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { revokeOtherSessions } from '@/lib/session'
import { sealSecret } from '@/lib/two-factor-secret'
import { verifyTotp, TOTP_DIGITS } from '@/lib/totp'
import {
  readEnrollment,
  registerEnrollmentFailure,
  enableTwoFactor,
  clearEnrollmentCookie,
} from '@/lib/two-factor'

/**
 * E1-03 — prove the authenticator app holds the secret, and switch two-factor on.
 *
 * Returns the backup codes. This is one of exactly two responses in the product
 * that ever carries them in plaintext, and there is no way to ask for them
 * again — see backup-codes/route.ts.
 */

const schema = z.object({
  code: z.string().trim().regex(new RegExp(`^\\d{${TOTP_DIGITS}}$`)),
})

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  const enrollment = await readEnrollment(session.user.id)
  if (!enrollment) {
    return fail(
      'no_pending_enrollment',
      'That setup has expired. Start again to get a new QR code.',
      410
    )
  }

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
      `Enter the ${TOTP_DIGITS}-digit code from your authenticator app.`,
      422
    )
  }

  const result = await verifyTotp(enrollment.secret, parsed.data.code)
  if (!result.valid) {
    const { burned, attemptsRemaining } = await registerEnrollmentFailure(enrollment.id)
    if (burned) {
      await clearEnrollmentCookie()
      return fail(
        'too_many_attempts',
        'Too many incorrect codes. Start setup again to get a new QR code.',
        429
      )
    }
    return fail(
      'wrong_code',
      `That code is not right. Check your app and try again — ${attemptsRemaining} tries left.`,
      400
    )
  }

  // The confirming code is recorded as the replay watermark: it has been used,
  // and without this it would still work at the login challenge for the next
  // thirty seconds.
  const backupCodes = await enableTwoFactor(
    session.user.id,
    sealSecret(enrollment.secret),
    enrollment.id,
    result.timeStep
  )

  await clearEnrollmentCookie()

  // Every other session predates the change and its assurance level just
  // dropped. This one stays — the person holding it has just proved themselves.
  const otherSessionsRevoked = await revokeOtherSessions(session.user.id, session.sessionId)

  return ok({ enabled: true, backupCodes, otherSessionsRevoked }, 200, NO_STORE)
}
