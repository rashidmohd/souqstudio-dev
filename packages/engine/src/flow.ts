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

import type { PageGrid, Pin, Region, RegionFill } from '@souqstudio/types'
import { resolveTracks, type Track } from './tracks'
import {
  narrowRect,
  spanRect,
  spansIntersect,
  type CellSpan,
  type Direction,
  type Rect,
} from './geometry'
import { mergeRegions, normalizeMerges } from './merge'
import { validateGrid } from './validate'

export interface FlowInput {
  /** The master grid. Every body page is an instance of it. */
  master: PageGrid
  /** Offer ids in book order. The engine places; the owner orders. */
  offerIds: readonly string[]
  pins: readonly Pin[]
  page: { width: number; height: number }
  direction: Direction
  /**
   * Merged cells, **per page index**, in body-card coordinates.
   *
   * **A page's layout, not the book's, and that is the whole point.** Merging
   * the first two cells of page one has to leave page two alone, so the master
   * supplies the tracks, the bands and one cell per position, and each page says
   * which of its cells it draws as one. Pages with no entry here draw the master
   * as it stands.
   *
   * **The flow does not restart at a merge.** A page with a merged hero holds one
   * card fewer and the products simply carry on onto the next page — the cursor
   * is the book's, not the page's. That is what keeps a merge a layout decision
   * rather than a pagination one.
   */
  merges?: Readonly<Record<number, readonly CellSpan[]>>
  /**
   * Blocks an owner has put in particular cells, by page index and region id.
   *
   * **A cell holding something that does not repeat stops taking a product**,
   * and the products route around it — which is the whole reason this carries a
   * `fill` rather than just an id. Put a brand block in the top-left cell and the
   * offer that was there moves to the next cell, the page after it fills up, and
   * the book grows by a page if it has to. Dropping a product instead is the
   * class of bug that reaches print, and `flowBook` has refused to do it since
   * pins were built; this is the same rule reached by a different gesture.
   *
   * **The caller decides the fill, not the engine.** Whether a block repeats is a
   * fact about the block document, which lives in a database the engine has
   * never read. `categoryRepeats` knows the vocabulary; only the web layer knows
   * which row was chosen.
   */
  regionBlocks?: Readonly<Record<number, Readonly<Record<string, RegionBlock>>>>
}

