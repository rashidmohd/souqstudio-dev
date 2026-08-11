/**
 * The seam where a TOTP secret is sealed before storage and opened after
 * reading. E1-03.
 *
 * **Today this is plaintext.** `sealSecret` prefixes a version tag and returns
 * the secret unchanged; `openSecret` strips the tag. That is deliberate and
 * temporary: souqstudio-technical → references/auth.md records encrypting
 * `users.twoFactorSecret` as the same unresolved decision as the token
 * encryption key management that blocks E10, and says to resolve both together
 * rather than inventing a key strategy here.
 *
 * **The version tag is the entire reason this module exists.** Without it,
 * switching to encryption later means a flag day: every row must be rewritten
 * in one transaction because nothing can tell an encrypted value from a
 * plaintext one. With it, `openSecret` reads `v0:` and `v1:` simultaneously
 * while a backfill runs, so the change is this file plus a job.
 *
 * When E10 settles key management, add `TWO_FACTOR_SECRET_KEY` to lib/env.ts and
 * make `seal` produce `v1:<iv>.<tag>.<ciphertext>` with AES-256-GCM and a fresh
 * 12-byte IV per secret. `openSecret` keeps its `v0` branch until the backfill
 * finishes, then loses it.
 *
 * Nothing outside this module may read or write a stored secret. A value read
 * straight from the database is NOT a base32 secret and handing it to otplib
 * will fail in a way that looks like a wrong code.
 */

const CURRENT_VERSION = 'v0'
const SEPARATOR = ':'

/** Wrap a freshly generated base32 secret for storage. */
export function sealSecret(plain: string): string {
  return `${CURRENT_VERSION}${SEPARATOR}${plain}`
}

/**
 * Unwrap a stored secret back to the base32 form otplib expects.
 *
 * Throws on an unrecognised tag rather than guessing. A secret that cannot be
 * opened must fail loudly at the one call site that uses it — silently treating
 * it as plaintext would hand a ciphertext to otplib and surface as "your
 * authenticator app is wrong", which is the least debuggable outcome available.
 */
export function openSecret(stored: string): string {
  const separatorAt = stored.indexOf(SEPARATOR)
  if (separatorAt === -1) {
    throw new Error('Stored two-factor secret has no version tag')
  }

  const version = stored.slice(0, separatorAt)
  const payload = stored.slice(separatorAt + 1)

  switch (version) {
    case 'v0':
      return payload
    default:
      throw new Error(`Unknown two-factor secret version: ${version}`)
  }
}
