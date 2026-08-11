import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSync } from 'otplib'
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS, currentTimeStep } from '@/lib/totp'
import { sealSecret } from '@/lib/two-factor-secret'
import { hashBackupCode } from '@/lib/backup-codes'

/**
 * The decision logic in lib/two-factor.ts, with Prisma standing in for the
 * database.
 *
 * What is worth testing here is the ordering and the branch coverage — that a
 * correct-but-spent code is reported as replayed rather than wrong, that a
 * backup code is claimed rather than merely compared, that a disabled account
 * short-circuits before any code is checked. Those are decisions this module
 * makes. Whether `updateMany` is atomic is PostgreSQL's business, and a mock
 * cannot say anything useful about it.
 */

const prisma = {
  user: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  twoFactorBackupCode: { updateMany: vi.fn(), count: vi.fn() },
  twoFactorChallenge: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  twoFactorEnrollment: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock('@souqstudio/db', () => ({ prisma }))
vi.mock('next/headers', () => ({
  cookies: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}))

const {
  verifySecondFactor,
  claimTotpTimeStep,
  claimBackupCode,
  needsTwoFactorEnrollment,
  CHALLENGE_MAX_ATTEMPTS,
  registerChallengeFailure,
} = await import('@/lib/two-factor')

/**
 * 32 base32 characters — 20 bytes, matching what generateTotpSecret produces.
 * otplib 13 rejects anything under 16 bytes, so the familiar 16-character RFC
 * test vector will not work here.
 */
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const USER_ID = 'user_1'

function currentCode(): string {
  return generateSync({
    secret: SECRET,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    epoch: Math.floor(Date.now() / 1000),
  })
}

/** The user row verifySecondFactor loads before doing anything else. */
function enabledUser() {
  prisma.user.findUnique.mockResolvedValue({
    twoFactorEnabled: true,
    twoFactorSecret: sealSecret(SECRET),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.twoFactorBackupCode.count.mockResolvedValue(10)
})

describe('verifySecondFactor — TOTP', () => {
  it('accepts a current code and claims its time step', async () => {
    enabledUser()
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const result = await verifySecondFactor(USER_ID, 'totp', currentCode())

    expect(result).toMatchObject({ ok: true, via: 'totp' })
    // Claimed, not merely verified — the watermark has to move or the same
    // code works again in the next challenge.
    expect(prisma.user.updateMany).toHaveBeenCalledOnce()
  })

  it('reports a correct but already-spent code as replayed, not wrong', async () => {
    enabledUser()
    // The compare-and-set matched no row: something already claimed this step.
    prisma.user.updateMany.mockResolvedValue({ count: 0 })

    const result = await verifySecondFactor(USER_ID, 'totp', currentCode())

    // The distinction matters to the person reading the message: "wrong code"
    // sends them to re-read their screen, when what they need is to wait.
    expect(result).toEqual({ ok: false, reason: 'replayed' })
  })

  it('rejects a wrong code without touching the watermark', async () => {
    enabledUser()

    const result = await verifySecondFactor(USER_ID, 'totp', '000000')

    expect(result).toEqual({ ok: false, reason: 'wrong_code' })
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('refuses when two-factor is off, before checking anything', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: null,
    })

    const result = await verifySecondFactor(USER_ID, 'totp', currentCode())

    expect(result).toEqual({ ok: false, reason: 'not_enabled' })
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('refuses when the row says enabled but the secret is missing', async () => {
    // Should be impossible. If it ever happens, failing closed is the only
    // acceptable answer — an enabled account with no secret must not sign in.
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: null,
    })

    expect(await verifySecondFactor(USER_ID, 'totp', currentCode())).toEqual({
      ok: false,
      reason: 'not_enabled',
    })
  })
})

describe('verifySecondFactor — backup codes', () => {
  it('spends a matching code and reports how many remain', async () => {
    enabledUser()
    prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 })
    prisma.twoFactorBackupCode.count.mockResolvedValue(9)

    const result = await verifySecondFactor(USER_ID, 'backup', 'A7K2-M9PQ-R4XT')

    expect(result).toEqual({ ok: true, via: 'backup', backupCodesRemaining: 9 })
  })

  it('looks the code up by its user-bound hash, in its normalized form', async () => {
    enabledUser()
    prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 })

    await verifySecondFactor(USER_ID, 'backup', ' a7k2-m9pq-r4xt ')

    expect(prisma.twoFactorBackupCode.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        codeHash: hashBackupCode(USER_ID, 'A7K2M9PQR4XT'),
        usedAt: null,
      },
      data: { usedAt: expect.any(Date) },
    })
  })

  it('rejects a code that matched nothing unused', async () => {
    enabledUser()
    prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 })

    expect(await verifySecondFactor(USER_ID, 'backup', 'A7K2-M9PQ-R4XT')).toEqual({
      ok: false,
      reason: 'wrong_code',
    })
  })

  it('does not query for a code that normalizes to nothing', async () => {
    enabledUser()

    expect(await verifySecondFactor(USER_ID, 'backup', '!!!!')).toEqual({
      ok: false,
      reason: 'wrong_code',
    })
    // An empty hash would match whatever an empty-code row hashed to.
    expect(prisma.twoFactorBackupCode.updateMany).not.toHaveBeenCalled()
  })
})

