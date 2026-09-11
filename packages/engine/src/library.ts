import type { PageGrid, Region } from '@souqstudio/types'
import type { BlockCategory } from './block-category'
import { CARD_BLOCKS } from './library-cards'
import { FOOTER_IDS, HEADER_IDS, PANEL_BLOCKS, SOCIAL_IDS } from './library-panels'
import { SEASONAL_BLOCKS } from './library-seasonal'

/**
 * The seeded block library — the building blocks every shop starts with.
 *
 * **Always seed.** An owner can author their own blocks, but a blank artboard
 * produces something worse than a good default and the owner blames the product.
 * Owner authoring is an escape hatch from a decent starting point, not a
 * substitute for having one. `docs/composition-model.md` §3.6.
 *
 * They live in the engine rather than beside the seed because two consumers need
 * the same bytes: `packages/db` seeds them into `blocks`, and the render harness
 * draws them. A second copy would drift, and a drifted seed block is one that
 * renders differently in the database from the one that was checked. Nothing
 * here is a hex or a pixel: every colour is a `TokenRef` resolved against the
 * shop's palette, every text element names a `TypeLevel` from its type scale,
 * and every box is a fraction of the block so one design serves a 1080 carousel
 * post and a third of an A4 column.
 *
 * ## Sixty-five, and why the count is the point
 *
 * This started as four. Four is enough to prove the model and not enough to
 * start from: a shop that opens the library, sees one card and one footer, and
 * concludes the product designs for somebody else is a shop that never gets to
 * its first book. `docs/E7-pending.md` names a seeded gallery as what is still
 * owed, and puts the number at fifteen to twenty-five *real designs*.
 *
 * The designs are drawn from what a printed offer book, a hypermarket weekly and
 * an e-commerce grid actually do — the reasoning is in `library-cards.ts` and
 * `library-panels.ts`, beside the blocks it produced. Two conclusions are worth
 * stating here because they shaped the whole list:
 *
 * - **Promotion mechanics are not blocks.** BOGO, multibuy, was/now, percent off
 *   and bundle are the offer's *tier* and what the price mark draws inside
 *   itself. Giving each a block would multiply the library by five and leave a
 *   shop that invents a sixth mechanic with nothing. What differs between these
 *   designs is emphasis, not vocabulary.
 * - **Most catalog rows have no photograph** — 4.2% carry one. So two of the
 *   cards have no image element at all, and they are designs rather than
 *   fallbacks.
 */

// ─── The library ──────────────────────────────────────────────────────────────

/**
 * Which group a block belongs to is **derived here rather than stored on the
 * row.** It is a property of the design we shipped, not a fact about a database
 * record, and the alternative — a column — would be one only the seed ever
 * writes and only one screen ever reads. A block an owner authors has no
 * category and needs none: theirs are listed first and separately, because that
 * is the collection they can change.
 *
 * The *vocabulary* is in `block-category.ts` rather than here, so that a client
 * wanting the six words does not import the sixty-five designs. See that file.
 */

export interface SeedBlock {
  id: string
  name: string
  description: string
  /** Does this block repeat over the product list, or is it placed once? */
  repeats: boolean
  category: BlockCategory
  /**
   * For an occasion rather than for a week. It carries no dates — Ramadan and
   * both Eids move against the Gregorian calendar, so a fixed window is wrong
   * from its second year. See `library-seasonal.ts`.
   */
  isSeasonal: boolean
  arrangements: import('@souqstudio/types').Arrangement[]
}

const categoryOf = (id: string): BlockCategory => {
  if (HEADER_IDS.has(id)) return 'header'
  if (FOOTER_IDS.has(id)) return 'footer'
  // A square post is a page rather than a piece of one, which is why it is its
  // own group and not a corner of `panel`. `library-panels.ts` carries the
  // reasoning, and the two blocks that moved into it.
  if (SOCIAL_IDS.has(id)) return 'social-post'
  return 'panel'
}

