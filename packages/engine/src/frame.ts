import { z } from 'zod'
import type { Box } from '@souqstudio/types'
import type { Direction } from './geometry'

/**
 * Frames, sizing and the layout vocabulary. E14 Phase 2.1 —
 * `docs/E14-layout-frames.md` §2.
 *
 * **A frame is a group that lays its children out.** It replaces `groupId`, and
 * it draws: the star with text inside it is a frame with `shape: 'star'` and a
 * hugging size, not a shape with a sibling somebody keeps re-centring by hand.
 *
 * **Sizing is per axis, three values** — `fixed`, `hug`, `fill`. Figma's model,
 * chosen because three composable values cover the cases rather than a list of
 * behaviours that grows every time somebody meets a new one.
 *
 * ## Why this is a tree of its own and not `BlockElement`
 *
 * §2 of the design writes `Frame` as a member of `BlockElement` with
 * `children: BlockElement[]`, and that is where it ends up. It is **not** added
 * to that union here, and the reason is sequencing rather than disagreement:
 * 72 call sites across the engine, the harness, the painter and the designer
 * switch on `element.kind`, and adding a member turns every one of them into a
 * compile error. Phase 2's exit is "the solver has tests for every rule in §5,
 * nothing renders yet" — so the union is joined in Phase 5, by the converter,
 * when there is something to convert *into* and painters that can draw it.
 *
 * What that costs is one indirection: a `LayoutLeaf` stands for the element the
 * solver is positioning, carrying only what layout reads. What it buys is that
 * this phase is finishable and testable on its own, which is the whole point of
 * splitting it out. `LayoutLeaf.ref` is where the element's id goes, so the
 * converter's mapping is a lookup rather than a rewrite.
 *
 * ## Units
 *
 * **Every spatial value in a frame is in design units** — `gap`, `padding`,
 * `radius`, `min`/`max` — and never a fraction of the frame. A fraction is
 * circular: in a hugging row the frame's width *is* children plus gaps, so a gap
 * expressed as a fraction of that width has no fixed point. §2.2.
 *
 * `box` stays fractional. It is read only for the root and inside `free`
 * frames, where the containing size is known before anything is measured.
 */

// ─── Sizing ───────────────────────────────────────────────────────────────────

/**
 * How one axis of one node gets its size.
 *
 * `fill`'s `weight` divides the parent's free space, flex-grow style. Default 1.
 */
export type Sizing =
  | { kind: 'fixed'; value: number }
  | { kind: 'hug' }
  | { kind: 'fill'; weight?: number | undefined }

/** Convenience constructors. Tests and the converter build a lot of these. */
export const fixed = (value: number): Sizing => ({ kind: 'fixed', value })
export const hug = (): Sizing => ({ kind: 'hug' })
export const fill = (weight?: number): Sizing =>
  weight === undefined ? { kind: 'fill' } : { kind: 'fill', weight }

/** `fill` with no weight is weight 1. Nothing else may read `.weight` directly. */
export function fillWeight(sizing: Sizing): number {
  if (sizing.kind !== 'fill') return 0
  return sizing.weight ?? 1
}

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Design units, on the four physical edges of the frame's own box. */
export interface Padding {
  start: number
  end: number
  top: number
  bottom: number
}

export const NO_PADDING: Padding = { start: 0, end: 0, top: 0, bottom: 0 }

/**
 * Along the direction of flow.
 *
 * **Mirrors only when the flow axis is horizontal** — see `solve.ts` and §5.5.
 * `between` is meaningless under `hug`, where there is no free space to
 * distribute, and `validateFrame` refuses that pairing rather than silently
 * behaving like `start`.
 */
export type Justify = 'start' | 'center' | 'end' | 'between'

/** Across the direction of flow. */
export type Align = 'start' | 'center' | 'end' | 'stretch'

export type Layout =
  /** Children keep their own fractional boxes. Exactly today's group. */
  | { mode: 'free' }
  | {
      mode: 'row' | 'column'
      /** Design units. */
      gap: number
      padding: Padding
      justify: Justify
      align: Align
      /**
       * Row only. Align text children on their baselines rather than their
       * boxes. A frame-level toggle rather than a value of `align`, because it
       * is a different question: `align` says where the box sits, this says
       * what counts as the box's reference line.
       *
       * The solver records the request and does not act on it: a baseline is a
       * font metric, and the measurer is what knows it. `SolvedNode.baseline`
       * is where that lands in Phase 3.
       */
      baselineAlign?: boolean | undefined
      /**
       * Flow order is not paint order. `false` (the default) paints last on
       * top, which is what a reader expects from a list.
       */
      firstOnTop?: boolean | undefined
    }

export type FlowLayout = Extract<Layout, { mode: 'row' | 'column' }>

