import { describe, expect, it } from 'vitest'
import type { PageBackground } from '@souqstudio/types'
import { flowBook, validateGrid } from '@souqstudio/engine'
import { BOOK_KINDS, KIND_SPEC, kindOf, type BookKind } from '@/lib/book-kind'
import { gridForFormat, gridForKind, readGridChoice } from '@/lib/offer-book-grid'
import { pageSizeFor } from '@/lib/offer-book-compose'

/**
 * The grid each kind starts from, and the one thing about it that cannot be
 * checked by reading it.
 *
 * **A cell's aspect ratio is not visible in the numbers that produce it.** It
 * falls out of the page rectangle, the track counts, the gap and the margin —
 * four values in three files — and it decides which arrangement the renderer
 * picks. `3 × 4` on an A3 poster reads as the obvious choice and gives 1.017,
 * which is in the `SQUARISH` band, and **no seeded offer card defines a
 * `SQUARISH` arrangement**. `pickArrangement` falls back to the nearest instead
 * of failing, so that grid renders a design drawn tall, stretched into a square.
 * It does not error, no test that asserts on track counts would catch it, and it
 * is exactly the class of defect `docs/STATUS.md` §1.0 was written about.
 *
 * So this file recomputes the aspect from the geometry the engine actually
 * produces, rather than from the arithmetic that was done when the counts were
 * chosen.
 */

/** `library-kit.ts`. The two bands the twenty-five seeded offer cards design for. */
const TALL = { min: 0.35, max: 0.85 }
const WIDE = { min: 1.35, max: 2.6 }

const inBand = (aspect: number, band: { min: number; max: number }): boolean =>
  aspect >= band.min && aspect <= band.max

/**
 * The aspect of a flowing cell on page one, measured off the engine's output.
 *
 * `flowBook` is asked for a real book rather than the grid being read directly,
 * because the rectangle a placement occupies is `spanRect`'s answer and not the
 * track size — a merged region swallows the gap between its tracks, and reading
 * `cols[0].size` would quietly stop describing the page the day anything merges.
 */
function cellAspect(kind: BookKind): number {
  const grid = gridForKind({ kind })
  const page = pageSizeFor(KIND_SPEC[kind].format)

  const flow = flowBook({
    master: grid,
    // One offer per body cell, so page one is full and nothing is compacted away.
    offerIds: grid.regions.filter((region) => region.fill === 'flow').map((_, i) => `o${i}`),
    pins: [],
    page,
    direction: 'ltr',
  })

  const placed = flow.pages[0]?.placements.find(
    (candidate) => candidate.kind === 'flow' && candidate.offerId !== null
  )
  if (placed === undefined) {
    throw new Error(`cellAspect: ${kind} flowed no offer into page one`)
  }

  return placed.rect.width / placed.rect.height
}

describe('gridForKind', () => {
  /**
   * The assertion this file exists for. It is deliberately a band rather than a
   * number: the counts may change, and what must not change is that they land
   * somewhere a card was actually designed for.
   */
  it.each(BOOK_KINDS)('gives %s a cell some card was designed for', (kind) => {
    const aspect = cellAspect(kind)
    const ok = inBand(aspect, TALL) || inBand(aspect, WIDE)

    expect(
      ok,
      `${kind} cells are ${aspect.toFixed(3)}, which is in no band any seeded offer card ` +
        `designs for. TALL is ${TALL.min}–${TALL.max}, WIDE is ${WIDE.min}–${WIDE.max}. ` +
        `Change perRow/bodyRows in KIND_SPEC, or give the cards a SQUARISH arrangement.`
    ).toBe(true)
  })

  /** The table in `KIND_SPEC`'s comment, held to what the engine actually does. */
  it.each([
    ['booklet', 0.769],
    ['post', 0.645],
    ['status', 0.807],
    ['poster', 0.744],
  ] as const)('puts %s cells at %f', (kind, expected) => {
    expect(cellAspect(kind)).toBeCloseTo(expected, 2)
  })

  it('produces a grid the engine considers valid, for every kind', () => {
    for (const kind of BOOK_KINDS) {
      expect(validateGrid(gridForKind({ kind }))).toEqual([])
    }
  })

  /*
   * The structural difference between the two grids. A footer is print
   * furniture; a post is looked at once in a feed, at thumbnail size first.
   */
  it('gives a booklet and a poster a footer band, and a post and a status none', () => {
    const hasFooter = (kind: BookKind): boolean =>
      gridForKind({ kind }).regions.some((region) => region.id === 'footer')

    expect(hasFooter('booklet')).toBe(true)
    expect(hasFooter('poster')).toBe(true)
    expect(hasFooter('post')).toBe(false)
    expect(hasFooter('status')).toBe(false)
  })

  it('composes from the card it is given', () => {
    const grid = gridForKind({ kind: 'booklet', cardBlockId: 'blk_price_first' })
    const flowing = grid.regions.filter((region) => region.fill === 'flow')

    expect(flowing.length).toBeGreaterThan(0)
    expect(flowing.every((region) => region.blockId === 'blk_price_first')).toBe(true)
  })

  it('lets the caller override the kind"s own counts', () => {
    const grid = gridForKind({ kind: 'booklet', perRow: 2, bodyRows: 2 })

    expect(grid.cols).toHaveLength(2)
    // Two body rows plus the footer band.
    expect(grid.rows).toHaveLength(3)
  })
})

