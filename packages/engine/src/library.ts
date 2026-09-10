import type { PageGrid, Region } from '@souqstudio/types'
import type { BlockCategory } from './block-category'
import { CARD_BLOCKS } from './library-cards'
import { FOOTER_IDS, HEADER_IDS, PANEL_BLOCKS } from './library-panels'
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
 * ## Sixty-seven, and why the count is the point
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
 * wanting the five words does not import the fifty-nine designs. See that file.
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
 * The master grid a new book starts from.
 *
 * **Here rather than in whichever caller needed it first, for the same reason
 * `SEED_BLOCKS` is here:** two consumers need the same bytes. The render harness
 * has drawn this grid since the engine existed and `createBook` writes it into
 * `page_grids`, so a second copy would mean the layout that was checked and the
 * layout that ships are different objects that merely look alike.
 *
 * `perRow` across, `bodyRows` down, plus a short merged footer row. The footer's
 * 0.34 is a fraction of a body row rather than a page fraction — a footer that
 * scales with the cards above it stays a footer at every page size, and one
 * pinned to the page grows into a band on A3.
 *
 * **Not a density setting.** E6 §5's density profiles are gone: density is the
 * consequence of track count at a given page size, and two controls that can
 * disagree is one too many. A denser book is more tracks.
 */
export function bookletGrid(options: { perRow?: number; bodyRows?: number } = {}): PageGrid {
  const perRow = options.perRow ?? 3
  const bodyRows = options.bodyRows ?? 3

  const regions: Region[] = []
  for (let row = 0; row < bodyRows; row += 1) {
    for (let col = 0; col < perRow; col += 1) {
      regions.push({
        id: `r${row}c${col}`,
        colStart: col,
        colEnd: col,
        rowStart: row,
        rowEnd: row,
        blockId: OFFER_CARD.id,
        fill: 'flow',
      })
    }
  }

  regions.push({
    id: 'footer',
    colStart: 0,
    colEnd: perRow - 1,
    rowStart: bodyRows,
    rowEnd: bodyRows,
    blockId: FOOTER.id,
    fill: 'static',
  })

  return {
    cols: Array.from({ length: perRow }, () => 1),
    rows: [...Array.from({ length: bodyRows }, () => 1), 0.34],
    gap: 0.022,
    margin: 0.04,
    regions,
  }
}
