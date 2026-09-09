/**
 * A throwaway SVG renderer, so the engine's output can be looked at.
 *
 * Not the real one. Export goes through Fabric's `toSVG()` and the price mark is
 * a real component — this draws just enough to answer one question: does an
 * engine-composed page read like a flyer without hand-finishing?
 *
 * Text does not run through the fit ladder here. It wraps greedily and is
 * allowed to overflow, which is the diagnostic: the worst-case page shows what
 * the ladder will have to absorb.
 */

import type { Block, BlockElement, Currency, TokenRef } from '@souqstudio/types'
import {
  fitPolicy,
  resolveColor,
  resolvePaint,
  shapePath,
  needsEvenOdd,
  PATH_SHAPES,
  type PathShape,
  fitText,
  compactBlock,
  layoutPriceMark,
  placeText,
  resolveBlock,
  type CompactionPolicy,
  type MarkPiece,
  type Placement,
  type Rect,
} from '../src/index'
import { KIT, PAGE_GROUND, SAMPLE_SCALE } from './dummy'
import { brandFor, nameFor, specFor, type HarnessProduct } from './product'

export interface RenderContext {
  blocks: Record<string, Block>
  products: Record<string, HarnessProduct>
  direction: 'ltr' | 'rtl'
  shopName: string
  /** How a card reclaims the height its content did not use. Defaults to the
   *  pre-compaction behaviour so the dummy pages are unchanged. */
  compaction?: CompactionPolicy
}

const LATIN = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const ARABIC = "'Noto Sans Arabic', 'Geeza Pro', 'Segoe UI', sans-serif"

export function renderPage(
  placements: readonly Placement[],
  size: { width: number; height: number },
  ctx: RenderContext
): string {
  const body = placements.map((placement) => renderPlacement(placement, ctx)).join('\n')
  const font = ctx.direction === 'rtl' ? ARABIC : LATIN

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"`,
    ` viewBox="0 0 ${size.width} ${size.height}" font-family="${font}">`,
    `<rect width="${size.width}" height="${size.height}" fill="${PAGE_GROUND}"/>`,
    body,
    '</svg>',
  ].join('\n')
}

function renderPlacement(placement: Placement, ctx: RenderContext): string {
  const block = ctx.blocks[placement.blockId]
  if (block === undefined) return ''

  const product = placement.offerId === null ? undefined : ctx.products[placement.offerId]
  const resolved = resolveBlock(block, placement.rect, ctx.direction)

  // Type levels size against the block, not against the element box: that is
  // what keeps h1 larger than h2 in a 1080px post and a 380px booklet cell
  // alike, and it is why a level carries a multiplier rather than a px size.
  //
  // Geometric mean rather than the shorter edge. A footer band is wide and
  // short, and anchoring to its shorter edge collapsed every string in it while
  // the cards above read correctly.
  const blockEdge = Math.sqrt(placement.rect.width * placement.rect.height)

  // Two passes, and only two. The first fit is a measurement against the box the
  // block designed; compaction reclaims what was not used; the second fit — in
  // `text` below — runs against the box that came back. It converges because
  // compaction changes heights only and line breaking is driven by width.
  const compacted = compactBlock(
    resolved,
    ({ element, rect }) => neededHeight(element, rect, product, ctx, blockEdge),
    ctx.compaction ?? 'none'
  )

  return compacted.elements
    .map(({ element, rect }) => renderElement(element, rect, product, ctx, blockEdge))
    .join('\n')
}

/**
 * How much of its box an element's content actually needs.
 *
 * Only text can be absent or short. A missing packshot is deliberately *not*
 * reported as absent: the catalog has an image on 4.2% of rows, and a card that
 * quietly closes up around the hole looks finished when it is not. E6 §10 makes
 * a fallback image a quality flag for the same reason — the owner has to see it
 * before it prints.
 */
function neededHeight(
  element: BlockElement,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): number | null {
  if (element.kind !== 'text') return rect.height

  const measured = fitFor(element, rect, product, ctx, blockEdge)
  if (measured === null) return null
  return measured.fitted.lines.length * measured.fitted.fontSize * measured.fitted.lineHeight
}

