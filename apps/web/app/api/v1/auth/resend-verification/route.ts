import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { issueCode, retryAfterSeconds } from '@/lib/verification'
import { formatWait } from '@/lib/wait'

/**
 * Reissue a verification code. Any outstanding code for the address is consumed
 * first, so only the newest email works.
 *
 * Throttled on an escalating cooldown — 1, 3, 10 then 60 minutes — which is what
 * keeps this from being an email bomb aimed at the account holder. The wait is
 * returned so the button can show a countdown instead of failing silently.
 */
export async function POST() {
  // Same reason as verify-email: verification precedes enrollment, so this has
  // to stay reachable for someone who still owes it.
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  if (session.user.emailVerifiedAt) return ok({ sent: false, alreadyVerified: true })

  const result = await issueCode(session.user.email, 'email_verification')

  if (!result.sent) {
    return fail(
      'resend_too_soon',
      `You can ask for another code in ${formatWait(result.retryAfterSeconds)}.`,
      429,
      { 'Retry-After': String(result.retryAfterSeconds) }
    )
  }

  // The wait now applying to the *next* resend, so the button starts counting
  // down the moment this one succeeds.
  const nextWait = await retryAfterSeconds(session.user.email, 'email_verification')
  return ok({ sent: true }, 200, { 'Retry-After': String(nextWait) })
}
