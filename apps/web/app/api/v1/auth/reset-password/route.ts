import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { hashPassword } from '@/lib/password'
import { revokeAllSessions } from '@/lib/session'
import { discardChallengesFor } from '@/lib/two-factor'
import { consumeCode } from '@/lib/verification'
import { clearFailures } from '@/lib/lockout'
import { OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@/lib/tokens'

/**
 * E1-02 — redeem the reset code and set a new password.
 */

const schema = z.object({
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
  password: z.string().min(10).max(200),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Enter the code and a password of at least 10 characters.', 422)
  }
  const { code, password } = parsed.data

  const result = await consumeCode(code, 'password_reset')
  if (!result.ok) {
    switch (result.reason) {
      case 'no_pending':
        return fail('no_pending_code', 'That code is no longer valid. Start again.', 410)
      case 'expired':
        return fail('code_expired', 'That code has expired. Start again.', 410)
      case 'too_many_attempts':
        return fail('too_many_attempts', 'Too many incorrect codes. Start again.', 429)
      case 'wrong_code':
        return fail(
          'wrong_code',
          `That code is not right. Check your email and try again — ${OTP_MAX_ATTEMPTS} tries per code.`,
          400
        )
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: result.identifier },
    select: { id: true },
  })
  // The code was valid, so the account existed when it was issued. If it is gone
  // now, say nothing useful.
  if (!user) return fail('no_pending_code', 'That code is no longer valid. Start again.', 410)

  const passwordHash = await hashPassword(password)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      // Clearing the lockout is not optional. "Forgot password" is exactly what
      // a locked-out owner reaches for, and without this they would reset
      // successfully and still be refused for another fifteen minutes with no
      // explanation on screen.
      ...clearFailures(),
      // Resetting a password is proof of inbox control, so it also verifies the
      // address — there is nothing left for a separate verification to prove.
      emailVerifiedAt: new Date(),
    },
  })

  // Whoever else was signed in is signed out. If the reset was prompted by a
  // compromise, leaving the intruder's session alive would defeat the point.
  await revokeAllSessions(user.id)

  // Pending two-factor challenges die with the sessions. revokeAllSessions does
  // not touch that table, and a challenge opened moments before the reset would
  // otherwise still be redeemable with the *old* password's authority.
  //
  // Note what is deliberately absent: this does not clear `twoFactorEnabled`.
  // A password reset is not a way around the second factor and must never
  // become one — an email-resettable 2FA is just email security wearing a
  // costume. Someone who has lost their device recovers with a backup code, or
  // their organization owner resets it for them.
  await discardChallengesFor(user.id)

  // No auto-login: they log in with the new password, which confirms it reached
  // the password manager.
  return ok({ reset: true })
}