/**
 * Rotation and opacity, applied once around whatever the kind painted.
 *
 * Here rather than in each branch for the reason `draw.tsx` gives: an element
 * that honours its own rotation in one renderer and ignores it in another is the
 * bug this package exists to prevent, and the harness is the renderer a design
 * is looked at in before anybody sees it in a browser.
 */
function renderElement(
  element: BlockElement,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): string {
  const inner = paintElement(element, rect, product, ctx, blockEdge)
  if (inner === '') return ''

  const rotation = element.rotation ?? 0
  const opacity = element.opacity ?? 1
  if (rotation === 0 && opacity === 1) return inner

  const spin =
    rotation === 0
      ? ''
      : ` transform="rotate(${rotation} ${mid(rect.x, rect.width)} ${mid(rect.y, rect.height)})"`
  const alpha = opacity === 1 ? '' : ` opacity="${opacity}"`
  return `<g${spin}${alpha}>${inner}</g>`
}

function paintElement(
  element: BlockElement,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): string {
  switch (element.kind) {
    case 'shape':
      return shape(element, rect, blockEdge)
    case 'image':
      return imagePlaceholder(rect, product, element.fit ?? 'contain')
    case 'logo':
      return logoPlaceholder(rect)
    case 'chip':
      return product === undefined ? '' : chip(element, rect, product, ctx)
    case 'priceMark':
      return product === undefined ? '' : priceMark(element, rect, product)
    case 'text':
      return text(element, rect, product, ctx, blockEdge)
  }
}

/**
 * A ground, a panel, a disc, a rule.
 *
 * Three variants rather than three kinds, matching `draw.tsx` line for line — a
 * rule that draws as a rectangle here and as a stroked line there is a divider
 * that disappears between the harness and the page.
 */
function shape(
  element: Extract<BlockElement, { kind: 'shape' }>,
  rect: Rect,
  blockEdge: number
): string {
  // A gradient needs a definition in the document and a `url(#id)` pointing at
  // it, so the fill is two strings here rather than one. The id is the element's
  // own — the harness draws one block per file, so that is unique enough, and
  // `draw.tsx` carries a per-surface prefix because a page holds sixty previews.
  const paint = resolvePaint(element.fill, color)
  const defs =
    paint.kind === 'flat'
      ? ''
      : `<defs><linearGradient id="g-${element.id}"` +
        ` x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}">` +
        paint.stops
          .map(
            (stop) =>
              `<stop offset="${stop.at}" stop-color="${stop.css}" stop-opacity="${stop.opacity}"/>`
          )
          .join('') +
        `</linearGradient></defs>`
  const fill = paint.kind === 'flat' ? paint.css : `url(#g-${element.id})`
  const stroke = element.stroke
  const strokeAttrs =
    stroke === undefined
      ? ''
      : ` stroke="${resolveColor(stroke.color, color)}"` +
        ` stroke-width="${Math.max(1, stroke.width * blockEdge)}"`

  if (element.variant === 'line') {
    const y = mid(rect.y, rect.height)
    const width = Math.max(1, (stroke?.width ?? 0.004) * blockEdge)
    return (
      defs +
      `<line x1="${rect.x}" y1="${y}" x2="${rect.x + rect.width}" y2="${y}"` +
      ` stroke="${fill}" stroke-width="${width}" stroke-linecap="round"/>`
    )
  }

  if (element.variant === 'ellipse') {
    return (
      defs +
      `<ellipse cx="${mid(rect.x, rect.width)}" cy="${mid(rect.y, rect.height)}"` +
      ` rx="${rect.width / 2}" ry="${rect.height / 2}" fill="${fill}"${strokeAttrs}/>`
    )
  }

  // The offer shapes, from the same path function `draw.tsx` calls — which is
  // the only reason this harness is worth looking at.
  if (element.variant !== undefined && (PATH_SHAPES as string[]).includes(element.variant)) {
    const shape = element.variant as PathShape
    const rule = needsEvenOdd(shape) ? ' fill-rule="evenodd"' : ''
    return defs + `<path d="${shapePath(shape, rect)}" fill="${fill}"${rule}${strokeAttrs}/>`
  }

  return (
    defs +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"` +
    ` rx="${element.radius}" fill="${fill}"${strokeAttrs}/>`
  )
}

