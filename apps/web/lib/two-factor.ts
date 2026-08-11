import 'server-only'

import { prisma } from '@souqstudio/db'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { generateToken, hashToken, expiryFrom } from '@/lib/tokens'
import { openSecret } from '@/lib/two-factor-secret'
import { verifyTotp } from '@/lib/totp'
import {
  BACKUP_CODE_COUNT,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from '@/lib/backup-codes'
import type { SessionUser } from '@/lib/session'

/**
 * Two-factor authentication state. E1-03.
 *
 * The stateful half — challenges, enrollments, backup codes, and the user
 * columns that back them. Policy that needs no database lives in lib/totp.ts
 * and lib/backup-codes.ts so it can be tested on its own.
 *
 * **Everything single-use in here is claimed by compare-and-set**: an
 * `updateMany` whose `where` carries the "not yet spent" condition, followed by
 * a check that exactly one row changed. Under READ COMMITTED that is atomic at
 * the row level, so two requests racing the same code produce exactly one
 * winner. Reading a row, deciding, then writing would let both through.
 *
 * See souqstudio-technical → references/auth.md.
 */

/** Names the pending login challenge. Set only after a correct password. */
export const TWO_FACTOR_CHALLENGE_COOKIE = 'sq_2fa'
/** Names an enrollment in progress. Set only inside an authenticated session. */
export const TWO_FACTOR_ENROLL_COOKIE = 'sq_2fa_enroll'

/**
 * Five minutes. A TOTP step is thirty seconds and opening an authenticator app
 * takes well under a minute; five covers "the phone was in another room".
 * Longer leaves a password-authenticated handle lying around to no purpose —
 * starting again costs one password entry.
 */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

/**
 * Fifteen minutes, matching EMAIL_VERIFICATION_TTL_MS for the same reason:
 * enough to switch to a phone and back. Someone installing an authenticator
 * from scratch will exceed it, and restarting is one button that issues a
 * fresh secret — which is the right outcome anyway.
 */
export const ENROLLMENT_TTL_MS = 15 * 60 * 1000

/**
 * Wrong codes per challenge before the row burns and a fresh password login is
 * required.
 *
 * The same number as OTP_MAX_ATTEMPTS and deliberately a separate constant:
 * different policy, and sharing one would mean a future change to email codes
 * silently changed the second factor too.
 *
 * This cap is not the real bound. Someone holding the password can mint
 * unlimited challenges, five guesses each, which against a million codes is a
 * certainty given time. The bound that matters is that a wrong code also counts
 * toward `users.failedLoginAttempts` — see lib/login.ts.
 */
export const CHALLENGE_MAX_ATTEMPTS = 5

/** Wrong codes allowed while confirming a new secret, before it is discarded. */
export const ENROLLMENT_MAX_ATTEMPTS = 5

export type PendingChallenge = {
  id: string
  userId: string
  attempts: number
  rememberMe: boolean
  ipHash: string | null
  userAgent: string | null
}

export type PendingEnrollment = {
  id: string
  /** Already opened — ready for lib/totp.ts, not for storage. */
  secret: string
  attempts: number
}

export type SecondFactorMethod = 'totp' | 'backup'

export type SecondFactorResult =
  | { ok: true; via: SecondFactorMethod; backupCodesRemaining: number }
  | { ok: false; reason: 'wrong_code' | 'replayed' | 'not_enabled' }

// ─── Cookies ──────────────────────────────────────────────────────────────────

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  }
}

// ─── Login challenge ──────────────────────────────────────────────────────────

/**
 * Open a challenge for a user who has passed the password step.
 *
 * The login intent captured at that step rides along on the row, so that when
 * the second factor lands `issueSession` receives exactly what it would have
 * received had there been no second factor at all. Losing `rememberMe` here is
 * the kind of bug that only shows up as "it keeps signing me out".
 */
export async function issueChallenge(
  userId: string,
  login: {
    rememberMe?: boolean | undefined
    ipHash?: string | undefined
    userAgent?: string | undefined
  } = {}
): Promise<void> {
  const token = generateToken()
  const expiresAt = expiryFrom(CHALLENGE_TTL_MS)

  await prisma.$transaction([
    // Starting a new challenge retires any earlier one, so a stale tab cannot
    // be completed against a login the user has already abandoned.
    prisma.twoFactorChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.twoFactorChallenge.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        rememberMe: login.rememberMe ?? false,
        ipHash: login.ipHash ?? null,
        userAgent: login.userAgent ?? null,
      },
    }),
  ])

  cookies().set(TWO_FACTOR_CHALLENGE_COOKIE, token, cookieOptions(expiresAt))
}

