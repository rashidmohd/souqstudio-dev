import type { Rect } from './geometry'

/**
 * Fitting a solved block into a region. E14 Phase 2.4 —
 * `docs/E14-layout-frames.md` §5.2 and §5.3.
 *
 * **Placement is a scalar, not a re-layout.** A block solves once at its design
 * size; putting it in a region is a single uniform scale applied at paint.
 *
 * Three things fall out of that, and they are the reason it is worth doing:
 *
 * - **Measurement happens once per block definition, not once per placement.**
 *   The hydration risk in §5.4 shrinks from every card on the page to one solve.
 * - **The fit ladder stops being a loop.** It becomes a solve for the largest
 *   `s` that fits. No bounded iteration, nothing to prove.
 * - **Raster sizing becomes computable.** `s` × output dpi says which source
 *   resolution to pull for a product image instead of guessing.
 *
 * **There is no viewport.** Every target region is known before anything is
 * painted: A4 at 300 dpi, a WhatsApp story, a square social crop. This is not
 * the web and nothing here should be built as though a user is dragging an edge.
 */

export interface Size {
  width: number
  height: number
}

/**
 * The largest uniform scale at which `design` fits inside `region`.
 *
 * Uniform, so the block keeps its proportions: a non-uniform fit is a stretched
 * card, and a stretched card is the thing the whole aspect-band rule in §5.6
 * exists to avoid. A degenerate region scales to zero rather than to infinity.
 */
export function fitScale(design: Size, region: Size): number {
  if (design.width <= 0 || design.height <= 0) return 0
  if (region.width <= 0 || region.height <= 0) return 0
  return Math.min(region.width / design.width, region.height / design.height)
}

/**
 * One scale for a whole slot class, computed against the worst case across it.
 *
 * **Per slot class, not per instance.** Every card in the same row of the same
 * grid gets this number. It is the thing no design tool does: Figma's component
 * instances size independently, and InDesign's data merge is worse — auto-sized
 * frames are positioned from the placeholder's size and only then grow, so they
 * overlap, and the standing professional advice is to find the longest record by
 * hand and size for it.
 *
 * **The generator has every record before it paints.** Doing this automatically
 * is not a gap-filler; it is the part a design tool structurally cannot copy,
 * and on a printed flyer grid regularity is the first thing that reads as
 * professional.
 *
 * An empty class scales to zero: there is no worst case, so there is no answer,
 * and 1 would be a number invented out of nothing.
 */
export function classScale(members: readonly Size[], region: Size): number {
  if (members.length === 0) return 0
  return members.reduce((worst, member) => Math.min(worst, fitScale(member, region)), Infinity)
}

/**
 * A text that must stay readable, and the size below which it does not.
 *
 * `minLegible` is **per role** — price, name, spec — which §8 leans toward over
 * per element on the grounds that it is less to author and probably enough. It
 * is expressed in the same units as the region, so a caller working in device
 * pixels at 300 dpi passes `points(6, 300)` and a caller working in CSS pixels
 * passes something else. This module has no opinion about physical size and
 * must not acquire one.
 */
export interface TextFloor {
  /** The solved node this text belongs to. Reported back so the caller can act. */
  nodeId: string
  /** `price`, `name`, `spec`. Carried for the caller's reflow decision. */
  role: string
  /** In design units, as solved. */
  fontSize: number
  /** In region units. */
  minLegible: number
}

/** Points to output units at a given dpi. 72 points to the inch. */
export function points(pt: number, dpi: number): number {
  return (pt * dpi) / 72
}

/**
 * Roughly 6pt at 300 dpi is where nothing is readable, and no amount of
 * proportional thinking gets around it. §5.3.
 *
 * A default rather than a law: a price at 6pt is already a failure, and a
 * block is free to set a higher floor for one.
 */
export const MIN_LEGIBLE_PT = 6

/**
 * `BlockPlacement` rather than `Placement`, which `flow.ts` has owned since
 * before this existed and which is where one offer lands on a page.
 */
export interface BlockPlacement {
  /** The uniform scale to apply at paint. */
  scale: number
  /**
   * Nodes whose text falls under its floor at `scale`.
   *
   * **This does not change the scale.** §5.3 is explicit that the block
   * *reflows* rather than scaling further: drop the spec line, collapse to one
   * line, shorten. Scaling up to rescue a spec line would push the card out of
   * its slot, and scaling down further is what produced the unreadable text in
   * the first place. So this is a signal to the caller, which re-solves with
   * less content and places again.
   *
   * That loop is content-driven rather than size-driven, and it is the only
   * breakpoint concept in this design.
   */
  reflow: TextFloor[]
}

/**
 * The scale for a slot class, and which of its text has gone under the floor.
 *
 * The caller's loop is: solve the class at design size, place it, and if
 * `reflow` is non-empty drop the content it names and solve again. It
 * terminates because each pass removes content, and the block that has nothing
 * left to drop reports its floors and is escalated — the same rung the fit
 * ladder already ends on.
 */
export function place(
  members: readonly Size[],
  region: Size,
  floors: readonly TextFloor[] = []
): BlockPlacement {
  const scale = classScale(members, region)
  const reflow = floors.filter((floor) => floor.fontSize * scale < floor.minLegible)
  return { scale, reflow }
}

/**
 * Where a solved box lands in the region, at `scale`.
 *
 * Centred on both axes: the uniform fit leaves slack on one of them by
 * construction, and putting it all at one edge makes a row of cards of slightly
 * different proportions look misaligned rather than centred.
 */
export function placeRect(rect: Rect, design: Size, region: Size, scale: number): Rect {
  const offsetX = (region.width - design.width * scale) / 2
  const offsetY = (region.height - design.height * scale) / 2
  return {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

/**
 * The source resolution a raster needs to survive this placement, in pixels.
 *
 * §5.2 names this as one of the three things the scalar buys. Pulling a 2000px
 * packshot for a box that prints 180px wide is bandwidth and memory spent on
 * detail the paper cannot hold; pulling a 200px one for a full-bleed cover is
 * the visible version of the same mistake.
 *
 * Rounded up, because a fractional pixel is a soft edge.
 */
export function sourcePixels(rect: Rect, scale: number, dpi: number, unitsPerInch = dpi): Size {
  const factor = (scale * dpi) / unitsPerInch
  return {
    width: Math.ceil(rect.width * factor),
    height: Math.ceil(rect.height * factor),
  }
}
