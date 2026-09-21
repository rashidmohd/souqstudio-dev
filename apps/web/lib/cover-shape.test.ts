import { describe, expect, it } from 'vitest'
import { coverRatio, shapeFor } from '@/lib/cover-shape'

/**
 * Which cover shape suits a page, from its own proportions.
 *
 * **Asked of the page rather than of the owner** in the editor, because they
 * answered it already when they chose what they were making. The failure is not
 * an error: a story-shaped cover under `fit: 'cover'` on an A4 page is cropped
 * to a sliver, and an owner sees a bad picture rather than a mismatch.
 *
 * Matching is nearest-by-ratio in log space, not a ladder of thresholds — A4
 * (1:1.414) and a 3:4 leaflet sit 0.04 apart and no hand-written cut-off
 * separates them convincingly.
 */
describe('shapeFor', () => {
  it('matches each shape to its own ratio', () => {
    expect(shapeFor(16 / 9)).toBe('wide')
    expect(shapeFor(1)).toBe('square')
    expect(shapeFor(4 / 5)).toBe('post')
    expect(shapeFor(3 / 4)).toBe('portrait')
    expect(shapeFor(1 / 1.414)).toBe('a4')
    expect(shapeFor(9 / 16)).toBe('story')
  })

  it('tells A4 and a 3:4 leaflet apart, which a threshold could not', () => {
    // 0.707 and 0.75 — the pair that made the old three-way ladder arbitrary.
    expect(shapeFor(210 / 297)).toBe('a4')
    expect(shapeFor(0.75)).toBe('portrait')
  })

  it('reads real page sizes', () => {
    expect(shapeFor(1080 / 1920)).toBe('story')
    expect(shapeFor(1080 / 1350)).toBe('post')
    // US Letter is 0.773, which is nearer 3:4 (0.75) than A4 (0.707) — worth
    // pinning, because it is the one people assume goes the other way.
    expect(shapeFor(8.5 / 11)).toBe('portrait')
  })

  it('takes the nearest shape for anything in between', () => {
    expect(shapeFor(1.2)).toBe('square')
    expect(shapeFor(0.5)).toBe('story')
  })

  it('falls back rather than throwing on a degenerate page', () => {
    // A page mid-layout can measure zero, and a cover picker is not the place
    // for that to become an exception.
    expect(shapeFor(0)).toBe('portrait')
    expect(shapeFor(Number.NaN)).toBe('portrait')
  })
})

/**
 * The ratio a kept cover is shown at.
 *
 * **It takes a stored string, not a `CoverShape`**, which is the whole reason
 * it needs a test: `covers.shape` is a plain column, and every thumbnail in the
 * product renders from whatever is in it. A row naming a shape we have stopped
 * offering must come back as a picture, not as an exception in a gallery.
 */
describe('coverRatio', () => {
  it('gives each shape its own proportions', () => {
    expect(coverRatio('wide')).toBe('16 / 9')
    expect(coverRatio('square')).toBe('1 / 1')
    expect(coverRatio('story')).toBe('9 / 16')
  })

  it('falls back to portrait for a shape no longer offered', () => {
    expect(coverRatio('billboard')).toBe('3 / 4')
    expect(coverRatio('')).toBe('3 / 4')
  })
})
