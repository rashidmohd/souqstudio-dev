/**
 * Choosing how a block lays itself out inside a region it was not designed for.
 *
 * Regions merge, so a region can be 1:2, 1:1, 2:1 or a wide band. "Fit" cannot
 * mean stretch — a stretched card is a distorted card — so it means reflow, and
 * the engine picks the arrangement whose aspect range contains the region's.
 *
 * Selection never fails. A block placed in an aspect no arrangement claims falls
 * back to the nearest range rather than refusing to render: a missing card on a
 * printed flyer is worse than a slightly cramped one, and the fit ladder (E6 §4)
 * is what handles cramped.
 */

import type { Arrangement } from '@souqstudio/types'

/** Index of the arrangement to use for `aspect`. */
export function pickArrangement(arrangements: readonly Arrangement[], aspect: number): number {
  if (arrangements.length === 0) {
    throw new Error('pickArrangement: a block must carry at least one arrangement')
  }

  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < arrangements.length; i += 1) {
    const arrangement = arrangements[i]
    if (arrangement === undefined) continue

    if (aspect >= arrangement.aspectMin && aspect <= arrangement.aspectMax) {
      return i
    }

    const distance =
      aspect < arrangement.aspectMin
        ? arrangement.aspectMin - aspect
        : aspect - arrangement.aspectMax

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = i
    }
  }

  return nearestIndex
}
