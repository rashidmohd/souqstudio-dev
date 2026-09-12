import { describe, expect, it } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { SEED_BLOCKS, bookletGrid, composeGrid, postGrid } from './library'
import { usesOnlyRoles } from './roles'
import { validateBlock } from './block-edit'
import { validateGrid } from './validate'
import { pickArrangement } from './arrangement'

/**
 * The seeded library, held to the rules it is the example of.
 *
 * Sixty-seven hand-authored blocks are sixty-seven chances to leave a hex in
 * one, to bind a product field on a panel that has no product, or to give two
 * elements the same id — and every one of those is a defect that reaches a
 * printed page rather than a screen, because the export worker reads these rows.
 *
 * The checks here are the ones `validateBlock` and the web app's zod schema make
 * at the edge, run over the library at build time instead. A seeded block that
 * fails the parser it will be read back through is one nobody should have to
 * discover by reseeding a database.
 */

const elementsOf = (blockIndex: number): BlockElement[] =>
  SEED_BLOCKS[blockIndex]!.arrangements.flatMap((arrangement) => arrangement.elements)

describe('SEED_BLOCKS', () => {
  it('ships a library rather than a sample', () => {
    // The number is not sacred; having enough of them to start from is. Four was
    // a proof of the model and a shop's first impression that it designs for
    // somebody else.
    expect(SEED_BLOCKS.length).toBeGreaterThanOrEqual(50)
  })

  it('gives every block a stable, unique id', () => {
    const ids = SEED_BLOCKS.map((block) => block.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('blk_'))).toBe(true)
  })

  it('keeps the ids four live books already name in their page grids', () => {
    // `page_grids.regions` holds block ids inside JSON, which Prisma cannot
    // enforce. Renaming either of these does not fail a migration — it draws a
    // footer where the cards should be.
    const ids = new Set(SEED_BLOCKS.map((block) => block.id))
    for (const id of ['blk_offer_card', 'blk_hero_band', 'blk_footer', 'blk_message']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('has no structural errors in any block', () => {
    for (const block of SEED_BLOCKS) {
      const errors = validateBlock(block).filter((problem) => problem.severity === 'error')
      expect({ id: block.id, errors }).toEqual({ id: block.id, errors: [] })
    }
  })

  it('has no warnings either, which is the bar for a block we ship', () => {
    // A warning is "this will disappoint you". An owner's own block may carry
    // one; the library every account loads may not, because three warnings on
    // the block every shop starts from is how owners learn to ignore warnings.
    for (const block of SEED_BLOCKS) {
      const warnings = validateBlock(block).filter((problem) => problem.severity === 'warning')
      expect({ id: block.id, warnings }).toEqual({ id: block.id, warnings: [] })
    }
  })

  it('names every colour by role, never by value', () => {
    // The rule that earns everything else: a block shipped before it has met a
    // shop has to name a colour the shop's kit can resolve.
    //
    // **Through `usesOnlyRoles`, which is now the only copy of this rule.** It
    // was re-implemented inline here, with a comment admitting it was the same
    // check the web app made at the edge — and a rule held in two places is one
    // that will be corrected in one of them. It moved into `roles.ts` when a
    // third caller appeared: `library-source.ts` holds a document loaded from a
    // file to exactly this bar before the seed writes it.
    for (const block of SEED_BLOCKS) {
      expect({ id: block.id, rolesOnly: usesOnlyRoles(block.arrangements) }).toEqual({
        id: block.id,
        rolesOnly: true,
      })
    }
  })

  it('writes every static string in both languages', () => {
    // A static line with only an English value renders a hole in the Arabic
    // edition, and the owner who left it there will never open that edition.
    for (const block of SEED_BLOCKS) {
      for (const element of block.arrangements.flatMap((a) => a.elements)) {
        if (element.kind !== 'text' || element.source.from !== 'static') continue
        expect({ id: block.id, en: element.source.textEn.length > 0 }).toEqual({
          id: block.id,
          en: true,
        })
        expect({ id: block.id, ar: element.source.textAr.length > 0 }).toEqual({
          id: block.id,
          ar: true,
        })
      }
    }
  })

  it('binds only the product fields both painters can resolve', () => {
    // `origin` and `packSize` are in `TextSource` and neither renderer returns a
    // value for them, so a seeded block naming one would print a blank where the
    // design says there is a line. Owner-authored blocks are free to reach for
    // them the day the painters do.
    const drawable = new Set(['name', 'spec', 'brand'])
    for (const block of SEED_BLOCKS) {
      for (const element of block.arrangements.flatMap((a) => a.elements)) {
        if (element.kind !== 'text') continue
        if (element.source.from === 'product') {
          expect(drawable.has(element.source.field)).toBe(true)
        }
        if (element.source.from === 'shop') {
          expect(element.source.field).toBe('name')
        }
      }
    }
  })

  it('gives a repeating card an arrangement for every merge an owner can draw', () => {
    // No exceptions. `pickArrangement` falls back to the nearest range rather
    // than failing, so a shape a card declines to design is not a shape it
    // avoids — it is a shape somebody else's layout gets crushed into. The list
    // row was the one block that skipped this, and the gallery showed what the
    // fallback actually looked like.
    const shapes = [0.5, 1, 2, 5]
    for (const block of SEED_BLOCKS) {
      if (!block.repeats) continue
      for (const aspect of shapes) {
        const index = pickArrangement(block.arrangements, aspect)
        const arrangement = block.arrangements[index]!
        expect({ id: block.id, aspect, covered: true }).toEqual({
          id: block.id,
          aspect,
          covered: aspect >= arrangement.aspectMin && aspect <= arrangement.aspectMax,
        })
      }
    }
  })

  it('puts a price mark on every repeating card and on no panel', () => {
    for (const block of SEED_BLOCKS) {
      for (const arrangement of block.arrangements) {
        const marks = arrangement.elements.filter((element) => element.kind === 'priceMark')
        expect({ id: block.id, marks: marks.length }).toEqual({
          id: block.id,
          marks: block.repeats ? 1 : 0,
        })
      }
    }
  })

  it('categorises every block, and marks the seasonal ones seasonal', () => {
    for (const block of SEED_BLOCKS) {
      expect(block.category).toBeTruthy()
      expect(block.isSeasonal).toBe(block.category === 'seasonal')
      // A seasonal block is a panel, never a card: an occasion is not a product.
      if (block.isSeasonal) expect(block.repeats).toBe(false)
    }
  })

  it('has an element in the first block whose ids read as a document', () => {
    // Ids are hand-written so a diff of a design says `spec moved` rather than
    // `e4 moved`. `elementsOf` is here to make that assertion cheap to extend.
    expect(elementsOf(0).map((element) => element.id)).toContain('name')
  })
})

describe('bookletGrid', () => {
  it('still composes from the two ids it always named', () => {
    const grid = bookletGrid()
    expect(validateGrid(grid)).toEqual([])
    expect(grid.regions.filter((region) => region.blockId === 'blk_offer_card')).toHaveLength(9)
    expect(grid.regions.find((region) => region.id === 'footer')?.blockId).toBe('blk_footer')
  })

  /*
   * The point of the parameter. Every book this product has ever created used
   * `blk_offer_card`, because the id was a module constant this function closed
   * over — twenty-five seeded cards and one reachable. `E6-create-flow.md` §5.1.
   */
  it('composes from the card it is given, leaving the footer alone', () => {
    const grid = bookletGrid({ cardBlockId: 'blk_price_first' })
    expect(validateGrid(grid)).toEqual([])
    expect(grid.regions.filter((region) => region.blockId === 'blk_price_first')).toHaveLength(9)
    expect(grid.regions.find((region) => region.id === 'footer')?.blockId).toBe('blk_footer')
  })

  it('takes a footer too', () => {
    const grid = bookletGrid({ footerBlockId: 'blk_footer_center' })
    expect(grid.regions.find((region) => region.id === 'footer')?.blockId).toBe(
      'blk_footer_center'
    )
  })

  it('names every cell for its position, so an override outlives a re-flow', () => {
    const grid = bookletGrid({ perRow: 2, bodyRows: 2 })
    expect(grid.regions.map((region) => region.id)).toEqual([
      'r0c0',
      'r0c1',
      'r1c0',
      'r1c1',
      'footer',
    ])
  })
})

describe('composeGrid', () => {
  /**
   * The distinction the whole header/footer feature turns on. Absent means "the
   * preset decides"; `null` means "the owner removed it". Conflating them would
   * make a removed footer come back on the next layout edit.
   */
  it('tells an absent band apart from a removed one', () => {
    expect(bookletGrid().regions.some((r) => r.id === 'footer')).toBe(true)
    expect(bookletGrid({ footerBlockId: null }).regions.some((r) => r.id === 'footer')).toBe(false)
  })

  it('puts a header band above the cards and a footer below them', () => {
    const grid = composeGrid({
      perRow: 2,
      bodyRows: 2,
      headerBlockId: 'blk_masthead',
      footerBlockId: 'blk_footer',
    })

    expect(validateGrid(grid)).toEqual([])
    // Band, two card rows, band.
    expect(grid.rows).toEqual([0.34, 1, 1, 0.34])

    const header = grid.regions.find((r) => r.id === 'header')
    const footer = grid.regions.find((r) => r.id === 'footer')
    expect(header?.rowStart).toBe(0)
    expect(footer?.rowStart).toBe(3)
    // Both span the page, so nothing sits beside a band.
    expect(header?.colEnd).toBe(1)
    expect(footer?.colEnd).toBe(1)
  })

  /**
   * **The reason `offerRegions` takes a row offset.** A nudge is keyed by region
   * id, so if `r0c0` meant "first row of the grid" rather than "first row of
   * cards", adding a header would renumber every region and orphan every
   * override in the book.
   */
  it('keeps a cell"s id when a header is added above it', () => {
    const without = composeGrid({ perRow: 2, bodyRows: 2 })
    const with_ = composeGrid({ perRow: 2, bodyRows: 2, headerBlockId: 'blk_masthead' })

    const ids = (g: ReturnType<typeof composeGrid>) =>
      g.regions.filter((r) => r.fill === 'flow').map((r) => r.id)

    expect(ids(with_)).toEqual(ids(without))
    // The cells moved down a row; only their position changed.
    expect(with_.regions.find((r) => r.id === 'r0c0')?.rowStart).toBe(1)
    expect(without.regions.find((r) => r.id === 'r0c0')?.rowStart).toBe(0)
  })

  it('makes a grid with neither band, which is all cards', () => {
    const grid = composeGrid({ perRow: 2, bodyRows: 3 })
    expect(validateGrid(grid)).toEqual([])
    expect(grid.rows).toEqual([1, 1, 1])
    expect(grid.regions.every((r) => r.fill === 'flow')).toBe(true)
  })

  it('takes a margin and a gap', () => {
    const grid = composeGrid({ margin: 0, gap: 0.01 })
    expect(grid.margin).toBe(0)
    expect(grid.gap).toBe(0.01)
  })

  it('stays valid at every combination of bands', () => {
    for (const headerBlockId of [null, 'blk_masthead']) {
      for (const footerBlockId of [null, 'blk_footer']) {
        const grid = composeGrid({ perRow: 3, bodyRows: 3, headerBlockId, footerBlockId })
        expect(validateGrid(grid)).toEqual([])
        expect(grid.regions.filter((r) => r.fill === 'flow')).toHaveLength(9)
      }
    }
  })
})

describe('postGrid', () => {
  /*
   * The one structural difference from a booklet, and the reason the function
   * exists rather than a `footer: false` flag on the other one.
   */
  it('has no footer band', () => {
    const grid = postGrid()
    expect(validateGrid(grid)).toEqual([])
    expect(grid.regions).toHaveLength(4)
    expect(grid.regions.every((region) => region.fill === 'flow')).toBe(true)
    expect(grid.regions.find((region) => region.id === 'footer')).toBeUndefined()
  })

  it('has one track per cell, so nothing is a short row', () => {
    const grid = postGrid({ perRow: 2, bodyRows: 3 })
    expect(validateGrid(grid)).toEqual([])
    expect(grid.cols).toEqual([1, 1])
    expect(grid.rows).toEqual([1, 1, 1])
    expect(grid.regions).toHaveLength(6)
  })

  it('composes from the card it is given', () => {
    const grid = postGrid({ cardBlockId: 'blk_price_first' })
    expect(grid.regions.every((region) => region.blockId === 'blk_price_first')).toBe(true)
  })

  /* Cropped by whatever app shows it, so the safe area is smaller than the page. */
  it('keeps a wider margin than a booklet', () => {
    expect(postGrid().margin ?? 0).toBeGreaterThan(bookletGrid().margin ?? 0)
  })

  /* No footer by default is a default, not a prohibition. */
  it('takes a footer when the owner asks for one', () => {
    const grid = postGrid({ footerBlockId: 'blk_footer' })
    expect(validateGrid(grid)).toEqual([])
    expect(grid.regions.find((region) => region.id === 'footer')?.blockId).toBe('blk_footer')
  })
})