export function isFlow(layout: Layout): layout is FlowLayout {
  return layout.mode !== 'free'
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

/**
 * What the solver reads off any node, frame or leaf.
 *
 * This is deliberately a subset of `ElementBase` plus the new fields. Rotation,
 * opacity and `locked` are paint and editing concerns and the solver must not
 * see them: a rotated element still occupies its unrotated box for layout, and
 * an element that participated in flow differently because it was locked would
 * be a trap.
 */
export interface LayoutNodeBase {
  id: string
  /**
   * Fractional, against the containing frame. Read **only** when the parent's
   * layout is `free`, when `ignoreLayout` is set, or for the root. A node in a
   * row or column is positioned by the solver and this is ignored.
   */
  box?: Box | undefined
  width: Sizing
  height: Sizing
  /** Design units. Composable with any `Sizing`, including `hug` and `fill`. */
  minWidth?: number | undefined
  maxWidth?: number | undefined
  minHeight?: number | undefined
  maxHeight?: number | undefined
  /**
   * Images only for now, and **applied only when exactly one axis is
   * flexible**. On a fully fixed node the ratio re-derives the cross axis and
   * fights the solved size over rounding; with both axes flexible there is no
   * anchor to derive from. A number is width ÷ height.
   *
   * `'fit'` and `'cover'` name the picture's own ratio, which the solver cannot
   * know — `MeasureLeaf` supplies it as a number. They are carried here so the
   * document round-trips, and `solve` treats them as absent.
   */
  aspect?: 'fit' | 'cover' | number | undefined
  /**
   * `'inherit'` is the default and is right almost everywhere. Pin `'ltr'` on
   * the subtree that must not flip: a currency/price pair, a Latin wordmark, a
   * barcode, a `1L × 6` pack spec. §5.5.
   */
  direction?: 'inherit' | 'ltr' | 'rtl' | undefined
  /**
   * Excluded from the auto flow and from the parent's hug measurement,
   * positioned by `box` against the parent exactly as a child of a `free` frame.
   * This is §2.3's escape hatch, and overhang is what needs it.
   */
  ignoreLayout?: boolean | undefined
  /**
   * What happens when this node's bound value is empty. §3.7.
   *
   * `collapse` is the default because it is right more often: a card with no
   * was-price should not print a hole where one would have been, and the gap
   * beside it goes too.
   *
   * `reserve` is what a repeating offer card sets on its was-price. It keeps the
   * node's measured size so that every card in a row sets its price at the same
   * height whether or not it has one. It handles **presence**, not magnitude —
   * one name wrapping to two lines while its neighbour fits on one is §5.3.
   */
  whenEmpty?: 'collapse' | 'reserve' | undefined
}

/**
 * A frame. Lays its children out, and draws.
 *
 * The paint fields are carried but never read by the solver, with one
 * exception: nothing here affects measurement, **including `stroke`**. A stroke
 * is drawn outside the box and excluded from measurement — a choice rather than
 * a law, made because it matches how a designer thinks about a border and
 * because the alternative compounds through nested frames in a way that is
 * visible in print. §2.3.
 */
export interface LayoutFrame extends LayoutNodeBase {
  kind: 'frame'
  layout: Layout
  children: LayoutNode[]
  /**
   * Paint, carried through the solver untouched. Typed loosely on purpose: the
   * real `shape`, `fill`, `stroke` and `shadow` vocabularies live in
   * `@souqstudio/types` and binding to them here would drag the whole paint
   * schema into a module about geometry. Phase 5 narrows this when the frame
   * joins `BlockElement`.
   */
  paint?: Record<string, unknown> | undefined
}

/**
 * Anything that is not a frame: a text, an image, a shape.
 *
 * The solver never interprets a leaf. It asks `MeasureLeaf` how big it wants to
 * be and positions the answer.
 */
export interface LayoutLeaf extends LayoutNodeBase {
  kind: 'leaf'
  /**
   * The id of the `BlockElement` this stands for. The solver does not read it;
   * it is what lets the converter and the painter join a solved box back to the
   * thing being drawn.
   */
  ref?: string | undefined
  /**
   * Is this leaf's bound value empty? Drives `whenEmpty`.
   *
   * On the node rather than discovered by the measurer, because emptiness is a
   * fact about the *data* and the measurer is a fact about the *font*. A
   * measurer that returned zero for an empty string would collapse a `reserve`
   * node, which is exactly the rule `reserve` exists to prevent.
   */
  empty?: boolean | undefined
}

export type LayoutNode = LayoutFrame | LayoutLeaf

/**
 * The size a block is authored at, in design units. §5.1.
 *
 * **A block with frames in it is no longer scale-free**, and pretending
 * otherwise produces the worst available outcome: the same card in a smaller
 * slot keeps its absolute text size, the fit ladder fires per instance, and
 * every card on the page lands at a different scale. So the layout solves once,
 * in absolute units, at this size, and placement is a single scalar. §5.2.
 */
export interface DesignSize {
  width: number
  height: number
}

/**
 * Direction is a render context plus a per-frame override, never a mode of
 * `Layout`. A block is authored once and rendered in both editions, so it
 * cannot be stored on the block.
 */
export interface ResolveContext {
  direction: Direction
}

/** How deep frames may nest. §8, resolved: capped at three. */
export const MAX_FRAME_DEPTH = 3

// ─── Schema ───────────────────────────────────────────────────────────────────

const unit = z.number().finite()
/** A design-unit length. Never negative, and bounded so a typo is caught here. */
const length = unit.min(0).max(100_000)

const sizingSchema: z.ZodType<Sizing> = z.union([
  z.object({ kind: z.literal('fixed'), value: length }),
  z.object({ kind: z.literal('hug') }),
  z.object({ kind: z.literal('fill'), weight: unit.min(0).optional() }),
])

const paddingSchema: z.ZodType<Padding> = z.object({
  start: length,
  end: length,
  top: length,
  bottom: length,
})

const layoutSchema: z.ZodType<Layout> = z.union([
  z.object({ mode: z.literal('free') }),
  z.object({
    mode: z.union([z.literal('row'), z.literal('column')]),
    gap: length,
    padding: paddingSchema,
    justify: z.union([
      z.literal('start'),
      z.literal('center'),
      z.literal('end'),
      z.literal('between'),
    ]),
    align: z.union([
      z.literal('start'),
      z.literal('center'),
      z.literal('end'),
      z.literal('stretch'),
    ]),
    baselineAlign: z.boolean().optional(),
    firstOnTop: z.boolean().optional(),
  }),
])

/**
 * Same bounds as `boxSchema` in `document.ts`, and for the same reason: a box is
 * bounded well outside 0–1 rather than clamped to it, because a chip anchored
 * `TOP_START` overhangs its block by design.
 */
const boxSchema: z.ZodType<Box> = z.object({
  start: unit.min(-1).max(2),
  top: unit.min(-1).max(2),
  width: unit.min(0).max(2),
  height: unit.min(0).max(2),
})

const nodeBaseShape = {
  id: z.string().min(1),
  box: boxSchema.optional(),
  width: sizingSchema,
  height: sizingSchema,
  minWidth: length.optional(),
  maxWidth: length.optional(),
  minHeight: length.optional(),
  maxHeight: length.optional(),
  aspect: z.union([z.literal('fit'), z.literal('cover'), unit.positive()]).optional(),
  direction: z
    .union([z.literal('inherit'), z.literal('ltr'), z.literal('rtl')])
    .optional(),
  ignoreLayout: z.boolean().optional(),
  whenEmpty: z.union([z.literal('collapse'), z.literal('reserve')]).optional(),
}

const leafSchema: z.ZodType<LayoutLeaf> = z.object({
  ...nodeBaseShape,
  kind: z.literal('leaf'),
  ref: z.string().min(1).optional(),
  empty: z.boolean().optional(),
})

/**
 * Recursive, so the frame schema is declared lazily. `z.lazy` is the only way
 * to express a self-referencing schema, and the explicit `ZodType` annotation
 * is what stops the inferred type becoming `any` at the cycle.
 */
export const frameSchema: z.ZodType<LayoutFrame> = z.lazy(() =>
  z.object({
    ...nodeBaseShape,
    kind: z.literal('frame'),
    layout: layoutSchema,
    children: z.array(nodeSchema).max(200),
    paint: z.record(z.unknown()).optional(),
  })
)

export const nodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([frameSchema, leafSchema])
)

