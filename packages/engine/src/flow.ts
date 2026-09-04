/**
 * The flow engine — a master grid, a product list and a set of pins become the
 * pages of a book.
 *
 * The load-bearing idea: a flow region binds to a *position* in the product
 * list, never to a product. Swapping week 32's offers for week 33's re-fills the
 * same layout with no work, and every merge, footer and pin survives. That is
 * the whole weekly-reissue promise, and it is what E6 §1 was protecting when it
 * said unbounded free positioning turns week 33 into a rebuild.
 */

import type { PageGrid, Pin, Region } from '@souqstudio/types'
import { resolveTracks, type Track } from './tracks'
import { spanRect, spansIntersect, type CellSpan, type Direction, type Rect } from './geometry'
import { validateGrid } from './validate'

export interface FlowInput {
  /** The master grid. Every body page is an instance of it. */
  master: PageGrid
  /** Offer ids in book order. The engine places; the owner orders. */
  offerIds: readonly string[]
  pins: readonly Pin[]
  page: { width: number; height: number }
  direction: Direction
}

export interface Placement {
  /** Region id for a region placement, pin id for a pin. Stable across a
   *  re-run, which is what `SlotOverride` keys on. */
  sourceId: string
  rect: Rect
  blockId: string
  /** The offer this placement carries. Null for static regions and for pins. */
  offerId: string | null
  kind: 'flow' | 'static' | 'pin'
}

export interface FlowPage {
  index: number
  placements: Placement[]
  /** Flow regions this page could hold, after pins took their cells. */
  capacity: number
}

export interface FlowResult {
  pages: FlowPage[]
  /** Pins whose cells fall outside the master grid. Reported, never silently
   *  dropped — a pin that vanishes is a brand ad the shop believes it printed. */
  invalidPinIds: string[]
  /** Offers that found no region. Non-empty only when a pin covers every flow
   *  region on every page that exists. */
  unplacedOfferIds: string[]
}

/**
 * Compose a book.
 *
 * Pages are generated until the products run out, and then far enough to reach
 * the last pin: an owner who placed a brand ad on page 2 gets page 2 whether or
 * not the product list fills it.
 */
export function flowBook(input: FlowInput): FlowResult {
  const { master, offerIds, page, direction } = input

  const problems = validateGrid(master)
  if (problems.length > 0) {
    throw new Error(`flowBook: invalid master grid — ${problems.map((p) => p.message).join('; ')}`)
  }

  const shorterEdge = Math.min(page.width, page.height)
  const gap = master.gap * shorterEdge
  const margin = (master.margin ?? 0) * shorterEdge

  // Tracks are laid out inside the margin, then shifted onto the page. Doing it
  // here keeps `spanRect` ignorant of the page: it sees tracks and nothing else.
  const inset = (track: Track): Track => ({ ...track, offset: track.offset + margin })
  const cols = resolveTracks(master.cols, page.width - margin * 2, gap).map(inset)
  const rows = resolveTracks(master.rows, page.height - margin * 2, gap).map(inset)

  const inBounds = (span: CellSpan): boolean =>
    span.colStart >= 0 &&
    span.rowStart >= 0 &&
    span.colEnd < master.cols.length &&
    span.rowEnd < master.rows.length &&
    span.colStart <= span.colEnd &&
    span.rowStart <= span.rowEnd

  const invalidPinIds = input.pins.filter((pin) => !inBounds(pin)).map((pin) => pin.id)
  const pins = input.pins.filter((pin) => inBounds(pin) && pin.pageIndex >= 0)

  // Reading order. `spanRect` mirrors for RTL, so ordering by logical column is
  // already right-to-left in an Arabic edition.
  const inReadingOrder = (a: Region, b: Region): number =>
    a.rowStart - b.rowStart || a.colStart - b.colStart

  const flowRegions = master.regions.filter((r) => r.fill === 'flow').sort(inReadingOrder)
  const staticRegions = master.regions.filter((r) => r.fill === 'static').sort(inReadingOrder)

  const lastPinnedPage = pins.reduce((max, pin) => Math.max(max, pin.pageIndex), -1)

  const pages: FlowPage[] = []
  let cursor = 0
  let index = 0

  // Two stop conditions, both needed: products exhausted, and every pinned page
  // reached. `guard` bounds the loop against a pin index far past anything the
  // products justify.
  const guard = offerIds.length + lastPinnedPage + 2

  while ((cursor < offerIds.length || index <= lastPinnedPage) && index < guard) {
    const pinsHere = pins.filter((pin) => pin.pageIndex === index)
    const placements: Placement[] = []

    for (const region of staticRegions) {
      if (pinsHere.some((pin) => spansIntersect(pin, region))) continue
      placements.push({
        sourceId: region.id,
        rect: spanRect(region, cols, rows, direction),
        blockId: region.blockId,
        offerId: null,
        kind: 'static',
      })
    }

    for (const pin of pinsHere) {
      placements.push({
        sourceId: pin.id,
        rect: spanRect(pin, cols, rows, direction),
        blockId: pin.blockId,
        offerId: null,
        kind: 'pin',
      })
    }

    // A pin consumes the flow regions it touches, and the offers that would have
    // sat there move downstream — the book grows by a page rather than losing a
    // product. Dropping one silently is the class of bug that reaches print.
    const openRegions = flowRegions.filter(
      (region) => !pinsHere.some((pin) => spansIntersect(pin, region))
    )

    for (const region of openRegions) {
      const offerId = offerIds[cursor]
      if (offerId === undefined) break
      cursor += 1
      placements.push({
        sourceId: region.id,
        rect: spanRect(region, cols, rows, direction),
        blockId: region.blockId,
        offerId,
        kind: 'flow',
      })
    }

    pages.push({ index, placements, capacity: openRegions.length })
    index += 1
  }

  return {
    pages,
    invalidPinIds,
    unplacedOfferIds: offerIds.slice(cursor),
  }
}

/**
 * Pages a product list will produce, without building placements.
 *
 * This is the number the owner actually cares about, because it is the print
 * bill — so the grid picker shows it live rather than making them compute it.
 */
export function pageCountFor(input: FlowInput): number {
  return flowBook(input).pages.length
}
