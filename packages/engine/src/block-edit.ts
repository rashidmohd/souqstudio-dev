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
import { markRecipe } from './price-mark'

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

/**
 * How far past the block an element may be dragged, as a fraction of it.
 *
 * **Because a bleed is a design, not a mistake.** Every flyer in the reference
 * pile has a band running off both edges and a photograph filling the trim, and
 * the editor refused all of it: `moveBox` clamped the whole box inside the
 * block, so the only way to make a shape reach an edge was to land it exactly
 * on the edge, and the only way to crop one was to not have it.
 *
 * **Seven tenths, and never the whole of it** — `keepInside` below is the other
 * half of the rule. This is also the tolerance `validateBlock` allows before it
 * warns, and the two are one constant on purpose: a gesture the designer offers
 * must not produce a warning about itself.
 *
 * **It was a quarter, and a quarter was measured against the wrong thing.** A
 * quarter of the block is a generous bleed for a chip and almost nothing for a
 * full-width row: the row stopped with three quarters of itself still on the
 * card, which is not a bleed, it is a row that is slightly too far along. The
 * band that runs off the page and the photograph cropped to a sliver of sky are
 * both past that point, so the ceiling is now the largest one the other half of
 * the rule will tolerate for a full-width element.
 */
export const BLEED = 0.7

/**
 * How far past the block a chip may sit *without costing anything*, as a
 * fraction of it.
 *
 * **Separate from `BLEED` because it is not a permission, it is a measurement.**
 * A chip overhangs a repeating card on purpose (E6 §7) and the engine reserves
 * exactly this much room for it when it calculates the slot gap. Raising the
 * bleed an owner may drag into must not quietly raise what the gap was built to
 * absorb, or a chip lands on the card beside it and `validateBlock` says
 * nothing — so the reserve stays where the gap calculation put it.
 */
export const CHIP_BLEED = 0.25

/**
 * How much of an element must stay in the block, as a fraction of the block.
 *
 * A bleed that can swallow the whole element is a way to lose one: a badge
 * dragged fully past the edge is invisible, unselectable on the canvas, and
 * indistinguishable from a badge that was deleted. `MIN_ELEMENT` is already the
 * answer to "the smallest thing an owner can see and get hold of", so it is the
 * answer here too.
 */
const keepInside = MIN_ELEMENT

export type Handle =
  | 'start-top'
  | 'top'
  | 'end-top'
  | 'start'
  | 'end'
  | 'start-bottom'
  | 'bottom'
  | 'end-bottom'

export function snap(value: number, step: number = SNAP): number {
  return Math.round(value / step) * step
}

/**
 * Rounds away the floating-point tail a chain of drags accumulates.
 *
 * **And negative zero with it.** `Math.max(-0, …)` is how an edge clamp
 * answers when nothing was allowed past it, and `-0` is a value that is equal
 * to `0`, prints as `-0`, and is not the same object to a deep comparison —
 * so it reads as a change to anything diffing two documents.
 */
