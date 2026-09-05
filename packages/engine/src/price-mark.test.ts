import { describe, it, expect } from 'vitest'
import type { PriceMark } from '@souqstudio/types'
import {
  CAP_RATIO,
  MAX_ROTATION,
  layoutPriceMark,
  minorDigits,
  splitAmount,
  toPriceMark,
} from './price-mark'

const BOX = { x: 100, y: 200, width: 320, height: 160 }

const mark = (over: Partial<PriceMark> = {}): PriceMark => ({
  tierId: 'tier_deal',
  major: '24',
  minor: '50',
  currency: 'AED',
  currencyPlacement: 'PREFIX',
  shape: 'TAG',
  ...over,
})

describe('minor digits', () => {
  it('is two for the two-decimal currencies', () => {
    for (const c of ['AED', 'SAR', 'QAR'] as const) expect(minorDigits(c)).toBe(2)
  })

  it('is three for KWD, OMR and BHD', () => {
    // Twelve dinars and seven hundred fifty fils. "12.75" is a different number,
    // and finding that out the week Kuwait signs up is a reprint.
    for (const c of ['KWD', 'OMR', 'BHD'] as const) expect(minorDigits(c)).toBe(3)
  })
})

describe('splitAmount', () => {
  it('splits a two-decimal price', () => {
    expect(splitAmount(24.5, 'AED')).toEqual({ major: '24', minor: '50' })
  })

  it('gives three minor digits on a three-decimal currency', () => {
    expect(splitAmount(12.75, 'KWD')).toEqual({ major: '12', minor: '750' })
    expect(splitAmount(8.25, 'OMR')).toEqual({ major: '8', minor: '250' })
  })

  it('pads a whole amount rather than dropping the minor', () => {
    expect(splitAmount(21, 'AED')).toEqual({ major: '21', minor: '00' })
    expect(splitAmount(21, 'BHD')).toEqual({ major: '21', minor: '000' })
  })

  it('accepts a string, so a Prisma Decimal survives without a float round trip', () => {
    expect(splitAmount('1299.99', 'AED')).toEqual({ major: '1299', minor: '99' })
  })

  it('rejects what is not a number instead of rendering NaN on a flyer', () => {
    expect(() => splitAmount('cheap', 'AED')).toThrow(/not a number/)
  })
})

describe('toPriceMark', () => {
  it('formats an amount into a mark', () => {
    expect(toPriceMark(24.5, 'AED', 'tier_deal')).toMatchObject({
      tierId: 'tier_deal',
      major: '24',
      minor: '50',
      currency: 'AED',
    })
  })

  it('carries extras through', () => {
    const m = toPriceMark(18.75, 'AED', 't', { comparePrice: '37.50', prefixLabel: 'FROM' })
    expect(m.comparePrice).toBe('37.50')
    expect(m.prefixLabel).toBe('FROM')
  })
})

describe('layoutPriceMark — the three load-bearing rules', () => {
  it('raises the minor to the major cap height, never the baseline', () => {
    // A baseline-aligned minor reads as a second number rather than as cents.
    const l = layoutPriceMark(mark(), BOX)
    expect(l.minor).not.toBeNull()
    expect(l.minor!.baseline).toBeLessThan(l.major.baseline)

    const majorCapTop = l.major.baseline - l.major.fontSize * CAP_RATIO
    const minorCapTop = l.minor!.baseline - l.minor!.fontSize * CAP_RATIO
    expect(minorCapTop).toBeCloseTo(majorCapTop, 6)
  })

  it('keeps the tab attached to the mark, with no gap at any size', () => {
    for (const height of [60, 160, 400]) {
      const l = layoutPriceMark(mark(), { ...BOX, height }, { tierLabel: 'Deal' })
      const tabBottom = l.tab!.rect.y + l.tab!.rect.height
      // Overlapping, not merely touching.
      expect(l.mark.y).toBeLessThan(tabBottom)
    }
  })

  it('lays the pieces out start-to-end and does not mirror', () => {
    // The mark is always LTR with Western numerals, including in AR editions.
    const l = layoutPriceMark(mark(), BOX)
    expect(l.currency.x).toBeLessThan(l.major.x)
    expect(l.major.x).toBeLessThan(l.minor!.x)
  })
})

