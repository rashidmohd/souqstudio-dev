import type { Arrangement } from '@souqstudio/types'

/**
 * Trimming or extending a locked layout from its edges.
 *
 * **The content stays where it is; the card's edge moves.** Element boxes are
 * fractions of the card, so a card made shorter with its boxes untouched would
 * squash everything into the new height. Instead each box is re-expressed
 * against the new card: an element 83% of the way down a card that loses its
 * bottom 17% ends exactly at the new bottom, at the same size it was. That is
 * what an owner dragging the bottom edge up expects, and what removes the empty
 * strip rather than shrinking the design.
 *
 * `width` and `height` are the new size as a share of the old, so 0.83 cuts
 * 17% off and 1.1 adds 10% of empty space. The cut comes off the bottom and
 * the reading-order end, which is the edge the designer draws the handles on.
 * Elements outside the new card are kept, not deleted, exactly as a ground
 * already dragged past the edge is kept today; dragging back brings them back.
 */
export function reshapeArrangement(
  arrangement: Arrangement,
  shape: number,
  width: number,
  height: number
): Arrangement {
  return {
    ...arrangement,
    shape: clampShape((shape * width) / height),
    elements: arrangement.elements.map((element) => ({
      ...element,
      box: {
        ...element.box,
        start: element.box.start / width,
        width: element.box.width / width,
        top: element.box.top / height,
        height: element.box.height / height,
      },
    })),
  }
}

/** The bounds `arrangementsSchema` puts on a shape, so a drag can never save one it refuses. */
export function clampShape(shape: number): number {
  return Math.min(40, Math.max(0.05, shape))
}

/** How far one drag may resize a card: down to a fifth, up to double. */
export const MIN_RESIZE = 0.2
export const MAX_RESIZE = 2
