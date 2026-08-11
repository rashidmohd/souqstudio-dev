import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Token generation and hashing for sessions, email verification and password
 * reset.
 *
 * The raw token goes in the cookie or the emailed link. Only its SHA-256 hash is
 * stored, so a leaked dump of `sessions` or `verification_tokens` cannot be
 * replayed. Look rows up by hashing what arrived and matching the stored hash.
 *
 * SHA-256 rather than bcrypt here, deliberately: these tokens carry 256 bits of
 * entropy from a CSPRNG, so there is no dictionary to attack and nothing for a
 * slow KDF to buy. Passwords are the opposite case — see lib/password.ts.
 */

/** 32 random bytes, base64url — URL-safe, so it survives an email link intact. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Compare two token hashes without leaking, through timing, how many leading
 * characters matched. Use when comparing a hash you computed against one you
 * fetched by some other key; a direct indexed lookup on `tokenHash` is already
 * constant-time from the caller's perspective.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// ─── One-time codes ───────────────────────────────────────────────────────────

export const OTP_LENGTH = 6
/** Wrong codes allowed before the row burns and a new code must be requested. */
export const OTP_MAX_ATTEMPTS = 5

/**
 * A six-digit code, uniformly distributed.
 *
 * `randomInt` is used rather than `randomBytes(n) % 1000000`: the modulo of a
 * byte range that is not a multiple of 10^6 makes low codes fractionally more
 * likely, and biased codes are guessable codes. Leading zeros are preserved —
 * "004821" is a valid code and must not become "4821".
 */
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0')
}

/**
 * Binds a code to the token that requested it. Verifying needs both: the token
 * from the cookie and the code from the email.
 *
 * Storing sha256(otp) alone would be pointless — six digits is a million
 * guesses, instant against a leaked table. Mixing in the raw token, which is
 * never stored, means the stored hash cannot be attacked at all.
 */
export function hashOtp(token: string, otp: string): string {
  return createHash('sha256').update(`${token}:${otp}`).digest('hex')
}

// ─── Lifetimes ────────────────────────────────────────────────────────────────

/** Password reset expires in one hour — E1-02. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

/**
 * Verification codes are short-lived by nature — a code sits in an inbox where a
 * link would sit in a browser. Fifteen minutes is long enough to switch to a
 * phone and back, short enough to shrink the window on a forwarded email.
 */
export const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000

/**
 * An invite link expires in 48 hours — E2-03.
 *
 * Much longer than a verification code because the shapes differ. A code is
 * typed into the browser that asked for it, seconds later. An invite arrives
 * unannounced at someone who was not expecting it, may be sent on a Thursday
 * evening, and has to survive a weekend of not checking work email. Expiry is
 * not the security control here — the token is, at 256 bits — so the window is
 * set by what a person can reasonably act on.
 */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000

export function expiryFrom(ttlMs: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlMs)
}