/** A block an owner put in one cell, and whether it takes a product. */
export interface RegionBlock {
  blockId: string
  /** `static` is what makes the products route around it. */
  fill: RegionFill
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
  /**
   * The cells of this page an owner may select, already merged as this page
   * merges them and with anything a pin took here left out.
   *
   * **Per page, because pages no longer have to agree.** This is what the editor
   * draws its grid and its selection from; it cannot be derived from the master
   * any more, because the master does not know which cells this page joined.
   */
  cells: MasterCell[]
  /**
   * This page's merges, as the engine resolved them.
   *
   * **Carried rather than left to be read off `cells`.** A merge the page holds
   * under a pin has no cell here — pinned cells are not offered — so an editor
   * reconstructing the set from what it can see would quietly drop it the next
   * time it wrote one. This is what the owner's next merge is computed against.
   *
   * Already normalised: anything the track count could not hold is gone.
   */
  merges: CellSpan[]
  /**
   * Flow regions a pin displaced **on this page**.
   *
   * **Reported because the editor cannot work it out and must not guess.** A
   * master cell exists on every page; a pin sits on one. So a cell can be part
   * of the grid, selectable in principle, and simply not drawn here — and an
   * editor that offered it anyway would let an owner merge two cells, watch the
   * page not change, and conclude the feature is broken. It is not: the merge
   * landed on a row this page gave to a brand ad.
   *
   * Not the same as a cell with no offer. Those are empty and still theirs to
   * merge; these belong to something else on this page.
   */
  pinnedRegionIds: string[]
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
 * A master grid's tracks, in page pixels.
 *
 * **Extracted so the flow and the editor cannot disagree about where a cell
 * is.** `flowBook` computed this inline for its whole life, which was correct
 * while placements were the only thing that needed a rectangle. The editor needs
 * one for every cell of the master — including cells no offer reached on this
 * page — to draw a selection over, and a second copy of the margin-and-gap
 * arithmetic is a selection ring that lands a few pixels off the card it is
 * meant to be around.
 *
 * Tracks are laid out inside the margin, then shifted onto the page. Doing it
 * here keeps `spanRect` ignorant of the page: it sees tracks and nothing else.
 */
export function resolveGridTracks(
  master: PageGrid,
  page: { width: number; height: number }
): { cols: Track[]; rows: Track[] } {
  const shorterEdge = Math.min(page.width, page.height)
  const gap = master.gap * shorterEdge
  const margin = (master.margin ?? 0) * shorterEdge

  const inset = (track: Track): Track => ({ ...track, offset: track.offset + margin })

  return {
    cols: resolveTracks(master.cols, page.width - margin * 2, gap).map(inset),
    rows: resolveTracks(master.rows, page.height - margin * 2, gap).map(inset),
  }
}

/** One flowing cell of the master grid, placed on the page. */
export interface MasterCell {
  /** The region id — `r{bodyRow}c{col}` of its start cell. What a nudge keys on. */
  regionId: string
  rect: Rect
  /** Where it sits in body-card space, which is where merges are authored. */
  body: CellSpan
  /** Whether it already covers more than one cell. */
  merged: boolean
  /** The block this cell draws — the book's offer card unless an owner changed it. */
  blockId: string
  /** `static` means the cell holds something that does not take a product. */
  fill: RegionFill
}

/**
 * Every flowing cell of the master, as a rectangle the editor can draw on.
 *
 * **Not `flowBook`'s placements, and the difference is the point.** A placement
 * exists only where an offer landed: the last page of a book is mostly empty,
 * and a pin covers the regions it sits on. Those cells are still cells — they
 * are part of the master, they can be selected, and they can be merged — so an
 * editor that could only address placed cells could not merge the bottom of the
 * last page, which is exactly where an owner puts a hero.
 *
 * **Body coordinates come back alongside the grid ones**, because a merge is
 * authored in body-card space — row 0 is the first row of cards — while a region
 * lives in grid space, one row down once a header band exists. The offset is
 * read off the regions rather than passed in: the top body row is the smallest
 * `rowStart` among flowing regions, which is true whether or not a band sits
 * above it and true whether or not that row is merged.
 *
 * Static regions and pins are excluded. A band is not a cell an owner merges;
 * it is already the whole width, and it is authored in the layout panel.
 */
export function masterCells(
  master: PageGrid,
  page: { width: number; height: number },
  direction: Direction
): MasterCell[] {
  const { cols, rows } = resolveGridTracks(master, page)
  return cellsFor(
    master.regions.filter((region) => region.fill === 'flow'),
    cols,
    rows,
    direction,
    bodyTop(master.regions)
  )
}

/**
 * The first grid row that holds cards.
 *
 * Read off the regions rather than counted from the bands: the smallest
 * `rowStart` among flowing regions is the top body row, which is true whether or
 * not a masthead sits above it and true whether or not that row is merged.
 * Counting bands instead would give this file its own opinion about where the
 * cards begin, and two opinions is one too many.
 */
function bodyTop(regions: readonly Region[]): number {
  const flowing = regions.filter((region) => region.fill === 'flow')
  // Seeded past the end rather than at zero: `Math.min(0, ...)` would pin the
  // answer to row zero and quietly undo the whole point of the offset once a
  // header band pushed the cards down.
  if (flowing.length === 0) return 0
  return flowing.reduce((top, region) => Math.min(top, region.rowStart), Infinity)
}

/**
 * Regions as rectangles, in reading order.
 *
 * **Takes exactly the regions it is given and filters nothing.** A body cell an
 * owner filled with a brand block is `static` and still has to come back — it is
 * a cell they must be able to select and change again. Deciding what counts as a
 * cell is the caller's job, because only the caller knows whether a static
 * region is a footer band or a cell that used to take a product.
 */
function cellsFor(
  regions: readonly Region[],
  cols: readonly Track[],
  rows: readonly Track[],
  direction: Direction,
  rowOffset: number
): MasterCell[] {
  return regions
    .slice()
    .sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart)
    .map((region) => ({
      regionId: region.id,
      rect: spanRect(region, cols, rows, direction),
      body: {
        colStart: region.colStart,
        colEnd: region.colEnd,
        rowStart: region.rowStart - rowOffset,
        rowEnd: region.rowEnd - rowOffset,
      },
      merged: region.colStart !== region.colEnd || region.rowStart !== region.rowEnd,
      blockId: region.blockId,
      fill: region.fill,
    }))
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

  const { cols, rows } = resolveGridTracks(master, page)

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

  const staticRegions = master.regions.filter((r) => r.fill === 'static').sort(inReadingOrder)

