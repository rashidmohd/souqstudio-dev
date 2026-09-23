import type { Rect, Direction } from './geometry'
import {
  fillWeight,
  isFlow,
  type Align,
  type DesignSize,
  type FlowLayout,
  type Justify,
  type LayoutFrame,
  type LayoutLeaf,
  type LayoutNode,
  type ResolveContext,
  type Sizing,
} from './frame'

/**
 * The two-pass frame solver. E14 Phase 2.2 — `docs/E14-layout-frames.md` §5.4.
 *
 * **Measure bottom-up, position top-down.** Resolve every `hug` from the
 * content outwards, clamping to min/max; then give the root the region, divide
 * each frame's free space among its `fill` children by weight, place everything
 * along the axis with the gap, and recurse.
 *
 * One rule makes the first pass terminate: **a child whose size depends on its
 * parent is excluded from the parent's hug measurement.** A `fill` child
 * contributes nothing to a `hug` parent. Figma states the consequence as a UI
 * rule — a frame containing any `fill` child stops hugging on that axis — and
 * the rule belongs here rather than only in the panel, because a solver that
 * asked a fill child how big it wanted to be would be asking it to answer with
 * the number it is waiting for.
 *
 * `designSize` in, absolute boxes out. Everything is in design units; fitting
 * the result into a real region is a single scalar and lives in `place.ts`.
 *
 * ## Direction is not a transform
 *
 * §5.5 is emphatic that mirroring must not be a pass over finished boxes — that
 * pass is what printed a pack label backwards on every Arabic card. It is not
 * one here. Each child's offset is computed **along the logical main axis**, and
 * converted to a physical coordinate exactly once, at the moment its rect is
 * written, by `physical()` below. Nothing re-reads a box it already wrote.
 *
 * The trap §5.5 exists to prevent is mirroring by *field name* rather than by
 * *axis*. `justify` and `align` are both spelled `start`/`end`, and only the one
 * addressing the horizontal axis mirrors: `justify` on a row, `align` on a
 * column. A solver that mirrored both would flip every column frame
 * top-to-bottom in the Arabic edition, and it would look like a vertical
 * centering bug. `mirrorMain` and `mirrorCross` are derived from the mode, and
 * there is no other place direction is consulted.
 */

// ─── Output ───────────────────────────────────────────────────────────────────

export interface SolvedNode {
  id: string
  kind: 'frame' | 'leaf'
  /** The element this stands for, carried through from `LayoutLeaf.ref`. */
  ref?: string | undefined
  /** Absolute, in design units, relative to the block's origin. */
  rect: Rect
  /** The direction this node's subtree resolved to. Painters read it for text. */
  direction: Direction
  /** Flow order, always. Paint order is `paintOrder()`. */
  children: SolvedNode[]
  /** Carried through untouched. */
  paint?: Record<string, unknown> | undefined
  /**
   * The node is present and its bound value is empty: `whenEmpty: 'reserve'`
   * held its space open. The painter draws nothing and the box stays.
   *
   * A collapsed node is not in the tree at all, which is what `collapse` means.
   */
  reserved?: boolean | undefined
  /**
   * The frame asked for baseline alignment. Recorded, not acted on: a baseline
   * is a font metric and this module has no fonts. Phase 3's painter resolves
   * it. Absent on leaves and on frames that did not ask.
   */
  baselineAlign?: boolean | undefined
}

export interface IntrinsicSize {
  width: number
  height: number
}

/**
 * How big a leaf wants to be, in design units.
 *
 * Injected for the reason `TextMeasurer` is: the engine cannot measure a glyph
 * without a font and must not try. The browser passes a canvas measurement, the
 * worker passes its own, tests pass an estimator.
 *
 * `constraint.width` is supplied when the width is already decided and the
 * height still hugs — a paragraph's height depends on where it wraps. Undefined
 * means unconstrained, which is what the measure pass asks for.
 */
export type MeasureLeaf = (
  leaf: LayoutLeaf,
  constraint: { width?: number | undefined }
) => IntrinsicSize

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Min wins over max, which is CSS's rule and the only one that degrades safely:
 * a box clamped under its minimum is unreadable, and a box over its maximum is
 * merely large.
 */
function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let out = value
  if (max !== undefined) out = Math.min(out, max)
  if (min !== undefined) out = Math.max(out, min)
  return Math.max(out, 0)
}

function clampWidth(node: LayoutNode, value: number): number {
  return clamp(value, node.minWidth, node.maxWidth)
}

