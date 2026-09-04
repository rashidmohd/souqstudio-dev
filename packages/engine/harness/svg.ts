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

import type { Block, BlockElement, TokenRef } from '@souqstudio/types'
import { resolveBlock, type Placement, type Rect } from '../src/index'
import { KIT, PAGE_GROUND, SAMPLE_SCALE, type DummyProduct } from './dummy'

export interface RenderContext {
  blocks: Record<string, Block>
  products: Record<string, DummyProduct>
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
  product: DummyProduct | undefined,
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

function imagePlaceholder(rect: Rect, product: DummyProduct | undefined): string {
  const inset = Math.min(rect.width, rect.height) * 0.12
  const inner = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - inset * 2,
    height: rect.height - inset * 2,
  }
  const label = product?.brandEn ?? 'image'
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

function chip(rect: Rect, product: DummyProduct, ctx: RenderContext): string {
  const label = ctx.direction === 'rtl' ? product.tier.labelAr : product.tier.labelEn
  // Fit on both axes. Sizing from height alone is what broke the wide
  // arrangement: the same box is a tall pill in one region aspect and a flat
  // sliver in another.
  const size = fitText(label, rect.width * 0.86, rect.height * 0.52, 0.56)
  return [
    rounded(rect, color(product.tier.token), rect.height / 2),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` font-weight="700" fill="${KIT.surface}" text-anchor="middle"`,
    ` dominant-baseline="middle">${esc(label)}</text>`,
  ].join('')
}

/** Largest font size at which `content` fits `maxWidth`, capped at `maxSize`. */
function fitText(content: string, maxWidth: number, maxSize: number, perChar: number): number {
  if (content.length === 0) return maxSize
  return Math.min(maxSize, maxWidth / (content.length * perChar))
}

/**
 * A stand-in for the real component. The rules it does honour are the ones that
 * decide whether a page reads as an offer book: minor digits raised to the
 * major's cap height rather than baseline-aligned, the tier label as an attached
 * tab, and the whole mark LTR with Western numerals even in an AR edition.
 */
function priceMark(rect: Rect, product: DummyProduct): string {
  const tint = color(product.tier.token)
  const tabHeight = rect.height * 0.26
  const tab = { x: rect.x, y: rect.y, width: rect.width * 0.56, height: tabHeight }
  const mark = {
    x: rect.x,
    y: rect.y + tabHeight * 0.86,
    width: rect.width,
    height: rect.height - tabHeight * 0.86,
  }

  // The mark must fit its box on both axes. A merged region changes the box's
  // aspect, and a price that overflows its card is the one failure the whole
  // artefact cannot absorb — so width constrains the type size as much as
  // height does. This is the fit ladder in miniature; the real one lives in the
  // renderer that replaces this.
  const CURRENCY_RATIO = 0.3
  const MINOR_RATIO = 0.44
  const GLYPH = 0.6
  const demand =
    product.currency.length * CURRENCY_RATIO * GLYPH +
    0.12 +
    product.major.length * GLYPH +
    product.minor.length * MINOR_RATIO * GLYPH
  const major = Math.min(mark.height * 0.58, (mark.width * 0.86) / demand)
  const minor = major * MINOR_RATIO
  const currency = major * CURRENCY_RATIO

  const baseline = mark.y + mark.height * 0.74
  const capTop = baseline - major * 0.72

  // A little air after the currency code; without it 'KWD' collides with the
  // major digits at small sizes.
  const currencyWidth = product.currency.length * currency * GLYPH + major * 0.12
  const majorWidth = product.major.length * major * GLYPH
  const minorWidth = product.minor.length * minor * GLYPH
  const groupWidth = currencyWidth + majorWidth + minorWidth
  const groupStart = mark.x + (mark.width - groupWidth) / 2

  const compare =
    product.comparePrice === undefined
      ? ''
      : [
          `<text x="${mark.x + mark.width * 0.94}" y="${mark.y + mark.height * 0.26}"`,
          ` font-size="${Math.min(currency * 0.95, mark.height * 0.2)}" fill="${KIT.inkMuted}"`,
          ` text-anchor="end" text-decoration="line-through"`,
          ` direction="ltr">${esc(product.comparePrice)}</text>`,
        ].join('')

  return [
    rounded(tab, tint, tabHeight / 2),
    `<text x="${mid(tab.x, tab.width)}" y="${mid(tab.y, tab.height)}"`,
    ` font-size="${fitText(product.tier.labelEn, tab.width * 0.86, tabHeight * 0.5, 0.62)}"`,
    ` font-weight="700" fill="${KIT.surface}" text-anchor="middle"`,
    ` dominant-baseline="middle">${esc(product.tier.labelEn.toUpperCase())}</text>`,
    rounded(mark, KIT.surface, 3),
    `<rect x="${mark.x}" y="${mark.y}" width="${mark.width}" height="${mark.height}" rx="3"`,
    ` fill="none" stroke="${tint}" stroke-width="${Math.max(1, mark.height * 0.035)}"/>`,
    // Currency stays LTR with Western numerals, including in AR editions.
    `<text x="${groupStart}" y="${baseline}" font-size="${currency}"`,
    ` font-weight="700" fill="${KIT.inkMuted}" direction="ltr">${esc(product.currency)}</text>`,
    `<text x="${groupStart + currencyWidth}" y="${baseline}" font-size="${major}"`,
    ` font-weight="800" fill="${KIT.ink}" direction="ltr">${esc(product.major)}</text>`,
    // Raised to the major's cap height. Never baseline-aligned.
    `<text x="${groupStart + currencyWidth + majorWidth}" y="${capTop + minor * 0.72}"`,
    ` font-size="${minor}" font-weight="800" fill="${KIT.ink}"`,
    ` direction="ltr">${esc(product.minor)}</text>`,
    compare,
  ].join('')
}

function text(
  element: Extract<BlockElement, { kind: 'text' }>,
  rect: Rect,
  product: DummyProduct | undefined,
  ctx: RenderContext,
  blockEdge: number
): string {
  const content = resolveText(element, product, ctx)
  if (content === '') return ''

  const step = SAMPLE_SCALE.levels[element.level]
  const size = SAMPLE_SCALE.base * blockEdge * step.size
  const family = SAMPLE_SCALE.families[step.family]
  const rendered = step.transform === 'uppercase' ? content.toUpperCase() : content

  const perChar = size * (ctx.direction === 'rtl' ? 0.48 : 0.52)
  const lines = wrap(rendered, Math.max(4, Math.floor(rect.width / perChar)))

  const anchor =
    element.align === 'center' ? 'middle' : element.align === 'end' ? 'end' : 'start'
  const x =
    element.align === 'center'
      ? mid(rect.x, rect.width)
      : (element.align === 'end') === (ctx.direction === 'ltr')
        ? rect.x + rect.width
        : rect.x

  const fill = element.level === 'caption' ? KIT.inkMuted : inkFor(element, ctx)

  // No fit ladder yet. Overflow is left visible on purpose — it is the whole
  // reason the worst-case page exists. When the ladder lands, its second rung
  // is "drop to the next type step", and the ordered scale is what makes that
  // a defined move rather than an arbitrary size.
  return lines
    .map((line, i) => {
      const y = rect.y + size * (0.85 + i * step.lineHeight)
      return (
        `<text x="${x}" y="${y}" font-size="${size}" font-weight="${step.weight}"` +
        ` font-family="${family}" fill="${fill}" text-anchor="${anchor}"` +
        ` direction="${ctx.direction}">${esc(line)}</text>`
      )
    })
    .join('')
}

function resolveText(
  element: Extract<BlockElement, { kind: 'text' }>,
  product: DummyProduct | undefined,
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
      if (element.source.field === 'name') return ar ? product.nameAr : product.nameEn
      if (element.source.field === 'spec') return ar ? product.specAr : product.specEn
      if (element.source.field === 'brand') return product.brandEn
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
