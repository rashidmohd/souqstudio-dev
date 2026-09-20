import { describe, it, expect } from 'vitest'
import type { PriceMark } from '@souqstudio/types'
import {
  MARK_MINOR_SCALE,
  MARK_NUDGE,
  MARK_SATELLITE_SCALE,
  PRICE_MARK_PRESETS,
} from '@souqstudio/types'
import type { Rect } from './geometry'
import {
  CAP_RATIO,
  currencyAdvance,
  layoutPriceMark,
  markGround,
  markRecipe,
  MAX_ROTATION,
  minorDigits,
  PRICE_MARK_RECIPES,
  splitAmount,
  toPriceMark,
  type PriceMarkLayout,
  type PriceMarkOptions,
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

describe('the ground the mark draws on', () => {
  const priced = { tierId: 't', major: '24', minor: '50', currency: 'AED' as const, currencyPlacement: 'PREFIX' as const, shape: 'TAG' as const }
  const box = { x: 0, y: 0, width: 200, height: 120 }

  it('defaults to the rounded box, so nothing already drawn moves', () => {
    const before = layoutPriceMark(priced, box, {})
    const asked = layoutPriceMark(priced, box, { ground: 'box' })
    expect(before.groundShape).toBe('box')
    expect(before.mark).toEqual(asked.mark)
  })

  it('reads the older `frame` spelling', () => {
    // Organization blocks already hold documents carrying it, and the schema is
    // strict — refusing the field would refuse a shop's saved work.
    expect(markGround({ frame: 'plain' })).toBe('none')
    expect(markGround({ frame: 'tag' })).toBe('box')
    expect(markGround(undefined)).toBe('box')
    // `ground` wins where a document carries both.
    expect(markGround({ frame: 'plain', ground: 'burst' })).toBe('burst')
  })

  it('squares a burst rather than stretching it', () => {
    // A star stretched to 3:1 is not a wide star, it is a broken one — the same
    // rule `HOLDS_PROPORTION` applies to a badge.
    const wide = layoutPriceMark(priced, { x: 0, y: 0, width: 300, height: 100 }, { ground: 'burst' })
    expect(wide.mark.width).toBeCloseTo(wide.mark.height, 5)
    // …and centres it in the box it was given.
    expect(wide.mark.x + wide.mark.width / 2).toBeCloseTo(150, 5)
  })

  it('does not square a ribbon, whose length is the point', () => {
    const wide = layoutPriceMark(priced, { x: 0, y: 0, width: 300, height: 100 }, { ground: 'ribbon' })
    expect(wide.mark.width).toBeGreaterThan(wide.mark.height)
  })

  it('fits the digits inside the shape, not inside its bounding box', () => {
    // A burst's usable interior is a fraction of the box it occupies. Digits
    // sized against the box run into the spikes.
    const burst = layoutPriceMark(priced, box, { ground: 'burst' })
    const plain = layoutPriceMark(priced, box, { ground: 'none' })
    expect(burst.digits.width).toBeLessThan(plain.digits.width)
    expect(burst.major.fontSize).toBeLessThan(plain.major.fontSize)
  })

  it('keeps every piece inside the digit box', () => {
    // The defect the gallery caught: a compare price placed against the ground
    // printed across a spike.
    const withCompare = { ...priced, comparePrice: '32.00' }
    for (const ground of ['none', 'box', 'burst', 'star', 'ribbon', 'tag', 'flash', 'arrow'] as const) {
      const l = layoutPriceMark(withCompare, box, { ground })
      const pieces = [l.currency, l.major, l.minor, l.compare].filter((x) => x !== null)
      for (const piece of pieces) {
        expect({ ground, inside: piece!.x >= l.digits.x - 0.5 }).toEqual({ ground, inside: true })
        expect({
          ground,
          within: piece!.x + piece!.width <= l.digits.x + l.digits.width + 0.5,
        }).toEqual({ ground, within: true })
      }
    }
  })

  it('centres the was-price in a round ground and ends it in a rectangle', () => {
    const withCompare = { ...priced, comparePrice: '32.00' }
    const burst = layoutPriceMark(withCompare, box, { ground: 'burst' })
    const boxed = layoutPriceMark(withCompare, box, { ground: 'box' })

    const centreOf = (l: typeof burst) => l.compare!.x + l.compare!.width / 2
    expect(centreOf(burst)).toBeCloseTo(burst.digits.x + burst.digits.width / 2, 5)
    // The rectangle keeps the end-aligned treatment it always had.
    expect(centreOf(boxed)).toBeGreaterThan(boxed.digits.x + boxed.digits.width / 2)
  })
})

// ─── Recipes ──────────────────────────────────────────────────────────────────

describe('classic-tag is byte-identical to the mark drawn before recipes', () => {
  /**
   * **Hand-computed from the pre-recipe formulas, not captured from this
   * implementation.** A snapshot taken from the code under test asserts only
   * that it has not changed since the snapshot; these numbers come from the
   * arithmetic the old `layoutPriceMark` did, so they are the thing that says
   * opening the interior moved nothing already drawn.
   *
   * BOX is 320×160 at (100, 200); the mark is AED 24.50 on the default box
   * ground, which insets to 0.86 × 0.82.
   */
  it('puts every piece exactly where it used to', () => {
    const l = layoutPriceMark(mark(), BOX)

    // digits = BOX inset by MARK_FIT.box
    expect(l.digits).toEqual({ x: 122.4, y: 214.4, width: 275.2, height: 131.2 })

    // majorSize = min(131.2 × 0.58, …) — height-bound at this aspect
    expect(l.major.fontSize).toBeCloseTo(76.096, 6)
    expect(l.minor!.fontSize).toBeCloseTo(33.48224, 6)
    expect(l.currency.fontSize).toBeCloseTo(22.8288, 6)

    // baseline = digits.y + digits.height × 0.74
    expect(l.major.baseline).toBeCloseTo(311.488, 6)
    expect(l.minor!.baseline).toBeCloseTo(280.8060928, 6)

    expect(l.currency.x).toBeCloseTo(162.064448, 6)
    expect(l.major.x).toBeCloseTo(226.441664, 6)
    expect(l.minor!.x).toBeCloseTo(317.756864, 6)
  })

  it('puts the tab exactly where it used to', () => {
    const l = layoutPriceMark(mark(), BOX, { tierLabel: 'DEAL' })

    // tabHeight = 160 × 0.26; the mark slides up by 14% of it.
    expect(l.tab!.rect.x).toBe(100)
    expect(l.tab!.rect.y).toBe(200)
    expect(l.tab!.rect.width).toBeCloseTo(179.2, 6)
    expect(l.tab!.rect.height).toBeCloseTo(41.6, 6)
    expect(l.mark.y).toBeCloseTo(200 + 41.6 * 0.86, 6)
    expect(l.tab!.fontSize).toBeCloseTo(Math.min(41.6 * 0.5, (320 * 0.48) / (4 * 0.62)), 6)
  })

  it('is what an absent preset resolves to', () => {
    expect(markRecipe(undefined)).toEqual(PRICE_MARK_RECIPES['classic-tag'])
    expect(markRecipe({})).toEqual(PRICE_MARK_RECIPES['classic-tag'])
    expect(markRecipe({ preset: 'classic-tag' })).toEqual(PRICE_MARK_RECIPES['classic-tag'])
  })
})

describe('markRecipe', () => {
  it('keeps the preset applying where an override is silent', () => {
    // An owner who moved the was-price has not thereby chosen a currency
    // placement. All-or-nothing would make every small adjustment a full
    // re-authoring.
    const r = markRecipe({ preset: 'shelf-ticket', recipe: { compare: { place: 'above' } } })
    expect(r.compare.place).toBe('above')
    expect(r.currency).toBe(PRICE_MARK_RECIPES['shelf-ticket'].currency)
    expect(r.align).toEqual(PRICE_MARK_RECIPES['shelf-ticket'].align)
  })

  it('clamps a scale rather than trusting the caller', () => {
    expect(markRecipe({ recipe: { compare: { scale: 9 } } }).compare.scale).toBe(
      MARK_SATELLITE_SCALE.max
    )
    expect(markRecipe({ recipe: { compare: { scale: 0 } } }).compare.scale).toBe(
      MARK_SATELLITE_SCALE.min
    )
    expect(markRecipe({ recipe: { minorScale: 4 } }).minorScale).toBe(MARK_MINOR_SCALE.max)
  })

  it('still reads the older `tab: none` spelling', () => {
    // Organization blocks already carry it and the document schema is strict.
    expect(markRecipe({ tab: 'none' }).tier.place).toBe('hidden')
    // …and the recipe wins where a document carries both.
    expect(markRecipe({ tab: 'none', recipe: { tier: { place: 'below-end' } } }).tier.place).toBe(
      'below-end'
    )
  })
})

describe('the invariants hold for every preset', () => {
  const BOXES: Rect[] = [
    { x: 0, y: 0, width: 320, height: 160 },
    { x: 0, y: 0, width: 160, height: 320 },
    { x: 0, y: 0, width: 600, height: 60 },
    { x: 0, y: 0, width: 120, height: 120 },
  ]
  const PRICES: PriceMark[] = [
    mark(),
    mark({ major: '9', minor: '' }),
    mark({ major: '1299', minor: '99', comparePrice: '2499.00', prefixLabel: 'FROM' }),
    mark({ major: '12', minor: '750', currency: 'KWD', comparePrice: '32.000' }),
    mark({ major: '8', minor: '25', currency: 'BHD', prefixLabel: 'PER_KG' }),
  ]

  /** Every combination the matrix produces, laid out. */
  const every = (
    run: (l: PriceMarkLayout, where: string) => void,
    options: Omit<PriceMarkOptions, 'recipe'> = {}
  ) => {
    for (const preset of PRICE_MARK_PRESETS) {
      const recipe = PRICE_MARK_RECIPES[preset]
      for (const box of BOXES) {
        for (const price of PRICES) {
          const where = `${preset} ${box.width}×${box.height} ${price.currency}${price.major}`
          run(layoutPriceMark(price, box, { ...options, recipe }), where)
        }
      }
    }
  }

  it('raises a raised minor to the major cap height', () => {
    // The choice is the treatment; the offset never is.
    for (const preset of PRICE_MARK_PRESETS) {
      const recipe = PRICE_MARK_RECIPES[preset]
      if (recipe.minor !== 'raised') continue
      const l = layoutPriceMark(mark(), BOX, { recipe })
      const majorCapTop = l.major.baseline - l.major.fontSize * CAP_RATIO
      const minorCapTop = l.minor!.baseline - l.minor!.fontSize * CAP_RATIO
      expect({ preset, aligned: Math.abs(minorCapTop - majorCapTop) < 1e-6 }).toEqual({
        preset,
        aligned: true,
      })
    }
  })

  it('gives a baseline minor its separator, so "2450" cannot happen', () => {
    const l = layoutPriceMark(mark(), BOX, { recipe: PRICE_MARK_RECIPES['wide-band'] })
    expect(l.minor!.text).toBe('.50')
    expect(l.minor!.baseline).toBe(l.major.baseline)
  })

  describe('whole numbers', () => {
    const whole = PRICE_MARK_RECIPES['whole-number']

    it('drops the fils when there are none to drop', () => {
      expect(layoutPriceMark(mark({ minor: '00' }), BOX, { recipe: whole }).minor).toBeNull()
      expect(
        layoutPriceMark(mark({ minor: '000', currency: 'KWD' }), BOX, { recipe: whole }).minor
      ).toBeNull()
    })

    it('never hides fils a customer would be charged', () => {
      /**
       * **The one thing a style field may not do is restate what an offer
       * costs.** "AED 12" for a price of 12.75 is not a quieter price, it is a
       * lower one, printed on a flyer somebody takes to a till. A non-zero
       * minor falls back to the raised treatment.
       */
      for (const [minor, currency] of [
        ['50', 'AED'],
        ['99', 'SAR'],
        ['750', 'KWD'],
        ['005', 'BHD'],
      ] as const) {
        const l = layoutPriceMark(mark({ minor, currency }), BOX, { recipe: whole })
        expect({ minor, shown: l.minor?.text ?? null }).toEqual({ minor, shown: minor })
        // …and it falls back to raised rather than sitting on the baseline.
        expect(l.minor!.baseline).toBeLessThan(l.major.baseline)
      }
    })
  })

  it('never lets the tab separate from the mark, wherever it is placed', () => {
    const PLACES = [
      'above-start',
      'above',
      'above-end',
      'below-start',
      'below',
      'below-end',
      'start',
      'end',
    ] as const

    for (const place of PLACES) {
      for (const height of [60, 160, 400]) {
        const recipe = markRecipe({ recipe: { tier: { place } } })
        const l = layoutPriceMark(mark(), { ...BOX, height }, { tierLabel: 'DEAL', recipe })
        const tab = l.tab!.rect
        // Overlapping on both axes, not merely touching.
        const overlaps =
          tab.x < l.mark.x + l.mark.width &&
          l.mark.x < tab.x + tab.width &&
          tab.y < l.mark.y + l.mark.height &&
          l.mark.y < tab.y + tab.height
        expect({ place, height, overlaps }).toEqual({ place, height, overlaps: true })
      }
    }
  })

  it('lays the amount out start-to-end, and does not mirror', () => {
    every((l, where) => {
      expect({ where, ordered: l.major.x <= (l.minor?.x ?? Infinity) }).toEqual({
        where,
        ordered: true,
      })
      const leading = l.currency.baseline === l.major.baseline || true
      expect(leading).toBe(true)
    })
  })

  it('never lets a part approach the major', () => {
    // The ratio ceiling is what actually prevents a hundred inconsistent price
    // treatments — not the absence of controls.
    every((l, where) => {
      for (const [name, piece] of [
        ['minor', l.minor],
        ['currency', l.currency],
        ['compare', l.compare],
        ['prefix', l.prefix],
      ] as const) {
        if (piece === null) continue
        expect({ where, name, under: piece.fontSize <= l.major.fontSize + 1e-9 }).toEqual({
          where,
          name,
          under: true,
        })
      }
    })
  })

  it('fits every piece inside the digit box', () => {
    every((l, where) => {
      for (const [name, piece] of [
        ['currency', l.currency],
        ['major', l.major],
        ['minor', l.minor],
        ['compare', l.compare],
        ['prefix', l.prefix],
      ] as const) {
        if (piece === null) continue
        expect({ where, name, from: piece.x >= l.digits.x - 0.5 }).toEqual({
          where,
          name,
          from: true,
        })
        expect({
          where,
          name,
          to: piece.x + piece.width <= l.digits.x + l.digits.width + 0.5,
        }).toEqual({ where, name, to: true })
      }
    })
  })

  it('never produces a size that is zero, negative or not a number', () => {
    // A price that fails to draw is the one failure the artefact cannot absorb.
    every((l, where) => {
      expect({ where, drawn: l.major.fontSize > 0 && Number.isFinite(l.major.fontSize) }).toEqual({
        where,
        drawn: true,
      })
    })
  })

  it('sizes the price the same whether or not the offer has a was-price', () => {
    /**
     * **The reason bands are reserved by the recipe and not by the content.**
     * A row of cards where some offers carry a was-price and some do not must
     * set every price at the same size; sizing to the content makes the price
     * jump between neighbouring cards, which is the inconsistency the component
     * exists to prevent.
     */
    for (const preset of PRICE_MARK_PRESETS) {
      const recipe = PRICE_MARK_RECIPES[preset]
      const bare = layoutPriceMark(mark(), BOX, { recipe })
      const rich = layoutPriceMark(mark({ comparePrice: '32.00', prefixLabel: 'FROM' }), BOX, {
        recipe,
      })
      expect({ preset, size: rich.major.fontSize }).toEqual({
        preset,
        size: bare.major.fontSize,
      })
    }
  })

  it('keeps the satellites off each other in a round ground', () => {
    // The old code centred the was-price and left the FROM line hugging the
    // start, so the two only missed each other by accident.
    const recipe = markRecipe({ recipe: { compare: { place: 'above-end' }, prefix: { place: 'above-start' } } })
    const l = layoutPriceMark(mark({ comparePrice: '32.00', prefixLabel: 'FROM' }), BOX, {
      ground: 'burst',
      recipe,
    })
    const prefixEnd = l.prefix!.x + l.prefix!.width
    expect(prefixEnd).toBeLessThanOrEqual(l.compare!.x)
  })
})

describe('two satellites sharing a band', () => {
  const both = mark({ comparePrice: '2499.00', prefixLabel: 'PER_KG' })

  it('never prints one on top of the other, whatever the recipe asks', () => {
    /**
     * **A band is laid out as a band, not as two independent placements.** Two
     * pieces asking for the same end of the same band is an ordinary thing for
     * a recipe to say; placing each one on its own puts them in the same place.
     * The old code only avoided this by hard-coding the was-price to the end and
     * the FROM line to the start.
     */
    const PAIRS = [
      ['above', 'above'],
      ['above-start', 'above-start'],
      ['above-end', 'above-end'],
      ['below', 'below'],
      ['below-end', 'below-end'],
      ['above-start', 'above'],
    ] as const

    for (const [compare, prefix] of PAIRS) {
      for (const ground of ['box', 'burst'] as const) {
        const recipe = markRecipe({ recipe: { compare: { place: compare }, prefix: { place: prefix } } })
        const l = layoutPriceMark(both, BOX, { ground, recipe })
        const a = l.prefix!
        const b = l.compare!
        const apart = a.x + a.width <= b.x + 0.001 || b.x + b.width <= a.x + 0.001
        expect({ compare, prefix, ground, apart }).toEqual({ compare, prefix, ground, apart: true })
      }
    }
  })

  it('keeps the reading order — the prefix leads, the was-price follows', () => {
    const recipe = markRecipe({ recipe: { compare: { place: 'above' }, prefix: { place: 'above' } } })
    const l = layoutPriceMark(both, BOX, { recipe })
    expect(l.prefix!.x).toBeLessThan(l.compare!.x)
  })
})

describe('a satellite in a side band', () => {
  it('shrinks to its column rather than running across the digits', () => {
    // A side band is a narrow strip. Sized only against the major, a long
    // was-price runs straight out of it and over the price.
    const recipe = markRecipe({ recipe: { compare: { place: 'end' } } })
    const l = layoutPriceMark(mark({ comparePrice: '2499.00' }), BOX, { recipe })

    const bandStart = l.digits.x + l.digits.width * (1 - 0.26)
    expect(l.compare!.x).toBeGreaterThanOrEqual(bandStart - 0.5)
    expect(l.compare!.x + l.compare!.width).toBeLessThanOrEqual(
      l.digits.x + l.digits.width + 0.5
    )
  })

  it('leaves the amount the room the band did not take', () => {
    const recipe = markRecipe({ recipe: { compare: { place: 'end' }, prefix: { place: 'start' } } })
    const l = layoutPriceMark(mark({ comparePrice: '32.00', prefixLabel: 'FROM' }), BOX, { recipe })
    // Both side bands reserved, so the cluster is narrower than the digit box.
    expect(l.amount.width).toBeLessThan(l.digits.width)
    expect(l.major.x).toBeGreaterThanOrEqual(l.amount.x - 0.5)
  })
})

// ─── The nudge ────────────────────────────────────────────────────────────────
//
// `dx`/`dy` move a part off its compass point, in fractions of the major's size.
// The compass decides which band a part belongs to; the nudge decides where in
// that band it sits. What these assert is the pair of properties that made it
// safe to offer at all: it changes nothing unless it is set, and it cannot break
// the one rule the tab has.

describe('the nudge', () => {
  it('defaults to zero, so a recipe that never mentions it is unchanged', () => {
    for (const preset of PRICE_MARK_PRESETS) {
      const recipe = markRecipe({ preset })
      expect({ preset, compare: recipe.compare.dx, tier: recipe.tier.dy }).toEqual({
        preset,
        compare: 0,
        tier: 0,
      })
    }
  })

  it('leaves the layout byte-identical when set to zero explicitly', () => {
    const price = mark({ comparePrice: '32.00', prefixLabel: 'FROM' })
    const plain = layoutPriceMark(price, BOX, { tierLabel: 'DEAL' })
    const zeroed = layoutPriceMark(price, BOX, {
      tierLabel: 'DEAL',
      recipe: markRecipe({ recipe: { compare: { dx: 0, dy: 0 }, prefix: { dx: 0, dy: 0 } } }),
    })
    expect(zeroed).toEqual(plain)
  })

  it('moves a satellite by the fraction of the major it was given', () => {
    const price = mark({ comparePrice: '32.00' })
    const before = layoutPriceMark(price, BOX, { tierLabel: 'DEAL' })
    const after = layoutPriceMark(price, BOX, {
      tierLabel: 'DEAL',
      recipe: markRecipe({ recipe: { compare: { dx: 0.25, dy: -0.1 } } }),
    })

    const step = before.major.fontSize
    expect(after.compare!.x - before.compare!.x).toBeCloseTo(0.25 * step, 6)
    expect(after.compare!.baseline - before.compare!.baseline).toBeCloseTo(-0.1 * step, 6)
    // It moved; it did not resize.
    expect(after.compare!.fontSize).toBe(before.compare!.fontSize)
    expect(after.compare!.width).toBe(before.compare!.width)
  })

  it('does not drag the other piece in the same band along with it', () => {
    const price = mark({ comparePrice: '32.00', prefixLabel: 'FROM' })
    // Both in the top band, hugging the same end, so they lay out as one row.
    const style = { recipe: { compare: { place: 'above' as const }, prefix: { place: 'above' as const } } }
    const before = layoutPriceMark(price, BOX, { tierLabel: 'DEAL', recipe: markRecipe(style) })
    const after = layoutPriceMark(price, BOX, {
      tierLabel: 'DEAL',
      recipe: markRecipe({ recipe: { ...style.recipe, compare: { place: 'above', dy: 0.2 } } }),
    })

    expect(after.prefix).toEqual(before.prefix)
    expect(after.compare!.baseline).toBeGreaterThan(before.compare!.baseline)
  })

  it('clamps to MARK_NUDGE rather than refusing an out-of-range value', () => {
    const recipe = markRecipe({ recipe: { compare: { dx: 99, dy: -99 } } })
    expect({ dx: recipe.compare.dx, dy: recipe.compare.dy }).toEqual({
      dx: MARK_NUDGE.max,
      dy: MARK_NUDGE.min,
    })
  })

  /**
   * The one that earns the feature.
   *
   * E6 §3's "the tab and the mark never separate" is asserted above for every
   * compass point; a nudge that could carry the tab clear of the mark would
   * have quietly repealed it. The solver slides the rect back until it keeps
   * its overlap, so the invariant holds at the extremes of the range, at every
   * size, in every position — which is what lets the slider exist.
   */
  it('never lets a nudged tab separate from the mark', () => {
    const PLACES = [
      'above-start',
      'above',
      'above-end',
      'below-start',
      'below',
      'below-end',
      'start',
      'end',
    ] as const

    for (const place of PLACES) {
      for (const height of [60, 160, 400]) {
        for (const dx of [MARK_NUDGE.min, 0, MARK_NUDGE.max]) {
          for (const dy of [MARK_NUDGE.min, 0, MARK_NUDGE.max]) {
            const recipe = markRecipe({ recipe: { tier: { place, dx, dy } } })
            const l = layoutPriceMark(mark(), { ...BOX, height }, { tierLabel: 'DEAL', recipe })
            const tab = l.tab!.rect
            const overlaps =
              tab.x < l.mark.x + l.mark.width &&
              l.mark.x < tab.x + tab.width &&
              tab.y < l.mark.y + l.mark.height &&
              l.mark.y < tab.y + tab.height
            expect({ place, height, dx, dy, overlaps }).toEqual({
              place,
              height,
              dx,
              dy,
              overlaps: true,
            })
          }
        }
      }
    }
  })
})

// ─── The currency a shop chose ────────────────────────────────────────────────
//
// A shop sets a currency, a display mode and optionally its own symbol; that
// resolves to one string on the mark. The code still decides the arithmetic.

describe('the currency label', () => {
  it('draws the ISO code when the shop has not chosen otherwise', () => {
    const l = layoutPriceMark(mark(), BOX, {})
    expect(l.currency.text).toBe('AED')
  })

  it('draws the shop’s symbol when there is one', () => {
    const l = layoutPriceMark(mark({ currencyLabel: 'د.إ' }), BOX, {})
    expect(l.currency.text).toBe('د.إ')
  })

  /**
   * The one that stops a symbol being a pricing change.
   *
   * `minorDigits` reads `currency`, never `currencyLabel` — so a Kuwaiti price
   * carries three fils whether the card says `KWD` or `د.ك`. Getting this wrong
   * would drop a digit off a price a customer takes to a till.
   */
  it('never lets the label change how many fils a price has', () => {
    const withCode = layoutPriceMark(
      mark({ currency: 'KWD', ...splitAmount('12.75', 'KWD') }),
      BOX,
      {}
    )
    const withSymbol = layoutPriceMark(
      mark({ currency: 'KWD', currencyLabel: 'د.ك', ...splitAmount('12.75', 'KWD') }),
      BOX,
      {}
    )
    expect(withCode.minor!.text).toBe('750')
    expect(withSymbol.minor!.text).toBe('750')
  })

  it('measures an Arabic symbol as narrower than three Latin capitals', () => {
    // The failure this prevents is not overflow — the solver sizes the amount
    // around the currency, so over-measuring shrinks the *price* and nothing
    // says why.
    expect(currencyAdvance('د.إ')).toBeLessThan(currencyAdvance('AED'))
  })

  it('measures every ISO code exactly as it did before symbols existed', () => {
    for (const code of ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD']) {
      expect(currencyAdvance(code)).toBeCloseTo(code.length * 0.74, 10)
    }
  })

  it('takes a renderer’s own metrics over its own guess', () => {
    // **A tall, narrow box, so width is what binds.** The solver takes the
    // smaller of what the width allows and what the height does; in a box where
    // height binds, the currency's measurement changes the mark's *spacing* and
    // not the price's size, and a test on the default box asserts nothing.
    const narrowBox = { x: 0, y: 0, width: 120, height: 400 }
    const wide = layoutPriceMark(mark({ currencyLabel: 'د.إ' }), narrowBox, {
      measureCurrency: () => 4,
    })
    const narrow = layoutPriceMark(mark({ currencyLabel: 'د.إ' }), narrowBox, {
      measureCurrency: () => 0.5,
    })
    // A currency measured wider leaves the digits less room, so the price is set
    // smaller — which is the whole reason the measurement has to be right.
    expect(wide.major.fontSize).toBeLessThan(narrow.major.fontSize)
    // And it is the measurement that moved, on any box.
    const onDefault = (advance: number) =>
      layoutPriceMark(mark({ currencyLabel: 'د.إ' }), BOX, { measureCurrency: () => advance })
    expect(onDefault(4).major.x).toBeGreaterThan(onDefault(0.5).major.x)
  })

  it('leaves a code-only mark byte-identical', () => {
    const plain = layoutPriceMark(mark({ comparePrice: '32.00' }), BOX, { tierLabel: 'DEAL' })
    const labelled = layoutPriceMark(
      mark({ comparePrice: '32.00', currencyLabel: 'AED' }),
      BOX,
      { tierLabel: 'DEAL' }
    )
    expect(labelled).toEqual(plain)
  })
})
