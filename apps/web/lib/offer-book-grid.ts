import { bookletGrid, postGrid } from '@souqstudio/engine'
import type { PageBackground, PageGrid } from '@souqstudio/types'
import { KIND_SPEC, kindOf, type BookKind } from '@/lib/book-kind'
import { DEFAULT_BAND_HEIGHT } from '@/lib/offer-book-layout'

/**
 * The master grid a book uses, chosen by what the owner said they were making
 * and by what they have changed since. E6 — `docs/E6-create-flow.md` §5.1.
 *
 * **Its own module, and the reason is bundle size rather than tidiness.**
 * `bookletGrid` and `postGrid` live in the engine's `library.ts` beside the
 * sixty-five seeded designs, so importing either as a *value* pulls every
 * element of every block into whatever bundle does it. `block-category.ts`
 * carries the measurement that made this a rule: 72 KB of blocks in a browser
 * chunk, to render six segment labels.
 *
 * So `book-kind.ts` holds the vocabulary and imports nothing but a type — the
 * wizard imports that — and this file holds the functions that reach for the
 * engine. Nothing that runs in a browser imports this.
 *
 * No `server-only` even so: it is pure, it has a test, and marking it would only
 * mean the test could not import it.
 */

export interface GridChoice {
  /** What the owner is making. Decides the shape and the default bands. */
  kind: BookKind
  /**
   * The repeating offer card every cell draws.
   *
   * **Checked by the caller, never here.** A block id arriving from a client is
   * a tenancy question — is it this organization's, is it seeded, is it behind a
   * plan — and this function has no session to answer it with. The create route
   * and the grid route both resolve it through `loadBlock` before calling.
   * Undefined means the engine's own default.
   */
  cardBlockId?: string
  /**
   * A band across the top of every page, or none.
   *
   * **Absent and `null` are different answers**, all the way down to
   * `composeGrid`. Absent is "whatever this kind does"; `null` is "the owner
   * removed it". If they were one value, an owner who deleted a booklet's footer
   * would find it back the next time they changed the track count.
   */
  headerBlockId?: string | null
  footerBlockId?: string | null
  /**
   * How big each band is: its height as a fraction of one body row, its width as
   * a fraction of the page.
   *
   * **Read back like everything else here, and for the same reason.** The grid
   * is rebuilt from scratch on every edit, so a height the owner set and this
   * function did not return would be handed back as the default the next time
   * they nudged the margin. That is the precise defect `gap` exists to record.
   */
  headerHeight?: number
  footerHeight?: number
  headerWidth?: number
  footerWidth?: number
  /** Fraction of the page's shorter edge. Zero is full bleed. */
  margin?: number
  /**
   * The gutter between cards, as a fraction of the shorter edge.
   *
   * **Absent means the preset's own**, which is `0.022` for a booklet and
   * `0.028` for a post — the two values every book had before this was a choice.
   * It has to be read back by `readGridChoice` like everything else here or the
   * next margin edit would hand the preset's gap back; that it was *not* read
   * back was the whole of the defect this field fixes.
   */
  gap?: number
  /**
   * The paper behind every card: a colour, a gradient or uploaded artwork.
   *
   * **Absent, `null` and a value are three answers**, exactly as the bands are.
   * `null` is the owner clearing it back to paper, and it has to survive a
   * rebuild or the next layout edit would hand the old background back.
   */
  background?: PageBackground | null
  /** Overrides the kind's own count. The editor's layout panel sends these. */
  perRow?: number
  bodyRows?: number
}

/**
 * **Two presets, not one builder with a flag**, because what differs between a
 * booklet and a post is a set of *defaults* rather than a capability: the
 * booklet defaults to a footer band and a 4% margin, the post to no footer and
 * 5%. Both reach the same `composeGrid` underneath, and either can be given
 * either band.
 */
export function gridForKind(choice: GridChoice): PageGrid {
  const spec = KIND_SPEC[choice.kind]

  const options = {
    perRow: choice.perRow ?? spec.perRow,
    bodyRows: choice.bodyRows ?? spec.bodyRows,
    ...(choice.cardBlockId === undefined ? {} : { cardBlockId: choice.cardBlockId }),
    ...(choice.margin === undefined ? {} : { margin: choice.margin }),
    ...(choice.gap === undefined ? {} : { gap: choice.gap }),
    ...(choice.background === undefined ? {} : { background: choice.background }),
    // Passed through as-is, `null` included: the preset reads absent as "use my
    // default" and `null` as "no band". Normalising here would lose that.
    ...(choice.headerBlockId === undefined ? {} : { headerBlockId: choice.headerBlockId }),
    ...(choice.footerBlockId === undefined ? {} : { footerBlockId: choice.footerBlockId }),
    ...(choice.headerHeight === undefined ? {} : { headerHeight: choice.headerHeight }),
    ...(choice.footerHeight === undefined ? {} : { footerHeight: choice.footerHeight }),
    ...(choice.headerWidth === undefined ? {} : { headerWidth: choice.headerWidth }),
    ...(choice.footerWidth === undefined ? {} : { footerWidth: choice.footerWidth }),
  }

  return spec.footer ? bookletGrid(options) : postGrid(options)
}