export const designSizeSchema: z.ZodType<DesignSize> = z.object({
  width: length.positive(),
  height: length.positive(),
})

/**
 * The mirror check, the same instrument `document.ts` uses.
 *
 * Asserting the inferred type against the declared one in both directions turns
 * "keep these in sync" from a comment into a build error. A one-way check would
 * let the schema quietly accept less than the type allows.
 */
type Extends<A, B> = A extends B ? true : false
const _schemaMatchesType: Extends<z.infer<typeof nodeSchema>, LayoutNode> = true
const _typeMatchesSchema: Extends<LayoutNode, z.infer<typeof nodeSchema>> = true
void _schemaMatchesType
void _typeMatchesSchema

// ─── Validity ─────────────────────────────────────────────────────────────────

/**
 * A problem with a frame tree, in the same shape `validateBlock` reports.
 *
 * These are the states the designer UI must not be able to produce, written
 * down before that UI exists — which is the order Figma's own rules were
 * discovered in, and the cheap direction.
 */
export interface FrameProblem {
  /** Stable, machine-readable. The designer branches on it. */
  code:
    | 'hug-on-leaf-without-intrinsic'
    | 'hug-on-free-frame'
    | 'fill-outside-flow'
    | 'between-on-hug'
    | 'nesting-too-deep'
    | 'duplicate-id'
    | 'missing-box'
  nodeId: string
  message: string
}

