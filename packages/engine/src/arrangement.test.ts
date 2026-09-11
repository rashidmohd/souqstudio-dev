import { describe, it, expect } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { arrangementCovers, pickArrangement } from './arrangement'

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

describe('arrangementCovers', () => {
  /** The two bands every seeded offer card carries, from `library-kit.ts`. */
  const CARD = [
    { aspectMin: 0.35, aspectMax: 0.85 },
    { aspectMin: 1.35, aspectMax: 2.6 },
  ] as unknown as Parameters<typeof arrangementCovers>[0]

  it('says yes inside a range and on its edges', () => {
    expect(arrangementCovers(CARD, 0.7)).toBe(true)
    expect(arrangementCovers(CARD, 0.35)).toBe(true)
    expect(arrangementCovers(CARD, 0.85)).toBe(true)
    expect(arrangementCovers(CARD, 2.0)).toBe(true)
  })

  /**
   * The hole this function exists to report: a square cell, which is what a
   * booklet with both bands or a story with either one produces, and which no
   * offer card designs for.
   */
  it('says no in the gap between the two bands', () => {
    expect(arrangementCovers(CARD, 1.0)).toBe(false)
    expect(arrangementCovers(CARD, 0.914)).toBe(false)
    expect(arrangementCovers(CARD, 1.3)).toBe(false)
  })

  it('disagrees with pickArrangement rather than duplicating it', () => {
    // `pickArrangement` still answers, because it never fails. That is exactly
    // the silence this reports.
    expect(pickArrangement(CARD, 1.0)).toBe(0)
    expect(arrangementCovers(CARD, 1.0)).toBe(false)
  })

  it('says no for a block with no arrangements at all', () => {
    expect(arrangementCovers([], 1.0)).toBe(false)
  })
})
