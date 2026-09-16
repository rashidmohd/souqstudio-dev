import type { CoverShape } from '@souqstudio/engine'

/**
 * Which cover shape suits a page, from its own proportions.
 *
 * **Shared by the two screens that care and owned by neither.** The brand kit
 * asks an owner which shape to draw, because there is no page in front of them;
 * the editor uses this to say whether a kept cover fits the page they are on.
 *
 * The midpoints between the three: square at 1, portrait at ~0.71 (A4) and story
 * at ~0.56 (9:16). Anything wider than a square is still square — there is no
 * landscape cover, and a square one cropped to a wide page loses its top and
 * bottom rather than its subject.
 */
export function shapeFor(aspect: number): CoverShape {
  if (aspect >= 0.86) return 'square'
  if (aspect >= 0.63) return 'portrait'
  return 'story'
}