/**
 * The validity rules, copied from Figma because they remove a class of nonsense
 * states from the designer before it is built. §2.
 *
 * - **`hug` is valid only on frames and text elements.** A leaf that cannot
 *   report an intrinsic size has nothing to hug, and `canHug` is how the caller
 *   says which leaves those are — the solver has no idea what a leaf contains.
 * - **`fill` is valid only on a child of a `row` or `column` frame.** There is
 *   no free space to divide anywhere else.
 * - **`hug` is refused on a `free` frame.** The design says hug is valid on
 *   frames; a `free` frame is the case that cannot work, because its children
 *   are positioned by fractions *of the frame*, so hugging them is circular.
 *   This is not in §2 and is added here rather than discovered by a solver that
 *   returns zero.
 * - **`between` is refused on a hugging axis.** §8 left this open between
 *   rejecting it and cutting the value. Rejecting keeps it available on the wide
 *   band that wanted it, and a silent fallback to `start` is the outcome neither
 *   option wanted.
 * - **Nesting is capped at three.** §8, resolved.
 */
export function validateFrame(
  root: LayoutNode,
  options: { canHug?: (leaf: LayoutLeaf) => boolean } = {}
): FrameProblem[] {
  const canHug = options.canHug ?? (() => true)
  const problems: FrameProblem[] = []
  const seen = new Set<string>()

  const walk = (node: LayoutNode, parent: LayoutFrame | null, depth: number): void => {
    if (seen.has(node.id)) {
      problems.push({
        code: 'duplicate-id',
        nodeId: node.id,
        message: `Two nodes share the id "${node.id}". Ids address a solved box, so they must be unique.`,
      })
    }
    seen.add(node.id)

    const inFlow = parent !== null && isFlow(parent.layout) && node.ignoreLayout !== true

    for (const axis of ['width', 'height'] as const) {
      const sizing = node[axis]

      if (sizing.kind === 'fill' && !inFlow) {
        const why =
          parent === null
            ? 'is the root, so there is no parent to divide space from'
            : node.ignoreLayout === true
              ? 'is out of the flow'
              : 'sits in a free frame'
        problems.push({
          code: 'fill-outside-flow',
          nodeId: node.id,
          message: `"${node.id}" ${why}, so its ${axis} cannot fill. Give it a fixed size or a box.`,
        })
      }

      if (sizing.kind === 'hug') {
        if (node.kind === 'frame' && !isFlow(node.layout)) {
          problems.push({
            code: 'hug-on-free-frame',
            nodeId: node.id,
            message: `"${node.id}" lays its children out freely, so hugging them is circular: their boxes are fractions of the size being measured.`,
          })
        }
        if (node.kind === 'leaf' && !canHug(node)) {
          problems.push({
            code: 'hug-on-leaf-without-intrinsic',
            nodeId: node.id,
            message: `"${node.id}" has no intrinsic size to hug. Only text and frames can hug.`,
          })
        }
      }
    }

    /*
     * A node positioned by its box needs one. **The root is exempt**: `solve`
     * hands it the design rect directly and never reads its box, so requiring
     * one would report a problem about a field nothing consults.
     */
    if (node.box === undefined && parent !== null && !inFlow) {
      problems.push({
        code: 'missing-box',
        nodeId: node.id,
        message: `"${node.id}" ${node.ignoreLayout === true ? 'is out of the flow' : 'sits in a free frame'}, so it is positioned by its box, and it has none.`,
      })
    }

    if (node.kind !== 'frame') return

    if (isFlow(node.layout) && node.layout.justify === 'between') {
      // `between` distributes free space, and a hugging axis has none by
      // construction: the frame is exactly its children plus its gaps.
      const mainAxis = node.layout.mode === 'row' ? node.width : node.height
      if (mainAxis.kind === 'hug') {
        problems.push({
          code: 'between-on-hug',
          nodeId: node.id,
          message: `"${node.id}" hugs on its flow axis, so there is no free space for "between" to distribute.`,
        })
      }
    }

    if (depth + 1 > MAX_FRAME_DEPTH && node.children.some((c) => c.kind === 'frame')) {
      problems.push({
        code: 'nesting-too-deep',
        nodeId: node.id,
        message: `Frames nest ${MAX_FRAME_DEPTH} deep at most. "${node.id}" is at ${depth + 1}.`,
      })
    }

    for (const child of node.children) walk(child, node, depth + 1)
  }

  walk(root, null, 1)
  return problems
}
