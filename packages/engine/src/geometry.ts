/**
 * Cell spans to rectangles, and the one place RTL is handled.
 *
 * Region and pin coordinates are logical: `colStart` is the reading-order start,
 * not the left edge. Mirroring happens here and nowhere else, which is what lets
 * an AR edition render the same grid — merges included — with no second layout
 * to author. E6 §6.
 *
 * Rows never mirror.
 */

import type { Track } from './tracks'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Direction = 'ltr' | 'rtl'

/** A rectangular span of cells. Logical and inclusive at both ends. */
export interface CellSpan {
  colStart: number
  colEnd: number
  rowStart: number
  rowEnd: number
}

/** Whether two spans share at least one cell. */
export function spansIntersect(a: CellSpan, b: CellSpan): boolean {
  return (
    a.colStart <= b.colEnd &&
    b.colStart <= a.colEnd &&
    a.rowStart <= b.rowEnd &&
    b.rowStart <= a.rowEnd
  )
}

/** Cell count. A 2×3 span covers six cells. */
export function spanArea(span: CellSpan): number {
  return (span.colEnd - span.colStart + 1) * (span.rowEnd - span.rowStart + 1)
}

/**
 * The rectangle a span occupies, with the gaps it swallows.
 *
 * A region spanning two columns covers both tracks *and* the gap between them —
 * omitting it leaves a visible seam through what should read as one card.
 */
export function spanRect(
  span: CellSpan,
  cols: readonly Track[],
  rows: readonly Track[],
  direction: Direction
): Rect {
  const lastCol = cols.length - 1
  const [startCol, endCol] =
    direction === 'rtl'
      ? [lastCol - span.colEnd, lastCol - span.colStart]
      : [span.colStart, span.colEnd]

  const first = cols[startCol]
  const last = cols[endCol]
  const top = rows[span.rowStart]
  const bottom = rows[span.rowEnd]

  if (first === undefined || last === undefined || top === undefined || bottom === undefined) {
    throw new Error(
      `spanRect: span ${span.colStart}..${span.colEnd} × ${span.rowStart}..${span.rowEnd} ` +
        `falls outside a ${cols.length}×${rows.length} grid`
    )
  }

  return {
    x: first.offset,
    y: top.offset,
    width: last.offset + last.size - first.offset,
    height: bottom.offset + bottom.size - top.offset,
  }
}

/** Width ÷ height. What `pickArrangement` selects on. */
export function aspectOf(rect: Rect): number {
  if (rect.height <= 0) {
    throw new Error('aspectOf: height must be greater than zero')
  }
  return rect.width / rect.height
}