export const SEED_BLOCKS: SeedBlock[] = [
  ...CARD_BLOCKS.map(
    (block): SeedBlock => ({
      ...block,
      repeats: true,
      category: 'offer-card',
      isSeasonal: false,
    })
  ),
  ...PANEL_BLOCKS.map(
    (block): SeedBlock => ({
      ...block,
      repeats: false,
      category: categoryOf(block.id),
      isSeasonal: false,
    })
  ),
  ...SEASONAL_BLOCKS.map(
    (block): SeedBlock => ({
      ...block,
      repeats: false,
      category: 'seasonal',
      isSeasonal: true,
    })
  ),
]

/**
 * The ids `bookletGrid` composes with, looked up rather than indexed.
 *
 * They were `SEED_BLOCKS[0]` and `SEED_BLOCKS[2]` while there were four blocks,
 * which is a position that silently became the wrong block the moment the list
 * grew. Four live books name these two ids inside their `page_grids` regions,
 * so getting it wrong is not a rendering bug — it is four books drawing footers
 * where their cards should be.
 */
const byId = (id: string): SeedBlock => {
  const block = SEED_BLOCKS.find((candidate) => candidate.id === id)
  if (block === undefined) throw new Error(`library: no seeded block "${id}"`)
  return block
}

const OFFER_CARD = byId('blk_offer_card')
const FOOTER = byId('blk_footer')

// ─── Seeded grids ─────────────────────────────────────────────────────────────

/**
 * How tall a header or footer band is, as a fraction of one body row.
 *
 * **A fraction of a row rather than of the page**, which is what keeps a band
 * looking like a band at every page size. A footer pinned to the page grows into
 * a stripe on A3; one that scales with the cards above it stays a footer.
 */
const BAND = 0.34

/**
 * The body of a grid: `perRow` × `bodyRows` cells, every one of them flowing.
 *
 * **The ids count body rows, not grid rows**, and `rowOffset` is what keeps that
 * true once a header band sits above them. `slotOverrides` keys a nudge by
 * `regionId` + `offerId` — `offer-book-overrides.ts` — so if `r0c0` meant "the
 * first row of the grid" rather than "the first row of cards", adding a header
 * would renumber every region and orphan every nudge in the book. It means the
 * first row of cards, and it goes on meaning that.
 */
function offerRegions(
  perRow: number,
  bodyRows: number,
  blockId: string,
  rowOffset: number
): Region[] {
  const regions: Region[] = []
  for (let row = 0; row < bodyRows; row += 1) {
    for (let col = 0; col < perRow; col += 1) {
      regions.push({
        id: `r${row}c${col}`,
        colStart: col,
        colEnd: col,
        rowStart: row + rowOffset,
        rowEnd: row + rowOffset,
        blockId,
        fill: 'flow',
      })
    }
  }
  return regions
}

export interface ComposeGridOptions {
  /** Cards across. */
  perRow?: number
  /** Rows of cards, not counting any band. */
  bodyRows?: number
  /** The repeating offer card every cell draws. */
  cardBlockId?: string
  /**
   * A band across the top of every page, or none.
   *
   * **Absent and `null` mean different things**, which is what lets a preset
   * have a default an owner can then take away. Absent is "the preset decides";
   * `null` is "the owner said no band". Collapsing them would make removing a
   * booklet's footer indistinguishable from not mentioning it, and the footer
   * would come back on the next edit.
   *
   * This is a **running** band: the master grid is instanced on every body page,
   * so a header here appears on all of them. A masthead that belongs to page one
   * alone is a pin, not this.
   */
  headerBlockId?: string | null
  footerBlockId?: string | null
  /** Fraction of the page's shorter edge. Zero is full bleed. */
  margin?: number
  /** Fraction of the shorter edge, between tracks. */
  gap?: number
}

/**
 * A master page grid: optional header band, rows of cards, optional footer band.
 *
 * **One function, and the two below are presets over it.** They were two
 * separate builders that each laid out their own tracks, which meant the band
 * arithmetic — where a row index starts once a band exists, how tall a band is,
 * which regions shift — was written twice and had to agree. It is written once
 * here, and `bookletGrid` and `postGrid` now differ only in what they default.
 */
