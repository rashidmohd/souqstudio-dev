/**
 * Resolving a block into absolute rectangles.
 *
 * The engine decides geometry; something else draws. This is the last geometric
 * step: a block's elements are fractions of the block, and a placement gives the
 * block a real rectangle, so the two combine into element rectangles a renderer
 * can consume without knowing anything about grids, flow or pins.
 *
 * RTL mirrors here, on the same rule as `spanRect`: `Box.start` is the
 * reading-order start, so an element at `start: 0` sits against the right edge
 * in an Arabic edition. E6 §6.
 */

import type { Block, BlockElement } from '@souqstudio/types'
import { pickArrangement } from './arrangement'
import { aspectOf, type Direction, type Rect } from './geometry'

export interface ResolvedElement {
  element: BlockElement
  rect: Rect
}

export interface ResolvedBlock {
  /** Which arrangement the container's aspect selected. */
  arrangementIndex: number
  elements: ResolvedElement[]
}

/**
 * Lay a block out inside the rectangle a placement gave it.
 *
 * Element rectangles are **not clamped to the container**. Chips anchored
 * `TOP_START` or `TOP_END` may overhang by up to half their own width, and the
 * engine reserves that bleed in gap calculation — E6 §7. Clamping here would
 * quietly delete the overhang the design depends on.
 */
export function resolveBlock(block: Block, container: Rect, direction: Direction): ResolvedBlock {
  const arrangementIndex = pickArrangement(block.arrangements, aspectOf(container))
  const arrangement = block.arrangements[arrangementIndex]

  if (arrangement === undefined) {
    throw new Error(`resolveBlock: block "${block.id}" has no arrangement at ${arrangementIndex}`)
  }

  const elements = arrangement.elements.map((element) => ({
    element,
    rect: boxRect(element.box, container, direction),
  }))

  return { arrangementIndex, elements }
}

function boxRect(
  box: { start: number; top: number; width: number; height: number },
  container: Rect,
  direction: Direction
): Rect {
  const width = box.width * container.width
  const height = box.height * container.height
  const offset = box.start * container.width

  return {
    x:
      direction === 'rtl'
        ? container.x + container.width - offset - width
        : container.x + offset,
    y: container.y + box.top * container.height,
    width,
    height,
  }
}
