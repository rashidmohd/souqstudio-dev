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

import type { Block, BlockElement, Currency, FlatColor, TokenRef } from '@souqstudio/types'
import {
  CHIP_FIT,
  chipPathShape,
  compactBlock,
  drawsGround,
  fitPolicy,
  fitText,
  fromHex,
  layoutPriceMark,
  markGround,
  markRecipe,
  needsEvenOdd,
  PATH_SHAPES,
  placeText,
  readableInkOn,
  resolveBlock,
  extrudeCopies,
  resolveColor,
  resolvePaint,
  shapePath,
  type CompactionPolicy,
  type MarkPiece,
  type PathShape,
  type Placement,
  type Rect,
} from '../src/index'
import { KIT, PAGE_GROUND, SAMPLE_SCALE } from './dummy'
import { brandFor, nameFor, originFor, packFor, specFor, type HarnessProduct } from './product'
import { resolveTextBinding, type BindingSubjects } from '../src/bindings'
import { PREFIX_TEXT } from '../src/price-mark'
import { shadowRings } from '../src/shadow'

export interface RenderContext {
  blocks: Record<string, Block>
  products: Record<string, HarnessProduct>
  direction: 'ltr' | 'rtl'
  /**
   * The shop the page is for, and the identity it carries.
   *
   * **This used to be one `shopName: string`**, which is exactly as much of the
   * vocabulary as this file could answer: `shop.address` and `shop.phone` were
   * declared, fell through to `''` here and in `draw.tsx`, and agreed with each
   * other and with nothing else. E14 §3.4.
   *
   * `brand` is the identity this book carries — one source, resolved through
   * `brandOverride` in the app. The harness has no override to read, so it
   * carries the resolved answer, which is what the app hands the painter too.
   */
  shop: { name: string; address: string; phone: string }
  brand: { name: string; logo: string | null }
  book: { title: string; validFrom: string; validTo: string }
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
  // **Painted here rather than inside each kind**, so one element cannot grow a
  // second reading of the rule — the same arrangement `draw.tsx` makes. Text is
  // the exception and casts its own: a glyph has no box to expand.
  const shadow =
    element.kind === 'shape' || element.kind === 'image' ? element.shadow : undefined
  const cast = shadow === undefined ? '' : castShadow(shadow, element, rect, ctx, blockEdge)
  return cast + paintBody(element, rect, product, ctx, blockEdge)
}

/**
 * A soft shadow, as concentric vector copies of the element's own silhouette.
 *
 * Never a filter. `feDropShadow` and `feGaussianBlur` rasterize the element at a
 * resolution Chromium picks and nothing in the document can set — about 220dpi
 * for a card on an A4 page, under the 300dpi target. `harness/export-check.ts`
 * is that measurement. E14 §2.4.
 */
