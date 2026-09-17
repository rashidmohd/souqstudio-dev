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
