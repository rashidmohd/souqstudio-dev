import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { consumeCode } from '@/lib/verification'
import { OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@/lib/tokens'

/**
 * E1-01 — redeem the six-digit code and mark the email verified.
 *
 * Requires a session: verification happens inside signup, so the account is
 * already known. That also means this endpoint can be specific about failures
 * without leaking anything — the caller is the account holder.
 */

const schema = z.object({
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
})

export async function POST(req: NextRequest) {
  // Verifying an email comes before enrolling in two-factor, so this must stay
  // reachable for someone who still owes enrollment — otherwise the two gates
  // point at each other.
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  // Already done. Idempotent rather than an error — a double-submitted form or a
  // second tab should not look like a failure.
  if (session.user.emailVerifiedAt) return ok({ verified: true })

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

  const result = await consumeCode(parsed.data.code, 'email_verification')

  if (!result.ok) {
    switch (result.reason) {
      case 'no_pending':
        return fail('no_pending_code', 'That code is no longer valid. Send a new one.', 410)
      case 'expired':
        return fail('code_expired', 'That code has expired. Send a new one.', 410)
      case 'too_many_attempts':
        return fail(
          'too_many_attempts',
          `Too many incorrect codes. Send a new one and try again.`,
          429
        )
      case 'wrong_code':
        return fail(
          'wrong_code',
          `That code is not right. Check your email and try again — ${OTP_MAX_ATTEMPTS} tries per code.`,
          400
        )
    }
  }

  // The code was issued to an address; verify the account that owns it. Guards
  // the case where someone changed their email between issue and redemption.
  if (result.identifier !== session.user.email) {
    return fail('no_pending_code', 'That code is no longer valid. Send a new one.', 410)
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailVerifiedAt: new Date() },
  })

  return ok({ verified: true })
}
