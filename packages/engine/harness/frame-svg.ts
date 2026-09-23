/**
 * A solved frame tree, drawn. E14 Phase 4.
 *
 * **Phase 4's exit is "all five render, and somebody looks at them"**, and
 * nothing could render a frame tree: `LayoutFrame` is deliberately not a member
 * of `BlockElement` until Phase 5's converter, so neither `draw.tsx` nor
 * `harness/svg.ts` can see one. This is the smallest thing that makes the gate
 * checkable.
 *
 * **It is not a second painter.** It draws a `SolvedNode` tree — boxes the
 * solver has already decided — and makes no layout decision of its own: no fit
 * ladder, no compaction, no price-mark anatomy, no mirroring. Every one of those
 * either already happened in `solve()` or is Phase 5's to port. The rule that a
 * second painter is how the PDF stops matching the screen is about a second
 * implementation of *layout*, and there is none here.
 *
 * The join from a solved box back to the thing being drawn is `LayoutLeaf.ref`,
 * which is exactly what that field was added for. A sidecar map is what the
 * converter will replace with the element itself.
 */

import type { LogicalAlign, TokenRef } from '@souqstudio/types'
import {
  PATH_SHAPES,
  type PathShape,
  needsEvenOdd,
  paintOrder,
  placeText,
  shapePath,
  type Rect,
  type SolvedNode,
} from '../src/index'
import { KIT } from './dummy'

/** What a leaf is, which the solver neither knows nor needs to. */
export type LeafPaint =
  | {
      kind: 'text'
      content: string
      /** Design units. The solver has already measured against this. */
      size: number
      weight?: number
      color?: TokenRef
      align?: LogicalAlign
      family?: 'display' | 'headline' | 'body'
      transform?: 'uppercase'
    }
  | { kind: 'image'; label: string; radius?: number }
  | {
      kind: 'shape'
      variant: 'rect' | 'ellipse' | PathShape
      fill?: TokenRef
      stroke?: { color: TokenRef; width: number }
      radius?: number
    }

/** What a frame draws behind its children. `LayoutFrame.paint`, read back. */
export interface FramePaint {
  shape?: 'rect' | PathShape
  fill?: TokenRef
  stroke?: { color: TokenRef; width: number }
  radius?: number
}

export interface FrameRenderContext {
  /** Keyed by `LayoutLeaf.ref`. */
  paint: Record<string, LeafPaint>
  direction: 'ltr' | 'rtl'
}

const LATIN = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const HEADLINE = "'Lalezar', 'Helvetica Neue', Helvetica, Arial, sans-serif"

/**
 * The same estimator `harness/svg.ts` uses, and it is wrong by 5–40% at the
 * median — Phase 0.1 measured that over 1.1M strings. It is the right thing
 * here anyway: the gate asks whether the *model* survives real design, and a
 * shared estimator means a block that looks balanced in this harness is
 * balanced against the same numbers `solve()` was given. The real measurer is
 * HarfBuzz, server-side, and it is E14's critical path rather than this file's.
 */
export const estimateWidth = (content: string, fontSize: number): number =>
  content.length * fontSize * 0.52

/** The multiple of the font size one line occupies. */
export const LINE_HEIGHT = 1.25

/**
 * Greedy word wrap, and **the measurer and the renderer must both call it**.
 *
 * Phase 4 found out why by not doing it: the measurer wrapped by dividing a
 * natural width by the available one, the renderer drew a single `<text>`, and
 * the gallery showed a product name running straight through the price while
 * the solver believed it occupied two lines. A harness whose picture disagrees
 * with the geometry behind it is worse than no harness, because the picture is
 * what somebody reviews.
 *
 * A single word longer than the line is not broken. It overflows, which is
 * visible, rather than being silently cut.
 */
export function wrapText(content: string, size: number, maxWidth?: number): string[] {
  if (maxWidth === undefined || maxWidth <= 0) return [content]

  const lines: string[] = []
  let line = ''

  for (const word of content.split(/\s+/)) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (line === '' || estimateWidth(candidate, size) <= maxWidth) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  return lines.length === 0 ? [content] : lines
}

export function renderSolved(
  root: SolvedNode,
  size: { width: number; height: number },
  ctx: FrameRenderContext
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"` +
    ` viewBox="0 0 ${size.width} ${size.height}">` +
    `<rect width="${size.width}" height="${size.height}" fill="${KIT.surface}"/>` +
    renderNode(root, ctx) +
    `</svg>`
  )
}

function renderNode(node: SolvedNode, ctx: FrameRenderContext): string {
  const own = node.kind === 'frame' ? frameBody(node) : leafBody(node, ctx)

  /*
   * A frame draws, then its children draw on top of it. `paintOrder` is the one
   * place `firstOnTop` is resolved — flow order is not paint order, which is why
   * it is a separate field rather than a reversed children array.
   */
  const firstOnTop = readPaint(node)?.['firstOnTop'] === true
  const children = paintOrder(node, firstOnTop)
    .map((child) => renderNode(child, ctx))
    .join('')

  return own + children
}

function readPaint(node: SolvedNode): Record<string, unknown> | undefined {
  return node.paint
}