describe('layoutPriceMark — fitting', () => {
  it('fits within the box on both axes', () => {
    const l = layoutPriceMark(mark({ major: '1299', minor: '99' }), BOX)
    const end = l.minor!.x + l.minor!.width
    expect(l.currency.x).toBeGreaterThanOrEqual(BOX.x)
    expect(end).toBeLessThanOrEqual(BOX.x + BOX.width)
  })

  it('shrinks for a long price rather than overflowing', () => {
    // Height alone was the first version, and a merged region that changed the
    // box aspect spilled digits out of the tag.
    const short = layoutPriceMark(mark({ major: '9' }), BOX)
    const long = layoutPriceMark(mark({ major: '129999' }), BOX)
    expect(long.major.fontSize).toBeLessThan(short.major.fontSize)
  })

  it('survives a wide, short box', () => {
    const wide = layoutPriceMark(mark(), { x: 0, y: 0, width: 600, height: 60 })
    expect(wide.major.fontSize).toBeGreaterThan(0)
    expect(wide.minor!.x + wide.minor!.width).toBeLessThanOrEqual(600)
  })

  it('fits three-decimal digits without spilling', () => {
    const kwd = layoutPriceMark(mark({ major: '12', minor: '750', currency: 'KWD' }), BOX)
    expect(kwd.minor!.x + kwd.minor!.width).toBeLessThanOrEqual(BOX.x + BOX.width)
  })
})

describe('layoutPriceMark — optional pieces', () => {
  it('omits the tab when no tier label is given', () => {
    expect(layoutPriceMark(mark(), BOX).tab).toBeNull()
    expect(layoutPriceMark(mark(), BOX, { tierLabel: 'Deal' }).tab).not.toBeNull()
  })

  it('omits the minor on a whole-currency price', () => {
    expect(layoutPriceMark(mark({ minor: '' }), BOX).minor).toBeNull()
  })

  it('places the compare price above the digits', () => {
    const l = layoutPriceMark(mark({ comparePrice: '32.00' }), BOX)
    expect(l.compare!.baseline).toBeLessThan(l.major.baseline)
  })

  it('renders PER_KG as two words', () => {
    expect(layoutPriceMark(mark({ prefixLabel: 'PER_KG' }), BOX).prefix!.text).toBe('PER KG')
  })

  it('has no compare or prefix when the offer carries neither', () => {
    const l = layoutPriceMark(mark(), BOX)
    expect(l.compare).toBeNull()
    expect(l.prefix).toBeNull()
  })
})

describe('rotation', () => {
  it('clamps to the template range — it is not an owner control', () => {
    expect(layoutPriceMark(mark({ rotation: 45 }), BOX).rotation).toBe(MAX_ROTATION)
    expect(layoutPriceMark(mark({ rotation: -45 }), BOX).rotation).toBe(-MAX_ROTATION)
  })

  it('defaults to none', () => {
    expect(layoutPriceMark(mark(), BOX).rotation).toBe(0)
  })
})

describe('the currency code', () => {
  it('never overlaps the first digit', () => {
    // Measuring "KWD" at digit width put the major straight on top of the D.
    // Letters are not tabular and W is the widest glyph in every code we ship.
    for (const currency of ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD'] as const) {
      for (const major of ['8', '24', '1299']) {
        const l = layoutPriceMark(mark({ currency, major }), BOX)
        const currencyEnd = l.currency.x + l.currency.width
        expect(currencyEnd).toBeLessThanOrEqual(l.major.x + 0.001)
      }
    }
  })

  it('leaves visible air, not merely zero overlap', () => {
    const l = layoutPriceMark(mark({ currency: 'KWD', major: '8' }), BOX)
    const gap = l.major.x - (l.currency.x + l.currency.text.length * l.currency.fontSize * 0.74)
    expect(gap).toBeGreaterThan(0)
  })
})
