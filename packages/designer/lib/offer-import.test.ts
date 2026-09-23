import { describe, expect, it } from 'vitest'
import { parsePercent, readOfferType, resolvePrices } from './offer-import'

/**
 * Reading a shop's promotion off a price list. `docs/E6-create-flow.md` §18.
 *
 * Pure, so it is tested here rather than through a screen — which matters more
 * than usual: every one of these values ends up in the largest type on a printed
 * flyer.
 */

describe('readOfferType', () => {
  it('reads the spellings a till actually exports', () => {
    for (const raw of ['BOGO', 'bogof', 'B1G1', 'Buy 1 Get 1 Free', 'buy one get one', '1+1']) {
      expect(readOfferType(raw)).toMatchObject({ kind: 'known', key: 'bogo' })
    }
  })

  it('gives every known kind an Arabic phrase', () => {
    // A chip with no Arabic cannot publish in an Arabic edition — E5 §2 — and a
    // CSV will never carry one, which is the whole reason the set is closed.
    const bogo = readOfferType('bogo')
    expect(bogo.kind === 'known' && bogo.labelAr.length).toBeGreaterThan(0)
  })

  it('treats a plain discount as no chip, because the two prices say it', () => {
    // E6 §3 removed the discount-magnitude badge deliberately: magnitude does
    // not choose a badge, the promo tier does.
    expect(readOfferType('discount')).toEqual({ kind: 'none' })
    expect(readOfferType('خصم')).toEqual({ kind: 'none' })
  })

  it('is empty for an empty cell', () => {
    expect(readOfferType('')).toEqual({ kind: 'none' })
    expect(readOfferType('   ')).toEqual({ kind: 'none' })
    expect(readOfferType('-')).toEqual({ kind: 'none' })
  })

  it('keeps words it does not know rather than dropping them', () => {
    // A shop writing "Ramadan special" means it. Deciding we know their
    // promotions better than they do is how a feature loses their trust.
    expect(readOfferType('Ramadan special')).toEqual({
      kind: 'custom',
      labelEn: 'Ramadan special',
    })
  })

  it('bounds a custom phrase, because it lands on a card', () => {
    const long = readOfferType('x'.repeat(200))
    expect(long.kind === 'custom' && long.labelEn.length).toBe(40)
  })
})

describe('resolvePrices', () => {
  it('inverts the naming: the sheet’s "now" is the mark', () => {
    // The trap. A till calls the shelf price "price" and the promotion "offer
    // price"; an offer calls the promotion `price`. Backwards, and the wrong
    // number is printed in the biggest type on the page.
    expect(resolvePrices({ before: '32.00', now: '24.50', percent: null, currency: 'AED' })).toEqual({
      price: '24.50',
      comparePrice: '32.00',
      mismatch: false,
    })
  })

  it('refuses a strikethrough that is not higher than the price', () => {
    // Equal is a lie on a flyer; lower is worse.
    expect(resolvePrices({ before: '24.50', now: '24.50', percent: null, currency: 'AED' })).toMatchObject({
      price: '24.50',
      comparePrice: null,
    })
    expect(resolvePrices({ before: '20.00', now: '24.50', percent: null, currency: 'AED' })).toMatchObject({
      comparePrice: null,
    })
  })

  it('derives the promotion from a shelf price and a percentage', () => {
    expect(resolvePrices({ before: '32.00', now: null, percent: '25', currency: 'AED' })).toEqual({
      price: '24.00',
      comparePrice: '32.00',
      mismatch: false,
    })
  })

  it('computes in minor units, never through a float', () => {
    // 9.95 less 10% is 8.955. Through a float it is 8.954999999999998, and the
    // rounding that follows is the one place a printed price could be wrong.
    expect(resolvePrices({ before: '9.95', now: null, percent: '10', currency: 'AED' }).price).toBe('8.96')
  })

  it('reports a percentage that disagrees with the two prices', () => {
    // A stale export: the prices were updated and the percentage column was not.
    expect(
      resolvePrices({ before: '32.00', now: '24.00', percent: '50', currency: 'AED' }).mismatch
    ).toBe(true)
  })

  it('tolerates a percentage rounded to whole numbers', () => {
    // 33.33% of 30.00 is 9.999. A sheet saying "33" is not a disagreement.
    expect(resolvePrices({ before: '30.00', now: '20.00', percent: '33', currency: 'AED' }).mismatch).toBe(false)
  })

  it('takes one price as the price, and invents no discount', () => {
    expect(resolvePrices({ before: null, now: '12.90', percent: null, currency: 'AED' })).toEqual({
      price: '12.90',
      comparePrice: null,
      mismatch: false,
    })
    expect(resolvePrices({ before: '12.90', now: null, percent: null, currency: 'AED' })).toEqual({
      price: '12.90',
      comparePrice: null,
      mismatch: false,
    })
  })

  it('has no price when the sheet gave nothing', () => {
    expect(resolvePrices({ before: null, now: null, percent: null, currency: 'AED' }).price).toBeNull()
  })
})

describe('parsePercent', () => {
  it('reads the three spellings of a fifth off', () => {
    expect(parsePercent('20')).toBe('20.00')
    expect(parsePercent('20%')).toBe('20.00')
    // Nobody runs a 0.2% promotion on a flyer.
    expect(parsePercent('0.20')).toBe('20.00')
  })

  it('refuses what is not a discount', () => {
    expect(parsePercent('')).toBeNull()
    expect(parsePercent('0')).toBeNull()
    expect(parsePercent('100')).toBeNull()
    expect(parsePercent('abc')).toBeNull()
  })
})