// ─── Elements ─────────────────────────────────────────────────────────────────

function imagePlaceholder(
  rect: Rect,
  product: HarnessProduct | undefined,
  fit: 'contain' | 'cover'
): string {
  // A `cover` box is filled edge to edge, because that is what `cover` means and
  // because the blocks that use it put the name and the price on top of the
  // photograph. Drawn inset, the overlay cards read as a scrim floating beside a
  // packshot rather than over one, which is not the design being checked.
  const inset = fit === 'cover' ? 0 : Math.min(rect.width, rect.height) * 0.12
  const inner = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - inset * 2,
    height: rect.height - inset * 2,
  }
  // The brand, when there is one. Two thirds of a real catalog row set has a
  // brand string and none has an image, so this box is what most of a real page
  // is made of — see the note in `real.ts`.
  const label = product === undefined || product.brandEn === null ? 'image' : product.brandEn
  const size = Math.min(inner.width * 0.22, inner.height * 0.16, 22)

  return [
    rounded(rect, '#ECEAE4', 3),
    rounded(inner, '#DEDBD2', 3),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` fill="${KIT.inkMuted}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`,
  ].join('')
}

function logoPlaceholder(rect: Rect): string {
  const size = Math.min(rect.height * 0.4, 20)
  return [
    rounded(rect, '#FFFFFF22', 3),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` fill="#FFFFFFAA" text-anchor="middle" dominant-baseline="middle">logo</text>`,
  ].join('')
}

function chip(
  element: Extract<BlockElement, { kind: 'chip' }>,
  rect: Rect,
  product: HarnessProduct,
  ctx: RenderContext
): string {
  const label = ctx.direction === 'rtl' ? product.tier.labelAr : product.tier.labelEn
  // Fit on both axes. Sizing from height alone is what broke the wide
  // arrangement: the same box is a tall pill in one region aspect and a flat
  // sliver in another.
  const size = fitLabel(label, rect.width * 0.86, rect.height * 0.52, 0.56)
  // The tier's own colour unless the block named one. A seeded card that puts
  // the pill on a coloured tab needs it to stop being the tier colour there.
  const pill =
    element.fill === undefined ? color(product.tier.token) : resolveColor(element.fill, color)

  return [
    rounded(rect, pill, rect.height / 2),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` font-weight="700" fill="${KIT.surface}" text-anchor="middle"`,
    ` dominant-baseline="middle">${esc(label)}</text>`,
  ].join('')
}

/** Largest font size at which a short label fits. Not the fit ladder — a chip
 *  label is one word in a pill, with no wrapping and nothing to step down to. */
function fitLabel(content: string, maxWidth: number, maxSize: number, perChar: number): number {
  if (content.length === 0) return maxSize
  return Math.min(maxSize, maxWidth / (content.length * perChar))
}

/**
 * Draws what `layoutPriceMark` decided. No geometry here.
 *
 * The harness used to do this arithmetic itself, which meant the rules that
 * decide whether a page reads as a real offer book — the raised minor, the
 * attached tab, the fit on both axes — lived in throwaway code and were checked
 * only by eye. They are in the engine now, with tests, and this just paints.
 */
