import type { PageGrid } from '@souqstudio/types'

/**
 * The cells a shape takes, given the grid it lands in.
 *
 * Logical and inclusive, the same convention a region uses — `colStart` is the
 * reading-order start, so an Arabic edition mirrors the pin with the rest of the
 * page and there is no second layout to author.
 */
export function spanFor(
  shape: 'row' | 'half-row' | 'page',
  row: number,
  master: Pick<PageGrid, 'cols' | 'rows' | 'regions'>
): { colStart: number; colEnd: number; rowStart: number; rowEnd: number } {
  const cols = master.cols.length
  const rows = master.rows.length

  if (shape === 'page') {
    return { colStart: 0, colEnd: cols - 1, rowStart: 0, rowEnd: rows - 1 }
  }

  /**
   * **Where the cards start, read off the grid rather than assumed.**
   *
   * This counted one row off the bottom for the footer band and nothing off the
   * top for the header — so on a book with a header, row 0 *was* the header, and
   * every pin the editor makes sends row 0. The result was a pin that quietly
   * replaced the header on that page instead of displacing products: the flow
   * engine drops a static region a pin intersects, so the masthead vanished, no
   * product moved, and nothing said so. That is the exact opposite of what a pin
   * promises — "it displaces, it never consumes" — and it is why this now asks
   * the grid where the bands are, the same way `readGridChoice` does, rather
   * than counting rows and hoping.
   */
  const top = master.regions.some((region) => region.id === 'header') ? 1 : 0
  const bottom = master.regions.some((region) => region.id === 'footer') ? 1 : 0
  const bodyRows = Math.max(1, rows - top - bottom)

  const rowIndex = top + Math.min(Math.max(row, 0), bodyRows - 1)
  const half = Math.max(1, Math.ceil(cols / 2))

  return {
    colStart: 0,
    colEnd: shape === 'row' ? cols - 1 : half - 1,
    rowStart: rowIndex,
    rowEnd: rowIndex,
  }
}
