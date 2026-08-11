import { createHash, randomBytes } from 'node:crypto'

/**
 * Single-use recovery codes for TOTP 2FA. E1-03: generated at setup, shown
 * once, downloadable.
 *
 * Pure functions — generation, normalization and hashing. Storing and spending
 * them is lib/two-factor.ts.
 */

export const BACKUP_CODE_COUNT = 10
export const BACKUP_CODE_LENGTH = 12
/** Warn from this many remaining. Three is late enough not to nag, early
 *  enough to act on before the last one is spent. */
export const BACKUP_CODES_LOW_WATERMARK = 3

/**
 * Crockford base32: the digits and uppercase letters, less I, L, O and U. I/L
 * and O drop out because they are unreadable against 1 and 0 on a printout;
 * U drops out because its absence makes accidental words much less likely.
 *
 * Exactly 32 symbols, which is what makes the masking in `generateBackupCodes`
 * unbiased.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Displayed in groups of four. Purely cosmetic — never hashed with hyphens. */
const GROUP_SIZE = 4

/**
 * Ten codes, twelve characters each — 60 bits apiece.
 *
 * `randomBytes` masked with `& 31` is **unbiased here without rejection
 * sampling**, because the alphabet has exactly 32 symbols and 256 / 32 = 8.
 * Every symbol is reachable from exactly eight byte values.
 *
 * This looks like the mistake lib/tokens.ts warns about in `generateOtp`, and
 * it is worth being clear that it is not the same case: there the modulus is
 * 10^6, which does not divide the byte range, so low values come out more
 * often. Here it divides exactly. Do not "fix" this into rejection sampling.
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = []
  for (let index = 0; index < BACKUP_CODE_COUNT; index += 1) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH)
    let code = ''
    for (const byte of bytes) {
      // The alphabet is 32 long, so the mask cannot index past its end.
      code += ALPHABET[byte & 31] as string
    }
    codes.push(formatBackupCode(code))
  }
  return codes
}

/** `A7K2M9PQR4XT` → `A7K2-M9PQ-R4XT`, for reading off a printout. */
export function formatBackupCode(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? [code]).join('-')
}

/**
 * Reduce whatever was typed to the canonical twelve characters.
 *
 * Crockford's transcription rules come first: someone reading a printed code
 * will type I for 1, l for 1 and O for 0, and rejecting them would be blaming
 * the reader for an ambiguity we introduced. Only then is everything outside
 * the alphabet dropped, which removes the display hyphens along with any spaces
 * and stray punctuation.
 *
 * Hyphens are stripped rather than required, so the display grouping can change
 * later without invalidating codes already printed and stored.
 */
export function normalizeBackupCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter((character) => ALPHABET.includes(character))
    .join('')
}

/**
 * The stored form. sha256 peppered with the userId — not bcrypt.
 *
 * references/auth.md calls these password-equivalent, which reads as an
 * argument for a slow KDF. The schema disagrees with that reading and is right:
 * `codeHash` is `@unique`, and bcrypt salts per hash, so a submitted code could
 * not be looked up at all. Verifying would mean loading every unused row for
 * the user and comparing against each one — ten bcrypt comparisons, about two
 * and a half seconds, on the login path, and a tenfold CPU amplifier on an
 * endpoint an attacker reaches with the password alone.
 *
 * The case for a KDF is a small or guessable input space. These are 60-bit
 * CSPRNG strings, used once, on one site. lib/tokens.ts already makes exactly
 * this argument for session tokens.
 *
 * The userId pepper does the work a salt would: each user's codes become a
 * separate keyspace, so one GPU pass over a stolen table cannot attack every
 * user at once. The userId is always known wherever a code is checked — the
 * challenge row carries it, and settings routes have the session — so this
 * stays a single indexed lookup.
 */
export function hashBackupCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${normalizeBackupCode(code)}`).digest('hex')
}
