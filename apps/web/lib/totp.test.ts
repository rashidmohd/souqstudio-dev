import { describe, it, expect } from 'vitest'
import { generateSync } from 'otplib'
import {
  generateTotpSecret,
  totpUri,
  formatManualKey,
  currentTimeStep,
  verifyTotp,
  TOTP_PERIOD_SECONDS,
  TOTP_DIGITS,
  TOTP_ISSUER,
} from '@/lib/totp'

/**
 * The drift window is the reason this file exists. otplib takes
 * `epochTolerance` in seconds, not time steps, and reading it as steps produces
 * a window so narrow that almost every real code fails — a bug that looks like
 * "the authenticator app is broken" and survives manual testing on a machine
 * whose clock happens to agree.
 */

/** A code as the user's phone would produce it at a given moment. */
function codeAt(secret: string, epochSeconds: number): string {
  return generateSync({
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    epoch: epochSeconds,
  })
}

const NOW = new Date('2026-03-01T12:00:15Z')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)

describe('generateTotpSecret', () => {
  it('returns a base32 secret an authenticator app will accept', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    // At least 16 bytes, which is 26 base32 characters. otplib refuses to
    // generate or verify below that, so a shorter secret would not fail at
    // setup — it would fail at the first login, with the secret already stored.
    expect(secret.length).toBeGreaterThanOrEqual(26)
  })

  it('does not repeat', () => {
    const secrets = new Set(Array.from({ length: 50 }, generateTotpSecret))
    expect(secrets.size).toBe(50)
  })
})

describe('totpUri', () => {
  it('carries the issuer, the account and the secret', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'owner@shop.ae')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain(`issuer=${TOTP_ISSUER}`)
    // The address must survive encoding, or the app labels the entry wrongly.
    expect(uri).toContain('owner%40shop.ae')
  })
})

describe('formatManualKey', () => {
  it('groups in fours for typing', () => {
    expect(formatManualKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
  })

  it('leaves a trailing partial group alone', () => {
    expect(formatManualKey('ABCDE')).toBe('ABCD E')
  })
})

describe('currentTimeStep', () => {
  it('advances once per period', () => {
    const step = currentTimeStep(NOW)
    const next = currentTimeStep(new Date(NOW.getTime() + TOTP_PERIOD_SECONDS * 1000))
    expect(next).toBe(step + 1)
  })

  it('does not advance within a period', () => {
    expect(currentTimeStep(new Date(NOW.getTime() + 1000))).toBe(currentTimeStep(NOW))
  })
})

describe('verifyTotp drift window', () => {
  const secret = generateTotpSecret()

  it('accepts the current code', async () => {
    const result = await verifyTotp(secret, codeAt(secret, NOW_SECONDS), NOW)
    expect(result.valid).toBe(true)
  })

  it('accepts one step behind — a phone clock running slow', async () => {
    const result = await verifyTotp(
      secret,
      codeAt(secret, NOW_SECONDS - TOTP_PERIOD_SECONDS),
      NOW
    )
    expect(result.valid).toBe(true)
  })

  it('accepts one step ahead — a phone clock running fast', async () => {
    const result = await verifyTotp(
      secret,
      codeAt(secret, NOW_SECONDS + TOTP_PERIOD_SECONDS),
      NOW
    )
    expect(result.valid).toBe(true)
  })

  it('rejects two steps out in either direction', async () => {
    const behind = await verifyTotp(
      secret,
      codeAt(secret, NOW_SECONDS - TOTP_PERIOD_SECONDS * 2),
      NOW
    )
    const ahead = await verifyTotp(
      secret,
      codeAt(secret, NOW_SECONDS + TOTP_PERIOD_SECONDS * 2),
      NOW
    )
    expect(behind.valid).toBe(false)
    expect(ahead.valid).toBe(false)
  })

  it('rejects a code for a different secret', async () => {
    const other = generateTotpSecret()
    const result = await verifyTotp(secret, codeAt(other, NOW_SECONDS), NOW)
    expect(result.valid).toBe(false)
  })
})

describe('verifyTotp results', () => {
  const secret = generateTotpSecret()

  it('returns the matched time step, so it can be claimed against replay', async () => {
    const result = await verifyTotp(secret, codeAt(secret, NOW_SECONDS), NOW)
    expect(result.valid && result.timeStep).toBe(currentTimeStep(NOW))
  })

  it('reports which side of the window matched', async () => {
    const behind = await verifyTotp(
      secret,
      codeAt(secret, NOW_SECONDS - TOTP_PERIOD_SECONDS),
      NOW
    )
    expect(behind.valid && behind.delta).toBe(-1)
  })

  it('treats a malformed code as wrong rather than throwing', async () => {
    // otplib raises for anything that is not exactly `digits` digits. Zod
    // catches those at the route boundary, so reaching here means a library
    // change — and it must never turn a typo into a 500.
    for (const bad of ['', 'abc', '12345', '1234567', '12 34 56']) {
      await expect(verifyTotp(secret, bad, NOW)).resolves.toEqual({ valid: false })
    }
  })
})
