/**
 * Editing a block. E7.
 *
 * The designer is direct manipulation over a **fractional** coordinate space —
 * a box is a fraction of the block, never a pixel — so every drag has to come
 * back through arithmetic that knows what a legal box is. That arithmetic is
 * here rather than in the component for the same reason `render.ts` is here:
 * the worker and the browser must agree about what a block *is*, and a rule
 * that lives in one renderer is a rule the other one breaks.
 *
 * Nothing in this file knows about pointers, React or SVG. It takes a box and
 * a delta in block fractions and returns a box.
 */

import type { Arrangement, Block, BlockElement, Box } from '@souqstudio/types'

/**
 * The smallest element a designer may produce, as a fraction of the block.
 *
 * A box below this is not a small element, it is a lost one: at a third of an
 * A4 column, 4% of the block is about three millimetres, and an element the
 * owner cannot see is an element they cannot select back.
 */
export const MIN_ELEMENT = 0.04

/**
 * Drags land on this lattice. 0.5% of the block — fine enough that nothing
 * feels caught, coarse enough that two elements an owner meant to align do.
 *
 * Snapping in fractions rather than pixels is what keeps the result honest: the
 * same design is 1080 square in a carousel post and a third of a column in a
 * booklet, and a pixel grid would align in exactly one of them.
 */
export const SNAP = 0.005

export type Handle =
  | 'start-top'
  | 'top'
  | 'end-top'
  | 'start'
  | 'end'
  | 'start-bottom'
  | 'bottom'
  | 'end-bottom'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function snap(value: number, step: number = SNAP): number {
  return Math.round(value / step) * step
}

/** Rounds away the floating-point tail a chain of drags accumulates. */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * Move a box by a delta, keeping the whole of it inside the block.
 *
 * **It slides against the edge rather than stopping at it.** Clamping the
 * origin alone lets a wide box keep its start while its end leaves the block,
 * which reads to the owner as the element escaping; clamping the origin to the
 * space the box actually has keeps the drag continuous and the element whole.
 *
 * A chip's overhang (E6 §7) is not expressed here. It is `ChipAnchorRef` on the
 * element, applied at render time, so an authored box stays inside the block and
 * the overhang stays a property of the chip rather than of where it was dropped.
 */
export function moveBox(box: Box, dStart: number, dTop: number, step = SNAP): Box {
  return {
    ...box,
    start: tidy(Math.min(Math.max(0, snap(box.start + dStart, step)), 1 - box.width)),
    top: tidy(Math.min(Math.max(0, snap(box.top + dTop, step)), 1 - box.height)),
  }
}

/**
 * Resize from one handle, with the opposite edge pinned.
 *
 * The box never inverts and never falls below `MIN_ELEMENT`: a drag past the
 * opposite edge stops at the minimum instead of turning the element inside out,
 * which is what a `width: -0.2` would mean to every renderer downstream.
 *
 * `start` and `end` are logical. Dragging the `end` handle in an Arabic edition
 * moves the same edge of the same box — mirroring happens once, in
 * `resolveBlock`, and doing it twice is how a design mirrors itself back.
 */
export function resizeBox(
  box: Box,
  handle: Handle,
  dStart: number,
  dTop: number,
  step = SNAP
): Box {
  let { start, top, width, height } = box

  if (handle.includes('start')) {
    const next = Math.min(clamp01(snap(start + dStart, step)), start + width - MIN_ELEMENT)
    width = start + width - next
    start = next
  }
  if (handle.includes('end')) {
    const right = Math.max(clamp01(snap(start + width + dStart, step)), start + MIN_ELEMENT)
    width = right - start
  }
  if (handle.includes('top')) {
    const next = Math.min(clamp01(snap(top + dTop, step)), top + height - MIN_ELEMENT)
    height = top + height - next
    top = next
  }
  if (handle.includes('bottom')) {
    const bottom = Math.max(clamp01(snap(top + height + dTop, step)), top + MIN_ELEMENT)
    height = bottom - top
  }

  return {
    start: tidy(start),
    top: tidy(top),
    width: tidy(Math.min(width, 1 - start)),
    height: tidy(Math.min(height, 1 - top)),
  }
}

// ─── Element lists ────────────────────────────────────────────────────────────
//
// Array order is z-order — later elements paint over earlier ones, which is what
// the seeded library already relies on by putting its surface first. Every
// operation returns a new array; the store swaps it in, so undo is a stack of
// arrays rather than a log of inverse operations.