/** The pending challenge for this browser, or null. */
export async function readChallenge(): Promise<PendingChallenge | null> {
  const token = cookies().get(TWO_FACTOR_CHALLENGE_COOKIE)?.value
  if (!token) return null

  const row = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!row || row.consumedAt) return null
  if (row.expiresAt <= new Date()) return null

  return {
    id: row.id,
    userId: row.userId,
    attempts: row.attempts,
    rememberMe: row.rememberMe,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
  }
}

/** Count a wrong code. At the cap the challenge is spent. */
export async function registerChallengeFailure(
  id: string
): Promise<{ burned: boolean; attemptsRemaining: number }> {
  const { attempts } = await prisma.twoFactorChallenge.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  })

  if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
    await prisma.twoFactorChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    })
    return { burned: true, attemptsRemaining: 0 }
  }

  return { burned: false, attemptsRemaining: CHALLENGE_MAX_ATTEMPTS - attempts }
}

/**
 * Spend the challenge. Call this only *after* the factor has been verified.
 *
 * Claiming first would mean a wrong code destroyed the challenge and left
 * `attempts` with nothing to count.
 */
export async function claimChallenge(id: string): Promise<boolean> {
  const { count } = await prisma.twoFactorChallenge.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  return count === 1
}

/** "Use a different account" — drop the challenge and the cookie. */
export async function abandonChallenge(): Promise<void> {
  const token = cookies().get(TWO_FACTOR_CHALLENGE_COOKIE)?.value
  if (token) {
    await prisma.twoFactorChallenge.updateMany({
      where: { tokenHash: hashToken(token), consumedAt: null },
      data: { consumedAt: new Date() },
    })
  }
  cookies().delete(TWO_FACTOR_CHALLENGE_COOKIE)
}

/** Used by password reset, which must not leave a redeemable challenge behind. */
export async function discardChallengesFor(userId: string): Promise<void> {
  await prisma.twoFactorChallenge.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

/**
 * Park a freshly generated secret until its owner proves they can read codes
 * from it. `sealedSecret` must already have been through `sealSecret`.
 */
export async function issueEnrollment(userId: string, sealedSecret: string): Promise<void> {
  const token = generateToken()
  const expiresAt = expiryFrom(ENROLLMENT_TTL_MS)

  await prisma.$transaction([
    prisma.twoFactorEnrollment.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.twoFactorEnrollment.create({
      data: { userId, tokenHash: hashToken(token), secret: sealedSecret, expiresAt },
    }),
  ])

  cookies().set(TWO_FACTOR_ENROLL_COOKIE, token, cookieOptions(expiresAt))
}

/**
 * The enrollment in progress for this browser, with its secret opened.
 *
 * `userId` is checked against the row rather than trusted from the cookie: a
 * cookie left over from a previous account on a shared browser must not name
 * an enrollment belonging to someone else.
 */
export async function readEnrollment(userId: string): Promise<PendingEnrollment | null> {
  const token = cookies().get(TWO_FACTOR_ENROLL_COOKIE)?.value
  if (!token) return null

  const row = await prisma.twoFactorEnrollment.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!row || row.consumedAt || row.userId !== userId) return null
  if (row.expiresAt <= new Date()) return null

  return { id: row.id, secret: openSecret(row.secret), attempts: row.attempts }
}

export async function registerEnrollmentFailure(
  id: string
): Promise<{ burned: boolean; attemptsRemaining: number }> {
  const { attempts } = await prisma.twoFactorEnrollment.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  })

  if (attempts >= ENROLLMENT_MAX_ATTEMPTS) {
    await prisma.twoFactorEnrollment.update({
      where: { id },
      data: { consumedAt: new Date() },
    })
    return { burned: true, attemptsRemaining: 0 }
  }

  return { burned: false, attemptsRemaining: ENROLLMENT_MAX_ATTEMPTS - attempts }
}

export async function clearEnrollmentCookie(): Promise<void> {
  cookies().delete(TWO_FACTOR_ENROLL_COOKIE)
}

// ─── Verifying a second factor ────────────────────────────────────────────────

/**
 * Check a code from the authenticator app, or a backup code, against a user who
 * already has two-factor switched on.
 *
 * Both paths spend something on success — a time step or a backup code — so a
 * true result means the factor has been consumed, not merely recognised.
 */