export function composeGrid(options: ComposeGridOptions = {}): PageGrid {
  const perRow = options.perRow ?? 3
  const bodyRows = options.bodyRows ?? 3
  const header = options.headerBlockId ?? null
  const footer = options.footerBlockId ?? null

  const rows: number[] = [
    ...(header === null ? [] : [BAND]),
    ...Array.from({ length: bodyRows }, () => 1),
    ...(footer === null ? [] : [BAND]),
  ]

  // Where the cards start. One row down when a header takes the top band.
  const top = header === null ? 0 : 1

  const regions: Region[] = []

  if (header !== null) {
    regions.push({
      id: 'header',
      colStart: 0,
      colEnd: perRow - 1,
      rowStart: 0,
      rowEnd: 0,
      blockId: header,
      fill: 'static',
    })
  }

  regions.push(...offerRegions(perRow, bodyRows, options.cardBlockId ?? OFFER_CARD.id, top))

  if (footer !== null) {
    regions.push({
      id: 'footer',
      colStart: 0,
      colEnd: perRow - 1,
      rowStart: top + bodyRows,
      rowEnd: top + bodyRows,
      blockId: footer,
      fill: 'static',
    })
  }

  return {
    cols: Array.from({ length: perRow }, () => 1),
    rows,
    gap: options.gap ?? 0.022,
    margin: options.margin ?? 0.04,
    regions,
  }
}

/**
 * The master grid a booklet, a leaflet or a poster starts from.
 *
 * **Here rather than in whichever caller needed it first, for the same reason
 * `SEED_BLOCKS` is here:** two consumers need the same bytes. The render harness
 * has drawn this grid since the engine existed and `createBook` writes it into
 * `page_grids`, so a second copy would mean the layout that was checked and the
 * layout that ships are different objects that merely look alike.
 *
 * `perRow` across, `bodyRows` down, plus a short merged footer row — **unless
 * the caller passes `footerBlockId: null`**, which is an owner having removed
 * it. No header by default: a running masthead on every page of a leaflet is a
 * choice rather than the norm, and one on page one alone is a pin.
 *
 * **Not a density setting.** E6 §5's density profiles are gone: density is the
 * consequence of track count at a given page size, and two controls that can
 * disagree is one too many. A denser book is more tracks.
 *
 * **The block ids are parameters, and default to what this function hardcoded
 * for its whole life.** Twenty-five offer cards were seeded in E7 and every book
 * ever created used exactly one of them, because the id was a module constant
 * closed over here. `docs/E6-create-flow.md` §5.1.
 */
export function bookletGrid(options: ComposeGridOptions = {}): PageGrid {
  return composeGrid({
    ...options,
    // Absent keeps the footer this function has always written; `null` removes
    // it. `??` would conflate the two and make removal impossible.
    footerBlockId: options.footerBlockId === undefined ? FOOTER.id : options.footerBlockId,
  })
}

/**
 * The master grid a **single-image** book starts from: a square post, a story, a
 * WhatsApp status.
 *
 * **The difference from `bookletGrid` is what it defaults**, and the footer is
 * the whole of it. A footer band is a page-furniture convention that belongs to
 * something printed and paginated. A post is looked at once, in a feed, at
 * thumbnail size first; a strip of shop address across the bottom of it spends a
 * tenth of the only impression it gets on something nobody reads at that scale.
 * The shop's name reaches the viewer from the account posting it.
 *
 * An owner who wants one anyway passes a `footerBlockId`, and gets it.
 *
 * The harness has had this grid as a local `carousel()` since the engine
 * existed. It moves here for the reason the file opens with: two consumers, one
 * set of bytes. `docs/E6-create-flow.md` §5.1.
 *
 * **A post still flows.** Twelve offers at 3 × 2 is two posts, which is a
 * carousel — the same pagination a booklet gets, and the reason this returns a
 * master grid rather than a one-off rectangle.
 *
 * The margin is wider than a booklet's and the gap is wider with it. A booklet
 * is held; a post is cropped by whatever app is showing it, and the safe area is
 * smaller than the canvas.
 */
export function postGrid(options: ComposeGridOptions = {}): PageGrid {
  return composeGrid({
    perRow: options.perRow ?? 2,
    bodyRows: options.bodyRows ?? 2,
    gap: options.gap ?? 0.028,
    margin: options.margin ?? 0.05,
    ...(options.cardBlockId === undefined ? {} : { cardBlockId: options.cardBlockId }),
    headerBlockId: options.headerBlockId ?? null,
    footerBlockId: options.footerBlockId ?? null,
  })
}
