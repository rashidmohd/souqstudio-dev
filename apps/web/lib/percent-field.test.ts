import { describe, expect, it } from 'vitest'
import { readPercent } from '@/lib/percent-field'

/**
 * The border width an owner types, as the fraction the document stores.
 *
 * A width is a fraction of the block's geometric mean — never pixels — which is
 * what lets one block render at 1080 square for a post and at a third of an A4
 * column with the border reading the same in both. The control shows a percent
 * because the fraction is `0.004`.
 */
const W = { min: 0.1, max: 5 }

describe('readPercent', () => {
  it('stores a percent as a fraction', () => {
    expect(readPercent('0.4', W)).toBeCloseTo(0.004, 10)
    expect(readPercent('2', W)).toBeCloseTo(0.02, 10)
  })

  it('clamps to a border a card can carry', () => {
    // The schema allows a fifth of a card. A fifth of a card is not a border.
    expect(readPercent('99', W)).toBeCloseTo(0.05, 10)
    expect(readPercent('0', W)).toBeCloseTo(0.001, 10)
  })

  it('survives an emptied field and a half-typed one', () => {
    // **A number input hands over both**, and `NaN` passes straight through
    // `Math.min`/`Math.max` — so it would reach the document as a width the
    // schema refuses and the owner would learn about a keystroke at save time.
    expect(readPercent('', W)).toBeCloseTo(0.001, 10)
    expect(readPercent('-', W)).toBeCloseTo(0.001, 10)
    expect(readPercent('abc', W)).toBeCloseTo(0.001, 10)
    expect(Number.isFinite(readPercent('1e', W))).toBe(true)
  })

  it('lets a caller choose what an unreadable value becomes', () => {
    // A border falls to the thinnest one that draws; an offset falls to zero,
    // because a shadow nudged by a typo is worse than one that has not moved.
    expect(readPercent('abc', { min: -10, max: 10 }, 0)).toBe(0)
  })

  it('never returns a value the document schema would refuse', () => {
    for (const input of ['', 'x', '-5', '0.0001', '1000', '3.7']) {
      const width = readPercent(input, W)
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width).toBeLessThanOrEqual(0.2)
    }
  })
})
