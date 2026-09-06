/**
 * Reclaiming the space a card's content did not use.
 *
 * **Found by composing real catalog rows, 6 September.** A block's element boxes
 * are designed at the worst case — the offer card's name box holds three lines
 * of a long Arabic name, because sizing it for "Basmati rice" made the fit
 * ladder escalate on every real product. That is the right way to design it. But
 * a real catalog is not the worst case *on most rows*: of 2,131 rows in the dev
 * catalog, 67% have no spec at all and the median name is 17 characters, so the
 * common card is a one-line name in a three-line box above an empty spec line.
 * Roughly a fifth of the card's height is void, sitting between the name and the
 * price where it reads as a mistake rather than as space.
 *
 * The dummies could never show this: all twelve of them carry every field.
 *
 * **This does not resize text and does not decide what a card looks like.** It
 * takes what the caller measured, removes what is not there, and hands the
 * reclaimed height to one beneficiary. Which beneficiary is a design decision
 * and is the caller's — see `CompactionPolicy`. The engine's job here is that
 * the arithmetic is the same in the browser and in the export worker.
 *
 * **Two passes, and only two.** The caller fits text against the resolved rect
 * to learn how much it used, compacts, then fits again against the compacted
 * rect. It converges immediately because compaction only ever changes *heights*
 * and line breaking is driven by width — so the second pass produces the same
 * line count as the first, at a box that now fits it.
 */

import type { ResolvedBlock, ResolvedElement } from './render'

/**
 * Where reclaimed height goes.
 *
 * There is no defensible default, which is why this is a parameter rather than
 * a constant. A grocery flyer that leads on the packshot and one that leads on
 * the price are both real, and they want opposite answers.
 *
 * - `none` — the behaviour before this module existed. Kept so a page can be
 *   rendered both ways and compared, which is the only way this gets decided.
 * - `image` — the packshot takes it. The catalog has almost no images yet, so
 *   this is a bet on where it is going rather than on what it holds.
 * - `price` — the price mark takes it. It is the one element E6 §3 calls the
 *   thing that decides whether output reads as a real offer book.
 * - `balance` — nobody takes it; it is spread evenly into the gaps between what
 *   remains, so a sparse card is an airier card rather than a different one.
 */
export type CompactionPolicy = 'none' | 'image' | 'price' | 'balance'

/**
 * How much of its box an element's content actually needed.
 *
 * `null` means the element has no content and should be removed — an absent
 * spec, a product with no brand. A number is a height in the same units as the
 * resolved rects; it is clamped to the box, because content that overflows its
 * box is the fit ladder's problem and not this module's.
 */
export type Occupancy = (element: ResolvedElement, index: number) => number | null

/** Elements that take part in the stack. A `shape` is the card's own full-bleed
 *  surface and a `chip` is anchored to a corner and deliberately overhangs it —
 *  neither is in the vertical flow, and moving either would break the design. */
const PARTICIPATES = new Set(['image', 'text', 'priceMark'])

/** Rounding slack, in the same units as the rects. Rect maths runs through
 *  fractional multiplies, so exact equality is not a test that ever passes. */
const EPSILON = 0.5

export function compactBlock(
  block: ResolvedBlock,
  occupancy: Occupancy,
  policy: CompactionPolicy
): ResolvedBlock {
  if (policy === 'none') return block

  const indices = block.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => PARTICIPATES.has(element.element.kind))
    .sort((a, b) => a.element.rect.y - b.element.rect.y)

  // **Compaction is a vertical-stack operation and says so by refusing.** The
  // WIDE and BANNER arrangements put the image beside the text and the price
  // beside both; they have the same empty-space problem and a different answer,
  // and inventing one here would move elements sideways into each other.
  if (!isVerticalStack(indices.map((entry) => entry.element))) return block

  const measured = indices.map((entry) => {
    const needed = occupancy(entry.element, entry.index)
    return {
      ...entry,
      keep: needed !== null,
      height: needed === null ? 0 : Math.min(Math.max(needed, 0), entry.element.rect.height),
    }
  })

  // The gap *before* each element. The first keeps its original offset from the
  // top of the block, so compaction never moves the stack as a whole.
  const gaps = measured.map((entry, i) => {
    const previous = measured[i - 1]
    if (previous === undefined) return 0
    return entry.element.rect.y - (previous.element.rect.y + previous.element.rect.height)
  })

  let freed = 0
  for (let i = 0; i < measured.length; i += 1) {
    const entry = measured[i]
    if (entry === undefined) continue
    freed += entry.element.rect.height - entry.height
    // A removed element takes its leading gap with it, or its trailing one when
    // it is first — otherwise deleting the top element leaves its gap behind as
    // a margin nothing asked for.
    if (!entry.keep) freed += i === 0 ? (gaps[1] ?? 0) : (gaps[i] ?? 0)
  }

  const kept = measured.filter((entry) => entry.keep)
  if (freed <= EPSILON || kept.length === 0) return block

  const keptGaps = kept.map((entry, i) =>
    i === 0 ? 0 : (gaps[measured.indexOf(entry)] ?? 0)
  )

  // `balance` spreads the reclaimed height into the gaps; the other two hand it
  // to one element. A policy whose beneficiary was removed falls through to
  // `balance` rather than dropping the space on the floor.
  const beneficiary =
    policy === 'balance'
      ? -1
      : kept.findIndex(({ element }) =>
          policy === 'image' ? element.element.kind === 'image' : element.element.kind === 'priceMark'
        )

  const bonusEach = beneficiary === -1 && keptGaps.length > 1 ? freed / (keptGaps.length - 1) : 0

  const adjusted = new Map<number, ResolvedElement>()
  let cursor = kept[0]?.element.rect.y ?? 0

  for (let i = 0; i < kept.length; i += 1) {
    const entry = kept[i]
    if (entry === undefined) continue

    if (i > 0) cursor += (keptGaps[i] ?? 0) + bonusEach

    const height = entry.height + (i === beneficiary ? freed : 0)
    adjusted.set(entry.index, {
      element: entry.element.element,
      rect: { ...entry.element.rect, y: cursor, height },
    })
    cursor += height
  }

  return {
    arrangementIndex: block.arrangementIndex,
    elements: block.elements
      .map((element, index) => {
        if (!PARTICIPATES.has(element.element.kind)) return element
        return adjusted.get(index) ?? null
      })
      .filter((element): element is ResolvedElement => element !== null),
  }
}

/** Every element starts at or below the bottom of the one before it. */
function isVerticalStack(elements: readonly ResolvedElement[]): boolean {
  for (let i = 1; i < elements.length; i += 1) {
    const previous = elements[i - 1]
    const current = elements[i]
    if (previous === undefined || current === undefined) return false
    if (current.rect.y + EPSILON < previous.rect.y + previous.rect.height) return false
  }
  return true
}