function clampHeight(node: LayoutNode, value: number): number {
  return clamp(value, node.minHeight, node.maxHeight)
}

/** A node the flow skips entirely: it is positioned by its own box instead. */
function isOutOfFlow(node: LayoutNode): boolean {
  return node.ignoreLayout === true
}

/**
 * Has this node's bound value gone, taking its box and the gap beside it?
 *
 * `collapse` is the default, which is why the test is for the *absence* of
 * `reserve`. §3.7.
 */
function isCollapsed(node: LayoutNode): boolean {
  return node.kind === 'leaf' && node.empty === true && node.whenEmpty !== 'reserve'
}

function resolveDirection(node: LayoutNode, inherited: Direction): Direction {
  const own = node.direction
  if (own === undefined || own === 'inherit') return inherited
  return own
}

/**
 * The picture's own ratio is a number the solver cannot know: `'fit'` and
 * `'cover'` name it, and `MeasureLeaf` is what supplies it. They are treated as
 * absent here so a document carrying one round-trips rather than being rejected.
 */
function aspectRatio(node: LayoutNode): number | null {
  return typeof node.aspect === 'number' && node.aspect > 0 ? node.aspect : null
}

/**
 * Derive the cross axis from the ratio, when exactly one axis has an
 * independent answer.
 *
 * **Not applied when both axes are fixed**: the ratio would re-derive a size
 * somebody set by hand and lose to it by a rounding error every time. Not
 * applied when neither is, either, because there is no anchor to derive from —
 * except that a row's main axis is decided first, so width wins there, which is
 * the convention rather than a law.
 */
function withAspect(
  node: LayoutNode,
  size: IntrinsicSize
): IntrinsicSize {
  const ratio = aspectRatio(node)
  if (ratio === null) return size

  const widthFixed = node.width.kind === 'fixed'
  const heightFixed = node.height.kind === 'fixed'
  if (widthFixed && heightFixed) return size

  if (widthFixed) return { width: size.width, height: clampHeight(node, size.width / ratio) }
  if (heightFixed) return { width: clampWidth(node, size.height * ratio), height: size.height }

  // Neither pinned: width leads.
  return { width: size.width, height: clampHeight(node, size.width / ratio) }
}

// ─── Pass one: measure ────────────────────────────────────────────────────────

/**
 * The size this node takes when nothing outside it has an opinion.
 *
 * An axis sized `fill` reports **zero**. That is the termination rule, and it is
 * why this pass cannot recurse forever: a fill child asks its parent, and its
 * parent must not ask back.
 */
export function measureNode(
  node: LayoutNode,
  measure: MeasureLeaf,
  ctx: ResolveContext
): IntrinsicSize {
  const direction = resolveDirection(node, ctx.direction)

  const intrinsic: IntrinsicSize =
    node.kind === 'leaf'
      ? measure(node, {})
      : measureFrame(node, measure, { direction })

  const width =
    node.width.kind === 'fixed'
      ? node.width.value
      : node.width.kind === 'fill'
        ? 0
        : intrinsic.width

  const height =
    node.height.kind === 'fixed'
      ? node.height.value
      : node.height.kind === 'fill'
        ? 0
        : intrinsic.height

  return withAspect(node, {
    width: clampWidth(node, width),
    height: clampHeight(node, height),
  })
}

/**
 * A frame's intrinsic size: its children plus its gaps plus its padding.
 *
 * A `free` frame has none. Its children are positioned by fractions *of the
 * frame*, so hugging them is circular — `validateFrame` reports
 * `hug-on-free-frame` and this returns zero rather than inventing a number.
 */
function measureFrame(
  frame: LayoutFrame,
  measure: MeasureLeaf,
  ctx: ResolveContext
): IntrinsicSize {
  if (!isFlow(frame.layout)) return { width: 0, height: 0 }

  const layout = frame.layout
  const participants = frame.children.filter((c) => !isOutOfFlow(c) && !isCollapsed(c))
  const sizes = participants.map((child) => measureNode(child, measure, ctx))

  // A collapsed child takes its gap with it, which is what makes the gaps
  // count off the survivors rather than off the authored children.
  const gaps = Math.max(participants.length - 1, 0) * layout.gap
  const { padding } = layout
  const padX = padding.start + padding.end
  const padY = padding.top + padding.bottom

  const sum = (pick: (s: IntrinsicSize) => number): number =>
    sizes.reduce((total, size) => total + pick(size), 0)
  const largest = (pick: (s: IntrinsicSize) => number): number =>
    sizes.reduce((most, size) => Math.max(most, pick(size)), 0)

  if (layout.mode === 'row') {
    return {
      width: sum((s) => s.width) + gaps + padX,
      height: largest((s) => s.height) + padY,
    }
  }

  return {
    width: largest((s) => s.width) + padX,
    height: sum((s) => s.height) + gaps + padY,
  }
}

