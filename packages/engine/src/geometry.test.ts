import { describe, it, expect } from 'vitest'
import { resolveTracks } from './tracks'
import { spanRect, spansIntersect, spanArea, aspectOf } from './geometry'

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
