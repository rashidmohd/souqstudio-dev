import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { finalizeLogin } from '@/lib/login'
import { isLockedOut, registerFailure, LOCKOUT_DURATION_MS } from '@/lib/lockout'
import { TOTP_DIGITS } from '@/lib/totp'
import {
  readChallenge,
  registerChallengeFailure,
  claimChallenge,
  abandonChallenge,
  verifySecondFactor,
} from '@/lib/two-factor'

/**
 * E1-03 — the second factor at login.
 *
 * The caller holds a challenge cookie, which means they have already passed the
 * password step. They do not hold a session: a row in `sessions` means
 * authenticated, and this request is not yet.
 *
 * A wrong code counts toward the account's failed-login attempts, not just the
 * challenge's own cap. The per-challenge cap alone bounds nothing — someone
 * with the password can open challenge after challenge, five guesses each.
 * Sharing the lockout puts a real wall in front of that: five guesses per
 * fifteen minutes for the account as a whole.
 */

const schema = z.object({
  method: z.enum(['totp', 'backup']),
  code: z.string().trim().min(1).max(64),
})

const LOCKOUT_MESSAGE = `Too many failed attempts. Try again in ${Math.ceil(
  LOCKOUT_DURATION_MS / 60000
)} minutes, or reset your password.`

/** Is a challenge pending, and for which account. Drives the challenge screen. */
export async function GET() {
  const challenge = await readChallenge()
  if (!challenge) return ok({ pending: false, email: null, backupOnly: false })

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { email: true },
  })

  return ok({
    pending: true,
    // The address is shown so they know which account they are completing. Safe
    // to return: reaching here required that account's password.
    email: user?.email ?? null,
    backupOnly: false,
  })
}

export async function POST(req: NextRequest) {
  const challenge = await readChallenge()
  if (!challenge) {
    return fail(
      'no_pending_challenge',
      'That sign-in attempt has expired. Enter your email and password again.',
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
      `Enter the ${TOTP_DIGITS}-digit code from your authenticator app, or a backup code.`,
      422
    )
  }
  const { method, code } = parsed.data

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, failedLoginAttempts: true, lockedUntil: true },
  })
  if (!user) {
    return fail(
      'no_pending_challenge',
      'That sign-in attempt has expired. Enter your email and password again.',
      410
    )
  }

  if (isLockedOut(user)) return fail('account_locked', LOCKOUT_MESSAGE, 423)

  const result = await verifySecondFactor(user.id, method, code)

  if (!result.ok) {
    if (result.reason === 'not_enabled') {
      // Two-factor was switched off in another session between the password
      // step and this one. There is nothing left to prove, so let the login
      // finish rather than stranding them at a challenge that cannot pass.
      if (!(await claimChallenge(challenge.id))) {
        return fail(
          'no_pending_challenge',
          'That sign-in attempt has expired. Enter your email and password again.',
          410
        )
      }
      const { needsVerification } = await finalizeLogin(user.id, {
        rememberMe: challenge.rememberMe,
        ipHash: challenge.ipHash ?? undefined,
        userAgent: challenge.userAgent ?? undefined,
      })
      return ok({
        id: user.id,
        needsVerification,
        redirectTo: needsVerification ? '/verify-email' : null,
        backupCodesRemaining: null,
      })
    }

    // A replayed code is a *correct* code that has already been spent. It is
    // still a failed attempt — a phishing proxy replaying what it captured
    // should be counted, not waved through — but the message has to say
    // something the honest user can act on.
    const lockoutState = registerFailure(user)
    await prisma.user.update({ where: { id: user.id }, data: lockoutState })
    const { burned, attemptsRemaining } = await registerChallengeFailure(challenge.id)

    if (lockoutState.lockedUntil) return fail('account_locked', LOCKOUT_MESSAGE, 423)

    if (burned) {
      return fail(
        'too_many_attempts',
        'Too many incorrect codes. Enter your email and password again to start over.',
        429
      )
    }

    if (result.reason === 'replayed') {
      return fail(
        'code_replayed',
        'That code has already been used. Wait for your app to show a new one.',
        400
      )
    }

    return fail(
      'wrong_code',
      method === 'backup'
        ? `That backup code is not right. ${attemptsRemaining} tries left.`
        : `That code is not right. ${attemptsRemaining} tries left.`,
      400
    )
  }

  // Verified. Spend the challenge before issuing anything — if another tab beat
  // us to it, this request must not also produce a session.
  if (!(await claimChallenge(challenge.id))) {
    return fail(
      'no_pending_challenge',
      'That sign-in attempt has expired. Enter your email and password again.',
      410
    )
  }

  const { needsVerification } = await finalizeLogin(user.id, {
    rememberMe: challenge.rememberMe,
    ipHash: challenge.ipHash ?? undefined,
    userAgent: challenge.userAgent ?? undefined,
  })

  return ok({
    id: user.id,
    needsVerification,
    redirectTo: needsVerification ? '/verify-email' : null,
    // Returned only when a backup code was spent, so the screen can say how
    // many are left at the moment that fact is most useful.
    backupCodesRemaining: result.via === 'backup' ? result.backupCodesRemaining : null,
  })
}

/** "Use a different account" — abandon the challenge and clear the cookie. */
export async function DELETE() {
  await abandonChallenge()
  return ok({ abandoned: true })
}