describe('claimTotpTimeStep', () => {
  it('only ever moves the watermark forward', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    await claimTotpTimeStep(USER_ID, currentTimeStep())

    const call = prisma.user.updateMany.mock.calls[0]?.[0]
    expect(call.where.OR).toEqual([
      { twoFactorLastTimeStep: null },
      { twoFactorLastTimeStep: { lt: currentTimeStep() } },
    ])
  })

  it('is false when the step was already claimed', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 })
    expect(await claimTotpTimeStep(USER_ID, 1)).toBe(false)
  })
})

describe('claimBackupCode', () => {
  it('is true only when exactly one unused row was claimed', async () => {
    prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 })
    expect(await claimBackupCode(USER_ID, 'A7K2-M9PQ-R4XT')).toBe(true)

    prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 })
    expect(await claimBackupCode(USER_ID, 'A7K2-M9PQ-R4XT')).toBe(false)
  })
})

describe('registerChallengeFailure', () => {
  it('counts down the remaining attempts', async () => {
    prisma.twoFactorChallenge.update.mockResolvedValue({ attempts: 2 })

    expect(await registerChallengeFailure('challenge_1')).toEqual({
      burned: false,
      attemptsRemaining: CHALLENGE_MAX_ATTEMPTS - 2,
    })
  })

  it('burns the challenge at the cap', async () => {
    prisma.twoFactorChallenge.update.mockResolvedValue({ attempts: CHALLENGE_MAX_ATTEMPTS })

    const result = await registerChallengeFailure('challenge_1')

    expect(result).toEqual({ burned: true, attemptsRemaining: 0 })
    // Second call is the one that sets consumedAt.
    expect(prisma.twoFactorChallenge.update).toHaveBeenCalledTimes(2)
    expect(prisma.twoFactorChallenge.update.mock.calls[1]?.[0]).toMatchObject({
      data: { consumedAt: expect.any(Date) },
    })
  })
})

describe('needsTwoFactorEnrollment', () => {
  const base = {
    id: USER_ID,
    email: 'owner@shop.ae',
    name: null,
    role: 'owner',
    organizationId: 'org_1',
    emailVerifiedAt: new Date(),
  }

  it('is true only when the org requires it and the user has not set it up', () => {
    expect(
      needsTwoFactorEnrollment({
        ...base,
        organizationRequiresTwoFactor: true,
        twoFactorEnabled: false,
      })
    ).toBe(true)
  })

  it('is false once the user has enrolled', () => {
    expect(
      needsTwoFactorEnrollment({
        ...base,
        organizationRequiresTwoFactor: true,
        twoFactorEnabled: true,
      })
    ).toBe(false)
  })

  it('is false when the org does not require it', () => {
    expect(
      needsTwoFactorEnrollment({
        ...base,
        organizationRequiresTwoFactor: false,
        twoFactorEnabled: false,
      })
    ).toBe(false)
  })
})
