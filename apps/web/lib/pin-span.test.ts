import { describe, expect, it } from 'vitest'
import type { PageGrid } from '@souqstudio/types'
import { spanFor } from '@/lib/pin-span'

/**
 * Where a pin lands, and the off-by-one that put it on the header.
 *
 * **The bug this pins down shipped and was invisible.** `spanFor` counted one
 * row off the bottom for the footer band and nothing off the top for the header,
 * while the pin form sends row 0 for every pin it makes. On a book with a
 * header, row 0 was therefore the header's own track — and `flowBook` drops a
 * static region a pin intersects, so pinning a panel to page 3 removed the
 * masthead from page 3, displaced no product, and reported nothing. A pin's one
 * promise is that it displaces and never consumes.
 */

/** Tracks and regions only: `spanFor` reads nothing else. */
function grid(options: { header: boolean; footer: boolean; perRow?: number; bodyRows?: number }) {
  const perRow = options.perRow ?? 3
  const bodyRows = options.bodyRows ?? 3
  const top = options.header ? 1 : 0

  const regions = [
    ...(options.header
      ? [{ id: 'header', colStart: 0, colEnd: perRow - 1, rowStart: 0, rowEnd: 0 }]
      : []),
    ...(options.footer
      ? [
          {
            id: 'footer',
            colStart: 0,
            colEnd: perRow - 1,
            rowStart: top + bodyRows,
            rowEnd: top + bodyRows,
          },
        ]
      : []),
  ].map((region) => ({ ...region, blockId: 'blk', fill: 'static' as const }))

  return {
    cols: Array.from({ length: perRow }, () => 1),
    rows: Array.from({ length: top + bodyRows + (options.footer ? 1 : 0) }, () => 1),
    regions,
  } satisfies Pick<PageGrid, 'cols' | 'rows' | 'regions'>
}

describe('spanFor', () => {
  it('puts row 0 on the first row of cards, not on the header', () => {
    // The regression. A booklet with both bands: rows are [header, 0, 1, 2, footer].
    expect(spanFor('row', 0, grid({ header: true, footer: true }))).toEqual({
      colStart: 0,
      colEnd: 2,
      rowStart: 1,
      rowEnd: 1,
    })
  })

  it('puts row 0 on row 0 when nothing is above it', () => {
    expect(spanFor('row', 0, grid({ header: false, footer: true })).rowStart).toBe(0)
  })

  it('never lands on a band, whichever rows the owner asks for', () => {
    for (const header of [true, false]) {
      for (const footer of [true, false]) {
        const master = grid({ header, footer, bodyRows: 3 })
        const top = header ? 1 : 0
        const bottom = footer ? master.rows.length - 1 : master.rows.length

        for (const asked of [0, 1, 2, 7, -4]) {
          const span = spanFor('row', asked, master)
          expect(span.rowStart).toBeGreaterThanOrEqual(top)
          expect(span.rowStart).toBeLessThan(bottom)
        }
      }
    }
  })

  it('takes half the columns for a half row, rounded up', () => {
    expect(spanFor('half-row', 0, grid({ header: false, footer: false, perRow: 3 })).colEnd).toBe(1)
    expect(spanFor('half-row', 0, grid({ header: false, footer: false, perRow: 4 })).colEnd).toBe(1)
  })

  it('covers everything for a whole-page pin, bands included', () => {
    // Deliberate: "the whole page" means the whole page, and in a 1×1 carousel
    // grid this is how a cell pin is expressed.
    expect(spanFor('page', 0, grid({ header: true, footer: true }))).toEqual({
      colStart: 0,
      colEnd: 2,
      rowStart: 0,
      rowEnd: 4,
    })
  })
})
