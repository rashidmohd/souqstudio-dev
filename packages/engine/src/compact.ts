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
 * reclaimed height to one beneficiary. It runs the other way too: a name set to
 * wrap to three lines under a box drawn for one asks for more than its box, and
 * the room comes out of the beneficiary and the flexible gaps below it. Which beneficiary is a design decision
 * and is the caller's — see `CompactionPolicy`. The engine's job here is that
 * the arithmetic is the same in the browser and in the export worker.
 *
 * **Two passes, and only two.** The caller fits text against the resolved rect
 * to learn how much it used, compacts, then fits again against the compacted
 * rect. It converges immediately because compaction only ever changes *heights*
 * and line breaking is driven by width — so the second pass produces the same
 * line count as the first, at a box that now fits it.
 */

import type { BlockElement } from '@souqstudio/types'
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
 * The policy a book is drawn with, and so the one the designer previews.
 *
 * **One constant, because two surfaces read it.** A designer preview that
 * compacted one way and a book that compacted another would show the owner a
 * card they will never print.
 */
export const BOOK_COMPACTION: CompactionPolicy = 'balance'

/**
 * How much of its box an element's content actually needed.
 *
 * `null` means the element has no content and should be removed — an absent
 * spec, a product with no brand. A number is a height in the same units as the
 * resolved rects. **It may be more than the box** — a name set to wrap to three
 * lines under a box drawn round one — and the stack then makes room for it out
 * of the flexible gaps below. Content that merely overflows a box it cannot grow
 * is the fit ladder's problem, and the caller reports the box for it.
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

  const participants = block.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => PARTICIPATES.has(element.element.kind))
    .sort((a, b) => a.element.rect.y - b.element.rect.y)

  /**
   * **Rows, rather than refusing any card that is not a clean column.** It used
   * to give up on the whole card the moment two elements overlapped vertically
   * — and a card owners actually design always has some: a "SAVE 20%" label on
   * the packshot, a brand pill beside a line. One label switched compaction off
   * for everything, silently, and a name set to three lines stayed cut to one.
   *
   * Elements that overlap vertically are one row, and a row moves as a unit and
   * keeps its shape — its members sit in each other's way, so none of them may
   * grow or close up inside it. An element alone in its row is what flows. A
   * side-by-side arrangement (the WIDE card, image beside name beside price) is
   * one row and so is left exactly as designed, which is what the refusal was
   * protecting.
   */
  const rows = toRows(participants)

  const measured = rows.map((row) => {
    const only = row.members.length === 1 ? row.members[0] : undefined
    if (only !== undefined) {
      const needed = occupancy(only.element, only.index)
      return { row, keep: needed !== null, height: needed === null ? 0 : Math.max(needed, 0) }
    }
    // A row goes only when none of its members has anything to show.
    const any = row.members.some((member) => occupancy(member.element, member.index) !== null)
    return { row, keep: any, height: any ? row.height : 0 }
  })

  // The gap *before* each row. The first keeps its original offset from the
  // top of the block, so compaction never moves the stack as a whole.
  const gaps = measured.map((entry, i) => {
    const previous = measured[i - 1]
    if (previous === undefined) return 0
    return entry.row.y - (previous.row.y + previous.row.height)
  })

  let freed = 0
  for (let i = 0; i < measured.length; i += 1) {
    const entry = measured[i]
    if (entry === undefined) continue
    freed += entry.row.height - entry.height
    // A removed row takes its leading gap with it, or its trailing one when it
    // is first — otherwise deleting the top element leaves its gap behind as a
    // margin nothing asked for.
    if (!entry.keep) freed += i === 0 ? (gaps[1] ?? 0) : (gaps[i] ?? 0)
  }

  const kept = measured.filter((entry) => entry.keep)
  // Negative is a stack that needs more than it was drawn with: a name that
  // wrapped to more lines than its box was drawn for.
  if (Math.abs(freed) <= EPSILON || kept.length === 0) return block

  const keptGaps = kept.map((entry, i) =>
    i === 0 ? 0 : (gaps[measured.indexOf(entry)] ?? 0)
  )

  // `balance` spreads the reclaimed height into the gaps; the other two hand it
  // to one element. A policy whose beneficiary was removed — or shares its row,
  // and so cannot change size — falls through to `balance` rather than dropping
  // the space on the floor.
  const beneficiary =
    policy === 'balance'
      ? -1
      : kept.findIndex(({ row }) => row.kind === (policy === 'image' ? 'image' : 'priceMark'))

  /**
   * **A gap the element below asked to keep never changes.** `balance` spread
   * the freed height into every gap, so a brand line under a one-line name
   * moved up and then drifted back down by a share of the space its own name
   * had given up. Only the flexible gaps open and close; if none is flexible,
   * spare space stays at the foot of the stack.
   */
  const open = kept
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry, i }) => i > 0 && !entry.row.keepWithAbove)
    .map(({ i }) => i)

  const heights = kept.map((entry) => entry.height)
  const extra = kept.map(() => 0)

  if (freed > 0) {
    if (beneficiary !== -1) heights[beneficiary] = (heights[beneficiary] ?? 0) + freed
    else for (const i of open) extra[i] = freed / open.length
  } else {
    let deficit = -freed

    // **Room for what grew, in the order that costs the design least.** The
    // policy's beneficiary gives first, but never below half what it was drawn
    // at — a packshot squeezed to a sliver to fit a name is a worse card than a
    // name cut short.
    if (beneficiary !== -1) {
      const drawn = kept[beneficiary]?.row.height ?? 0
      const give = Math.min(deficit, Math.max(0, (heights[beneficiary] ?? 0) - drawn / 2))
      heights[beneficiary] = (heights[beneficiary] ?? 0) - give
      deficit -= give
    }

    // Then the flexible gaps close, each in proportion to its size, so the
    // card's rhythm shrinks evenly rather than one gap vanishing.
    const room = open.reduce((sum, i) => sum + Math.max(0, keptGaps[i] ?? 0), 0)
    if (deficit > 0 && room > 0) {
      const take = Math.min(deficit, room)
      for (const i of open) extra[i] = -(Math.max(0, keptGaps[i] ?? 0) / room) * take
      deficit -= take
    }

    // Out of room: what grew gives back, in proportion to how far it grew, and
    // the fit ladder draws it in the height that is left — smaller, or cut.
    if (deficit > 0) {
      const growth = kept.map((entry, i) => Math.max(0, (heights[i] ?? 0) - entry.row.height))
      const total = growth.reduce((sum, value) => sum + value, 0)
      if (total > 0) {
        const take = Math.min(deficit, total)
        growth.forEach((value, i) => {
          heights[i] = (heights[i] ?? 0) - (value / total) * take
        })
      }
    }
  }

  const adjusted = new Map<number, ResolvedElement>()
  let cursor = kept[0]?.row.y ?? 0

  for (let i = 0; i < kept.length; i += 1) {
    const entry = kept[i]
    if (entry === undefined) continue

    if (i > 0) cursor += (keptGaps[i] ?? 0) + (extra[i] ?? 0)

    const height = heights[i] ?? entry.height
    const single = entry.row.members.length === 1
    for (const member of entry.row.members) {
      const rect = member.element.rect
      adjusted.set(member.index, {
        element: member.element.element,
        // Each member keeps its place inside the row; only a lone member's
        // height is the row's.
        rect: { ...rect, y: cursor + (rect.y - entry.row.y), height: single ? height : rect.height },
      })
    }
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

type Participant = { element: ResolvedElement; index: number }

/** Elements that overlap vertically, as one band of the card. */
interface Row {
  members: Participant[]
  y: number
  height: number
  /** Kept close if any member asked to be. */
  keepWithAbove: boolean
  /** The kind of a lone member — the only kind a policy can hand space to. */
  kind: BlockElement['kind'] | null
}

/**
 * The stack's rows, top to bottom. An element joins the row above when it
 * starts before that row ends; the row then reaches as far as its lowest
 * member.
 */
function toRows(sorted: readonly Participant[]): Row[] {
  const rows: Row[] = []
  for (const participant of sorted) {
    const { rect } = participant.element
    const last = rows[rows.length - 1]
    if (last !== undefined && rect.y + EPSILON < last.y + last.height) {
      last.members.push(participant)
      last.height = Math.max(last.y + last.height, rect.y + rect.height) - last.y
      last.keepWithAbove ||= participant.element.element.keepWithAbove === true
      last.kind = null
    } else {
      rows.push({
        members: [participant],
        y: rect.y,
        height: rect.height,
        keepWithAbove: participant.element.element.keepWithAbove === true,
        kind: participant.element.element.kind,
      })
    }
  }
  return rows
}