function priceMark(
  element: Extract<BlockElement, { kind: 'priceMark' }>,
  rect: Rect,
  product: HarnessProduct
): string {
  // The composition stays ours; the skin is the shop's. `plain` drops the ground
  // and the outline so the digits sit straight on a tinted card, and `tab: none`
  // hides the tier badge for the cards that carry it as a chip instead.
  const style = element.style ?? {}
  const tint = style.tint === undefined ? color(product.tier.token) : resolveColor(style.tint, color)
  const ink = style.ink === undefined ? KIT.ink : resolveColor(style.ink, color)
  const plate = style.surface === undefined ? KIT.surface : resolveColor(style.surface, color)
  const framed = style.frame !== 'plain'
  const l = layoutPriceMark(
    {
      tierId: 'harness',
      major: product.major,
      minor: product.minor,
      currency: product.currency as Currency,
      currencyPlacement: 'PREFIX',
      shape: 'TAG',
      ...(product.comparePrice === undefined ? {} : { comparePrice: product.comparePrice }),
    },
    rect,
    { tierLabel: product.tier.labelEn.toUpperCase() }
  )

  // Every piece is LTR with Western numerals, in an AR edition too.
  const piece = (p: MarkPiece, fill: string, weight = 800, extra = '') =>
    `<text x="${p.x}" y="${p.baseline}" font-size="${p.fontSize}" font-weight="${weight}"` +
    ` fill="${fill}" direction="ltr"${extra}>${esc(p.text)}</text>`

  const tab =
    l.tab && style.tab !== 'none'
    ? rounded(l.tab.rect, tint, l.tab.rect.height / 2) +
      `<text x="${mid(l.tab.rect.x, l.tab.rect.width)}" y="${mid(l.tab.rect.y, l.tab.rect.height)}"` +
      ` font-size="${l.tab.fontSize}" font-weight="700" fill="${KIT.surface}"` +
      ` text-anchor="middle" dominant-baseline="middle">${esc(l.tab.text)}</text>`
    : ''

  const frame = framed
    ? rounded(l.mark, plate, 3) +
      `<rect x="${l.mark.x}" y="${l.mark.y}" width="${l.mark.width}" height="${l.mark.height}"` +
      ` rx="3" fill="none" stroke="${tint}" stroke-width="${Math.max(1, l.mark.height * 0.035)}"/>`
    : ''

  return [
    tab,
    frame,
    `<text x="${l.currency.x}" y="${l.currency.baseline}" font-size="${l.currency.fontSize}"`,
    ` font-weight="700" fill="${ink}" opacity="0.7" direction="ltr">${esc(l.currency.text)}</text>`,
    piece(l.major, ink),
    l.minor ? piece(l.minor, ink) : '',
    l.compare ? piece(l.compare, ink, 400, ' text-decoration="line-through" opacity="0.6"') : '',
    l.prefix ? piece(l.prefix, ink, 700, ' opacity="0.7"') : '',
  ].join('')
}

/**
 * One text element, fitted. Null when there is nothing to draw.
 *
 * Shared by the measuring pass and the drawing pass so the two cannot disagree:
 * a compaction computed from one fit and a render from another would place text
 * in a box sized for a different string.
 */
function fitFor(
  element: Extract<BlockElement, { kind: 'text' }>,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
) {
  const content = resolveText(element, product, ctx)
  if (content === '') return null

  const step = SAMPLE_SCALE.levels[element.level]
  const family = SAMPLE_SCALE.families[step.family]
  const policy = fitPolicy(element.source, element.overflow)

  // The element's own case wins over the level's. A brand line set in small
  // uppercase is a decision the block made; the scale's is the default it made
  // it against.
  const transform = element.transform ?? step.transform

  const fitted = fitText({
    text: transform === 'uppercase' ? content.toUpperCase() : content,
    box: { width: rect.width, height: rect.height },
    level: element.level,
    scale: SAMPLE_SCALE,
    blockSize: blockEdge,
    measure: estimateWidth,
    truncatable: policy.truncatable,
    ...(policy.floor === undefined ? {} : { floor: policy.floor }),
    ...(policy.maxLines === undefined ? {} : { maxLines: policy.maxLines }),
  })

  return { content, fitted, step, family }
}