export async function verifySecondFactor(
  userId: string,
  method: SecondFactorMethod,
  code: string
): Promise<SecondFactorResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  })
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, reason: 'not_enabled' }
  }

  if (method === 'backup') {
    if (!(await claimBackupCode(userId, code))) return { ok: false, reason: 'wrong_code' }
    return {
      ok: true,
      via: 'backup',
      backupCodesRemaining: await countUnusedBackupCodes(userId),
    }
  }

  const result = await verifyTotp(openSecret(user.twoFactorSecret), code)
  if (!result.valid) return { ok: false, reason: 'wrong_code' }

  // Correct, but possibly already used. A code stays valid across the drift
  // window, so without this a code seen over a shoulder or relayed by a
  // phishing proxy can be replayed into a *fresh* challenge — which the
  // single-use challenge row does not stop, because the attacker opens their
  // own.
  if (!(await claimTotpTimeStep(userId, result.timeStep))) {
    return { ok: false, reason: 'replayed' }
  }

  return {
    ok: true,
    via: 'totp',
    backupCodesRemaining: await countUnusedBackupCodes(userId),
  }
}

/**
 * Move the replay watermark forward, but only ever forward.
 *
 * otplib ships `afterTimeStep` for this and it is deliberately unused: it
 * throws when the stored step is ahead of the current one, which is exactly
 * what a backwards clock adjustment on the server produces — turning a login
 * into a 500. Doing it here keeps the rule visible and unable to throw.
 */
export async function claimTotpTimeStep(userId: string, timeStep: number): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ twoFactorLastTimeStep: null }, { twoFactorLastTimeStep: { lt: timeStep } }],
    },
    data: { twoFactorLastTimeStep: timeStep },
  })
  return count === 1
}

/** Spend a backup code. False means no unused code matched. */
export async function claimBackupCode(userId: string, code: string): Promise<boolean> {
  const normalized = normalizeBackupCode(code)
  if (!normalized) return false

  const { count } = await prisma.twoFactorBackupCode.updateMany({
    where: { userId, codeHash: hashBackupCode(userId, normalized), usedAt: null },
    data: { usedAt: new Date() },
  })
  return count === 1
}

export function countUnusedBackupCodes(userId: string): Promise<number> {
  return prisma.twoFactorBackupCode.count({ where: { userId, usedAt: null } })
}

// ─── Turning it on and off ────────────────────────────────────────────────────

/**
 * Promote a confirmed enrollment to a live credential and hand back the backup
 * codes. The plaintext codes are returned once, here, and never again — see the
 * note on the backup-codes route.
 *
 * `timeStep` is the step of the code that just confirmed the enrollment. It is
 * written as the replay watermark because that code has been used, and without
 * this it would still work at the login challenge thirty seconds later.
 */
export async function enableTwoFactor(
  userId: string,
  sealedSecret: string,
  enrollmentId: string,
  timeStep: number
): Promise<string[]> {
  const codes = generateBackupCodes()

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: sealedSecret,
        twoFactorEnabledAt: new Date(),
        twoFactorLastTimeStep: timeStep,
      },
    }),
    // Any codes from a previous enrollment are void the moment the secret
    // changes; leaving them would make "how many remain" a lie.
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashBackupCode(userId, code) })),
    }),
    prisma.twoFactorEnrollment.update({
      where: { id: enrollmentId },
      data: { consumedAt: new Date() },
    }),
  ])

  return codes
}

/**
 * Replace every backup code. Returns the new plaintext set, once.
 *
 * Used codes are deleted along with the unused ones. The schema comment calls a
 * used row an audit record, and across a regeneration it stops being one — a
 * used hash cannot be traced back to which code it was, and keeping it only
 * makes "how many remain" ambiguous. The auditable fact is the `usedAt`
 * timestamp, which belongs in an audit log once E2 builds one.
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes()

  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashBackupCode(userId, code) })),
    }),
  ])

  return codes
}

/**
 * Switch two-factor off and remove every trace of it.
 *
 * Pending challenges go too, and that is not housekeeping: a challenge opened
 * seconds before this call would otherwise still be redeemable against a secret
 * that no longer exists — a null-secret path nobody thinks to test.
 */
export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
        twoFactorLastTimeStep: null,
      },
    }),
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorEnrollment.deleteMany({ where: { userId } }),
    prisma.twoFactorChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ])
}

export const BACKUP_CODES_ISSUED = BACKUP_CODE_COUNT

// ─── Org-wide policy ──────────────────────────────────────────────────────────

/** True when the organization requires two-factor and this user has not set it up. */
export function needsTwoFactorEnrollment(user: SessionUser): boolean {
  return user.organizationRequiresTwoFactor && !user.twoFactorEnabled
}
