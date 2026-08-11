import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { verifyCode } from '@/lib/verification'
import { OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@/lib/tokens'

/**
 * Step one of the reset: confirm the code is good, without spending it.
 *
 * The password is chosen on the next screen and submitted to /reset-password,
 * which is where the code is actually redeemed. Splitting the check from the
 * redemption is what lets the flow be two screens without a code being burned
 * by someone who changes their mind at the password step.
 */

const schema = z.object({
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
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
    return fail('invalid_code', `Enter the ${OTP_LENGTH}-digit code from your email.`, 422)
  }

  const result = await verifyCode(parsed.data.code, 'password_reset')

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

  return ok({ verified: true })
}