function castShadow(
  shadow: NonNullable<Extract<BlockElement, { kind: 'shape' }>['shadow']>,
  element: BlockElement,
  rect: Rect,
  ctx: RenderContext,
  blockEdge: number
): string {
  const ink = resolveColor(shadow.color, color)
  // **An outline-only shape casts from its outline, not its silhouette.** The
  // rings are filled copies, which is right while the shape is filled and
  // visibly wrong when it is not — the shadow shows through the hole and a
  // hairline rule box comes out a grey panel. Line for line with `draw.tsx`,
  // which is the point of this file.
  const outlineOnly =
    element.kind === 'shape' && element.fill === undefined && element.stroke !== undefined
  if (element.kind === 'shape' && element.fill === undefined && element.stroke === undefined) {
    return ''
  }
  const paintAttrs = (alpha: number): string =>
    outlineOnly && element.kind === 'shape' && element.stroke !== undefined
      ? ` fill="none" stroke="${ink}" stroke-opacity="${alpha}"` +
        ` stroke-width="${element.stroke.width * blockEdge}"`
      : ` fill="${ink}" fill-opacity="${alpha}"`
  const radius =
    element.kind === 'shape'
      ? element.variant === undefined
        ? element.radius
        : 0
      : element.kind === 'image'
        ? (element.radius ?? 0)
        : 0
  const rings = shadowRings(
    {
      ...shadow,
      x: shadow.x * blockEdge,
      y: shadow.y * blockEdge,
      blur: shadow.blur * blockEdge,
    },
    rect,
    radius,
    { scale: 1, dpi: 96 }
  )
  const path =
    element.kind === 'shape' && element.variant !== undefined && isPathShape(element.variant)
      ? element.variant
      : null

  return rings
    .map((ring) => {
      const alpha = paintAttrs(ring.alpha)
      if (path !== null) {
        // A twelve-point burst offsets by growing its radius and the shadow
        // follows its points — which is what makes this work on any path.
        return (
          `<path d="${shapePath(path, ring.rect, ctx.direction)}"${alpha}` +
          (needsEvenOdd(path) && !outlineOnly ? ' fill-rule="evenodd"' : '') +
          '/>'
        )
      }
      if (element.kind === 'shape' && element.variant === 'ellipse') {
        return (
          `<ellipse cx="${mid(ring.rect.x, ring.rect.width)}" cy="${mid(ring.rect.y, ring.rect.height)}"` +
          ` rx="${ring.rect.width / 2}" ry="${ring.rect.height / 2}"${alpha}/>`
        )
      }
      if (outlineOnly) {
        return (
          `<rect x="${ring.rect.x}" y="${ring.rect.y}" width="${ring.rect.width}"` +
          ` height="${ring.rect.height}" rx="${ring.radius}"${alpha}/>`
        )
      }
      return rounded(ring.rect, ink, ring.radius, ring.alpha)
    })
    .join('')
}

const isPathShape = (variant: string): variant is PathShape =>
  (PATH_SHAPES as readonly string[]).includes(variant)

function paintBody(
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
      // **A mark and a packshot get different treatments, and the gallery is
      // what said so.** Folding `logo` into `image` (E14 §3.1) put every mark
      // into the packshot's grey box — and a mark sits on a footer's ink band
      // or a hero's tint, where a light grey rectangle reads as a broken image
      // rather than as a reserved space. Same box, same geometry, different
      // palette, because the ground underneath is different.
      return element.source.from === 'brand'
        ? logoPlaceholder(rect, placeholderLabel(element.source, product, ctx))
        : imagePlaceholder(rect, element.source, product, ctx, element.fit ?? 'contain')
    // Still renderable, and deleted in the release after the one that converts
    // — a block published to R2 is read by every shop. E14 §6 and Phase 8.
    case 'logo':
      return logoPlaceholder(rect, 'logo')
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
  // **Absent is `none`.** A shape may be outline-only now — a hairline rule box
  // around a price, which used to be faked with one filled rectangle sitting on
  // another. E14 §2.4.
  const paint = element.fill === undefined ? null : resolvePaint(element.fill, color)
  const defs =
    paint === null || paint.kind === 'flat'
      ? ''
      : `<defs><linearGradient id="g-${element.id}"` +
        ` x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}">` +
        (paint !== null && paint.kind === 'gradient' ? paint.stops : [])
          .map(
            (stop) =>
              `<stop offset="${stop.at}" stop-color="${stop.css}" stop-opacity="${stop.opacity}"/>`
          )
          .join('') +
        `</linearGradient></defs>`
  const fill = paint === null ? 'none' : paint.kind === 'flat' ? paint.css : `url(#g-${element.id})`
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
  source: Extract<BlockElement, { kind: 'image' }>['source'],
  product: HarnessProduct | undefined,
  ctx: RenderContext,
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
  // **What the box is standing in for, not just "image".** A brand logo and a
  // product packshot are different bindings and a placeholder that called both
  // "image" is one a reader cannot use to tell a mis-bound element from an
  // absent photograph — E14 §3.1, which is why `logo` stopped being a kind.
  const label = placeholderLabel(source, product, ctx)
  const size = Math.min(inner.width * 0.22, inner.height * 0.16, 22)

  return [
    rounded(rect, '#ECEAE4', 3),
    rounded(inner, '#DEDBD2', 3),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` fill="${KIT.inkMuted}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`,
  ].join('')
}

