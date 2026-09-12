/**
 * Merging cells, which is span algebra and nothing else.
 *
 * Composition model §4: "Merges are **rectangular only**, same as a spreadsheet.
 * Non-rectangular selections are refused rather than solved." Everything here
 * follows from that one sentence — a merge is a `CellSpan`, two merges may not
 * overlap, and a selection that half-covers a merge grows to cover it whole
 * rather than producing an L.
 *
 * **Body-card coordinates, not grid coordinates.** Row 0 is the first row of
 * *cards*, not the first row of the grid, so a header band does not renumber
 * anything. That is the same choice `offerRegions` already made for region ids
 * — `slotOverrides` keys a nudge by `regionId`, and if `r0c0` meant "the first
 * row of the grid" then adding a masthead would orphan every nudge in the book.
 * A merge is keyed the same way for the same reason.
 *
 * **Nothing here knows about pixels, tracks or blocks.** `composeGrid` turns
 * merges into regions and `spanRect` turns regions into rectangles; this decides
 * only which cells belong together.
 */

import type { CellSpan } from './geometry'
import { spansIntersect } from './geometry'

/** Cells across and rows of cards a merge has to fit inside. */
export interface MergeBounds {
  perRow: number
  bodyRows: number
}

const isRectangular = (span: CellSpan): boolean =>
  span.colStart <= span.colEnd && span.rowStart <= span.rowEnd

/** A span covering one cell is not a merge, whatever it is stored as. */
const isSingleCell = (span: CellSpan): boolean =>
  span.colStart === span.colEnd && span.rowStart === span.rowEnd

const withinBounds = (span: CellSpan, bounds: MergeBounds): boolean =>
  span.colStart >= 0 &&
  span.rowStart >= 0 &&
  span.colEnd < bounds.perRow &&
  span.rowEnd < bounds.bodyRows

/** The smallest span containing both. */
export function unionSpan(a: CellSpan, b: CellSpan): CellSpan {
  return {
    colStart: Math.min(a.colStart, b.colStart),
    colEnd: Math.max(a.colEnd, b.colEnd),
    rowStart: Math.min(a.rowStart, b.rowStart),
    rowEnd: Math.max(a.rowEnd, b.rowEnd),
  }
}

/**
 * The merges a grid of this size can actually hold.
 *
 * **Out of bounds is dropped, never clipped**, and that is the whole decision in
 * this function. An owner who merges the bottom two cells of a four-wide page
 * and then sets it to two across has a merge describing cells that no longer
 * exist. Clipping it to what survives would silently hand them a merge they
 * never made — a 2×1 band where they had drawn a 2×2 hero — and they would find
 * it by looking at a printed flyer.
 *
 * This is the same answer the layout route already gives for nudges: "region ids
 * change with the track count, and the orphaned nudges are meant to be
 * orphaned". A merge that no longer fits is gone, and the cells come back as
 * cells, which is a state the owner can see and redo in one gesture.
 *
 * Overlaps are resolved first-wins rather than refused. `validateGrid` is what
 * refuses an overlapping *grid*; this runs on the way in, where the honest
 * response to two merges claiming one cell is to keep the one that claimed it
 * first rather than to fail a request an owner cannot diagnose.
 */
export function normalizeMerges(
  merges: readonly CellSpan[],
  bounds: MergeBounds
): CellSpan[] {
  const kept: CellSpan[] = []

  for (const span of merges) {
    if (!isRectangular(span)) continue
    if (isSingleCell(span)) continue
    if (!withinBounds(span, bounds)) continue
    if (kept.some((other) => spansIntersect(other, span))) continue
    kept.push({
      colStart: span.colStart,
      colEnd: span.colEnd,
      rowStart: span.rowStart,
      rowEnd: span.rowEnd,
    })
  }

  return kept
}

/**
 * Grow a span until every merge it touches is inside it.
 *
 * **This is what makes a selection rectangular in the presence of merges**, and
 * every spreadsheet does it: drag across half of a merged hero and the selection
 * snaps out to include all of it, because the alternative is an L-shaped
 * selection and there is no L-shaped merge to make from one.
 *
 * A fixpoint rather than a single pass: growing to swallow one merge can bring
 * the span into contact with a second.
 */
export function expandSpan(span: CellSpan, merges: readonly CellSpan[]): CellSpan {
  let current: CellSpan = { ...span }

  // Bounded by the number of merges: each pass that changes anything absorbs at
  // least one, and an absorbed merge is already inside the span on the next.
  for (let pass = 0; pass <= merges.length; pass += 1) {
    let grew = false
    for (const merge of merges) {
      if (!spansIntersect(current, merge)) continue
      const next = unionSpan(current, merge)
      if (
        next.colStart !== current.colStart ||
        next.colEnd !== current.colEnd ||
        next.rowStart !== current.rowStart ||
        next.rowEnd !== current.rowEnd
      ) {
        current = next
        grew = true
      }
    }
    if (!grew) return current
  }

  return current
}

/** The merge covering a cell, if one does. */
export function mergeAt(
  merges: readonly CellSpan[],
  col: number,
  row: number
): CellSpan | undefined {
  return merges.find(
    (merge) =>
      col >= merge.colStart && col <= merge.colEnd && row >= merge.rowStart && row <= merge.rowEnd
  )
}

/**
 * Merge a selection, absorbing whatever merges it already touches.
 *
 * The span is expanded first — see `expandSpan` — so merging a selection that
 * overlaps an existing hero produces one larger region rather than a refusal or
 * an overlap. A selection that expands to a single cell merges nothing.
 */
export function mergeSpan(
  merges: readonly CellSpan[],
  span: CellSpan,
  bounds: MergeBounds
): CellSpan[] {
  const target = expandSpan(span, merges)
  if (!isRectangular(target) || isSingleCell(target)) return [...merges]

  const survivors = merges.filter((merge) => !spansIntersect(merge, target))
  return normalizeMerges([...survivors, target], bounds)
}

/**
 * Unmerge everything a selection touches.
 *
 * **Any merge it intersects, not only ones it contains.** An owner who selects a
 * single cell inside a merged hero and asks to unmerge means that hero; asking
 * them to first select all four cells of a region that draws as one card would
 * be asking them to select something they cannot see the edges of.
 */
export function unmergeSpan(merges: readonly CellSpan[], span: CellSpan): CellSpan[] {
  return merges.filter((merge) => !spansIntersect(merge, span))
}

/** Whether a selection has anything to unmerge. */
export function hasMergeIn(merges: readonly CellSpan[], span: CellSpan): boolean {
  return merges.some((merge) => spansIntersect(merge, span))
}
