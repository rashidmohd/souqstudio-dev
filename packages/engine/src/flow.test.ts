import { describe, it, expect } from 'vitest'
import type { PageGrid, Pin, Region } from '@souqstudio/types'
import { flowBook, pageCountFor, type FlowInput } from './flow'

/**
 * The flow engine, against the cases the product actually has to survive: a
 * weekly booklet, an Instagram carousel, a brand ad pinned mid-book, and the
 * reissue that has to stay cheap.
 */

const A4 = { width: 2480, height: 3508 }
const SQUARE = { width: 1080, height: 1080 }

/** Every cell of a cols×rows grid as its own flow region, in reading order. */
function fullGrid(cols: number, rows: number, gap = 0): PageGrid {
  const regions: Region[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      regions.push({
        id: `r${row}c${col}`,
        colStart: col,
        colEnd: col,
        rowStart: row,
        rowEnd: row,
        blockId: 'blk_card',
        fill: 'flow',
      })
    }
  }
  return { cols: Array(cols).fill(1), rows: Array(rows).fill(1), gap, regions }
}

const offers = (n: number): string[] => Array.from({ length: n }, (_, i) => `off_${i}`)

const input = (over: Partial<FlowInput> & Pick<FlowInput, 'master'>): FlowInput => ({
  offerIds: [],
  pins: [],
  page: A4,
  direction: 'ltr',
  ...over,
})

const offersOn = (page: { placements: Array<{ offerId: string | null }> }) =>
  page.placements.map((p) => p.offerId).filter((id): id is string => id !== null)

describe('flowBook — pagination', () => {
  it('turns 100 products in a 3×4 grid into 9 pages', () => {
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(100) }))
    expect(result.pages).toHaveLength(9)
    expect(result.unplacedOfferIds).toEqual([])
  })

  it('places every product exactly once, in order', () => {
    const ids = offers(100)
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: ids }))
    expect(result.pages.flatMap(offersOn)).toEqual(ids)
  })

  it('leaves the last page partly empty rather than stretching to fill', () => {
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(100) }))
    const last = result.pages[8]
    expect(offersOn(last!)).toHaveLength(4)
    expect(last!.capacity).toBe(12)
  })

  it('produces no pages for an empty product list', () => {
    expect(flowBook(input({ master: fullGrid(3, 4) })).pages).toEqual([])
  })

  it('makes a 10-product carousel ten posts', () => {
    const result = flowBook(
      input({ master: fullGrid(1, 1), offerIds: offers(10), page: SQUARE })
    )
    expect(result.pages).toHaveLength(10)
  })

  it('reports the page count without building placements', () => {
    expect(pageCountFor(input({ master: fullGrid(4, 5), offerIds: offers(100) }))).toBe(5)
  })
})

describe('flowBook — static regions', () => {
  const withFooter = (): PageGrid => {
    const grid = fullGrid(3, 4)
    // Row 3 becomes one merged static footer: the last full row, exactly as an
    // owner would build it.
    const regions = grid.regions.filter((r) => r.rowStart < 3)
    regions.push({
      id: 'footer',
      colStart: 0,
      colEnd: 2,
      rowStart: 3,
      rowEnd: 3,
      blockId: 'blk_footer',
      fill: 'static',
    })
    return { ...grid, regions }
  }

  it('renders the footer on every page and never gives it a product', () => {
    const result = flowBook(input({ master: withFooter(), offerIds: offers(20) }))
    expect(result.pages).toHaveLength(3)
    for (const page of result.pages) {
      const footer = page.placements.find((p) => p.sourceId === 'footer')
      expect(footer?.kind).toBe('static')
      expect(footer?.offerId).toBeNull()
      expect(page.capacity).toBe(9)
    }
  })

  it('spans the merged footer across all three columns', () => {
    const result = flowBook(input({ master: withFooter(), offerIds: offers(9) }))
    const footer = result.pages[0]!.placements.find((p) => p.sourceId === 'footer')
    expect(footer!.rect.width).toBeCloseTo(A4.width)
  })
})