/**
 * What an image box says it is holding.
 *
 * `brand.logo` resolves through the identity fixture, so a header pinned to the
 * parent mark says so rather than saying "logo" either way.
 */
function placeholderLabel(
  source: Extract<BlockElement, { kind: 'image' }>['source'],
  product: HarnessProduct | undefined,
  ctx: RenderContext
): string {
  switch (source.from) {
    case 'brand':
      // The name, not "<name> logo": the box's own treatment already says it is
      // a mark, and the only thing a reviewer cannot see is *whose* — which is
      // the question an identity pin exists to answer. E14 §3.2.
      return ctx.brand.logo ?? ctx.brand.name
    case 'asset':
      return `asset ${source.assetId}`
    case 'product':
      // Two thirds of a real catalog row set has a brand string and none has an
      // image, so this box is what most of a real page is made of — `real.ts`.
      return product === undefined || product.brandEn === null ? 'image' : product.brandEn
  }
}

/**
 * The shop's mark, reserved.
 *
 * Translucent white rather than the packshot's grey: a mark is drawn on a
 * footer's ink band or a hero's tint almost every time, and an opaque light box
 * there reads as a broken image instead of as a space held for something.
 */
function logoPlaceholder(rect: Rect, label: string): string {
  // Bounded against the box's width as well as its height, because a wide
  // lockup in a short band would otherwise set its label wider than its box.
  const size = Math.min(rect.height * 0.4, rect.width / Math.max(label.length, 1) * 1.6, 20)
  return [
    rounded(rect, '#FFFFFF22', 3),
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` fill="#FFFFFFAA" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`,
  ].join('')
}

