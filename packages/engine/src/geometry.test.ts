import { describe, it, expect } from 'vitest'
import { resolveTracks } from './tracks'
import { spanRect, spansIntersect, spanArea, aspectOf, narrowRect } from './geometry'

const cols = resolveTracks([1, 1, 1], 300, 0)
const rows = resolveTracks([1, 1], 200, 0)

const span = (colStart: number, colEnd: number, rowStart: number, rowEnd: number) => ({
  colStart,
  colEnd,
  rowStart,
  rowEnd,
})

describe('spanRect', () => {
  it('places a single cell', () => {
    expect(spanRect(span(1, 1, 0, 0), cols, rows, 'ltr')).toEqual({
      x: 100,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('swallows the gap between merged columns, leaving no seam', () => {
    const gapped = resolveTracks([1, 1, 1], 320, 10)
    const merged = spanRect(span(0, 1, 0, 0), gapped, rows, 'ltr')
    // Two 100px tracks plus the 10px gap between them, as one card.
    expect(merged.width).toBeCloseTo(210)
  })

  it('mirrors columns in RTL and leaves rows alone', () => {
    // Logical columns 0..1 of three are physical columns 1..2 in an AR edition.
    expect(spanRect(span(0, 1, 1, 1), cols, rows, 'rtl')).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    })
  })

  it('mirrors a single cell to the opposite edge', () => {
    expect(spanRect(span(0, 0, 0, 0), cols, rows, 'rtl').x).toBe(200)
    expect(spanRect(span(0, 0, 0, 0), cols, rows, 'ltr').x).toBe(0)
  })

  it('throws rather than clamping a span outside the grid', () => {
    expect(() => spanRect(span(0, 5, 0, 0), cols, rows, 'ltr')).toThrow(/falls outside/)
  })
})

describe('spansIntersect', () => {
  it('detects a pin overlapping a region', () => {
    expect(spansIntersect(span(0, 1, 0, 0), span(1, 2, 0, 0))).toBe(true)
  })

  it('is false for spans that only touch diagonally', () => {
    expect(spansIntersect(span(0, 0, 0, 0), span(1, 1, 1, 1))).toBe(false)
  })

  it('is false for adjacent spans', () => {
    expect(spansIntersect(span(0, 0, 0, 0), span(1, 1, 0, 0))).toBe(false)
  })
})

describe('spanArea', () => {
  it('counts cells inclusively', () => {
    expect(spanArea(span(0, 1, 0, 2))).toBe(6)
    expect(spanArea(span(2, 2, 1, 1))).toBe(1)
  })
})

describe('aspectOf', () => {
  it('is width over height', () => {
    expect(aspectOf({ x: 0, y: 0, width: 200, height: 100 })).toBe(2)
  })

  it('refuses a zero-height rect rather than returning Infinity', () => {
    expect(() => aspectOf({ x: 0, y: 0, width: 10, height: 0 })).toThrow(/greater than zero/)
  })
})

/**
 * A region narrowed to part of its own span — a header an owner set to 70%.
 *
 * **Geometry only, which is the whole design.** The region still *owns* its
 * track: `spansIntersect` reads the integer span and never this, so a pin on
 * that row still collides with the band and no product creeps into the space
 * beside it. Anything else would be a layout where two blocks share a track and
 * only the renderer knows.
 */
describe('narrowRect', () => {
  const rect = { x: 100, y: 40, width: 400, height: 60 }

  it('keeps the rectangle centred as it narrows', () => {
    expect(narrowRect(rect, 0.5)).toEqual({ x: 200, y: 40, width: 200, height: 60 })
  })

  it('leaves height and vertical position alone', () => {
    const narrowed = narrowRect(rect, 0.25)
    expect(narrowed.y).toBe(rect.y)
    expect(narrowed.height).toBe(rect.height)
  })

  it('is the same rectangle at full width, absent, or wider than its span', () => {
    // Absent and 1 are one layout, which is why `composeGrid` stores neither.
    expect(narrowRect(rect, undefined)).toEqual(rect)
    expect(narrowRect(rect, 1)).toEqual(rect)
    expect(narrowRect(rect, 2)).toEqual(rect)
  })

  it('floors a width that would draw nothing', () => {
    // A band nobody can see is not a layout an owner can fix — they cannot
    // select what is not drawn. Small beats invisible.
    expect(narrowRect(rect, 0).width).toBeGreaterThan(0)
    expect(narrowRect(rect, -3).width).toBeGreaterThan(0)
    expect(narrowRect(rect, Number.NaN)).toEqual(rect)
  })
})