describe('flowBook — pins', () => {
  it('displaces products rather than consuming them', () => {
    // A message post at slot 5 of a ten-product carousel makes eleven posts, not
    // ten with a product dropped.
    const pin: Pin = {
      id: 'pin_msg',
      pageIndex: 4,
      blockId: 'blk_message',
      colStart: 0,
      colEnd: 0,
      rowStart: 0,
      rowEnd: 0,
    }
    const result = flowBook(
      input({ master: fullGrid(1, 1), offerIds: offers(10), pins: [pin], page: SQUARE })
    )

    expect(result.pages).toHaveLength(11)
    expect(result.pages.flatMap(offersOn)).toEqual(offers(10))
    expect(result.unplacedOfferIds).toEqual([])

    const pinned = result.pages[4]!
    expect(pinned.capacity).toBe(0)
    expect(pinned.placements).toHaveLength(1)
    expect(pinned.placements[0]).toMatchObject({ sourceId: 'pin_msg', kind: 'pin', offerId: null })
  })

  it('a two-cell brand ad on page 2 takes exactly two products off that page', () => {
    const pin: Pin = {
      id: 'pin_ad',
      pageIndex: 1,
      blockId: 'blk_ad',
      colStart: 1,
      colEnd: 2,
      rowStart: 1,
      rowEnd: 1,
    }
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(24), pins: [pin] }))

    expect(result.pages[0]!.capacity).toBe(12)
    expect(result.pages[1]!.capacity).toBe(10)
    expect(result.pages.flatMap(offersOn)).toEqual(offers(24))
  })

  it('creates a page a pin sits on even when the products do not need it', () => {
    // An owner who placed a brand ad on page 2 gets page 2.
    const pin: Pin = {
      id: 'pin_ad',
      pageIndex: 2,
      blockId: 'blk_ad',
      colStart: 0,
      colEnd: 0,
      rowStart: 0,
      rowEnd: 0,
    }
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(3), pins: [pin] }))
    expect(result.pages).toHaveLength(3)
    expect(result.pages[2]!.placements.map((p) => p.sourceId)).toEqual(['pin_ad'])
  })

  it('reports an out-of-bounds pin instead of dropping it silently', () => {
    // A pin that vanishes is a brand ad the shop believes it printed.
    const pin: Pin = {
      id: 'pin_bad',
      pageIndex: 0,
      blockId: 'blk_ad',
      colStart: 5,
      colEnd: 6,
      rowStart: 0,
      rowEnd: 0,
    }
    const result = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(12), pins: [pin] }))
    expect(result.invalidPinIds).toEqual(['pin_bad'])
    expect(result.pages[0]!.capacity).toBe(12)
  })
})

describe('flowBook — the weekly reissue', () => {
  const PIN: Pin = {
    id: 'pin_ad',
    pageIndex: 1,
    blockId: 'blk_ad',
    colStart: 1,
    colEnd: 2,
    rowStart: 1,
    rowEnd: 1,
  }

  it('keeps the pin in the same place when the product list grows', () => {
    // Week 32 and week 33. Same master, more offers, and the brand ad has not
    // moved — this is the difference between five minutes and a rebuild.
    const week32 = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(24), pins: [PIN] }))
    const week33 = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(30), pins: [PIN] }))

    const adIn = (r: typeof week32) =>
      r.pages[1]!.placements.find((p) => p.sourceId === 'pin_ad')

    expect(adIn(week33)).toEqual(adIn(week32))
  })

  it('keeps region ids stable so overrides survive a re-run', () => {
    // `SlotOverride` keys on these. Position-derived ids would not survive.
    const week32 = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(24) }))
    const week33 = flowBook(input({ master: fullGrid(3, 4), offerIds: offers(30) }))
    const ids = (r: typeof week32) => r.pages[0]!.placements.map((p) => p.sourceId)
    expect(ids(week33)).toEqual(ids(week32))
  })
})

describe('flowBook — RTL', () => {
  it('fills right to left without a second layout', () => {
    const result = flowBook(
      input({ master: fullGrid(3, 1), offerIds: offers(3), direction: 'rtl' })
    )
    const placements = result.pages[0]!.placements
    // Reading order is unchanged; only the geometry mirrors.
    expect(placements.map((p) => p.offerId)).toEqual(['off_0', 'off_1', 'off_2'])
    expect(placements[0]!.rect.x).toBeCloseTo((A4.width / 3) * 2)
    expect(placements[2]!.rect.x).toBeCloseTo(0)
  })

  it('mirrors a pinned brand ad to the matching cells', () => {
    const pin: Pin = {
      id: 'pin_ad',
      pageIndex: 0,
      blockId: 'blk_ad',
      colStart: 0,
      colEnd: 1,
      rowStart: 0,
      rowEnd: 0,
    }
    const rtl = flowBook(
      input({ master: fullGrid(3, 1), offerIds: offers(1), pins: [pin], direction: 'rtl' })
    )
    const ad = rtl.pages[0]!.placements.find((p) => p.sourceId === 'pin_ad')
    expect(ad!.rect.x).toBeCloseTo(A4.width / 3)
    expect(ad!.rect.width).toBeCloseTo((A4.width / 3) * 2)
  })
})

describe('flowBook — refusals', () => {
  it('throws on a master with no flow region', () => {
    const grid = fullGrid(2, 2)
    const allStatic: PageGrid = {
      ...grid,
      regions: grid.regions.map((r) => ({ ...r, fill: 'static' as const })),
    }
    expect(() => flowBook(input({ master: allStatic, offerIds: offers(4) }))).toThrow(
      /flow region/
    )
  })

  it('throws on overlapping regions rather than producing a hidden card', () => {
    const grid = fullGrid(2, 2)
    const overlapping: PageGrid = {
      ...grid,
      regions: [...grid.regions, { ...grid.regions[0]!, id: 'dupe' }],
    }
    expect(() => flowBook(input({ master: overlapping, offerIds: offers(4) }))).toThrow(
      /same cells/
    )
  })
})
