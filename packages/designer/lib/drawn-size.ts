import type { BlockElement } from '@souqstudio/types'

/**
 * What the box fields read their percentages against.
 *
 * `aspect` is the previewed shape's own proportion, width over height. `page`
 * is that shape in export pixels where the block has one to be drawn on, and
 * `null` where it does not: a repeating block letterboxes into whatever region
 * the grid hands it, so a pixel figure there would be invented.
 */
export type Canvas = {
  aspect: number
  page: { width: number; height: number } | null
}

/**
 * What the two size percentages come to where the block is drawn.
 *
 * **The pair is read against different edges, and nothing in the panel said
 * so.** A circle dragged round by eye on a story reads 32.5 wide and 18.5 tall
 * — both correct, both percentages, of two edges that are not the same length —
 * and an owner looking at those two numbers has every reason to think the tool
 * has lost the shape. Worse, they cannot get a circle or a square deliberately:
 * the arithmetic that would give them one is the block's aspect, which is not a
 * number anywhere on this screen.
 *
 * So the panel does the multiplication. Equal figures are a square, and on an
 * ellipse a circle, which is the whole of what an owner needs to read off it.
 *
 * In pixels where the block has a page to be drawn on. A repeating block does
 * not — it letterboxes into whatever region the grid gives it, at a range of
 * shapes rather than one — so there the proportion is all that can honestly be
 * said, and a circle is a circle only at the shape on the canvas.
 */
export function drawnSize(box: BlockElement['box'], canvas: Canvas): string | null {
  const page = canvas.page
  if (page !== null) {
    const width = Math.round(box.width * page.width)
    const height = Math.round(box.height * page.height)
    if (width <= 0 || height <= 0) return null
    return `Drawn ${width} × ${height} px`
  }

  // Drawn width over drawn height: `(w·W) / (h·H)`, and `W/H` is the aspect.
  const ratio = (box.width / box.height) * canvas.aspect
  if (!Number.isFinite(ratio) || ratio <= 0) return null

  const figure = (value: number) =>
    value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)

  return ratio >= 1
    ? `Drawn ${figure(ratio)} : 1 at this shape`
    : `Drawn 1 : ${figure(1 / ratio)} at this shape`
}