// ─── Pass two: position ───────────────────────────────────────────────────────

/**
 * Solve a tree at its design size. The root is placed at the origin and fills
 * it; every box that comes back is absolute, in design units.
 *
 * `validateFrame` should have run first. This does not refuse an invalid tree:
 * it is a geometry function, and a solver that threw would take a page down
 * over one bad block. An invalid tree solves to something harmless — a fill with
 * nowhere to grow gets zero — and the problems are reported where a person can
 * read them.
 */
export function solve(
  root: LayoutNode,
  design: DesignSize,
  measure: MeasureLeaf,
  ctx: ResolveContext
): SolvedNode {
  const rect: Rect = { x: 0, y: 0, width: design.width, height: design.height }
  return positionNode(root, rect, measure, ctx)
}

function positionNode(
  node: LayoutNode,
  rect: Rect,
  measure: MeasureLeaf,
  ctx: ResolveContext
): SolvedNode {
  const direction = resolveDirection(node, ctx.direction)

  const solved: SolvedNode = {
    id: node.id,
    kind: node.kind,
    rect,
    direction,
    children: [],
    ...(node.kind === 'leaf' && node.ref !== undefined ? { ref: node.ref } : {}),
    ...(node.kind === 'frame' && node.paint !== undefined ? { paint: node.paint } : {}),
    ...(node.kind === 'leaf' && node.empty === true ? { reserved: true } : {}),
  }

  if (node.kind !== 'frame') return solved

  if (isFlow(node.layout) && node.layout.baselineAlign === true) {
    solved.baselineAlign = true
  }

  const childCtx: ResolveContext = { direction }

  if (!isFlow(node.layout)) {
    solved.children = node.children.map((child) =>
      positionNode(child, boxRect(child, rect, direction), measure, childCtx)
    )
    return solved
  }

  solved.children = positionFlow(node, node.layout, rect, measure, childCtx)
  return solved
}

/**
 * A fractional box against a containing rect, mirrored on the inline axis.
 *
 * `box.start` is the reading-order start, exactly as `colStart` is in
 * `geometry.ts` — and this is the same conversion that file performs, for the
 * same reason. `top` is never mirrored; rows have no reading order.
 */
function boxRect(node: LayoutNode, parent: Rect, direction: Direction): Rect {
  const box = node.box ?? { start: 0, top: 0, width: 1, height: 1 }
  const width = box.width * parent.width
  const height = box.height * parent.height
  const start = box.start * parent.width

  const x =
    direction === 'ltr'
      ? parent.x + start
      : parent.x + parent.width - start - width

  return { x, y: parent.y + box.top * parent.height, width, height }
}

/** The main-axis size a participant takes before free space is divided. */
function baseMain(
  node: LayoutNode,
  intrinsic: IntrinsicSize,
  mode: 'row' | 'column'
): number {
  const sizing: Sizing = mode === 'row' ? node.width : node.height
  if (sizing.kind === 'fill') return 0
  return mode === 'row' ? intrinsic.width : intrinsic.height
}