describe('gridForFormat', () => {
  /**
   * The three formats the wizard stopped offering. Books carrying them exist,
   * and a grid rebuilt for one has to be the grid it already had.
   */
  it.each([
    ['catalog', 'booklet'],
    ['print', 'booklet'],
    ['whatsapp', 'post'],
  ] as const)('reads a stored %s as a %s', (format, kind) => {
    expect(kindOf(format)).toBe(kind)
    expect(gridForFormat(format)).toEqual(gridForKind({ kind }))
  })
})

describe('readGridChoice', () => {
  /**
   * The round trip this function exists for.
   *
   * The layout route rebuilds the master from scratch on every change, so
   * whatever it cannot read back off the stored grid is silently reset. Before
   * this existed it rebuilt from the track counts alone, which meant changing
   * "3 across" to "4 across" also reset the offer card to `blk_offer_card` and
   * gave a square post a footer band it never had.
   */
  it.each(BOOK_KINDS)('reads a %s grid back into the choice that made it', (kind) => {
    const grid = gridForKind({ kind })
    const read = readGridChoice(KIND_SPEC[kind].format, grid)

    expect(gridForKind(read)).toEqual(grid)
  })

  it('reads back a card the owner chose', () => {
    const grid = gridForKind({ kind: 'booklet', cardBlockId: 'blk_price_first' })
    expect(readGridChoice('leaflet', grid).cardBlockId).toBe('blk_price_first')
    expect(gridForKind(readGridChoice('leaflet', grid))).toEqual(grid)
  })

  /**
   * **The removal case, which is the one a `??` would break.** A booklet
   * defaults to a footer, so reading a footer-less booklet back as *absent*
   * rather than `null` would hand the preset its default and put the band
   * straight back on the next edit.
   */
  it('reads a removed footer back as removed, not as absent', () => {
    const grid = gridForKind({ kind: 'booklet', footerBlockId: null })
    const read = readGridChoice('leaflet', grid)

    expect(read.footerBlockId).toBeNull()
    expect(gridForKind(read).regions.some((region) => region.id === 'footer')).toBe(false)
  })

  it('reads a header back, and counts body rows without it', () => {
    const grid = gridForKind({
      kind: 'booklet',
      headerBlockId: 'blk_masthead',
      perRow: 2,
      bodyRows: 4,
    })
    const read = readGridChoice('leaflet', grid)

    expect(read.headerBlockId).toBe('blk_masthead')
    expect(read.perRow).toBe(2)
    // Four rows of cards, not six tracks.
    expect(read.bodyRows).toBe(4)
    expect(gridForKind(read)).toEqual(grid)
  })

  it('reads a margin back', () => {
    const grid = gridForKind({ kind: 'booklet', margin: 0 })
    expect(readGridChoice('leaflet', grid).margin).toBe(0)
    expect(gridForKind(readGridChoice('leaflet', grid))).toEqual(grid)
  })

  /**
   * A change applied on top of what was read must alter one thing and keep the
   * rest. This is exactly what the layout route does.
   */
  it('survives a track-count change with every other choice intact', () => {
    const before = gridForKind({
      kind: 'post',
      cardBlockId: 'blk_price_first',
      headerBlockId: 'blk_masthead',
      margin: 0.02,
    })

    const after = gridForKind({ ...readGridChoice('instagram_post', before), perRow: 4 })

    expect(after.cols).toHaveLength(4)
    expect(after.margin).toBe(0.02)
    expect(after.regions.find((region) => region.id === 'header')?.blockId).toBe('blk_masthead')
    expect(after.regions.some((region) => region.id === 'footer')).toBe(false)
    expect(
      after.regions.filter((region) => region.fill === 'flow').every(
        (region) => region.blockId === 'blk_price_first'
      )
    ).toBe(true)
  })
})