function chip(
  element: Extract<BlockElement, { kind: 'chip' }>,
  rect: Rect,
  product: HarnessProduct,
  ctx: RenderContext
): string {
  const label = ctx.direction === 'rtl' ? product.tier.labelAr : product.tier.labelEn
  /**
   * **The badge's shape, through the same three helpers `draw.tsx` calls.**
   *
   * This drew a rounded pill in white, always, and read neither `shape` nor
   * `ink` — so a card that asked for a ribbon got a pill, and a card that asked
   * for no badge at all got one anyway. That is worse than a missing feature in
   * the one renderer whose whole job is to be looked at: the gallery is how a
   * design defect is found, and a painter that ignores a field reports a card
   * the document does not describe. `topRibbon` and `dealFrame` are the two it
   * misreported.
   */
  const shape = element.shape ?? 'pill'
  const fit = CHIP_FIT[shape]
  const size = fitLabel(label, rect.width * fit.width, rect.height * fit.height, 0.56)
  // The tier's own colour unless the block named one. A seeded card that puts
  // the pill on a coloured tab needs it to stop being the tier colour there.
  const badge =
    element.fill === undefined ? color(product.tier.token) : resolveColor(element.fill, color)
  // With no ground behind it the badge's colour becomes the label's, rather
  // than a contrast computed against a rectangle nobody can see.
  const rgb = fromHex(badge)
  const labelInk =
    element.ink !== undefined
      ? resolveColor(element.ink, color)
      : !drawsGround(shape)
        ? badge
        : rgb === null
          ? KIT.surface
          : readableInkOn(rgb)

  const path = chipPathShape(shape)
  const ground = !drawsGround(shape)
    ? ''
    : path === null
      ? rounded(rect, badge, rect.height / 2)
      : `<path d="${shapePath(path, rect, ctx.direction)}" fill="${badge}"` +
        `${needsEvenOdd(path) ? ' fill-rule="evenodd"' : ''}/>`

  return [
    ground,
    `<text x="${mid(rect.x, rect.width)}" y="${mid(rect.y, rect.height)}" font-size="${size}"`,
    ` font-weight="700" fill="${labelInk}" text-anchor="middle"`,
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
  // The composition stays ours; the skin is the shop's. `ground: 'none'` drops
  // the shape and the outline so the digits sit straight on a tinted card, and
  // `tab: 'none'` hides the tier badge for the cards that carry it as a chip.
  const style = element.style ?? {}
  const tint = style.tint === undefined ? color(product.tier.token) : resolveColor(style.tint, color)
  const ink = style.ink === undefined ? KIT.ink : resolveColor(style.ink, color)
  const plate = style.surface === undefined ? KIT.surface : resolveColor(style.surface, color)

  /**
   * The narrow slots, each falling back to the broad one it replaced.
   *
   * **The harness paints what the product paints or it is checking a picture
   * nobody sees** — the same rule the shape kit note below states. `draw.tsx`
   * resolves narrow → broad → the old hard-coded value, and so does this.
   *
   * The harness has no `--sq-ui-ink-muted`: it drew the currency, the was-price
   * and the FROM line as the ink at reduced opacity. So that is what an unset
   * slot still does, and a set one paints at full strength.
   */
  const slot = (value: FlatColor | undefined): string | null =>
    value === undefined ? null : resolveColor(value, color)

  const majorInk = slot(style.majorInk) ?? ink
  const minorInk = slot(style.minorInk) ?? ink
  const currencyInk = slot(style.currencyInk)
  const compareInk = slot(style.compareInk)
  const prefixInk = slot(style.prefixInk)
  const groundFill = slot(style.groundFill) ?? plate
  const groundStroke = slot(style.groundStroke) ?? tint
  const tabFill = slot(style.tabFill) ?? tint
  const tabInk = slot(style.tabInk) ?? groundFill
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
    {
      tierLabel: product.tier.labelEn.toUpperCase(),
      ground: markGround(style),
      recipe: markRecipe(style),
    }
  )

  // Every piece is LTR with Western numerals, in an AR edition too.
  const piece = (p: MarkPiece, fill: string, weight = 800, extra = '') =>
    `<text x="${p.x}" y="${p.baseline}" font-size="${p.fontSize}" font-weight="${weight}"` +
    ` fill="${fill}" direction="ltr"${extra}>${esc(p.text)}</text>`

  const tab =
    l.tab && style.tab !== 'none'
    ? rounded(l.tab.rect, tabFill, l.tab.rect.height / 2) +
      `<text x="${mid(l.tab.rect.x, l.tab.rect.width)}" y="${mid(l.tab.rect.y, l.tab.rect.height)}"` +
      ` font-size="${l.tab.fontSize}" font-weight="700" fill="${tabInk}"` +
      ` text-anchor="middle" dominant-baseline="middle">${esc(l.tab.text)}</text>`
    : ''

  // The same shape kit the badge draws from, through the same generator — a
  // burst here and a burst in `draw.tsx` have to be one burst, or the gallery
  // is checking a picture the product does not draw.
  const stroke = Math.max(1, l.mark.height * 0.035)
  const frame =
    l.groundShape === 'none'
      ? ''
      : l.groundShape === 'box'
        ? rounded(l.mark, groundFill, 3) +
          `<rect x="${l.mark.x}" y="${l.mark.y}" width="${l.mark.width}" height="${l.mark.height}"` +
          ` rx="3" fill="none" stroke="${groundStroke}" stroke-width="${stroke}"/>`
        : `<path d="${shapePath(l.groundShape, l.mark, 'ltr')}" fill="${groundFill}"/>` +
          `<path d="${shapePath(l.groundShape, l.mark, 'ltr')}" fill="none"` +
          ` stroke="${groundStroke}" stroke-width="${stroke}"/>`

  return [
    tab,
    frame,
    `<text x="${l.currency.x}" y="${l.currency.baseline}" font-size="${l.currency.fontSize}"`,
    ` font-weight="700" fill="${currencyInk ?? ink}"${currencyInk === null ? ' opacity="0.7"' : ''}` +
      ` direction="ltr">${esc(l.currency.text)}</text>`,
    piece(l.major, majorInk),
    l.minor ? piece(l.minor, minorInk) : '',
    l.compare
      ? piece(
          l.compare,
          compareInk ?? ink,
          400,
          ` text-decoration="line-through"${compareInk === null ? ' opacity="0.6"' : ''}`
        )
      : '',
    l.prefix
      ? piece(l.prefix, prefixInk ?? ink, 700, prefixInk === null ? ' opacity="0.7"' : '')
      : '',
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

  /** Everything that positions a run, shared by the text, its outline and its
   *  shadow — so three copies of a line cannot drift apart by a letter. */
  // `paint` sits where `fill` always sat, so a run with no outline and no
  // shadow is byte-for-byte the string this file emitted before any of this
  // existed — which is what the gallery diff is for.
  const run = (y: number, paint: string) =>
    `x="${x}" y="${y}" font-size="${fitted.fontSize}"` +
    ` font-weight="${element.weight ?? step.weight}"` +
    (element.letterSpacing === undefined
      ? ''
      : ` letter-spacing="${element.letterSpacing * fitted.fontSize}"`) +
    ` font-family="${family}" ${paint} text-anchor="${anchor}"` +
    ` direction="${direction}" unicode-bidi="isolate"`

  /**
   * The outline, and the rule that makes it look like one.
   *
   * **`paint-order="stroke fill"`, and the width doubled.** SVG centres a
   * stroke on the path, so half falls inside the glyph; painted in the default
   * order it eats the counters and the digits come out thin at exactly the size
   * a price is read. Stroke-first, the fill covers the inner half and what
   * survives is an outside outline of half the declared width — so
   * `stroke.width` means the outline you see. Line for line with `draw.tsx`,
   * which is the point of this file. E14 §2.4.
   */
  const outline =
    element.stroke === undefined
      ? ''
      : ` stroke="${resolveColor(element.stroke.color, color)}"` +
        ` stroke-width="${element.stroke.width * blockEdge * 2}"` +
        ` paint-order="stroke fill" stroke-linejoin="round"`

  // A glyph has no box to expand, so each ring is the string again under a
  // stroke of twice the step. Never a filter: `filter: drop-shadow()` over text
  // takes the font out of the PDF entirely — `harness/export-check.ts`.
  const shadow = element.shadow
  const rings =
    shadow === undefined
      ? []
      : shadowRings(
          {
            ...shadow,
            x: shadow.x * blockEdge,
            y: shadow.y * blockEdge,
            blur: shadow.blur * blockEdge,
          },
          rect,
          0,
          { scale: 1, dpi: 96 }
        )
  const shadowInk = shadow === undefined ? '' : resolveColor(shadow.color, color)

  /**
   * The side of the letters, as copies offset toward a vanishing point.
   *
   * **Behind the shadow as well as behind the face.** The shadow is cast by the
   * whole solid, so it belongs under all of it; drawing the side first would put
   * the cast shadow on top of the letters' own edge.
   *
   * `dpi: 96` here, as the rings above use: this file draws for a screen, and
   * `draw.tsx` passes the real surface.
   */
  const extrude = element.extrude
  const sides =
    extrude === undefined
      ? []
      : extrudeCopies(
          { x: extrude.x * blockEdge, y: extrude.y * blockEdge },
          { scale: 1, dpi: 96 }
        )
  const sideInk = extrude === undefined ? '' : resolveColor(extrude.color, color)
  const face = textFace(element)

  return fitted.lines
    .map((line, i) => {
      const y = rect.y + fitted.fontSize * (0.85 + i * fitted.lineHeight)
      const side = sides
        .map(
          (copy) =>
            `<text ${run(y + copy.dy, `fill="${sideInk}"`)}` +
            ` transform="translate(${copy.dx} 0)"` +
            `>${esc(line)}</text>`
        )
        .join('')
      const cast = rings
        .map(
          (ring) =>
            `<text ${run(y + (shadow?.y ?? 0) * blockEdge, `fill="${shadowInk}"`)}` +
            ` fill-opacity="${ring.alpha}"` +
            ` stroke="${shadowInk}" stroke-opacity="${ring.alpha}"` +
            ` stroke-width="${ring.rect.width - rect.width}"` +
            ` paint-order="stroke fill" stroke-linejoin="round"` +
            `>${esc(line)}</text>`
        )
        .join('')
      return (
        (i === 0 ? face.defs : '') +
        side +
        cast +
        `<text ${run(y, `fill="${fill}"`)}${outline}>${esc(line)}</text>`
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

/**
 * The subjects this page's vocabulary resolves against.
 *
 * **The adapter, and it is where the harness's fallbacks live** — `nameAr ??
 * nameEn`, the invented price, the absent columns. The resolver in
 * `src/bindings.ts` takes strings and knows nothing about a catalog row, which
 * is what stops this file and `draw.tsx` being two readings of one vocabulary.
 */
function subjectsFor(
  product: HarnessProduct | undefined,
  ctx: RenderContext
): BindingSubjects {
  const ar = ctx.direction === 'rtl'
  return {
    product:
      product === undefined
        ? undefined
        : {
            name: nameFor(product, ar),
            spec: specFor(product, ar),
            brand: brandFor(product),
            origin: originFor(product, ar),
            packSize: packFor(product),
          },
    offer:
      product === undefined
        ? undefined
        : {
            // The harness's rows carry invented prices. The major and the minor
            // are what the price mark would draw, joined the way a single bound
            // text run holds them — the fils is raised at paint, not here.
            price: product.minor ? `${product.major}.${product.minor}` : product.major,
            currency: product.currency,
            compare: product.comparePrice ?? '',
            tier: ar ? product.tier.labelAr : product.tier.labelEn,
            prefix: product.prefixLabel ? PREFIX_TEXT[product.prefixLabel] : '',
            unitPrice: product.unitPrice ?? '',
            ...saved(product),
          },
    shop: ctx.shop,
    brand: { name: ctx.brand.name },
    book: ctx.book,
    ar,
  }
}

/**
 * What the shop saved, computed the way the composer computes it.
 *
 * **Both empty when there is no was-price**, which is what makes "SAVE 20%"
 * conditional content without a predicate in the engine — §3.3. The frame
 * holding it collapses, and the gap beside it goes too.
 */
function saved(product: HarnessProduct): { saveAmount: string; savePercent: string } {
  const was = product.comparePrice === undefined ? NaN : Number(product.comparePrice)
  const now = Number(`${product.major}.${product.minor || '0'}`)
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= now) {
    return { saveAmount: '', savePercent: '' }
  }
  return {
    saveAmount: (was - now).toFixed(2),
    savePercent: `${Math.round(((was - now) / was) * 100)}%`,
  }
}

function resolveText(
  element: Extract<BlockElement, { kind: 'text' }>,
  product: HarnessProduct | undefined,
  ctx: RenderContext
): string {
  return resolveTextBinding(element.source, subjectsFor(product, ctx))
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
  // A gradient face resolves to a `url(#…)` and its definition is emitted
  // beside the run — see `textFace`. Flat stays a colour, as it always was.
  if (element.color !== undefined) return textFace(element).fill
  // `shop` is deliberately absent — see the note in `draw.tsx`. This file
  // matches it line for line, which is the point of it.
  if (element.source.from === 'static') return KIT.surface
  return element.level === 'caption' ? KIT.inkMuted : KIT.ink
}

/**
 * The face of a string: what it is filled with, and the definition that needs
 * to travel with it.
 *
 * **An opaque gradient is admissible on text and an alpha one is not** — the
 * ban `export-check.ts` carries is on the soft mask Chromium emits to carry
 * alpha, and an opaque gradient emits a shading pattern with no mask and leaves
 * the text as text. `TextFill` carries the measurement. The schema refuses a
 * stop with an `opacity`, so anything reaching here is already opaque.
 */
function textFace(element: Extract<BlockElement, { kind: 'text' }>): {
  fill: string
  defs: string
} {
  const value = element.color
  if (value === undefined) return { fill: '', defs: '' }

  const paint = resolvePaint(value, color)
  if (paint.kind === 'flat') return { fill: paint.css, defs: '' }

  const id = `tf-${element.id}`
  return {
    fill: `url(#${id})`,
    defs:
      `<defs><linearGradient id="${id}"` +
      ` x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}">` +
      paint.stops
        .map((stop) => `<stop offset="${stop.at}" stop-color="${stop.css}"/>`)
        .join('') +
      `</linearGradient></defs>`,
  }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function rounded(rect: Rect, fill: string, radius: number, opacity?: number): string {
  return (
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"` +
    ` rx="${radius}" fill="${fill}"` +
    (opacity === undefined ? '' : ` fill-opacity="${opacity}"`) +
    '/>'
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