function positionFlow(
  frame: LayoutFrame,
  layout: FlowLayout,
  rect: Rect,
  measure: MeasureLeaf,
  ctx: ResolveContext
): SolvedNode[] {
  const { direction } = ctx
  const horizontal = layout.mode === 'row'

  /**
   * Only the property addressing the horizontal axis mirrors. This pair is the
   * whole of §5.5's trap, and it is derived from the mode rather than from the
   * field's name on purpose.
   */
  const mirrorMain = horizontal && direction === 'rtl'
  const mirrorCross = !horizontal && direction === 'rtl'

  // Padding's inline edges are logical, so they swap with the direction.
  const { padding } = layout
  const padLeft = direction === 'ltr' ? padding.start : padding.end
  const padRight = direction === 'ltr' ? padding.end : padding.start

  const content: Rect = {
    x: rect.x + padLeft,
    y: rect.y + padding.top,
    width: Math.max(rect.width - padLeft - padRight, 0),
    height: Math.max(rect.height - padding.top - padding.bottom, 0),
  }

  const contentMain = horizontal ? content.width : content.height
  const contentCross = horizontal ? content.height : content.width

  /*
   * **The authored order is preserved, and that is not cosmetic.** Paint order
   * derives from flow order, so a solver that emitted every out-of-flow child
   * first would paint an overhanging chip *underneath* the card it overhangs —
   * which is exactly what happened to the burst card's star in Phase 4, and
   * what no unit test caught. `slot` holds each child's place in the authored
   * array while the flow maths runs over the participants alone.
   */
  const slot: (SolvedNode | null)[] = frame.children.map(() => null)
  const participants: LayoutNode[] = []
  const participantSlot: number[] = []

  // Out-of-flow and collapsed children are separated first, because both the
  // gap count and the free space depend on who is actually in the flow.
  frame.children.forEach((child, index) => {
    if (isCollapsed(child)) return
    if (isOutOfFlow(child)) {
      slot[index] = positionNode(child, boxRect(child, rect, direction), measure, ctx)
      return
    }
    participants.push(child)
    participantSlot.push(index)
  })

  const intrinsics = participants.map((child) => measureNode(child, measure, ctx))

  /*
   * **The horizontal axis is resolved first, whichever axis that is.** Text
   * height depends on text width and never the reverse, so the axis that
   * carries the width has to be settled before anything asks how tall the
   * content is.
   *
   * In a **row** the width is the main axis and it is already first; the
   * re-measure happens further down, once `main` is known. In a **column** the
   * width is the *cross* axis, so it is resolved here — before `mains` — and
   * the hugging height is re-measured against it.
   *
   * Without this a column of text never wraps: a name sized `fill` takes the
   * column's width and then reports the height of a single unwrapped line, so
   * it draws straight through whatever sits beside it. Phase 4's shelf ticket
   * is where that showed.
   */
  if (!horizontal) {
    participants.forEach((child, index) => {
      if (child.kind !== 'leaf' || child.height.kind !== 'hug') return
      const intrinsic = intrinsics[index] as IntrinsicSize
      const width = crossSize(child, intrinsic, layout, contentCross)
      if (Math.abs(width - intrinsic.width) <= 0.0001) return
      intrinsics[index] = {
        width,
        height: clampHeight(child, measure(child, { width }).height),
      }
    })
  }

  const mains = participants.map((child, index) =>
    baseMain(child, intrinsics[index] as IntrinsicSize, layout.mode)
  )

  const gapTotal = Math.max(participants.length - 1, 0) * layout.gap
  const used = mains.reduce((total, size) => total + size, 0)
  const free = Math.max(contentMain - used - gapTotal, 0)

  const weights = participants.map((child) =>
    fillWeight(layout.mode === 'row' ? child.width : child.height)
  )
  const weightTotal = weights.reduce((total, weight) => total + weight, 0)

  if (weightTotal > 0) {
    participants.forEach((child, index) => {
      const weight = weights[index] ?? 0
      if (weight === 0) return
      const share = (free * weight) / weightTotal
      mains[index] =
        layout.mode === 'row' ? clampWidth(child, share) : clampHeight(child, share)
    })
  }

  // What justify has left to distribute. Zero whenever anything filled, which
  // is why `between` on a hugging axis is refused rather than silently becoming
  // `start`: there the number is zero for a different reason.
  const placed = mains.reduce((total, size) => total + size, 0)
  const leftover = contentMain - placed - gapTotal

  let cursor = startOffset(layout.justify, leftover, participants.length)
  const spread = extraGap(layout.justify, leftover, participants.length)

  participants.forEach((child, index) => {
    const main = mains[index] ?? 0
    const intrinsic = intrinsics[index] as IntrinsicSize

    let cross = crossSize(child, intrinsic, layout, contentCross)

    /*
     * A text whose width was decided by the flow wraps against *that* width, not
     * against the unconstrained one the measure pass asked for. Re-measured only
     * when it can change the answer: the cross axis hugs and the main axis is
     * horizontal, which is the paragraph case and nothing else.
     */
    if (
      child.kind === 'leaf' &&
      horizontal &&
      child.height.kind === 'hug' &&
      Math.abs(main - intrinsic.width) > 0.0001
    ) {
      cross = clampHeight(child, measure(child, { width: main }).height)
    }

    const crossOffset = alignOffset(layout.align, contentCross, cross)

    const rectOut: Rect = horizontal
      ? {
          x: physical(cursor, main, content.x, content.width, mirrorMain),
          y: content.y + crossOffset,
          width: main,
          height: cross,
        }
      : {
          x: physical(crossOffset, cross, content.x, content.width, mirrorCross),
          y: content.y + cursor,
          width: cross,
          height: main,
        }

    slot[participantSlot[index] as number] = positionNode(child, rectOut, measure, ctx)
    cursor += main + layout.gap + spread
  })

  // Collapsed children left their slot null and are simply not in the tree,
  // which is what `collapse` means.
  return slot.filter((node): node is SolvedNode => node !== null)
}

