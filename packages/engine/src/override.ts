/**
 * Bounded overrides — E6 §1 and E6-04.
 *
 * The engine decides where every card goes. This is the one place an owner is
 * allowed to disagree with it, and the disagreement is **bounded by
 * construction**: a nudge within the region, an image scaled between 0.8 and
 * 1.25, and nothing else.
 *
 * That bound is the whole design. E6 §1: unbounded free positioning is what
 * turns week 33 into a rebuild, because a hand-placed card cannot survive the
 * list changing under it. A delta *can* — it is re-applied to whatever the
 * engine produces next week, against a key that survives a repack.
 *
 * Applied **after** `resolveBlock` and after compaction, on the rectangles
 * something is about to draw. Nothing here re-decides geometry; it moves what
 * geometry already decided.
 */

import type { SlotOverride } from '@souqstudio/types'
import { SLOT_OVERRIDE_LIMITS } from '@souqstudio/types'
import type { Rect } from './geometry'
import type { ResolvedBlock, ResolvedElement } from './render'

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0

/**
 * A stored override, forced inside its limits.
 *
 * **Clamped on the way in and again on the way out.** The API clamps what it
 * writes, and this clamps what it reads: a row written before a limit changed,
 * or by anything other than that route, must not be able to move a card out of
 * its region. Storage is not a trust boundary.
 */
export function clampOverride(override: SlotOverride): SlotOverride {
  const { offset, imageScaleMin, imageScaleMax } = SLOT_OVERRIDE_LIMITS

  return {
    regionId: override.regionId,
    offerId: override.offerId,
    ...(override.offsetX === undefined
      ? {}
      : { offsetX: clamp(override.offsetX, -offset, offset) }),
    ...(override.offsetY === undefined
      ? {}
      : { offsetY: clamp(override.offsetY, -offset, offset) }),
    ...(override.imageScale === undefined
      ? {}
      : { imageScale: clamp(override.imageScale, imageScaleMin, imageScaleMax) }),
    ...(override.imageAssetId === undefined ? {} : { imageAssetId: override.imageAssetId }),
    ...(override.textOverrides === undefined ? {} : { textOverrides: override.textOverrides }),
  }
}

/** True when the override would change nothing, so callers can drop the row. */
export function isEmptyOverride(override: SlotOverride): boolean {
  const clamped = clampOverride(override)
  return (
    (clamped.offsetX ?? 0) === 0 &&
    (clamped.offsetY ?? 0) === 0 &&
    (clamped.imageScale ?? 1) === 1 &&
    clamped.imageAssetId === undefined &&
    clamped.textOverrides === undefined
  )
}

/**
 * The override for one placement, out of a page's list.
 *
 * **Both halves of the key must match**, and that is what makes a nudge survive
 * next week: the region is the position on the page, the offer is what is
 * standing in it. An entry whose offer has left the book matches nothing and is
 * simply not applied — an orphan, discarded rather than re-attached to whatever
 * moved into that region.
 */
export function findOverride(
  overrides: readonly SlotOverride[],
  regionId: string,
  offerId: string | null
): SlotOverride | undefined {
  return overrides.find(
    (override) => override.regionId === regionId && override.offerId === offerId
  )
}

/**
 * Apply a nudge and an image scale to a resolved block.
 *
 * **The offset moves the whole card, not its elements individually.** An owner
 * nudging a card means "this one sits a little low in its cell", not "the price
 * has moved relative to the name" — and a per-element offset is exactly the
 * unbounded positioning E6 §1 refuses. The offset is a fraction of the
 * *container*, so the same nudge means the same thing at any page size.
 *
 * The image scale grows or shrinks image elements **about their own centre**, so
 * a packshot fills more of its box without moving the box. Scaling from the
 * origin would drag the product into the corner, which is what the owner
 * reaching for this control is usually trying to fix.
 */
export function applyOverride(
  resolved: ResolvedBlock,
  container: Rect,
  override: SlotOverride | undefined
): ResolvedBlock {
  if (override === undefined) return resolved

  const clamped = clampOverride(override)
  const dx = (clamped.offsetX ?? 0) * container.width
  const dy = (clamped.offsetY ?? 0) * container.height
  const scale = clamped.imageScale ?? 1

  if (dx === 0 && dy === 0 && scale === 1) return resolved

  const elements: ResolvedElement[] = resolved.elements.map(({ element, rect }) => {
    const moved: Rect = { ...rect, x: rect.x + dx, y: rect.y + dy }
    if (element.kind !== 'image' || scale === 1) return { element, rect: moved }

    const width = moved.width * scale
    const height = moved.height * scale
    return {
      element,
      rect: {
        x: moved.x - (width - moved.width) / 2,
        y: moved.y - (height - moved.height) / 2,
        width,
        height,
      },
    }
  })

  return { ...resolved, elements }
}
