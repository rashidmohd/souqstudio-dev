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

/**
 * Whether any arrangement actually claims this aspect.
 *
 * **`pickArrangement` never fails, and that is the problem this answers.** It
 * falls back to the nearest range rather than refusing to render, which is the
 * right call on a printed flyer — a missing card is worse than a cramped one —
 * but it means a block placed in a shape nobody designed for renders *silently*,
 * as a design drawn tall stretched into a square. Nothing errors. No test that
 * asserts on track counts sees it. Only a rendered page shows it.
 *
 * The twenty-five seeded offer cards carry `TALL` (0.35–0.85) and `WIDE`
 * (1.35–2.6) and nothing between, so every layout whose cells land near 1.0 is
 * in that hole — and an owner reaches it from the editor by adding a header band
 * to a story, which costs the body a row's worth of height.
 *
 * So: this reports the fallback, and a screen that lets an owner change the
 * layout can say so while they are doing it. It decides nothing and changes no
 * rendering; `pickArrangement` behaves exactly as it did.
 */
export function arrangementCovers(
  arrangements: readonly Arrangement[],
  aspect: number
): boolean {
  return arrangements.some(
    (arrangement) => aspect >= arrangement.aspectMin && aspect <= arrangement.aspectMax
  )
}
