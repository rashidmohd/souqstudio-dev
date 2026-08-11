import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { verifyPassword, burnPasswordTiming } from '@/lib/password'
import { completeLogin } from '@/lib/login'
import { isLockedOut, registerFailure, LOCKOUT_DURATION_MS } from '@/lib/lockout'

/**
 * E1-02 login. Password only — Google OAuth is handled by next-auth and lands
 * on the same session layer.
 *
 * Every failure returns the same code and message. Distinguishing "no such
 * account" from "wrong password" turns the form into an account enumerator.
 *
 * The password is only half of it when E1-03 two-factor is on. What happens
 * after a correct password belongs to lib/login.ts, which is the only place
 * allowed to issue a session — see the note there about the Google handler.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
})

const INVALID_MESSAGE = 'That email and password do not match. Check both and try again.'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_credentials', INVALID_MESSAGE, 401)
  }
  const { email, password, rememberMe = false } = parsed.data

  const user = await prisma.user.findUnique({
    where: { email },
    // Only what the *password* decision needs. Two-factor and verification
    // state are read by lib/login.ts, which owns what happens next.
    select: {
      id: true,
      passwordHash: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  })

  // No account, or a Google-only account with no password set. Burn the same
  // time a real comparison costs — answering in microseconds here tells an
  // attacker exactly which addresses are registered.
  if (!user?.passwordHash) {
    await burnPasswordTiming(password)
    return fail('invalid_credentials', INVALID_MESSAGE, 401)
  }

  if (isLockedOut(user)) {
    return fail(
      'account_locked',
      `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutes, or reset your password.`,
      423
    )
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const next = registerFailure(user)
    await prisma.user.update({ where: { id: user.id }, data: next })

    // Say so on the attempt that trips it, rather than letting the next attempt
    // fail for a reason the owner cannot see.
    if (next.lockedUntil) {
      return fail(
        'account_locked',
        `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutes, or reset your password.`,
        423
      )
    }
    return fail('invalid_credentials', INVALID_MESSAGE, 401)
  }

  // Note what is *not* here any more: clearing the lockout counter and stamping
  // lastLoginAt. Both moved into lib/login.ts, to the point where a login
  // actually completes. Clearing them on a correct password would let someone
  // holding the password reset the counter on every attempt, and the counter is
  // the only real bound on guessing the second factor.
  const outcome = await completeLogin(user.id, {
    rememberMe,
    ipHash: hashClientIp(req),
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  if (outcome.status === 'two_factor_required') {
    // This tells the caller the account has two-factor on — but only after they
    // supplied the right password, and the next screen has to ask for a code
    // regardless. No new enumeration.
    return ok({ twoFactorRequired: true, redirectTo: '/login/2fa' })
  }

  // An owner who never finished verifying goes back to it rather than to a
  // dashboard they cannot use. The client honours this over its own `next`.
  // Only advisory — the actual rule is requireVerifiedSession() on the routes
  // that need it, since a client can ignore anything we return here.
  if (outcome.needsVerification) {
    return ok({ id: user.id, needsVerification: true, redirectTo: '/verify-email' })
  }

  return ok({ id: user.id, needsVerification: false })
}

function hashClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim()
  if (!ip) return undefined
  return createHash('sha256').update(ip).digest('hex')
}
