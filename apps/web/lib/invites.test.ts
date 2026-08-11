import { describe, it, expect, vi } from 'vitest'

/**
 * The invite rules that are not Prisma's job.
 *
 * What is worth pinning down is the policy: when a link stops working, what a
 * row means, how fast the same address can be mailed twice, and that a grant
 * blob from the database cannot smuggle in a role nobody may hold.
 */

vi.mock('@souqstudio/db', () => ({
  prisma: {},
  Prisma: {},
  enqueueEmail: vi.fn(),
}))

const { inviteStatus, isRedeemable, retryAfterSeconds, toShopGrants } = await import(
  '@/lib/invites'
)

const NOW = new Date('2026-08-11T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function invite(over: Partial<Parameters<typeof inviteStatus>[0]> = {}) {
  return {
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    ...over,
  }
}

describe('inviteStatus', () => {
  it('is pending while unused and in date', () => {
    expect(inviteStatus(invite(), NOW)).toBe('pending')
  })

  it('is expired once the window closes', () => {
    expect(inviteStatus(invite({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(
      'expired'
    )
  })

  it('treats the exact expiry instant as expired', () => {
    // The boundary matters: a link that works at exactly its expiry is a link
    // whose stated lifetime is a lie.
    expect(inviteStatus(invite({ expiresAt: NOW }), NOW)).toBe('expired')
  })

  it('is accepted once used, even after expiry', () => {
    // Accepted has to win. Otherwise an old row starts reading "expired" and
    // the team list would offer to resend an invitation to someone already in.
    expect(
      inviteStatus(
        invite({ acceptedAt: NOW, expiresAt: new Date(NOW.getTime() - HOUR) }),
        NOW
      )
    ).toBe('accepted')
  })

  it('is revoked when withdrawn', () => {
    expect(inviteStatus(invite({ revokedAt: NOW }), NOW)).toBe('revoked')
  })

  it('reports accepted over revoked if somehow both are set', () => {
    expect(inviteStatus(invite({ acceptedAt: NOW, revokedAt: NOW }), NOW)).toBe('accepted')
  })
})

describe('isRedeemable', () => {
  it('is true only for a pending invite', () => {
    expect(isRedeemable(invite(), NOW)).toBe(true)
    expect(isRedeemable(invite({ acceptedAt: NOW }), NOW)).toBe(false)
    expect(isRedeemable(invite({ revokedAt: NOW }), NOW)).toBe(false)
    expect(isRedeemable(invite({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(false)
  })
})

describe('retryAfterSeconds', () => {
  it('allows the first send immediately', () => {
    expect(retryAfterSeconds(null, NOW)).toBe(0)
    expect(retryAfterSeconds({ lastSentAt: null, resendCount: 0 }, NOW)).toBe(0)
  })

  it('escalates 1, 3, 10, 60 minutes', () => {
    const minutes = [1, 3, 10, 60]
    minutes.forEach((expected, resendCount) => {
      const justSent = { lastSentAt: NOW, resendCount }
      expect(retryAfterSeconds(justSent, NOW)).toBe(expected * 60)
    })
  })

  it('settles at an hour past the end of the list', () => {
    expect(retryAfterSeconds({ lastSentAt: NOW, resendCount: 99 }, NOW)).toBe(60 * 60)
  })

  it('returns zero once the cooldown has passed', () => {
    const sent = { lastSentAt: new Date(NOW.getTime() - 2 * 60 * 1000), resendCount: 0 }
    expect(retryAfterSeconds(sent, NOW)).toBe(0)
  })

  it('never returns a negative wait', () => {
    const long = { lastSentAt: new Date(NOW.getTime() - 10 * HOUR), resendCount: 3 }
    expect(retryAfterSeconds(long, NOW)).toBe(0)
  })
})

describe('toShopGrants', () => {
  it('reads a well-formed list', () => {
    expect(toShopGrants([{ shopId: 'a', role: 'editor' }, { shopId: 'b' }])).toEqual([
      { shopId: 'a', role: 'editor' },
      { shopId: 'b' },
    ])
  })

  it('drops an owner role rather than honouring it', () => {
    // The column is JSON, so nothing at the database level stops `owner` being
    // written into it. Reading it back as a plain grant is the floor that keeps
    // a hand-edited row from minting an owner on accept.
    expect(toShopGrants([{ shopId: 'a', role: 'owner' }])).toEqual([{ shopId: 'a' }])
  })

  it('survives anything that is not a grant list', () => {
    expect(toShopGrants(null)).toEqual([])
    expect(toShopGrants('nonsense')).toEqual([])
    expect(toShopGrants({ shopId: 'a' })).toEqual([])
    expect(toShopGrants([null, 3, { role: 'editor' }, { shopId: '' }])).toEqual([])
  })
})