function frameBody(node: SolvedNode): string {
  const paint = readPaint(node) as FramePaint | undefined
  if (paint === undefined) return ''
  if (paint.fill === undefined && paint.stroke === undefined) return ''

  const fill = paint.fill === undefined ? 'none' : KIT[paint.fill]
  const strokeAttrs =
    paint.stroke === undefined
      ? ''
      : ` stroke="${KIT[paint.stroke.color]}" stroke-width="${paint.stroke.width}"`

  const variant = paint.shape ?? 'rect'
  if (variant !== 'rect' && (PATH_SHAPES as readonly string[]).includes(variant)) {
    const rule = needsEvenOdd(variant as PathShape) ? ' fill-rule="evenodd"' : ''
    // The same path function `draw.tsx` calls. A star drawn two ways is how the
    // harness stops being worth looking at.
    const d = shapePath(variant as PathShape, node.rect, 'ltr', {})
    return `<path d="${d}" fill="${fill}"${rule}${strokeAttrs}/>`
  }

  return rect(node.rect, fill, paint.radius ?? 0, strokeAttrs)
}

function leafBody(node: SolvedNode, ctx: FrameRenderContext): string {
  const ref = node.ref
  const paint = ref === undefined ? undefined : ctx.paint[ref]
  if (paint === undefined) return debugBox(node.rect)

  switch (paint.kind) {
    case 'shape':
      return shapeLeaf(paint, node.rect)
    case 'image':
      return imageLeaf(paint, node.rect)
    case 'text':
      return textLeaf(paint, node, ctx)
    default:
      return ''
  }
}

function shapeLeaf(paint: Extract<LeafPaint, { kind: 'shape' }>, box: Rect): string {
  const fill = paint.fill === undefined ? 'none' : KIT[paint.fill]
  const strokeAttrs =
    paint.stroke === undefined
      ? ''
      : ` stroke="${KIT[paint.stroke.color]}" stroke-width="${paint.stroke.width}"`

  if (paint.variant === 'ellipse') {
    return (
      `<ellipse cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}"` +
      ` rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}"${strokeAttrs}/>`
    )
  }

  if (paint.variant !== 'rect' && (PATH_SHAPES as readonly string[]).includes(paint.variant)) {
    const shape = paint.variant as PathShape
    const rule = needsEvenOdd(shape) ? ' fill-rule="evenodd"' : ''
    return `<path d="${shapePath(shape, box, 'ltr', {})}" fill="${fill}"${rule}${strokeAttrs}/>`
  }

  return rect(box, fill, paint.radius ?? 0, strokeAttrs)
}

function imageLeaf(paint: Extract<LeafPaint, { kind: 'image' }>, box: Rect): string {
  // A placeholder, exactly as `harness/svg.ts` draws one: the gate is about
  // layout, and a real packshot would only make a wrong box look plausible.
  return (
    rect(box, '#EDEDED', paint.radius ?? 0, '') +
    `<text x="${box.x + box.width / 2}" y="${box.y + box.height / 2}"` +
    ` font-family="${LATIN}" font-size="${Math.min(11, box.height / 3)}" fill="${KIT.inkMuted}"` +
    ` text-anchor="middle" dominant-baseline="middle">${esc(paint.label)}</text>`
  )
}

function textLeaf(
  paint: Extract<LeafPaint, { kind: 'text' }>,
  node: SolvedNode,
  ctx: FrameRenderContext
): string {
  const content =
    paint.transform === 'uppercase' ? paint.content.toUpperCase() : paint.content

  /*
   * **`placeText`, always.** It decides the anchor, the physical x and the
   * string's own direction together, because they cannot be decided separately
   * — that is the bug that drew an Arabic product name out of its card. The
   * artboard has no `[data-figure]` to lean on, so this is the rule every
   * renderer has to call.
   */
  const family = paint.family === 'headline' ? HEADLINE : LATIN

  // The same wrap the measurer used, so the drawing matches the box.
  const lines = wrapText(content, paint.size, node.rect.width)

  return lines
    .map((line, index) => {
      // Baseline from the top of the box: the solver sized the box from the
      // measurer's height, so the text sits inside it rather than on its edge.
      const y = node.rect.y + paint.size * 0.8 + index * paint.size * LINE_HEIGHT
      const place = placeText(line, paint.align ?? 'start', node.rect, node.direction)
      return (
        `<text x="${place.x}" y="${y}"` +
        ` font-family="${family}" font-size="${paint.size}"` +
        (paint.weight === undefined ? '' : ` font-weight="${paint.weight}"`) +
        ` fill="${KIT[paint.color ?? 'ink']}"` +
        ` text-anchor="${place.anchor}" direction="${place.direction}">` +
        `${esc(line)}</text>`
      )
    })
    .join('')
}

/**
 * A leaf whose ref has no paint. Drawn rather than skipped, because a silently
 * missing element is the defect this harness exists to surface.
 */
function debugBox(box: Rect): string {
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"` +
    ` fill="none" stroke="#D0021B" stroke-width="1" stroke-dasharray="3 2"/>`
  )
}

function rect(box: Rect, fill: string, radius: number, extra: string): string {
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"` +
    ` rx="${radius}" fill="${fill}"${extra}/>`
  )
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