const tidy = (value: number) => {
  const rounded = Math.round(value * 1e6) / 1e6
  return rounded === 0 ? 0 : rounded
}

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
export function moveBox(
  box: Box,
  dStart: number,
  dTop: number,
  step = SNAP,
  bleed = 0
): Box {
  /**
   * The travel on one axis: as far as `bleed` past each edge, and never so far
   * that the element has nothing left inside.
   *
   * **Two ceilings, and the tighter one wins.** The bleed is what the owner is
   * allowed to hang off the edge; `keepInside` is what has to stay on the card
   * whatever the bleed says, because an element dragged fully past the edge is
   * invisible, unselectable, and indistinguishable from one that was deleted.
   *
   * Which of them binds depends on the element. A full-width row runs out of
   * bleed first and seven tenths of it hangs off; a small badge runs out of
   * *itself* first and stops with a sliver showing.
   *
   * At `bleed = 0` this is the old rule exactly — `low` is 0 and `high` is
   * `1 - size` — which is what keeps every caller that does not ask for a bleed
   * where it was.
   */
  const span = (size: number) => ({
    low: Math.max(-bleed, keepInside - size),
    high: Math.min(1 - size + bleed, 1 - keepInside),
  })

  const across = span(box.width)
  const down = span(box.height)

  return {
    ...box,
    start: tidy(
      Math.min(Math.max(across.low, snap(box.start + dStart, step)), across.high)
    ),
    top: tidy(Math.min(Math.max(down.low, snap(box.top + dTop, step)), down.high)),
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
export interface ResizeOptions {
  /** The lattice edges land on. Defaults to `SNAP`. */
  step?: number | undefined
  /**
   * Keep the box's width-to-height ratio.
   *
   * Only a corner can honour this — an edge handle moves one pair of sides by
   * definition, and forcing the other pair to follow would move an edge the
   * owner did not touch. It is ignored for the other four handles rather than
   * refused, so a caller can pass one flag for every handle.
   */
  aspect?: boolean | undefined
  /**
   * How far past the block an edge may travel, as a fraction of it.
   *
   * **Zero is not the honest default for every element, which is why this
   * exists.** A chip overhangs its block on purpose — E6 §7 reserves the bleed
   * — and `validateBlock` already allows it `CHIP_BLEED`. Clamping
   * its handles to the block anyway snapped it back inside the moment a drag
   * began, which reads as the handle coming off the pointer.
   *
   * A box that is *already* outside is never pulled in tighter than it sits,
   * whatever this says: a resize changes the edge under the pointer, and
   * correcting an unrelated one at the same time is the jump again in a
   * different place.
   */
  overhang?: number | undefined
}

export function resizeBox(
  box: Box,
  handle: Handle,
  dStart: number,
  dTop: number,
  options: ResizeOptions = {}
): Box {
  const step = options.step ?? SNAP

  const slack = Math.max(
    options.overhang ?? 0,
    -box.start,
    -box.top,
    box.start + box.width - 1,
    box.top + box.height - 1,
    0
  )
  const low = -slack
  const high = 1 + slack
  const hold = (value: number) => Math.min(high, Math.max(low, value))

  let { start, top, width, height } = box

  const movesStart = handle.includes('start')
  const movesEnd = handle.includes('end')
  const movesTop = handle.includes('top')
  const movesBottom = handle.includes('bottom')

  if (movesStart) {
    const next = Math.min(hold(snap(start + dStart, step)), start + width - MIN_ELEMENT)
    width = start + width - next
    start = next
  }
  if (movesEnd) {
    const right = Math.max(hold(snap(start + width + dStart, step)), start + MIN_ELEMENT)
    width = right - start
  }
  if (movesTop) {
    const next = Math.min(hold(snap(top + dTop, step)), top + height - MIN_ELEMENT)
    height = top + height - next
    top = next
  }
  if (movesBottom) {
    const bottom = Math.max(hold(snap(top + height + dTop, step)), top + MIN_ELEMENT)
    height = bottom - top
  }

  /*
   * The ratio, restored from whichever axis the pointer moved further along.
   *
   * **Led by the dominant axis rather than by one named side.** Fixing the
   * height to the width would make a corner drag straight down do nothing,
   * which is the behaviour that makes an aspect lock feel broken; comparing the
   * two *proportional* changes means the corner follows the pointer along
   * whichever axis the owner is actually pulling.
   *
   * The opposite corner stays pinned, exactly as it does without the lock —
   * everything below recomputes the moving edges from it rather than nudging
   * the free result.
   */
  if (
    options.aspect === true &&
    (movesStart || movesEnd) &&
    (movesTop || movesBottom) &&
    box.width > 0 &&
    box.height > 0
  ) {
    const ratio = box.width / box.height

    if (Math.abs(width - box.width) / box.width >= Math.abs(height - box.height) / box.height) {
      height = width / ratio
    } else {
      width = height * ratio
    }

    // The floor applies to the pair, not to one of them: shrinking past it on
    // either axis stops the drag at the smallest box that still holds the
    // ratio, rather than flattening the element on the way down.
    const floor = Math.max(MIN_ELEMENT / width, MIN_ELEMENT / height, 1)
    width *= floor
    height *= floor

    // And the same for the ceiling — the room left from the pinned corner.
    const roomWide = movesStart ? box.start + box.width - low : high - box.start
    const roomTall = movesTop ? box.top + box.height - low : high - box.top
    const fit = Math.min(roomWide / width, roomTall / height, 1)
    width *= fit
    height *= fit

    if (movesStart) start = box.start + box.width - width
    if (movesTop) top = box.top + box.height - height
  }

  return {
    start: tidy(start),
    top: tidy(top),
    width: tidy(Math.min(width, high - start)),
    height: tidy(Math.min(height, high - top)),
  }
}

/**
 * The shift that keeps a rotated element's pinned corner where the owner left
 * it, in the logical fractions a box is written in.
 *
 * A rotation is about the element's own centre. Resize with one edge pinned and
 * the centre moves, so every point swings about the *new* centre instead of the
 * old one — the far corner of a shape turned 30° walks across the card while
 * the near one follows the pointer. Solving
 * `c₁ + t + R(p − c₁) = c₀ + R(p − c₀)` for the shift `t` leaves
 * `t = (c₀ − c₁) − R(c₀ − c₁)`: the part of the centre's movement that the
 * turn does not already account for.
 *
 * Zero at zero degrees, where `R` is the identity — an upright drag pays
 * nothing for this.
 */
export function recentre(
  before: Box,
  after: Box,
  turn: number,
  artboard: { width: number; height: number; mirror: boolean }
): { start: number; top: number } {
  if (turn === 0) return { start: 0, top: 0 }

  // Artboard units, because a vector in fractions of two different lengths
  // cannot be rotated — the same reason `screenDelta` works in them. And on
  // the *screen's* axes, because the turn is: `start` runs the other way in an
  // Arabic edition, so it is flipped on the way in and back on the way out.
  const sign = artboard.mirror ? -1 : 1
  const dx =
    (before.start + before.width / 2 - (after.start + after.width / 2)) * artboard.width * sign
  const dy = (before.top + before.height / 2 - (after.top + after.height / 2)) * artboard.height

  const radians = (turn * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return {
    start: ((dx - (dx * cos - dy * sin)) / artboard.width) * sign,
    top: (dy - (dx * sin + dy * cos)) / artboard.height,
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
      //
      // **`brand` and `book` are live data and deliberately not "bound" here**,
      // and the distinction is load-bearing. This function answers "does this
      // need a product in scope", which is what `product-binding-on-static-block`
      // is about; a shop's name and a book's dates are available everywhere, so
      // a header carrying them is correct rather than broken. E14 §3.6, and
      // `bindingInScope` in `bindings.ts` is the general form.
      //
      // Widening it would put a warning on every seeded header and footer — and
      // the loader refuses a shipped block that draws any warning, which is what
      // took the dev deploy down on 10 September. `docs/block-library-from-r2.md`
      // §12.
      return element.source.from === 'product' || element.source.from === 'offer'
    case 'image':
      // Same rule: a `brand.logo` image is the shop's mark, which every block
      // has in scope. It was `kind: 'logo'` and answered `false` here too, so
      // folding it in changed nothing about what the canvas marks. E14 §3.1.
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
  | 'duplicate-tier'
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
  let attachedTabs = 0
  let badges = 0
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

    /*
     * **Whether a bleed is a design or a collision depends on what is beside
     * it, and `repeats` is exactly that question.**
     *
     * A block placed once is a cover, a header, a footer or a panel: it has the
     * page to itself, and a band running off its edge is what every flyer in
     * the reference pile does. Nothing is harmed, so nothing is said.
     *
     * A repeating card has twenty-three neighbours. An element past its edge
     * does not vanish there — the page painter draws it where it was put — so
     * it lands on the card beside it, and the owner sees it on the *other*
     * product. That is worth a warning however deliberate the drag was, which
     * is why this stayed at a hairline rather than following `BLEED`.
     *
     * The chip is the exception it always was: it overhangs by construction and
     * E6 §7 reserves the room for it in the gap calculation — `CHIP_BLEED`,
     * which is that reserve rather than the larger bleed a free drag may use.
     *
     * The drag itself is not limited by any of this. The designer lets an owner
     * put an element where they want it and this says what it will cost — a
     * tool that silently refuses is a tool with a bug, as far as anyone using
     * it can tell.
     */
    const tolerance = repeats ? (element.kind === 'chip' ? CHIP_BLEED : 0.001) : BLEED
    const gone =
      box.start + box.width <= 0 ||
      box.top + box.height <= 0 ||
      box.start >= 1 ||
      box.top >= 1
    const past =
      box.start < -tolerance ||
      box.top < -tolerance ||
      box.start + box.width > 1 + tolerance ||
      box.top + box.height > 1 + tolerance

    if (gone || past) {
      problems.push({
        code: 'out-of-bounds',
        // Two different things have gone wrong and they read differently to
        // the owner: one element is cropped by the edge, the other is not on
        // the card at all and no amount of looking at the card will say so.
        message: gone
          ? 'This element is entirely outside the block, so nothing of it draws'
          : 'This element falls outside the block and will be cut off',
        arrangementIndex: index,
        elementIndex,
        severity: 'warning',
      })
    }

    if (element.kind === 'priceMark') {
      priceMarks += 1
      /**
       * **Through `markRecipe`, not off the legacy field.** A recipe hides the
       * tab with `tier: { place: 'hidden' }`, and two of the shipped presets —
       * `price-bomb` and `wide-band` — hide it by default without ever writing
       * `tab: 'none'`. Reading the old spelling alone would warn on a card that
       * draws the tier exactly once, and `library-source.ts` refuses a shipped
       * block that draws any warning: a false positive here is a deploy that
       * fails, which is what `duplicate-tier` itself cost on 10 September.
       */
      if (markRecipe(element.style).tier.place !== 'hidden') attachedTabs += 1
    }
    if (element.kind === 'chip' && element.shape !== 'none') badges += 1

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

  /**
   * The tier, drawn twice.
   *
   * **A defect the shipped library carried in 43 of its 100 arrangements**,
   * including `blk_offer_card` — the default every shop starts from. A chip and
   * the mark's attached tab both render the promo tier, so an offer with one
   * gets "HALF PRICE" at the corner and again on the price. Nothing caught it:
   * the tests assert the tab *is* attached, which is a correctness rule and
   * passes, and in the gallery it reads as a design choice unless you know it
   * is not one.
   *
   * A warning rather than an error. It draws, and an owner who genuinely wants
   * the tier twice may keep it — but it should never be something a block does
   * without anybody choosing it.
   */
  if (badges > 0 && attachedTabs > 0) {
    problems.push({
      code: 'duplicate-tier',
      message:
        'The promo tier draws twice here — once on the badge and once on the price. Hide one of them',
      arrangementIndex: index,
      severity: 'warning',
    })
  }

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
