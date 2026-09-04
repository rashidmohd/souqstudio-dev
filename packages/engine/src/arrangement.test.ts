import { describe, it, expect } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { pickArrangement } from './arrangement'

const at = (aspectMin: number, aspectMax: number): Arrangement => ({
  aspectMin,
  aspectMax,
  elements: [],
})

/** A typical repeating offer card: tall, square, wide, banner. */
const CARD: Arrangement[] = [at(0.4, 0.8), at(0.8, 1.3), at(1.3, 2.5), at(2.5, 8)]

describe('pickArrangement', () => {
  it('picks the arrangement whose range contains the aspect', () => {
    expect(pickArrangement(CARD, 0.5)).toBe(0)
    expect(pickArrangement(CARD, 1)).toBe(1)
    expect(pickArrangement(CARD, 2)).toBe(2)
    expect(pickArrangement(CARD, 5)).toBe(3)
  })

  it('takes the first match when ranges touch at a boundary', () => {
    expect(pickArrangement(CARD, 0.8)).toBe(0)
    expect(pickArrangement(CARD, 1.3)).toBe(1)
  })

  it('falls back to the nearest range rather than refusing to render', () => {
    // A missing card on a printed flyer is worse than a cramped one; the fit
    // ladder handles cramped.
    expect(pickArrangement(CARD, 0.1)).toBe(0)
    expect(pickArrangement(CARD, 50)).toBe(3)
  })

  it('serves a static block that declares one open range', () => {
    const brandAd = [at(0.1, 10)]
    expect(pickArrangement(brandAd, 0.5)).toBe(0)
    expect(pickArrangement(brandAd, 4)).toBe(0)
  })

  it('throws on a block with no arrangements', () => {
    expect(() => pickArrangement([], 1)).toThrow(/at least one arrangement/)
  })
})
