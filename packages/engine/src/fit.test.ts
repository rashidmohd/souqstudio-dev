import { describe, it, expect } from 'vitest'
import type { TypeScale } from '@souqstudio/types'
import { fitPolicy, fitText, wrapText, MIN_LINE_HEIGHT, type TextMeasurer } from './fit'

/**
 * A deterministic stand-in for font metrics. The engine cannot measure a glyph
 * without a font and must not try, so the measurer is injected — the browser
 * passes a canvas measurement, the worker passes its own, tests pass this.
 */
const measure: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.5

const SCALE: TypeScale = {
  families: { headline: 'Lalezar', display: 'Cairo', price: 'Changa', body: 'Almarai' },
  base: 0.055,
  levels: {
    h1: { family: 'headline', size: 2.2, weight: 400, lineHeight: 1.02 },
    h2: { family: 'headline', size: 1.7, weight: 400, lineHeight: 1.06 },
    h3: { family: 'display', size: 1.25, weight: 700, lineHeight: 1.15 },
    h4: { family: 'display', size: 1, weight: 700, lineHeight: 1.2 },
    h5: { family: 'body', size: 0.85, weight: 600, lineHeight: 1.25 },
    h6: { family: 'body', size: 0.72, weight: 600, lineHeight: 1.3 },
    body: { family: 'body', size: 0.72, weight: 400, lineHeight: 1.35 },
    caption: { family: 'body', size: 0.58, weight: 400, lineHeight: 1.3 },
  },
}

const req = (over: Partial<Parameters<typeof fitText>[0]> = {}) => ({
  text: 'Golden basmati rice',
  box: { width: 300, height: 120 },
  level: 'h3' as const,
  scale: SCALE,
  blockSize: 400,
  measure,
  ...over,
})

describe('wrapText', () => {
  it('breaks on words, greedily', () => {
    expect(wrapText('one two three four', 95, 20, 'x', measure)).toEqual([
      'one two',
      'three',
      'four',
    ])
  })

  it('returns nothing for empty text', () => {
    expect(wrapText('   ', 100, 20, 'x', measure)).toEqual([])
  })

  it('leaves a single over-long word on its own line for rung 3 to handle', () => {
    expect(wrapText('supercalifragilistic', 10, 20, 'x', measure)).toEqual([
      'supercalifragilistic',
    ])
  })
})

describe('rung 0 — as designed', () => {
  it('leaves comfortable text at its own size and leading', () => {
    const r = fitText(req())
    expect(r.level).toBe('h3')
    expect(r.lineHeight).toBeCloseTo(1.15)
    expect(r.escalated).toBe(false)
    expect(r.truncated).toBe(false)
  })
})

describe('rung 1 — tighten the leading', () => {
  it('tightens before it shrinks', () => {
    // Three lines at h3 need 94.9 as designed and 83.5 tightened. A box of 88
    // is reachable by leading alone, so the type step must survive.
    const r = fitText(req({ text: 'Golden basmati rice aged', box: { width: 160, height: 88 } }))
    expect(r.level).toBe('h3')
    expect(r.lineHeight).toBeLessThan(1.15)
  })

  it('never tightens past the floor', () => {
    const r = fitText(req({ box: { width: 60, height: 400 } }))
    expect(r.lineHeight).toBeGreaterThanOrEqual(MIN_LINE_HEIGHT)
  })
})

describe('rung 2 — step down the scale', () => {
  it('drops to the next step, never to an arbitrary size', () => {
    const r = fitText(req({ text: 'Automatic laundry detergent powder with lemon fragrance', box: { width: 200, height: 70 } }))
    // Whatever it landed on is a real step in the scale, not a computed size.
    const sizes = Object.values(SCALE.levels).map((l) => SCALE.base * 400 * l.size)
    expect(sizes.some((s) => Math.abs(s - r.fontSize) < 1e-9)).toBe(true)
    expect(r.fontSize).toBeLessThan(SCALE.base * 400 * SCALE.levels.h3.size)
  })

  it('will not fall below the floor a name is given', () => {
    // A product name below its floor is a wasted card, not a smaller one.
    const r = fitText(
      req({
        text: 'مسحوق غسيل أوتوماتيك بالليمون للغسالات الأوتوماتيكية الحديثة',
        box: { width: 120, height: 40 },
        floor: 'h4',
      })
    )
    expect(r.fontSize).toBeGreaterThanOrEqual(SCALE.base * 400 * SCALE.levels.h4.size)
  })
})