/**
 * Text, through the fit ladder.
 *
 * The harness used to wrap greedily and let long strings run over the card,
 * which was the right diagnostic while the ladder did not exist — the worst-case
 * page is what proved it was needed. Now it runs the real one, so what overflows
 * here is what would overflow in print.
 *
 * An escalated card draws in the caution colour rather than silently: the owner
 * has to see it before publishing, and E6's quality flags are exactly this
 * signal reaching the editor.
 */
function text(
  element: Extract<BlockElement, { kind: 'text' }>,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): string {
  const measured = fitFor(element, rect, product, ctx, blockEdge)
  if (measured === null) return ''
  const { content, fitted, step, family } = measured

  // Position, anchor and direction together, from the engine. Deciding them
  // separately is what drew a real Arabic name out through the left edge of an
  // English card — see `src/direction.ts`.
  const { anchor, x, direction } = placeText(content, element.align, rect, ctx.direction)

  const fill = fitted.escalated ? ESCALATED : inkFor(element, ctx)

  return fitted.lines
    .map((line, i) => {
      const y = rect.y + fitted.fontSize * (0.85 + i * fitted.lineHeight)
      return (
        `<text x="${x}" y="${y}" font-size="${fitted.fontSize}"` +
        ` font-weight="${element.weight ?? step.weight}"` +
        (element.letterSpacing === undefined
          ? ''
          : ` letter-spacing="${element.letterSpacing * fitted.fontSize}"`) +
        ` font-family="${family}" fill="${fill}" text-anchor="${anchor}"` +
        ` direction="${direction}" unicode-bidi="isolate">${esc(line)}</text>`
      )
    })
    .join('')
}

/**
 * A stand-in for font metrics. The real renderers measure with a canvas; this
 * estimates, which is enough to prove the ladder runs and wrong enough that the
 * harness must never be the thing that signs off a layout.
 */
const estimateWidth = (content: string, fontSize: number) => content.length * fontSize * 0.52

/** An escalated card is visible, not silent. */
const ESCALATED = '#B3261E'

function resolveText(
  element: Extract<BlockElement, { kind: 'text' }>,
  product: HarnessProduct | undefined,
  ctx: RenderContext
): string {
  const ar = ctx.direction === 'rtl'
  switch (element.source.from) {
    case 'offer':
      return product === undefined ? '' : ar ? product.tier.labelAr : product.tier.labelEn
    case 'static':
      return ar ? element.source.textAr : element.source.textEn
    case 'shop':
      return element.source.field === 'name' ? ctx.shopName : ''
    case 'product': {
      if (product === undefined) return ''
      // The app's fallbacks, not the harness's own: an Arabic page over rows
      // with no `nameAr` draws the English name, which is what the product
      // does today. Drawing a blank or a placeholder here would invent a
      // different failure from the real one.
      if (element.source.field === 'name') return nameFor(product, ar)
      if (element.source.field === 'spec') return specFor(product, ar)
      if (element.source.field === 'brand') return brandFor(product)
      return ''
    }
  }
}

/**
 * What colour a string draws in, in `draw.tsx`'s order.
 *
 * **The element's own colour wins first**, and it has to: a product name on a
 * tinted card names `surface` explicitly, and a harness that checked "is it a
 * caption" before "did the block say" drew every one of them in the ink colour
 * on top of the ink-coloured ground.
 */
function inkFor(
  element: Extract<BlockElement, { kind: 'text' }>,
  ctx: RenderContext
): string {
  void ctx
  if (element.color !== undefined) return resolveColor(element.color, color)
  if (element.source.from === 'static' || element.source.from === 'shop') return KIT.surface
  return element.level === 'caption' ? KIT.inkMuted : KIT.ink
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function rounded(rect: Rect, fill: string, radius: number): string {
  return (
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"` +
    ` rx="${radius}" fill="${fill}"/>`
  )
}

function color(token: TokenRef): string {
  return KIT[token]
}

const mid = (start: number, extent: number) => start + extent / 2

function wrap(content: string, maxChars: number): string[] {
  const words = content.split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (candidate.length <= maxChars) {
      line = candidate
    } else {
      if (line !== '') lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