/**
 * Logical offset to physical coordinate, and the only place direction touches a
 * number.
 *
 * This is the conversion §5.5 asks for and not the transform it forbids. The
 * difference is that it runs once, as each rect is written, from an offset that
 * was never physical — rather than as a second traversal over boxes that are
 * already correct in one direction and get flipped into the other. That
 * traversal is what reversed a pack label.
 */
function physical(
  offset: number,
  size: number,
  contentStart: number,
  contentSize: number,
  mirror: boolean
): number {
  return mirror
    ? contentStart + contentSize - offset - size
    : contentStart + offset
}

function startOffset(justify: Justify, leftover: number, count: number): number {
  if (leftover <= 0) return 0
  switch (justify) {
    case 'start':
      return 0
    case 'center':
      return leftover / 2
    case 'end':
      return leftover
    case 'between':
      // With one child there is nothing to space, so it sits at the start —
      // which is what every flex implementation does and what reads correctly.
      return 0
    default:
      return 0
  }
}

function extraGap(justify: Justify, leftover: number, count: number): number {
  if (justify !== 'between' || count < 2 || leftover <= 0) return 0
  return leftover / (count - 1)
}

function crossSize(
  node: LayoutNode,
  intrinsic: IntrinsicSize,
  layout: FlowLayout,
  contentCross: number
): number {
  const horizontal = layout.mode === 'row'
  const sizing: Sizing = horizontal ? node.height : node.width
  const clampIt = horizontal ? clampHeight : clampWidth

  /*
   * **A cross size set by hand wins over `stretch`.** Flexbox stretches only
   * items whose cross size is `auto`, and Figma behaves the same way. Growing an
   * explicit height because the parent happens to align one way would make the
   * field a suggestion rather than an instruction, and the author has no way to
   * say "no, I meant it".
   */
  if (sizing.kind === 'fixed') return clampIt(node, sizing.value)
  // `fill` on the cross axis takes all of it; so does `stretch`, which is the
  // frame asking for the same thing on a hugging child's behalf.
  if (sizing.kind === 'fill' || layout.align === 'stretch') return clampIt(node, contentCross)
  return clampIt(node, horizontal ? intrinsic.height : intrinsic.width)
}

function alignOffset(align: Align, contentCross: number, size: number): number {
  switch (align) {
    case 'start':
    case 'stretch':
      return 0
    case 'center':
      return Math.max(contentCross - size, 0) / 2
    case 'end':
      return Math.max(contentCross - size, 0)
    default:
      return 0
  }
}

// ─── Reading the result ───────────────────────────────────────────────────────

/**
 * Back to front, which is the order a painter draws in.
 *
 * **Flow order is not paint order**, and `firstOnTop` is a separate field for
 * exactly this reason. The default paints the last child on top, which is what
 * a reader expects from a list; a frame that wants the first child in front
 * says so, and this is the one place that is resolved.
 */
export function paintOrder(
  frame: { children: SolvedNode[] },
  firstOnTop = false
): SolvedNode[] {
  return firstOnTop ? [...frame.children].reverse() : frame.children
}

/**
 * Depth-first, flow order. The flat list a painter or a hit test walks.
 *
 * `flattenSolved` rather than `flatten`, which `color.ts` has owned since
 * before this existed and which flattens a colour against a backdrop.
 */
export function flattenSolved(node: SolvedNode): SolvedNode[] {
  return [node, ...node.children.flatMap(flattenSolved)]
}

/** The solved box for one id, or null. */
export function findSolved(node: SolvedNode, id: string): SolvedNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findSolved(child, id)
    if (found !== null) return found
  }
  return null
}

/**
 * The tightest rect containing everything drawn, including anything that
 * overhangs the root. A caller fitting a block into a region wants this rather
 * than the design size whenever `ignoreLayout` has put something outside it.
 */
export function solvedBounds(node: SolvedNode): Rect {
  const all = flattenSolved(node)
  const minX = Math.min(...all.map((n) => n.rect.x))
  const minY = Math.min(...all.map((n) => n.rect.y))
  const maxX = Math.max(...all.map((n) => n.rect.x + n.rect.width))
  const maxY = Math.max(...all.map((n) => n.rect.y + n.rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