  /*
   * Body-card row zero, in grid rows. Merges are authored in body space so a
   * header band cannot renumber them; this is what converts back.
   */
  const rowOffset = bodyTop(master.regions)

  const perRow = master.cols.length
  // Rows of *cards*, counted off the cells rather than by subtracting bands: a
  // static region is not guaranteed to be a whole row, and the master's flowing
  // cells are one per position, so their distinct rows are exactly the body.
  const bodyRows = new Set(
    master.regions.filter((r) => r.fill === 'flow').map((r) => r.rowStart)
  ).size

  /**
   * This page's flowing cells, after this page's merges.
   *
   * Computed per page rather than once, because two pages of one book may now
   * disagree about their cells — that is what merging "on this page only" means.
   * A page with no merges gets the master's regions unchanged, which is both the
   * common case and the cheap one.
   */
  const regionsFor = (pageIndex: number): { body: Region[]; merges: CellSpan[] } => {
    const merges = normalizeMerges(input.merges?.[pageIndex] ?? [], {
      perRow,
      bodyRows: Math.max(1, bodyRows),
    })

    const merged =
      merges.length === 0 ? master.regions : mergeRegions(master.regions, merges, rowOffset)

    /*
     * **The body cells, whatever they now hold.** Filtered on the *master's*
     * notion of a body cell — a flowing region — before any override is applied,
     * because an override is exactly what turns one of them static. Filtering
     * after would make a cell holding a brand block indistinguishable from a
     * footer band, and the editor would stop offering it: an owner could put a
     * brand block in a cell and have no way to take it out again.
     */
    const chosen = input.regionBlocks?.[pageIndex]
    const body = merged
      .filter((region) => region.fill === 'flow')
      .map((region) => {
        const override = chosen?.[region.id]
        return override === undefined
          ? region
          : { ...region, blockId: override.blockId, fill: override.fill }
      })
      .sort(inReadingOrder)

    return { body, merges }
  }

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
    const { body, merges: mergesHere } = regionsFor(index)

    // A body cell an owner filled with something that does not repeat is drawn
    // like a band and takes no product. The bands themselves come from the
    // master and are the same on every page.
    const flowRegions = body.filter((region) => region.fill === 'flow')
    const staticHere = [...staticRegions, ...body.filter((region) => region.fill === 'static')]
      .sort(inReadingOrder)

    const placements: Placement[] = []

    for (const region of staticHere) {
      if (pinsHere.some((pin) => spansIntersect(pin, region))) continue
      placements.push({
        sourceId: region.id,
        /*
         * **Narrowed where the region asks for it — bands, in practice.** A
         * header set to 70% is drawn at 70% and centred, while still owning its
         * whole track: `spansIntersect` reads the integer span, so a pin on that
         * row still collides and no product creeps into the space beside it.
         * The cells an owner selects are computed from `spanRect` untouched,
         * which is right — a narrowed band is not a narrowed cell, and bands are
         * not selectable cells at all.
         */
        rect: narrowRect(spanRect(region, cols, rows, direction), region.width),
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
    // Every body cell a pin covers here, whether it was taking a product or
    // holding a brand block: neither is drawn on this page.
    const pinnedRegionIds = body
      .filter((region) => pinsHere.some((pin) => spansIntersect(pin, region)))
      .map((region) => region.id)

    for (const region of openRegions) {
      const offerId = offerIds[cursor]
      if (offerId === undefined) break
      cursor += 1
      placements.push({
        sourceId: region.id,
        // A flowing cell has no `width` today — only bands are given one — but
        // reading it here is what stops a cell that gains one from being the
        // single place the field is silently ignored.
        rect: narrowRect(spanRect(region, cols, rows, direction), region.width),
        blockId: region.blockId,
        offerId,
        kind: 'flow',
      })
    }

    pages.push({
      index,
      placements,
      capacity: openRegions.length,
      merges: mergesHere,
      pinnedRegionIds,
      // Only the cells this page can actually offer: merged as this page merges
      // them, minus whatever a pin took here. An owner cannot select a cell the
      // page is not drawing — that was a defect once already.
      // **Every body cell, not only the ones taking a product.** A cell holding a
      // brand block must stay selectable or the owner cannot change it back.
      cells: cellsFor(
        body.filter((region) => !pinnedRegionIds.includes(region.id)),
        cols,
        rows,
        direction,
        rowOffset
      ),
    })
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