describe('rung 3 — truncate', () => {
  it('cuts a spec and marks it', () => {
    const r = fitText(
      req({
        text: 'Front load, 3 kg, concentrated formula, product of Germany, with lemon',
        box: { width: 120, height: 24 },
        level: 'caption',
        truncatable: true,
      })
    )
    expect(r.truncated).toBe(true)
    expect(r.escalated).toBe(false)
    expect(r.lines[r.lines.length - 1]).toMatch(/…$/)
  })

  it('never cuts a name', () => {
    // "Truncate spec. Never name, never price." — E6 §4.
    const r = fitText(
      req({
        text: 'Automatic laundry detergent powder with lemon fragrance and softener',
        box: { width: 100, height: 24 },
        floor: 'h4',
        truncatable: false,
      })
    )
    expect(r.truncated).toBe(false)
    expect(r.escalated).toBe(true)
  })

  it('leaves no dangling punctuation before the ellipsis', () => {
    const r = fitText(
      req({ text: 'One, two, three, four, five, six', box: { width: 70, height: 22 }, level: 'caption', truncatable: true })
    )
    expect(r.lines[r.lines.length - 1]).not.toMatch(/[,;:.]…$/)
  })
})

describe('rung 4 — escalate', () => {
  it('flags rather than shrinking a name past legibility', () => {
    const r = fitText(req({ text: 'A'.repeat(400), box: { width: 60, height: 20 }, floor: 'h4' }))
    expect(r.escalated).toBe(true)
    // It still returns lines: the editor draws the overflowing card and marks
    // it, because a blank card tells the owner nothing about what went wrong.
    expect(r.lines.length).toBeGreaterThan(0)
  })

  it('does not escalate something that simply fits', () => {
    expect(fitText(req()).escalated).toBe(false)
  })
})

describe('the ladder as a whole', () => {
  it('is monotonic — a tighter box never yields larger type', () => {
    let previous = Infinity
    for (const width of [400, 300, 200, 140, 100, 70]) {
      const r = fitText(req({ text: 'Golden basmati rice aged two years', box: { width, height: 80 } }))
      expect(r.fontSize).toBeLessThanOrEqual(previous + 1e-9)
      previous = r.fontSize
    }
  })

  it('always returns something drawable', () => {
    for (const text of ['', 'x', 'a b c', 'A'.repeat(200)]) {
      const r = fitText(req({ text, box: { width: 80, height: 30 } }))
      expect(r.fontSize).toBeGreaterThan(0)
      expect(r.lineHeight).toBeGreaterThanOrEqual(MIN_LINE_HEIGHT)
    }
  })
})

describe('fitPolicy', () => {
  it('refuses to cut a product name, and gives it a floor', () => {
    const policy = fitPolicy({ from: 'product', field: 'name' })
    expect(policy.truncatable).toBe(false)
    expect(policy.floor).toBeDefined()
  })

  it('lets a spec be cut', () => {
    expect(fitPolicy({ from: 'product', field: 'spec' }).truncatable).toBe(true)
    expect(fitPolicy({ from: 'product', field: 'origin' }).truncatable).toBe(true)
  })

  it('refuses to cut the owner’s own words', () => {
    // An ellipsis through someone's headline is worse than telling them it
    // does not fit.
    expect(fitPolicy({ from: 'static', textEn: 'Ramadan Kareem', textAr: 'رمضان كريم' }).truncatable).toBe(false)
  })

  it('protects the shop name but not its address', () => {
    expect(fitPolicy({ from: 'shop', field: 'name' }).truncatable).toBe(false)
    expect(fitPolicy({ from: 'shop', field: 'address' }).truncatable).toBe(true)
  })
})
