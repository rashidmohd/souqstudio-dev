import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

/**
 * TOTP policy and the otplib boundary. E1-03.
 *
 * Pure with respect to our data — it takes a secret and a code and answers a
 * question. Nothing here touches the database or a cookie; that is
 * lib/two-factor.ts. Keeping the split means the drift window and the code
 * format can be tested without a database.
 *
 * otplib 13 exposes a functional API from the package root that already carries
 * the Noble crypto and Scure base32 plugins, so no plugin wiring is needed. Its
 * v12 preset imports (`authenticator`, `totp.options = …`) do not exist here.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6

/**
 * Accepted clock drift, **in seconds, not time steps**. This is the single
 * easiest thing to get wrong in this file: otplib's `epochTolerance` is a
 * seconds value, so `1` would mean one second and produce an effectively
 * zero-width window that fails for almost everyone.
 *
 * 30 seconds against a 30-second period accepts the previous, current and next
 * step — the conventional ±1, and what otplib's own documentation calls the
 * standard for 2FA. Tightening to past-only rejects the very common phone
 * running a few seconds fast, which reads to the owner as "my code never
 * works". Widening to ±2 buys nothing and multiplies the guessing surface.
 */
export const TOTP_DRIFT_SECONDS = 30

/** Shown as the account issuer in the authenticator app. */
export const TOTP_ISSUER = 'SouqStudio'

export type TotpVerification =
  | { valid: false }
  | { valid: true; timeStep: number; delta: number }

/** A fresh base32 secret. otplib's default is 20 bytes — 160 bits. */
export function generateTotpSecret(): string {
  return generateSecret()
}

/** The `otpauth://` URI an authenticator app scans. `secret` must be opened. */
export function totpUri(secret: string, accountEmail: string): string {
  return generateURI({
    issuer: TOTP_ISSUER,
    label: accountEmail,
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  })
}

/**
 * The QR as a PNG data URL, rendered server-side.
 *
 * PNG rather than SVG because placing a server-generated SVG in the document
 * needs `dangerouslySetInnerHTML`, and the bytes saved are not worth opening
 * that door on a page that renders a live credential.
 */
export function totpQrDataUri(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 256 })
}

/**
 * The secret grouped in fours, for someone typing it in by hand because their
 * camera will not focus. Authenticator apps ignore the spaces.
 */
export function formatManualKey(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(' ')
}

/** The RFC 6238 step number for a moment in time. */
export function currentTimeStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS)
}

/**
 * Check a code against a secret.
 *
 * `secret` must already have been through `openSecret` — a value straight from
 * the database carries a version tag and is not valid base32.
 *
 * On success the caller gets `timeStep`, which must then be claimed through
 * `claimTotpTimeStep` so the same code cannot be replayed into a second
 * challenge inside its 90-second validity. otplib offers `afterTimeStep` for
 * this, and it is deliberately not used: it throws
 * `AfterTimeStepRangeExceededError` when the stored step is ahead of the
 * current one, which is what a backwards server clock adjustment produces —
 * turning a login into a 500. The guard is written by hand in lib/two-factor.ts
 * so the rule is visible and cannot throw.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  now: Date = new Date()
): Promise<TotpVerification> {
  try {
    const result = await verify({
      secret,
      token: code,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      epochTolerance: TOTP_DRIFT_SECONDS,
      // Seconds, like epochTolerance — not milliseconds. Passing Date.now()
      // directly puts the epoch about 50,000 years into the future and every
      // code fails.
      epoch: Math.floor(now.getTime() / 1000),
    })

    if (!result.valid) return { valid: false }

    // otplib's root `verify` is shared between TOTP and HOTP, so its return
    // type is the union of both and only the TOTP arm carries `timeStep`.
    // Nothing here ever takes the HOTP path — there is no counter in this
    // system — so this is a type-level formality. It returns "not valid"
    // rather than asserting, because a replay guard that cannot be fed is not
    // a guard worth trusting.
    if (!('timeStep' in result)) return { valid: false }

    return { valid: true, timeStep: result.timeStep, delta: result.delta }
  } catch {
    // otplib throws rather than returning `{ valid: false }` for a token that
    // is not exactly `digits` digits. Zod already rejects those at the route
    // boundary, so reaching here means a library change — and a malformed code
    // must be a wrong code, never a 500.
    return { valid: false }
  }
}