export function addElement(elements: readonly BlockElement[], element: BlockElement): BlockElement[] {
  return [...elements, element]
}

export function removeElement(elements: readonly BlockElement[], index: number): BlockElement[] {
  return elements.filter((_, i) => i !== index)
}

export function replaceElement(
  elements: readonly BlockElement[],
  index: number,
  element: BlockElement
): BlockElement[] {
  return elements.map((existing, i) => (i === index ? element : existing))
}

/** Move one element through the paint order. Out-of-range moves are no-ops. */
export function reorderElement(
  elements: readonly BlockElement[],
  from: number,
  to: number
): BlockElement[] {
  if (from === to || from < 0 || to < 0 || from >= elements.length || to >= elements.length) {
    return [...elements]
  }
  const next = [...elements]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return [...elements]
  next.splice(to, 0, moved)
  return next
}

/**
 * Whether this element draws from the catalog or is the same on every card.
 *
 * **One answer, read in four places.** The design system requires bound elements
 * to be marked on the canvas, in the layer list and in the palette — three
 * surfaces that must never disagree — and the fourth reader is the binding
 * vocabulary a static block is not offered at all. Deriving it three times is
 * how one of them ends up wrong.
 */
export function isBound(element: BlockElement): boolean {
  switch (element.kind) {
    case 'text':
      // **The offer's tier counts.** A text element bound to it reads a fact
      // about the row it is drawn for, exactly as a product field does — so it
      // gets the dashed canvas outline, the layer-list mark and the refusal to
      // sit on a block that is placed once. Leaving it out would give an owner
      // a live badge on a static panel that silently draws nothing.
      return element.source.from === 'product' || element.source.from === 'offer'
    case 'image':
      return element.source.from === 'product'
    case 'priceMark':
    case 'chip':
      return true
    case 'logo':
    case 'shape':
      return false
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type BlockProblemCode =
  | 'no-arrangements'
  | 'empty-arrangement'
  | 'inverted-aspect'
  | 'overlapping-aspects'
  | 'aspect-gap'
  | 'degenerate-box'
  | 'out-of-bounds'
  | 'duplicate-price-mark'
  | 'product-binding-on-static-block'
  | 'no-price-mark'
  | 'duplicate-element-id'

export interface BlockProblem {
  code: BlockProblemCode
  message: string
  /** Which arrangement it was found in, where that is meaningful. */
  arrangementIndex?: number | undefined
  elementIndex?: number | undefined
  /** A block with a warning still saves and still renders. */
  severity: 'error' | 'warning'
}

/**
 * Structural checks on an authored block.
 *
 * Run on save and while editing, not on every render. The split between `error`
 * and `warning` is the difference between *this cannot be composed* and *this
 * will disappoint you*: an aspect gap falls back to the nearest arrangement and
 * renders, so refusing to save it would be refusing a design that works.
 *
 * `pickArrangement` never fails, deliberately — a missing card on a printed
 * flyer is worse than a cramped one — which is exactly why the gaps have to be
 * reported somewhere. This is that somewhere.
 */
export function validateBlock(block: Pick<Block, 'repeats' | 'arrangements'>): BlockProblem[] {
  const problems: BlockProblem[] = []

  if (block.arrangements.length === 0) {
    return [
      {
        code: 'no-arrangements',
        message: 'A block needs at least one arrangement, or it cannot be drawn at any size',
        severity: 'error',
      },
    ]
  }

  block.arrangements.forEach((arrangement, index) => {
    problems.push(...arrangementProblems(arrangement, index, block.repeats))
  })

  problems.push(...coverageProblems(block.arrangements))

  return problems
}

function arrangementProblems(
  arrangement: Arrangement,
  index: number,
  repeats: boolean
): BlockProblem[] {
  const problems: BlockProblem[] = []

  if (arrangement.aspectMin > arrangement.aspectMax) {
    problems.push({
      code: 'inverted-aspect',
      message: 'This arrangement ends at a narrower aspect than it starts',
      arrangementIndex: index,
      severity: 'error',
    })
  }

  if (arrangement.elements.length === 0) {
    problems.push({
      code: 'empty-arrangement',
      message: 'This arrangement has nothing in it, so the region renders blank',
      arrangementIndex: index,
      severity: 'warning',
    })
  }

  let priceMarks = 0
  const ids = new Set<string>()

  arrangement.elements.forEach((element, elementIndex) => {
    const { box } = element

    // Selection, grouping and z-order all name an element by id, so two
    // elements sharing one is a document where clicking the second selects the
    // first. The designer mints ids that cannot collide; a hand-written seed
    // can, and this is where that is caught.
    if (ids.has(element.id)) {
      problems.push({
        code: 'duplicate-element-id',
        message: 'Two elements on this layout share an id, so only one of them can be selected',
        arrangementIndex: index,
        elementIndex,
        severity: 'error',
      })
    }
    ids.add(element.id)

    if (!(box.width > 0) || !(box.height > 0)) {
      problems.push({
        code: 'degenerate-box',
        message: 'An element with no width or height cannot be seen or selected',
        arrangementIndex: index,
        elementIndex,
        severity: 'error',
      })
    }

    // Chips overhang on purpose — the engine reserves the bleed in gap
    // calculation, E6 §7 — so their box is allowed past the edge. Nothing else
    // is: an element half outside a merged region is clipped by its neighbour
    // on screen and by the trim on paper.
    const tolerance = element.kind === 'chip' ? 0.25 : 0.001
    if (
      box.start < -tolerance ||
      box.top < -tolerance ||
      box.start + box.width > 1 + tolerance ||
      box.top + box.height > 1 + tolerance
    ) {
      problems.push({
        code: 'out-of-bounds',
        message: 'This element falls outside the block and will be cut off',
        arrangementIndex: index,
        elementIndex,
        severity: 'warning',
      })
    }

    if (element.kind === 'priceMark') priceMarks += 1

    // The binding vocabulary is what `repeats` decides — a static block has no
    // product in scope, so a product field there is not merely empty, it is a
    // question with no subject. `contentFor` in the painter draws nothing for
    // it, which is a silent blank rather than an error the owner can act on.
    if (!repeats && isBound(element)) {
      problems.push({
        code: 'product-binding-on-static-block',
        message:
          'This block is placed once rather than per product, so a product field has nothing to read',
        arrangementIndex: index,
        elementIndex,
        severity: 'error',
      })
    }
  })

  if (priceMarks > 1) {
    problems.push({
      code: 'duplicate-price-mark',
      message: 'One offer has one price. A second mark would draw the same number twice',
      arrangementIndex: index,
      severity: 'error',
    })
  }

  if (repeats && priceMarks === 0) {
    problems.push({
      code: 'no-price-mark',
      message: 'A card for a product with no price on it is a catalog page, not an offer',
      arrangementIndex: index,
      severity: 'warning',
    })
  }

  return problems
}

/**
 * Where the aspect ranges overlap, and where they leave a hole.
 *
 * Overlap is a warning rather than an error because `pickArrangement` resolves
 * it deterministically — first match wins — so the block still renders, and the
 * owner may well have meant the earlier one to take precedence. A hole is worth
 * saying out loud: a region whose aspect falls in it gets the *nearest*
 * arrangement, which is a design drawn at a shape it was not drawn for.
 */
function coverageProblems(arrangements: readonly Arrangement[]): BlockProblem[] {
  const problems: BlockProblem[] = []
  const sorted = [...arrangements]
    .map((arrangement, index) => ({ arrangement, index }))
    .sort((a, b) => a.arrangement.aspectMin - b.arrangement.aspectMin)

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (previous === undefined || current === undefined) continue

    // **A shared endpoint is a touch, not an overlap.** The seeded offer card's
    // four ranges meet exactly — 0.35–0.85, 0.85–1.35, and so on — which is how
    // a set of ranges covers the line without a hole in it. Reading that as an
    // overlap put three warnings on the block every shop starts from, which is
    // how owners learn to ignore warnings. Found by reading the real rows back
    // out of the database, not by a test: the test asserted the absence of a
    // *gap* and never looked at what else was reported.
    if (current.arrangement.aspectMin < previous.arrangement.aspectMax - 1e-6) {
      problems.push({
        code: 'overlapping-aspects',
        message: 'Two arrangements claim the same shape. The first one listed wins',
        arrangementIndex: current.index,
        severity: 'warning',
      })
    } else if (current.arrangement.aspectMin > previous.arrangement.aspectMax + 1e-6) {
      problems.push({
        code: 'aspect-gap',
        message: 'No arrangement covers the shapes between these two, so one will be stretched to reach',
        arrangementIndex: current.index,
        severity: 'warning',
      })
    }
  }

  return problems
}
