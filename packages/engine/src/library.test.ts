import { describe, expect, it } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { PRICE_MARK_PRESETS } from '@souqstudio/types'
import { SEED_BLOCKS, bookletGrid, composeGrid, postGrid } from './library'
import { usesOnlyRoles } from './roles'
import { validateBlock } from './block-edit'
import { validateGrid } from './validate'
import { pickArrangement } from './arrangement'
import { TEXT_BINDINGS, bindingInScope, bindingKey } from './bindings'

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

  it('binds only what the vocabulary offers, and only where it is in scope', () => {
    // **This used to say something narrower and the narrower thing was a bug
    // written down as a rule.** It asserted that a seeded block could bind only
    // `product.name`, `spec` and `brand` and `shop.name` — because `origin`,
    // `packSize`, `phone` and `address` were declared in `TextSource` and drew
    // nothing in either painter, so naming one printed a blank where the design
    // said there was a line. One block worked around it with a static "Your
    // phone number".
    //
    // E14 §3.4 fixed the painters and §3.5's walk is what keeps them fixed, so
    // the bound this file should hold is the real one: a binding has to exist,
    // and it has to be in scope for the block that carries it — a static panel
    // has no product, which is what `repeats: false` means.
    const known = new Set(TEXT_BINDINGS.map(bindingKey))

    for (const block of SEED_BLOCKS) {
      for (const element of block.arrangements.flatMap((a) => a.elements)) {
        if (element.kind === 'text' && element.source.from !== 'static') {
          expect(known.has(bindingKey(element.source))).toBe(true)
          expect(bindingInScope(element.source, block.repeats)).toBe(true)
        }
        if (element.kind === 'image') {
          expect(bindingInScope(element.source, block.repeats)).toBe(true)
        }
      }
    }
  })


  /**
   * **The canvas shape an owner designs on comes from the range's *middle*.**
   *
   * `DesignerShell` draws a repeating block at `sqrt(aspectMin × aspectMax)`,
   * so a range wide enough to "cover everything" produces a canvas that is not
   * a card — `{0.1, 1.35}` centres on 0.37, a sliver, and `{1.35, 30}` on 6.36.
   * The Layout control then names those in ratios an owner cannot place.
   *
   * Nothing else in the codebase says this, which is why it had to be found by
   * opening the designer. The library's own ranges centre on 0.55, 1.07, 1.87
   * and 5.59; the bound here is what keeps a new one honest.
   */
  it('centres every layout on a shape somebody would design a card at', () => {
    const middle = (a: { aspectMin: number; aspectMax: number }) =>
      Math.sqrt(a.aspectMin * a.aspectMax)
    for (const arrangement of SEED_BLOCKS.filter((b) => b.repeats).flatMap((b) => b.arrangements)) {
      expect(middle(arrangement)).toBeGreaterThanOrEqual(0.35)
      expect(middle(arrangement)).toBeLessThanOrEqual(6)
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


describe('the library uses the range it ships', () => {
  const marks = SEED_BLOCKS.flatMap((block) =>
    block.arrangements
      .flatMap((a) => a.elements)
      .filter((e): e is Extract<BlockElement, { kind: 'priceMark' }> => e.kind === 'priceMark')
  )

  it('draws more than one price arrangement', () => {
    /**
     * **The check this library needed and did not have.** Every seeded block
     * styled the mark's *skin* — ninety-two calls to `markOn`, `markAs`,
     * `noTab` and `PLAIN_PRICE` — and not one of them said anything about its
     * arrangement, because until recipes existed none of them could. Shipping
     * the recipe vocabulary and leaving the library on one preset would have
     * been the capability arriving dark, and nothing would have said so: every
     * other test here passes on a library of one card in costumes.
     */
    const presets = new Set(marks.map((m) => m.style?.preset ?? 'classic-tag'))
    expect(presets.size).toBeGreaterThanOrEqual(5)
  })

  it('leaves the card every shop starts from exactly as it was', () => {
    // `blk_offer_card` is the default. A preset on it would move every book
    // already built, and `classic-tag` is the one that renders identically to
    // what the mark drew before recipes existed.
    const offerCard = SEED_BLOCKS.find((b) => b.id === 'blk_offer_card')!
    for (const element of offerCard.arrangements.flatMap((a) => a.elements)) {
      if (element.kind !== 'priceMark') continue
      expect(element.style?.preset ?? 'classic-tag').toBe('classic-tag')
    }
  })

  it('names a preset only from the published vocabulary', () => {
    // A typo here is a block the document schema refuses on the way back in,
    // which `library-source.ts` turns into a refused sync for every shop.
    for (const m of marks) {
      if (m.style?.preset === undefined) continue
      expect(PRICE_MARK_PRESETS).toContain(m.style.preset)
    }
  })
})

/**
 * How big a band is — the one thing about a header an owner could not change.
 *
 * It was a constant in `library.ts`: every band in every book was 0.34 of a body
 * row and full bleed. The height *is* the row track and the width *is* a field
 * on the region, so both are read back off the stored grid rather than kept
 * anywhere else — which is what makes them survive the rebuild that every other
 * layout edit performs.
 */
describe('band size', () => {
  it('writes the height as the band track', () => {
    const grid = composeGrid({
      perRow: 3,
      bodyRows: 2,
      headerBlockId: 'blk_head',
      footerBlockId: 'blk_foot',
      headerHeight: 0.8,
      footerHeight: 0.2,
    })
    expect(grid.rows).toEqual([0.8, 1, 1, 0.2])
  })

  it('defaults to the band constant when nothing asks', () => {
    const grid = composeGrid({ perRow: 3, bodyRows: 2, headerBlockId: 'blk_head' })
    expect(grid.rows[0]).toBe(0.34)
  })

  it('holds a stored oddity to something renderable', () => {
    // A book that cannot open is worse than a book with a strange header, so a
    // value from outside the editor's own bounds is clamped rather than refused.
    const huge = composeGrid({ bodyRows: 1, headerBlockId: 'b', headerHeight: 40 })
    const tiny = composeGrid({ bodyRows: 1, headerBlockId: 'b', headerHeight: 0 })
    expect(huge.rows[0]).toBe(2)
    expect(tiny.rows[0]).toBe(0.1)
  })

  it('puts the width on the region, and omits it at full bleed', () => {
    const narrow = composeGrid({ bodyRows: 2, headerBlockId: 'b', headerWidth: 0.7 })
    expect(narrow.regions.find((region) => region.id === 'header')?.width).toBe(0.7)

    // Absent and 1 are the same layout; storing 1 would make two identical
    // grids compare unequal.
    const full = composeGrid({ bodyRows: 2, headerBlockId: 'b', headerWidth: 1 })
    expect(full.regions.find((region) => region.id === 'header')).not.toHaveProperty('width')
    expect(composeGrid({ bodyRows: 2, headerBlockId: 'b' }).regions[0]).not.toHaveProperty('width')
  })

  it('sizes the two bands independently', () => {
    const grid = composeGrid({
      bodyRows: 2,
      headerBlockId: 'b',
      footerBlockId: 'f',
      headerWidth: 0.5,
      footerWidth: 0.9,
    })
    expect(grid.regions.find((region) => region.id === 'header')?.width).toBe(0.5)
    expect(grid.regions.find((region) => region.id === 'footer')?.width).toBe(0.9)
  })

  it('leaves the cards where they were, whatever the band height', () => {
    // The band takes a track either way, so the regions below it must not move:
    // a region id names a position among the cards, and renumbering them would
    // orphan every nudge in the book.
    const short = composeGrid({ perRow: 2, bodyRows: 2, headerBlockId: 'b', headerHeight: 0.15 })
    const tall = composeGrid({ perRow: 2, bodyRows: 2, headerBlockId: 'b', headerHeight: 1.6 })
    expect(short.regions.map((r) => `${r.id}@${r.rowStart}`)).toEqual(
      tall.regions.map((r) => `${r.id}@${r.rowStart}`)
    )
  })
})
