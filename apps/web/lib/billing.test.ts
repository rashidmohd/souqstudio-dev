import { describe, it, expect } from 'vitest'
import { restrictionFor, GRACE_PERIOD_DAYS } from '@/lib/billing'
import { planDirection, planFeatures, isSelfServe } from '@/lib/plans'

/**
 * The two pure decisions in billing: what an unpaid account may still do, and
 * which direction a plan change goes.
 *
 * Both are read by code that charges money or takes access away, and both are
 * the kind of comparison that looks obviously right and is off by a day or a
 * sign. The Stripe calls around them are not worth a mock — what they do is
 * Stripe's business, and asserting that we called it proves nothing.
 */

const PAST_DUE_AT = new Date('2026-08-01T00:00:00Z')
const daysAfter = (days: number) =>
  new Date(PAST_DUE_AT.getTime() + days * 24 * 60 * 60 * 1000)

describe('restrictionFor', () => {
  it('leaves an active account alone', () => {
    expect(restrictionFor({ billingStatus: 'active', pastDueSince: null })).toBe('none')
  })

  it('holds a past-due account read-only inside the grace period', () => {
    expect(
      restrictionFor(
        { billingStatus: 'past_due', pastDueSince: PAST_DUE_AT },
        daysAfter(GRACE_PERIOD_DAYS - 1)
      )
    ).toBe('read_only')
  })

  it('suspends once the grace period has elapsed', () => {
    expect(
      restrictionFor(
        { billingStatus: 'past_due', pastDueSince: PAST_DUE_AT },
        daysAfter(GRACE_PERIOD_DAYS)
      )
    ).toBe('suspended')
  })

  it('is read-only on the last moment of the grace period, not suspended', () => {
    // The boundary is the whole point of the field. An off-by-one here locks a
    // paying customer out a day early.
    const oneSecondBefore = new Date(daysAfter(GRACE_PERIOD_DAYS).getTime() - 1000)
    expect(
      restrictionFor({ billingStatus: 'past_due', pastDueSince: PAST_DUE_AT }, oneSecondBefore)
    ).toBe('read_only')
  })

  it('fails towards read-only when past due without a timestamp', () => {
    // The webhook set the status but not the clock. Keeping the customer
    // working is the right direction for a discrepancy that is ours.
    expect(restrictionFor({ billingStatus: 'past_due', pastDueSince: null })).toBe('read_only')
  })

  it('keeps a suspended account suspended regardless of the clock', () => {
    expect(restrictionFor({ billingStatus: 'suspended', pastDueSince: null })).toBe('suspended')
  })

  it('does not restrict a cancelled account', () => {
    // Cancellation is not a payment failure. Access ran to the end of the paid
    // period; what happens after that is the purge clock, not a restriction.
    expect(restrictionFor({ billingStatus: 'cancelled', pastDueSince: null })).toBe('none')
  })
})

describe('planDirection', () => {
  const pro = { tier: 2 }

  it('reads a higher tier as an upgrade', () => {
    expect(planDirection(pro, { tier: 3 })).toBe('upgrade')
  })

  it('reads a lower tier as a downgrade', () => {
    expect(planDirection(pro, { tier: 1 })).toBe('downgrade')
  })

  it('reads the same tier as no change', () => {
    expect(planDirection(pro, { tier: 2 })).toBe('same')
  })

  it('treats no plan as below every plan', () => {
    // An organization that has never subscribed is upgrading into any of them,
    // which is what sends it through Checkout rather than a schedule.
    expect(planDirection(null, { tier: 1 })).toBe('upgrade')
  })
})

describe('planFeatures', () => {
  it('reads the flags that are set', () => {
    expect(planFeatures({ features: { allocatedCredits: true } }).allocatedCredits).toBe(true)
  })

  it('defaults everything to false on a plan with no flags', () => {
    expect(planFeatures({ features: {} })).toMatchObject({
      allocatedCredits: false,
      customTemplates: false,
    })
  })

  it('grants nothing when there is no plan at all', () => {
    expect(planFeatures(null).allocatedCredits).toBe(false)
  })

  it('grants nothing from a corrupt features column', () => {
    // The failure direction of an unreadable entitlement must be less
    // capability, never more — the same rule toRole() follows.
    expect(planFeatures({ features: 'not an object' as never }).allocatedCredits).toBe(false)
    expect(planFeatures({ features: null as never }).whiteLabel).toBe(false)
  })

  it('does not accept a truthy non-boolean as a granted flag', () => {
    expect(planFeatures({ features: { apiAccess: 'yes' } as never }).apiAccess).toBe(false)
  })
})

describe('isSelfServe', () => {
  it('accepts a public plan with a price', () => {
    expect(isSelfServe({ isPublic: true, basePrice: 35 })).toBe(true)
  })

  it('refuses a plan with no published price', () => {
    // Enterprise. There is nothing to charge, so there is nothing to check out.
    expect(isSelfServe({ isPublic: false, basePrice: 0 })).toBe(false)
  })

  it('refuses an unlisted plan even when it carries a price', () => {
    expect(isSelfServe({ isPublic: false, basePrice: 199 })).toBe(false)
  })
})