describe('gridForKind — background', () => {
  // Typed rather than `as const`: a gradient's `stops` is a mutable
  // `GradientStop[]`, and a readonly literal is not assignable to it.
  const NAVY: PageBackground = { from: 'role', ref: 'primary' }
  const RUN: PageBackground = {
    from: 'gradient',
    angle: 90,
    stops: [
      { at: 0, color: { from: 'role', ref: 'primary' } },
      { at: 1, color: { from: 'hex', hex: '#ffffff' } },
    ],
  }
  const PHOTO: PageBackground = {
    from: 'asset',
    assetId: 'org_1/blocks/abc',
    fit: 'cover',
    opacity: 0.4,
  }

  it('has none by default, which every renderer reads as paper', () => {
    expect(gridForKind({ kind: 'booklet' }).background).toBeUndefined()
  })

  it.each([
    ['a colour', NAVY],
    ['a gradient', RUN],
    ['artwork', PHOTO],
  ])('carries %s onto the grid', (_label, background) => {
    expect(gridForKind({ kind: 'booklet', background }).background).toEqual(background)
  })

  it('reads each of them back', () => {
    for (const background of [NAVY, RUN, PHOTO]) {
      const grid = gridForKind({ kind: 'booklet', background })
      expect(readGridChoice('leaflet', grid).background).toEqual(background)
      expect(gridForKind(readGridChoice('leaflet', grid))).toEqual(grid)
    }
  })

  /**
   * The removal case. `null` has to survive the read, or clearing a background
   * would be undone by the next change to any other layout field.
   */
  it('reads a cleared background back as cleared', () => {
    const grid = gridForKind({ kind: 'booklet', background: null })
    expect(grid.background).toBeUndefined()
    expect(readGridChoice('leaflet', grid).background).toBeNull()
  })

  it('survives a change to another field', () => {
    const before = gridForKind({ kind: 'post', background: PHOTO, cardBlockId: 'blk_price_first' })
    const after = gridForKind({ ...readGridChoice('instagram_post', before), perRow: 4 })

    expect(after.background).toEqual(PHOTO)
    expect(after.cols).toHaveLength(4)
  })

  /* A post has no footer by default, and a background is orthogonal to that. */
  it('works on a kind with no bands', () => {
    const grid = gridForKind({ kind: 'status', background: NAVY })
    expect(grid.background).toEqual(NAVY)
    expect(grid.regions.some((region) => region.id === 'footer')).toBe(false)
  })
})

/**
 * Merges, and the one property that actually matters about them: they survive
 * every other layout edit.
 *
 * `PATCH .../grid` rebuilds the master from scratch on each change, so a merge
 * has to be part of the *choice* rather than a shape applied to the output —
 * otherwise an owner who merged a hero and then nudged the margin would find
 * their hero gone, with nothing in the interface saying why. The round trip
 * below is that guarantee written down.
 */
describe('readGridChoice — merges', () => {
  const HERO = { colStart: 0, colEnd: 1, rowStart: 0, rowEnd: 1 }

  it('reads back the merge a grid is drawing', () => {
    const grid = gridForKind({ kind: 'booklet', perRow: 3, bodyRows: 3, merges: [HERO] })
    expect(readGridChoice('a4', grid).merges).toEqual([HERO])
  })

  it('reports no merges for a grid that has none', () => {
    expect(readGridChoice('a4', gridForKind({ kind: 'booklet' })).merges).toEqual([])
  })

  it('survives a margin change — the edit that would otherwise erase it', () => {
    const before = gridForKind({ kind: 'booklet', perRow: 3, bodyRows: 3, merges: [HERO] })

    // Exactly what the route does: read the stored grid back into the choice
    // that made it, apply the delta, rebuild.
    const choice = readGridChoice('a4', before)
    const after = gridForKind({ ...choice, margin: 0.08 })

    expect(readGridChoice('a4', after).merges).toEqual([HERO])
    expect(after.margin).toBe(0.08)
  })

  it('survives adding a header band, without the band renumbering it', () => {
    const before = gridForKind({ kind: 'booklet', perRow: 3, bodyRows: 3, merges: [HERO] })
    const after = gridForKind({ ...readGridChoice('a4', before), headerBlockId: 'blk_header' })

    // Still body rows 0–1, though the region now sits at grid rows 1–2.
    expect(readGridChoice('a4', after).merges).toEqual([HERO])
    expect(after.regions.find((region) => region.id === 'r0c0')).toMatchObject({
      rowStart: 1,
      rowEnd: 2,
    })
  })

  it('drops a merge the new track count cannot hold, rather than clipping it', () => {
    const before = gridForKind({
      kind: 'booklet',
      perRow: 4,
      bodyRows: 3,
      merges: [{ colStart: 2, colEnd: 3, rowStart: 0, rowEnd: 0 }],
    })
    const after = gridForKind({ ...readGridChoice('a4', before), perRow: 2 })

    expect(readGridChoice('a4', after).merges).toEqual([])
    expect(validateGrid(after)).toEqual([])
  })

  it('produces a grid the flow engine accepts', () => {
    const grid = gridForKind({ kind: 'booklet', perRow: 3, bodyRows: 3, merges: [HERO] })
    expect(validateGrid(grid)).toEqual([])

    // Six regions for nine cells, so a page holds six offers rather than nine.
    const flow = flowBook({
      master: grid,
      offerIds: Array.from({ length: 6 }, (_, index) => `off_${index}`),
      pins: [],
      page: pageSizeFor('a4'),
      direction: 'ltr',
    })
    expect(flow.pages).toHaveLength(1)
    expect(flow.unplacedOfferIds).toEqual([])
  })
})
