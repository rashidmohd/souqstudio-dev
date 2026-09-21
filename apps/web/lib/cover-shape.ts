import { COVER_SHAPES, COVER_SHAPE_RATIO, type CoverShape } from '@souqstudio/engine'

/**
 * Which cover shape suits a page, from its own proportions.
 *
 * **Nearest by ratio, rather than a ladder of thresholds.** The first version
 * hard-coded three boundaries, which was fine for three shapes and wrong the
 * moment there were six — A4 (1:1.414) and a 3:4 leaflet sit 0.04 apart and no
 * hand-written cut-off separates them convincingly. Comparing the actual numbers
 * needs no boundaries at all, and adding a seventh shape cannot break it.
 *
 * Compared in log space, because ratios are multiplicative: 2.0 is as far from
 * 1.0 as 0.5 is, and a linear distance would call 2.0 twice as wrong.
 *
 * **Shared by the two screens that care and owned by neither.** The brand kit
 * asks an owner outright, because there is no page in front of them; the editor
 * uses this to say whether a kept cover fits the page they are on.
 */
export function shapeFor(aspect: number): CoverShape {
  if (!Number.isFinite(aspect) || aspect <= 0) return 'portrait'

  let best: CoverShape = 'portrait'
  let bestDistance = Infinity

  for (const shape of COVER_SHAPES) {
    const distance = Math.abs(Math.log(aspect / COVER_SHAPE_RATIO[shape].aspect))
    if (distance < bestDistance) {
      bestDistance = distance
      best = shape
    }
  }

  return best
}

/**
 * The CSS `aspect-ratio` for a stored cover shape.
 *
 * **A stored string, not a `CoverShape`** — `covers.shape` is a plain column and
 * a row may name a shape we no longer offer, which must still render rather than
 * crash a gallery. Portrait is the fallback for the same reason the campaign
 * label never indexes the engine's map.
 *
 * **Why any of this exists:** every cover thumbnail in the product was an
 * `aspect-square`, so a 16:9 cover and a 9:16 one were shown as the same square
 * and both were cropped to something that was not the picture. The top third a
 * cover keeps clear for the shop's name is exactly what a square crop eats, so
 * the one thing an owner is judging is the one thing they could not see.
 */
export function coverRatio(shape: string): string {
  const found = COVER_SHAPES.find((known) => known === shape)
  return COVER_SHAPE_RATIO[found ?? 'portrait'].css
}
