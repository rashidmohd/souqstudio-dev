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
  fitText,
  layoutPriceMark,
  resolveBlock,
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
  const { elements } = resolveBlock(block, placement.rect, ctx.direction)

  // Type levels size against the block, not against the element box: that is
  // what keeps h1 larger than h2 in a 1080px post and a 380px booklet cell
  // alike, and it is why a level carries a multiplier rather than a px size.
  //
  // Geometric mean rather than the shorter edge. A footer band is wide and
  // short, and anchoring to its shorter edge collapsed every string in it while
  // the cards above read correctly.
  const blockEdge = Math.sqrt(placement.rect.width * placement.rect.height)

  return elements
    .map(({ element, rect }) => renderElement(element, rect, product, ctx, blockEdge))
    .join('\n')
}

function renderElement(
  element: BlockElement,
  rect: Rect,
  product: HarnessProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): string {
  switch (element.kind) {
    case 'shape':
      return rounded(rect, color(element.surface), element.radius)
    case 'image':
      return imagePlaceholder(rect, product)
    case 'logo':
      return logoPlaceholder(rect)
    case 'chip':
      return product === undefined ? '' : chip(rect, product, ctx)
    case 'priceMark':
      return product === undefined ? '' : priceMark(rect, product)
    case 'text':
      return text(element, rect, product, ctx, blockEdge)
  }
}

// ─── Elements ─────────────────────────────────────────────────────────────────

function imagePlaceholder(rect: Rect, product: HarnessProduct | undefined): string {
  const inset = Math.min(rect.width, rect.height) * 0.12
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

function chip(rect: Rect, product: HarnessProduct, ctx: RenderContext): string {
  const label = ctx.direction === 'rtl' ? product.tier.labelAr : product.tier.labelEn
  // Fit on both axes. Sizing from height alone is what broke the wide
  // arrangement: the same box is a tall pill in one region aspect and a flat
  // sliver in another.
  const size = fitLabel(label, rect.width * 0.86, rect.height * 0.52, 0.56)
  return [
    rounded(rect, color(product.tier.token), rect.height / 2),
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
function priceMark(rect: Rect, product: HarnessProduct): string {
  const tint = color(product.tier.token)
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

  const tab = l.tab
    ? rounded(l.tab.rect, tint, l.tab.rect.height / 2) +
      `<text x="${mid(l.tab.rect.x, l.tab.rect.width)}" y="${mid(l.tab.rect.y, l.tab.rect.height)}"` +
      ` font-size="${l.tab.fontSize}" font-weight="700" fill="${KIT.surface}"` +
      ` text-anchor="middle" dominant-baseline="middle">${esc(l.tab.text)}</text>`
    : ''

  return [
    tab,
    rounded(l.mark, KIT.surface, 3),
    `<rect x="${l.mark.x}" y="${l.mark.y}" width="${l.mark.width}" height="${l.mark.height}"`,
    ` rx="3" fill="none" stroke="${tint}" stroke-width="${Math.max(1, l.mark.height * 0.035)}"/>`,
    `<text x="${l.currency.x}" y="${l.currency.baseline}" font-size="${l.currency.fontSize}"`,
    ` font-weight="700" fill="${KIT.inkMuted}" direction="ltr">${esc(l.currency.text)}</text>`,
    piece(l.major, KIT.ink),
    l.minor ? piece(l.minor, KIT.ink) : '',
    l.compare
      ? piece(l.compare, KIT.inkMuted, 400, ' text-decoration="line-through"')
      : '',
    l.prefix ? piece(l.prefix, KIT.inkMuted, 700) : '',
  ].join('')
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
  const content = resolveText(element, product, ctx)
  if (content === '') return ''

  const step = SAMPLE_SCALE.levels[element.level]
  const family = SAMPLE_SCALE.families[step.family]
  const policy = fitPolicy(element.source)

  const fitted = fitText({
    text: step.transform === 'uppercase' ? content.toUpperCase() : content,
    box: { width: rect.width, height: rect.height },
    level: element.level,
    scale: SAMPLE_SCALE,
    blockSize: blockEdge,
    measure: estimateWidth,
    truncatable: policy.truncatable,
    ...(policy.floor === undefined ? {} : { floor: policy.floor }),
  })

  const anchor =
    element.align === 'center' ? 'middle' : element.align === 'end' ? 'end' : 'start'
  const x =
    element.align === 'center'
      ? mid(rect.x, rect.width)
      : (element.align === 'end') === (ctx.direction === 'ltr')
        ? rect.x + rect.width
        : rect.x

  const fill = fitted.escalated
    ? ESCALATED
    : element.level === 'caption'
      ? KIT.inkMuted
      : inkFor(element, ctx)

  // Anchoring follows the page; reordering follows the string. See `textDirection`.
  const dir = textDirection(content, ctx.direction)

  return fitted.lines
    .map((line, i) => {
      const y = rect.y + fitted.fontSize * (0.85 + i * fitted.lineHeight)
      return (
        `<text x="${x}" y="${y}" font-size="${fitted.fontSize}" font-weight="${step.weight}"` +
        ` font-family="${family}" fill="${fill}" text-anchor="${anchor}"` +
        ` direction="${dir}" unicode-bidi="isolate">${esc(line)}</text>`
      )
    })
    .join('')
}

/**
 * The direction a *string* reorders in, which is not the direction the page
 * lays out in.
 *
 * **Found by rendering real rows.** An Arabic edition draws every text element
 * with `direction="rtl"`, and 900 of the 2,131 catalog rows carry a pack line
 * like `2 kg` with no Arabic translation — `specFor` falls back to the English
 * one, correctly. In an RTL paragraph that string reorders to `kg 2`: the digit
 * is bidi-weak, the unit is a strong LTR run, and the space between them is
 * neutral. Every pack label on the Arabic page was printing backwards, and it
 * is the kind of error that survives review because it still looks like text.
 *
 * First-strong, which is the Unicode `plaintext` heuristic and what
 * `unicode-bidi: plaintext` would do if every renderer honoured it. A string
 * beginning with an Arabic letter reorders RTL; one beginning with a Latin
 * letter reorders LTR; one with no strong character at all — a bare `500` —
 * follows the page, because there is nothing in it that can reorder anyway.
 *
 * `text-anchor` deliberately does *not* use this. Where the line sits in its box
 * is a page decision — an Arabic card right-aligns its English pack label — and
 * only the order of the glyphs within the line is the string's own business.
 *
 * The real renderers have to do the same thing. Fabric and the SVG export both
 * inherit the artboard's direction, and the design system's answer in chrome is
 * `[data-figure]` with bidi isolation; nothing equivalent exists on the artboard
 * yet.
 */
function textDirection(content: string, page: 'ltr' | 'rtl'): 'ltr' | 'rtl' {
  // Arabic, Hebrew and their supplements against the Latin/Greek/Cyrillic
  // ranges. Not `\p{Script=Arabic}` alone: the first strong character may be
  // Latin in a string that also contains Arabic, and that string is still LTR.
  const strong = /[\u0041-\u005A\u0061-\u007A\u00C0-\u02AF\u0370-\u04FF]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u
  const match = strong.exec(content)
  if (match === null) return page
  return match[0].charCodeAt(0) >= 0x0590 ? 'rtl' : 'ltr'
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

/** Static blocks sit on a tinted ground, so their text inverts. */
function inkFor(
  element: Extract<BlockElement, { kind: 'text' }>,
  ctx: RenderContext
): string {
  void ctx
  return element.source.from === 'static' || element.source.from === 'shop'
    ? KIT.surface
    : KIT.ink
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
