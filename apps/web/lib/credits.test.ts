import { describe, it, expect } from 'vitest'
/**
 * Imported by file path rather than from `@souqstudio/db`.
 *
 * The package index also re-exports `queue-client.ts`, which constructs a
 * BullMQ `Queue` at module load — importing the index in a test opens a Redis
 * connection that nothing here needs and nothing here can serve. The credit
 * module itself pulls in Prisma and no transport.
 */
import {
  rolloverAmount,
  splitSpend,
  addMonths,
  currentPeriod,
  CREDIT_COSTS,
  CREDIT_ROLLOVER_MULTIPLE,
} from '@souqstudio/db/src/credits'

/**
 * The arithmetic behind E3-03.
 *
 * Everything here is money-adjacent and none of it is Stripe's — rollover,
 * spend order and the period walk are ours, which makes them the parts a future
 * change can plausibly get wrong without anything failing loudly.
 */

describe('rolloverAmount', () => {
  it('carries nothing on a plan without rollover', () => {
    expect(rolloverAmount({ remaining: 40, allocation: 50, rollover: false })).toBe(0)
  })

  it('carries the unused balance when it fits under the cap', () => {
    expect(rolloverAmount({ remaining: 120, allocation: 200, rollover: true })).toBe(120)
  })

  it('caps the carry so the new balance never exceeds the multiple', () => {
    const allocation = 200
    const carried = rolloverAmount({ remaining: 900, allocation, rollover: true })
    // The cap is on the balance, not on the amount carried: 200 fresh + 200
    // carried is 2x, and 900 unused does not buy a third allocation.
    expect(carried).toBe(allocation * (CREDIT_ROLLOVER_MULTIPLE - 1))
    expect(allocation + carried).toBe(allocation * CREDIT_ROLLOVER_MULTIPLE)
  })

  it('carries nothing from an empty or negative balance', () => {
    expect(rolloverAmount({ remaining: 0, allocation: 200, rollover: true })).toBe(0)
    expect(rolloverAmount({ remaining: -5, allocation: 200, rollover: true })).toBe(0)
  })

  it('carries nothing when the plan allocates nothing', () => {
    // An organization between plans. Without the clamp this would be negative.
    expect(rolloverAmount({ remaining: 30, allocation: 0, rollover: true })).toBe(0)
  })
})

describe('splitSpend', () => {
  it('spends monthly credits before purchased ones', () => {
    // The monthly ones expire. Spending the purchased ones first would destroy
    // something the customer paid for.
    const split = splitSpend({ cost: 10, monthlyRemaining: 50, topupRemaining: 100 })
    expect(split).toMatchObject({ fromMonthly: 10, fromTopup: 0, sufficient: true })
  })

  it('spills the remainder onto purchased credits', () => {
    const split = splitSpend({ cost: 10, monthlyRemaining: 4, topupRemaining: 100 })
    expect(split).toMatchObject({ fromMonthly: 4, fromTopup: 6, sufficient: true })
  })

  it('reports insufficient when both buckets together fall short', () => {
    const split = splitSpend({ cost: 10, monthlyRemaining: 4, topupRemaining: 5 })
    expect(split.sufficient).toBe(false)
  })

  it('treats an exactly-sufficient balance as sufficient', () => {
    const split = splitSpend({ cost: 10, monthlyRemaining: 4, topupRemaining: 6 })
    expect(split).toMatchObject({ fromMonthly: 4, fromTopup: 6, sufficient: true })
  })

  it('does not draw a negative amount from an empty bucket', () => {
    const split = splitSpend({ cost: 3, monthlyRemaining: 0, topupRemaining: 3 })
    expect(split).toMatchObject({ fromMonthly: 0, fromTopup: 3, sufficient: true })
  })
})

describe('addMonths', () => {
  it('keeps the day of the month', () => {
    expect(addMonths(new Date('2026-03-08T00:00:00Z'), 1).toISOString()).toBe(
      new Date('2026-04-08T00:00:00Z').toISOString()
    )
  })

  it('clamps to the end of a shorter month rather than overflowing', () => {
    // setMonth alone turns 31 January into 3 March, which walks the billing
    // anniversary forward a few days every year.
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      new Date('2026-02-28T00:00:00Z').toISOString()
    )
  })

  it('clamps to 29 February in a leap year', () => {
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe(
      new Date('2028-02-29T00:00:00Z').toISOString()
    )
  })

  it('crosses the year boundary', () => {
    expect(addMonths(new Date('2026-12-15T00:00:00Z'), 1).toISOString()).toBe(
      new Date('2027-01-15T00:00:00Z').toISOString()
    )
  })
})

describe('currentPeriod', () => {
  it('returns the period containing the given moment', () => {
    const period = currentPeriod(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-11T00:00:00Z'))
    expect(period.start.toISOString()).toBe(new Date('2026-08-01T00:00:00Z').toISOString())
    expect(period.end.toISOString()).toBe(new Date('2026-09-01T00:00:00Z').toISOString())
  })

  it('walks forward over a gap rather than opening one period per missed month', () => {
    // A dormant account, or a webhook outage. The result is one current period,
    // which is what makes the reset grant one allocation rather than five.
    const period = currentPeriod(new Date('2026-01-10T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))
    expect(period.start.toISOString()).toBe(new Date('2026-06-10T00:00:00Z').toISOString())
    expect(period.end.toISOString()).toBe(new Date('2026-07-10T00:00:00Z').toISOString())
  })

  it('leaves a period that has not ended alone', () => {
    const start = new Date('2026-08-10T00:00:00Z')
    const period = currentPeriod(start, new Date('2026-08-11T00:00:00Z'))
    expect(period.start.toISOString()).toBe(start.toISOString())
  })
})

describe('CREDIT_COSTS', () => {
  it('matches the price list in docs/E3-billing-subscription.md', () => {
    expect(CREDIT_COSTS).toMatchObject({
      character_gen: 10,
      pose_gen: 3,
      prompt_gen: 5,
      variation: 2,
      cover_gen: 5,
      background_removal: 1,
    })
  })

  it('prices every action above zero, so nothing is silently free', () => {
    for (const cost of Object.values(CREDIT_COSTS)) expect(cost).toBeGreaterThan(0)
  })
})
