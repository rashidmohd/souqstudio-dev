import { bookletGrid, postGrid } from '@souqstudio/engine'
import type { PageGrid } from '@souqstudio/types'
import { KIND_SPEC, kindOf, type BookKind } from '@/lib/book-kind'

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
  /** Fraction of the page's shorter edge. Zero is full bleed. */
  margin?: number
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
    // Passed through as-is, `null` included: the preset reads absent as "use my
    // default" and `null` as "no band". Normalising here would lose that.
    ...(choice.headerBlockId === undefined ? {} : { headerBlockId: choice.headerBlockId }),
    ...(choice.footerBlockId === undefined ? {} : { footerBlockId: choice.footerBlockId }),
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
    ...(flowing === undefined ? {} : { cardBlockId: flowing.blockId }),
    // `null` rather than absent, and that is the point of the function: a book
    // whose footer was removed must not have one handed back by the preset.
    headerBlockId: header?.blockId ?? null,
    footerBlockId: footer?.blockId ?? null,
  }
}