/** The grid a *stored* book would start from, for a caller holding a format. */
export function gridForFormat(format: string, options: Omit<GridChoice, 'kind'> = {}): PageGrid {
  return gridForKind({ kind: kindOf(format), ...options })
}

/**
 * What a stored grid says the owner chose, read back off the regions.
 *
 * **This is what makes an edit an edit rather than a reset.** The layout route
 * rebuilds the master from scratch on every change — that is deliberate, since
 * hand-patching tracks and regions in place is how a grid ends up internally
 * inconsistent — but rebuilding from the *kind alone* throws away everything the
 * owner has decided since. Before this existed, `PATCH .../grid` called
 * `bookletGrid({ perRow, bodyRows })` and nothing else, which meant changing the
 * number of cards across a page silently reset the offer card to
 * `blk_offer_card` and gave a square post a footer band it never had.
 *
 * **Derived from the regions rather than stored beside them.** A `page_grids`
 * row already says which block each region draws; a second copy of that on the
 * book would be a fact recorded twice, and the copy nothing renders from is the
 * one that goes stale.
 *
 * The card is read off the first flowing region because every flowing region
 * names the same block — `composeGrid` writes them from one id. If a future
 * editor lets two cells carry different cards, this returns the first, and
 * rebuilding would flatten them; that is a real limit and it is the same limit
 * the layout route already has by rebuilding at all.
 *
 * **Merges are not here, and that is deliberate.** They were, briefly, which made
 * them a property of the master and therefore of every body page at once. A merge
 * belongs to the page an owner made it on, so it lives on `offer_book_pages` and
 * `flowBook` applies it per page. Nothing in this choice varies by page.
 */
export function readGridChoice(format: string, grid: PageGrid): GridChoice {
  const flowing = grid.regions.find((region) => region.fill === 'flow')
  const header = grid.regions.find((region) => region.id === 'header')
  const footer = grid.regions.find((region) => region.id === 'footer')

  // Body rows, not grid rows: a band takes a track and is not a row of cards.
  const bodyRows = grid.rows.length - (header === undefined ? 0 : 1) - (footer === undefined ? 0 : 1)

  return {
    kind: kindOf(format),
    perRow: grid.cols.length,
    // A grid with bands and no cards is a corrupt row rather than a layout, and
    // `resolveTracks` throws on zero tracks anyway. One is the floor the route's
    // own schema already sets.
    bodyRows: Math.max(1, bodyRows),
    margin: grid.margin ?? 0,
    // Always a number on a stored grid — `composeGrid` writes its preset's
    // default when nothing asked — so there is no absent case to preserve here
    // the way the bands and the background have one.
    gap: grid.gap,
    // `null` rather than absent, same reason as the bands below: a cleared
    // background must not be handed back by a rebuild.
    background: grid.background ?? null,
    ...(flowing === undefined ? {} : { cardBlockId: flowing.blockId }),
    // `null` rather than absent, and that is the point of the function: a book
    // whose footer was removed must not have one handed back by the preset.
    headerBlockId: header?.blockId ?? null,
    footerBlockId: footer?.blockId ?? null,
    /*
     * **The band's size, read off the grid that has it rather than stored
     * twice.** The height *is* the row track and the width *is* the region's
     * own field, so there is nothing to keep in step — the same argument this
     * function makes about the card: a second copy on the book would be the one
     * that goes stale.
     *
     * Absent when the band is, because a height for a band that does not exist
     * is a number with nothing to measure.
     */
    ...(header === undefined ? {} : { headerHeight: grid.rows[0] ?? DEFAULT_BAND_HEIGHT }),
    ...(footer === undefined
      ? {}
      : { footerHeight: grid.rows[grid.rows.length - 1] ?? DEFAULT_BAND_HEIGHT }),
    // Absent on the region means edge to edge, which is what `composeGrid`
    // writes for a full-width band — so absent here says the same thing.
    ...(header?.width === undefined ? {} : { headerWidth: header.width }),
    ...(footer?.width === undefined ? {} : { footerWidth: footer.width }),
  }
}
