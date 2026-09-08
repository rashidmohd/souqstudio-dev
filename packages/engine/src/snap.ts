/**
 * Snapping and alignment. E7.
 *
 * A design tool that does not snap makes an owner nudge two boxes at each other
 * for a minute and still leave them a pixel apart, and a printed flyer shows
 * that pixel. This is what turns "close enough" into "the same".
 *
 * In the engine rather than in the canvas component for the reason everything
 * geometric is: the numbers have to be the same wherever they are computed, and
 * alignment applied in the browser must produce the document the worker prints.
 * Nothing here knows about pointers or SVG — it takes boxes and returns boxes.
 */

import type { Box } from '@souqstudio/types'

/** Within this fraction of the block, a drag is treated as meaning "aligned". */
export const SNAP_RANGE = 0.012

/** The six lines an element can align to — three per axis. */
export interface Guides {
  /** Fractions along the block's inline axis. */
  x: number[]
  /** Fractions down the block. */
  y: number[]
}

const edges = (box: Box) => ({
  x: [box.start, box.start + box.width / 2, box.start + box.width],
  y: [box.top, box.top + box.height / 2, box.top + box.height],
})

/**
 * Where a moving box would like to land, and the lines it would land on.
 *
 * **The block's own edges and centre are always candidates**, alongside every
 * other element's. Centring something on the card is the most common alignment
 * there is, and requiring another element to snap against would make it the one
 * thing the tool cannot help with.
 *
 * Returns the snapped box *and* the guides that were hit, because a snap the
 * owner cannot see reads as the drag being wrong rather than as help.
 */
export function snapBox(
  box: Box,
  others: readonly Box[],
  range = SNAP_RANGE
): { box: Box; guides: Guides } {
  const candidatesX = [0, 0.5, 1, ...others.flatMap((other) => edges(other).x)]
  const candidatesY = [0, 0.5, 1, ...others.flatMap((other) => edges(other).y)]

  const own = edges(box)
  const hit: Guides = { x: [], y: [] }

  // Each of the three edges is offered to every candidate, and the *closest*
  // pairing wins — offering only the leading edge would refuse to snap two
  // boxes by their right edges, which is half of what alignment means.
  let dx = 0
  let bestX = range
  for (const [index, edge] of own.x.entries()) {
    for (const candidate of candidatesX) {
      const distance = Math.abs(candidate - edge)
      if (distance < bestX) {
        bestX = distance
        dx = candidate - edge
        hit.x = [candidate]
      } else if (distance <= 1e-9 && hit.x.length > 0 && index >= 0) {
        // An exact second hit on the same offset is another guide worth drawing.
        if (!hit.x.includes(candidate)) hit.x.push(candidate)
      }
    }
  }

  let dy = 0
  let bestY = range
  for (const edge of own.y) {
    for (const candidate of candidatesY) {
      const distance = Math.abs(candidate - edge)
      if (distance < bestY) {
        bestY = distance
        dy = candidate - edge
        hit.y = [candidate]
      }
    }
  }

  return {
    box: { ...box, start: round(box.start + dx), top: round(box.top + dy) },
    guides: hit,
  }
}

/** Six ways to line boxes up. Logical: `start` is the reading-order start. */
export type Alignment =
  | 'start'
  | 'center'
  | 'end'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y'

/**
 * Align a set of boxes to each other.
 *
 * **They align to their own extent, not to the block.** Two elements dragged to
 * the corner and then centred should end up centred *on each other* — aligning
 * them to the card instead is a different command, and one an owner can get by
 * selecting nothing and using the block's own centre guide.
 *
 * Distribution needs three: with two there is nothing to space out, and
 * silently doing nothing is the right answer rather than an error.
 */
export function alignBoxes(boxes: readonly Box[], how: Alignment): Box[] {
  if (boxes.length < 2) return [...boxes]

  const minX = Math.min(...boxes.map((box) => box.start))
  const maxX = Math.max(...boxes.map((box) => box.start + box.width))
  const minY = Math.min(...boxes.map((box) => box.top))
  const maxY = Math.max(...boxes.map((box) => box.top + box.height))

  if (how === 'distribute-x' || how === 'distribute-y') {
    if (boxes.length < 3) return [...boxes]
    return distribute(boxes, how === 'distribute-x')
  }

  return boxes.map((box) => {
    switch (how) {
      case 'start':
        return { ...box, start: round(minX) }
      case 'center':
        return { ...box, start: round((minX + maxX) / 2 - box.width / 2) }
      case 'end':
        return { ...box, start: round(maxX - box.width) }
      case 'top':
        return { ...box, top: round(minY) }
      case 'middle':
        return { ...box, top: round((minY + maxY) / 2 - box.height / 2) }
      case 'bottom':
        return { ...box, top: round(maxY - box.height) }
    }
  })
}

/**
 * Even gaps, not even centres.
 *
 * Spacing centres evenly is the easier arithmetic and the wrong answer: three
 * boxes of different widths end up with visibly different gaps, which is the
 * thing the owner reached for this control to fix. The first and last stay
 * where they are, because they are what defines the span.
 */
function distribute(boxes: readonly Box[], horizontal: boolean): Box[] {
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.start - b.start : a.top - b.top))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) return [...boxes]

  const size = (box: Box) => (horizontal ? box.width : box.height)
  const position = (box: Box) => (horizontal ? box.start : box.top)

  const span = position(last) + size(last) - position(first)
  const occupied = sorted.reduce((total, box) => total + size(box), 0)
  const gap = (span - occupied) / (sorted.length - 1)

  let cursor = position(first)
  const moved = new Map<Box, Box>()
  for (const box of sorted) {
    moved.set(box, horizontal ? { ...box, start: round(cursor) } : { ...box, top: round(cursor) })
    cursor += size(box) + gap
  }

  // Returned in the order they came in: the caller is holding a selection, and
  // handing it back sorted would reorder the document as a side effect.
  return boxes.map((box) => moved.get(box) ?? box)
}

const round = (value: number) => Math.round(value * 1e6) / 1e6
