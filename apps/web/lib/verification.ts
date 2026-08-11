import 'server-only'

import { prisma, enqueueEmail } from '@souqstudio/db'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import {
  generateToken,
  hashToken,
  generateOtp,
  hashOtp,
  expiryFrom,
  tokenHashesMatch,
  OTP_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from '@/lib/tokens'

/**
 * One-time codes for email verification and password reset.
 *
 * Both flows are the same machine — issue, email, consume once — so they share
 * one implementation and differ only in what the caller does after a successful
 * consume. See souqstudio-technical → references/auth.md.
 *
 * Two secrets are always in play: the six-digit code goes to the inbox, and a
 * 32-byte token goes into an httpOnly cookie. Neither works alone.
 */

export type VerificationType = 'email_verification' | 'password_reset'

/** Separate cookies so a reset in one tab cannot clobber a verification in another. */
const COOKIE: Record<VerificationType, string> = {
  email_verification: 'sq_verify',
  password_reset: 'sq_reset',
}

const TTL: Record<VerificationType, number> = {
  email_verification: EMAIL_VERIFICATION_TTL_MS,
  password_reset: PASSWORD_RESET_TTL_MS,
}

const TEMPLATE = {
  email_verification: 'email-verification',
  password_reset: 'password-reset',
} as const

export type ConsumeResult =
  | { ok: true; identifier: string }
  | { ok: false; reason: 'no_pending' | 'expired' | 'wrong_code' | 'too_many_attempts' }

export type IssueResult =
  | { sent: true }
  | { sent: false; retryAfterSeconds: number }

/**
 * Escalating cooldown between codes to the same address, in minutes.
 *
 * The first code is immediate; each resend pushes the next one further out. A
 * flat limit either annoys the person who genuinely mistyped their address or
 * leaves the button usable as a mail bomb — this is cheap for one honest retry
 * and expensive for a hundred.
 *
 * Past the end of the list the last value repeats, so it settles at an hour.
 */
const RESEND_COOLDOWN_MINUTES = [1, 3, 10, 60]

function cooldownMsFor(resendCount: number): number {
  const index = Math.min(resendCount, RESEND_COOLDOWN_MINUTES.length - 1)
  return (RESEND_COOLDOWN_MINUTES[index] ?? 60) * 60 * 1000
}

/**
 * Seconds until another code may be requested, or 0 if one may be sent now.
 * Reads the newest row whether or not it was consumed — otherwise redeeming a
 * code would reset the counter and hand back an unlimited resend.
 */
export async function retryAfterSeconds(
  identifier: string,
  type: VerificationType,
  now: Date = new Date()
): Promise<number> {
  const latest = await prisma.verificationToken.findFirst({
    where: { identifier, type },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, resendCount: true },
  })
  if (!latest) return 0

  const readyAt = latest.createdAt.getTime() + cooldownMsFor(latest.resendCount)
  return Math.max(0, Math.ceil((readyAt - now.getTime()) / 1000))
}

/**
 * Issue a code, email it, and put the paired token in a cookie.
 *
 * Any earlier code of the same type for the same address is consumed first, so a
 * forwarded older email cannot be redeemed after a resend.
 *
 * Returns `sent: false` with a wait when the cooldown has not elapsed. Callers
 * decide whether to surface that — `forgot-password` must not, because a
 * cooldown message for one address and success for another would reveal which
 * addresses have accounts.
 */
export async function issueCode(
  identifier: string,
  type: VerificationType
): Promise<IssueResult> {
  const wait = await retryAfterSeconds(identifier, type)
  if (wait > 0) return { sent: false, retryAfterSeconds: wait }

  const previous = await prisma.verificationToken.findFirst({
    where: { identifier, type },
    orderBy: { createdAt: 'desc' },
    select: { resendCount: true },
  })

  const token = generateToken()
  const otp = generateOtp()

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { identifier, type, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        identifier,
        type,
        tokenHash: hashToken(token),
        otpHash: hashOtp(token, otp),
        expiresAt: expiryFrom(TTL[type]),
        // Carried forward, so the cooldown keeps climbing across a run rather
        // than resetting with every fresh row.
        resendCount: previous ? previous.resendCount + 1 : 0,
      },
    }),
  ])

  cookies().set(COOKIE[type], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiryFrom(TTL[type]),
  })

  // Queued, never sent inline — a slow provider must not slow the request, and a
  // failed send must not roll back a code the user may already have received.
  await enqueueEmail({
    template: TEMPLATE[type],
    to: identifier,
    props: { code: otp, expiresInMinutes: Math.round(TTL[type] / 60000) },
  })

  return { sent: true }
}

/**
 * Check a code without spending it.
 *
 * Password reset asks for the code on one screen and the new password on the
 * next, so the code has to be checkable before it is redeemed — otherwise
 * abandoning at the password step burns a code and pushes the owner into the
 * resend cooldown for something they did nothing wrong to trigger.
 *
 * Wrong codes still count against `attempts`, so this is not a free oracle. A
 * *correct* code can be checked repeatedly, which costs an attacker nothing they
 * did not already have — they would need the token cookie as well, and holding
 * both is the same as being able to redeem it.
 */
export async function verifyCode(
  otp: string,
  type: VerificationType
): Promise<ConsumeResult> {
  return checkCode(otp, type, { consume: false })
}

/**
 * Check a submitted code against the cookie's token, and spend it.
 *
 * Returns a reason rather than throwing, because the caller decides how much to
 * reveal — password reset must not confirm whether an address exists, while
 * email verification is already inside a session and can be specific.
 */
export async function consumeCode(
  otp: string,
  type: VerificationType
): Promise<ConsumeResult> {
  return checkCode(otp, type, { consume: true })
}

async function checkCode(
  otp: string,
  type: VerificationType,
  { consume }: { consume: boolean }
): Promise<ConsumeResult> {
  const token = cookies().get(COOKIE[type])?.value
  if (!token) return { ok: false, reason: 'no_pending' }

  const row = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!row || row.consumedAt || row.type !== type) return { ok: false, reason: 'no_pending' }

  if (row.expiresAt <= new Date()) return { ok: false, reason: 'expired' }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await burn(row.id)
    return { ok: false, reason: 'too_many_attempts' }
  }

  // Compared as hashes of equal length, so the check cannot leak how many
  // leading digits were right.
  if (!tokenHashesMatch(row.otpHash, hashOtp(token, otp))) {
    const { attempts } = await prisma.verificationToken.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await burn(row.id)
      return { ok: false, reason: 'too_many_attempts' }
    }
    return { ok: false, reason: 'wrong_code' }
  }

  if (consume) {
    await prisma.verificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    })
    cookies().delete(COOKIE[type])
  }

  return { ok: true, identifier: row.identifier }
}

/** Which address a pending code was sent to, for "we sent a code to …". */
export async function pendingIdentifier(type: VerificationType): Promise<string | null> {
  const token = cookies().get(COOKIE[type])?.value
  if (!token) return null
  const row = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { identifier: true, consumedAt: true, expiresAt: true },
  })
  if (!row || row.consumedAt || row.expiresAt <= new Date()) return null
  return row.identifier
}

async function burn(id: string): Promise<void> {
  await prisma.verificationToken.update({
    where: { id },
    data: { consumedAt: new Date() },
  })
}
