import { describe, it, expect } from 'vitest'
import type { CellSpan } from './geometry'
import {
  expandSpan,
  hasMergeIn,
  mergeAt,
  mergeSpan,
  normalizeMerges,
  unionSpan,
  unmergeSpan,
} from './merge'

const span = (colStart: number, rowStart: number, colEnd = colStart, rowEnd = rowStart): CellSpan => ({
  colStart,
  colEnd,
  rowStart,
  rowEnd,
})

const bounds = { perRow: 4, bodyRows: 3 }

describe('normalizeMerges', () => {
  it('keeps a well-formed merge', () => {
    expect(normalizeMerges([span(0, 0, 1, 1)], bounds)).toEqual([span(0, 0, 1, 1)])
  })

  it('drops a single cell — that is not a merge', () => {
    expect(normalizeMerges([span(2, 1)], bounds)).toEqual([])
  })

  it('drops an inverted span rather than repairing it', () => {
    expect(normalizeMerges([{ colStart: 3, colEnd: 1, rowStart: 0, rowEnd: 1 }], bounds)).toEqual([])
  })

  it('drops an out-of-bounds merge rather than clipping it', () => {
    // The whole decision in this function. A 2×2 hero clipped to a 2×1 band is a
    // merge the owner never made, and they would find it on a printed flyer.
    expect(normalizeMerges([span(2, 0, 4, 1)], bounds)).toEqual([])
    expect(normalizeMerges([span(0, 2, 1, 3)], bounds)).toEqual([])
  })

  it('keeps a merge that still fits when the grid shrinks', () => {
    expect(normalizeMerges([span(0, 0, 1, 1)], { perRow: 2, bodyRows: 2 })).toEqual([
      span(0, 0, 1, 1),
    ])
  })

  it('resolves two merges claiming one cell first-wins', () => {
    const first = span(0, 0, 1, 0)
    const second = span(1, 0, 2, 0)
    expect(normalizeMerges([first, second], bounds)).toEqual([first])
  })

  it('copies rather than aliasing its input', () => {
    const input = [span(0, 0, 1, 1)]
    const out = normalizeMerges(input, bounds)
    expect(out[0]).not.toBe(input[0])
  })
})

describe('unionSpan', () => {
  it('is the smallest span containing both', () => {
    expect(unionSpan(span(0, 0), span(2, 1))).toEqual(span(0, 0, 2, 1))
  })
})

describe('expandSpan', () => {
  it('leaves a span that touches nothing alone', () => {
    expect(expandSpan(span(0, 0, 1, 0), [span(2, 2, 3, 2)])).toEqual(span(0, 0, 1, 0))
  })

  it('grows to cover a merge it half-touches', () => {
    // Every spreadsheet does this: drag across half a merged hero and the
    // selection snaps out to include all of it, because there is no L-shaped
    // merge to make from an L-shaped selection.
    expect(expandSpan(span(1, 0), [span(1, 0, 2, 1)])).toEqual(span(1, 0, 2, 1))
  })

  it('reaches a second merge the first one brought it into contact with', () => {
    // The fixpoint, and why one pass is not enough. The selection is the top
    // two cells; absorbing the tall merge on the right grows it down two rows,
    // and only then does it reach the tall merge on the left. Ordered so the
    // left one is tested *before* the growth that makes it relevant.
    const left = span(0, 1, 0, 2)
    const right = span(1, 0, 1, 2)
    expect(expandSpan(span(0, 0, 1, 0), [left, right])).toEqual(span(0, 0, 1, 2))
  })
})

describe('mergeAt', () => {
  it('finds the merge covering a cell, including one it does not start', () => {
    const merges = [span(1, 0, 2, 1)]
    expect(mergeAt(merges, 2, 1)).toEqual(merges[0])
    expect(mergeAt(merges, 0, 0)).toBeUndefined()
  })
})

describe('mergeSpan', () => {
  it('merges a plain selection', () => {
    expect(mergeSpan([], span(0, 0, 1, 1), bounds)).toEqual([span(0, 0, 1, 1)])
  })

  it('merges nothing when the selection is one cell', () => {
    expect(mergeSpan([], span(2, 1), bounds)).toEqual([])
  })

  it('absorbs a merge the selection overlaps rather than overlapping it', () => {
    const existing = span(0, 0, 1, 0)
    expect(mergeSpan([existing], span(1, 0, 2, 0), bounds)).toEqual([span(0, 0, 2, 0)])
  })

  it('leaves merges the selection does not touch', () => {
    const kept = span(2, 2, 3, 2)
    expect(mergeSpan([kept], span(0, 0, 1, 0), bounds)).toEqual([kept, span(0, 0, 1, 0)])
  })

  it('refuses a merge that does not fit the grid', () => {
    expect(mergeSpan([], span(2, 0, 4, 0), bounds)).toEqual([])
  })
})

describe('unmergeSpan', () => {
  it('unmerges a region from a single cell inside it', () => {
    // An owner cannot see the edges of a merged region's absorbed cells, so
    // asking them to select all four before unmerging asks the impossible.
    expect(unmergeSpan([span(0, 0, 1, 1)], span(1, 1))).toEqual([])
  })

  it('leaves merges the selection does not touch', () => {
    const kept = span(2, 2, 3, 2)
    expect(unmergeSpan([kept], span(0, 0))).toEqual([kept])
  })
})

describe('hasMergeIn', () => {
  it('reports whether a selection has anything to unmerge', () => {
    expect(hasMergeIn([span(0, 0, 1, 1)], span(1, 1))).toBe(true)
    expect(hasMergeIn([span(0, 0, 1, 1)], span(3, 2))).toBe(false)
  })
})
