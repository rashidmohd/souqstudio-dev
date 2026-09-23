'use client'

import * as React from 'react'
import type {
  BlockElement,
  BrandColor,
  ColorValue,
  FlatColor,
  Shadow,
  TokenRef,
  TypeStep,
} from '@souqstudio/types'
import { SHADOW_PRESET_SPECS } from '@souqstudio/types'
import {
  chipPathShape,
  drawsGround,
  fitPolicy,
  layoutChipStack,
  fitText,
  layoutPriceMark,
  markGround,
  markRecipe,
  artTransform,
  needsEvenOdd,
  PATH_SHAPES,
  type ShapeOptions,
  placeText,
  PREFIX_TEXT,
  resolveColor,
  resolveImageBinding,
  resolvePaint,
  resolveTextBinding,
  extrudeCopies,
  shadowRings,
  shapeExtent,
  shapePath,
  type BindingSubjects,
  type ChipStackRow,
  type OfferField,
  type PathShape,
  type Rect,
  type TextMeasurer,
} from '@souqstudio/engine'
import { fontStack, type resolveScale } from '../../lib/font-catalog'
import { ARTBOARD_PLACEHOLDER, fromHex, readableInkOn } from '../../lib/color'
import type { ComposedOffer } from '../../lib/offer-book-compose'

/**
 * Painting one block element. The engine has already decided where it goes.
 *
 * **Extracted from `BlockPreview` when a second surface needed it**, which is
 * the moment the alternative became two implementations of the same card. The
 * block preview on `/brand` draws one seeded block against a sample product; the
 * editor draws a page of real offers. Same elements, same brand kit, same fit
 * ladder — only the rectangle and the product differ, and both are arguments.
 *
 * `packages/engine` exists so *where things go* has one implementation. This is
 * the matching rule for *how they are painted*: the export worker will need a
 * third, and it must not be a third reading of these rules.
 *
 * It computes no geometry. Every rectangle, font size, line break and price
 * position comes from the engine.
 */

/**
 * What a card draws from.
 *
 * Structurally `ComposedOffer` minus the bookkeeping, so the editor passes its
 * rows straight through and the preview adapts its sample product *into* the
 * same shape. A second product type here is how the preview and the real
 * artboard start disagreeing about what a card shows.
 */
export type ArtboardOffer = Pick<
  ComposedOffer,
  | 'name'
  | 'spec'
  | 'brand'
  // The country line and the pack line — two bindings that were declared and
  // drew nothing until E14 §3.5's test walked the vocabulary.
  | 'origin'
  | 'packSize'
  | 'imageUrl'
  // Shadowed renditions that exist, by preset. An image element naming one
  // draws it instead of `imageUrl` — E14 §2.4.
  | 'imageShadowUrls'
  | 'priceMark'
  | 'tierLabel'
  | 'tierToken'
  // What the shop saved. Resolved by the composer, empty when there is no
  // was-price, which is what makes "SAVE 20%" conditional content without a
  // predicate in the engine — §3.3 and §3.7.
  | 'saveAmount'
  | 'savePercent'
  | 'chips'
  // The `(1 kg = 1.76)` line, so it can be placed as its own layer rather than
  // only drawn under the card by whatever renders it.
  | 'unitPrice'
>

export type DrawContext = {
  /**
   * Unique to this surface, and it prefixes every id this painter puts in the
   * document — gradient definitions today. `React.useId()` at the surface is
   * what it is for: `/brand/blocks` draws many blocks on one page and two
   * copies of the same seed share element ids, so an unprefixed id would have
   * one card's ground painting another's.
   */
  uid: string
  /** A brand-kit slot — `primary`, `accent`, `ink` — resolved to the shop's colour. */
  token: (ref: TokenRef) => string
  /**
   * The shop's own palette, for elements that name a colour by id rather than
   * by role. Empty is fine: a seeded block never names one.
   */
  palette?: readonly BrandColor[]
  /**
   * Artwork the owner uploaded, by `image_assets` id. Absent on a surface that
   * has not loaded them — the element then draws nothing rather than a
   * placeholder, because "no photograph" is a fact about a *product*.
   */
  asset?: ((assetId: string) => string | null) | undefined
  scale: ReturnType<typeof resolveScale>
  blockSize: number
  ar: boolean
  direction: 'ltr' | 'rtl'
  measure: TextMeasurer
  /** Absent on a static block — a hero band or a footer has no product in scope,
   *  which is what `Block.repeats` means. */
  offer: ArtboardOffer | undefined
  /**
   * The shop this book is for, and the identity it carries.
   *
   * **This was one `shopName: string`**, which is exactly as much of the
   * vocabulary as this painter could answer. `shop.address` and `shop.phone`
   * were declared in `TextSource`, fell through to `''` here *and* in
   * `harness/svg.ts`, and agreed with each other and with nothing else — a
   * footer bound to the shop's phone number drew an empty box and said nothing
   * about why. E14 §3.4.
   *
   * `brand` is §3.2's single identity source: *the identity this book should
   * carry*, already resolved through `readEffectiveBrand` and `brandOverride`
   * by the surface, exactly as the artboard's colours are. There is no
   * `organization` entry and there must not be one — an owner asked to choose
   * between two logos picks wrong for half their branches.
   */
  shop: { name: string; address: string; phone: string }
  brand: { name: string; logo: string | null }
  /** The book's own facts. Dates are strings the composer resolved — §8. */
  book: { title: string; validFrom: string; validTo: string }
  /**
   * The surface's resolution, for the one thing that depends on it.
   *
   * **Only a shadow reads this**, and it reads it to decide how many concentric
   * rings it becomes: banding disappears once they are about a device pixel
   * apart, so the same shadow is roughly 16 paths on screen and 48 at 300 dpi.
   * Absent is a screen. E9's export sets 300. E14 §2.4.
   */
  dpi?: number | undefined
}

/** A colour the element named, in whichever of the three ways it named it. */
export const paint = (ctx: DrawContext, value: FlatColor): string =>
  resolveColor(value, ctx.token, ctx.palette ?? [])

/**
 * A fill that may be a gradient, and the definition it needs to exist.
 *
 * **SVG cannot take a gradient as an attribute value.** It takes `url(#id)` and
 * expects a `<linearGradient>` with that id somewhere in the same document — so
 * a fill is two things here where a flat colour was one, and the caller has to
 * render `defs` as well as apply `fill`.
 *
 * The definition is emitted **beside the shape rather than at the root of the
 * svg**. A `<linearGradient>` paints nothing itself and resolves document-wide
 * wherever it sits, so hoisting it to a single `<defs>` at the top would buy
 * nothing and cost a channel from every element back up to the surface — which
 * on the library page means threading state through sixty previews.
 *
 * `ctx.uid` is what keeps the id unique, and it has to. Ids are document-global,
 * `/brand/blocks` draws every block the shop owns on one page, and two of them
 * imported from the same seed carry the same element ids — so without a
 * per-surface prefix the second card's ground silently adopts the first card's
 * gradient. That failure looks like a rendering bug and is a naming one.
 */
export function fillPaint(
  ctx: DrawContext,
  value: ColorValue | undefined,
  slot: string
): { fill: string; defs: React.ReactNode } {
  // **Absent is `none`, not a colour.** A shape may be outline-only now — a
  // hairline rule box around a price, which used to be faked with one filled
  // rectangle sitting on another. `opacity` cannot express it, because it fades
  // the stroke along with the fill. E14 §2.4.
  if (value === undefined) return { fill: 'none', defs: null }
  return paintFill(value, {
    token: ctx.token,
    palette: ctx.palette ?? [],
    id: `${ctx.uid}-${slot}`,
  })
}

/**
 * The same thing, without a `DrawContext`.
 *
 * **Extracted because the page ground needs it and is not an element.** A
 * `PageBackground` is resolved by the same `resolvePaint` and emits the same
 * `<linearGradient>`, but it is painted by `BookPage` before any block exists —
 * there is no offer, no block size, no measurer, so there is no context to
 * build. Assembling a fake one to reach a colour would be worse than this split.
 *
 * Two gradient emitters is the thing being avoided here. There is one, and both
 * callers go through it.
 */
export function paintFill(
  value: ColorValue,
  ctx: {
    token: (ref: TokenRef) => string
    palette: readonly BrandColor[]
    /** Document-global, so it must be unique per surface. See the note above. */
    id: string
  }
): { fill: string; defs: React.ReactNode } {
  const resolved = resolvePaint(value, ctx.token, ctx.palette)
  if (resolved.kind === 'flat') return { fill: resolved.css, defs: null }

  const id = safeId(ctx.id)

  return {
    fill: `url(#${id})`,
    defs: (
      <defs>
        <linearGradient
          id={id}
          x1={resolved.x1}
          y1={resolved.y1}
          x2={resolved.x2}
          y2={resolved.y2}
        >
          {resolved.stops.map((stop, index) => (
            <stop key={index} offset={stop.at} stopColor={stop.css} stopOpacity={stop.opacity} />
          ))}
        </linearGradient>
      </defs>
    ),
  }
}

/**
 * An id safe to put inside `url(#...)`.
 *
 * **`React.useId()` returns colons** — `:R7b7rrqfj6:` — and every gradient id in
 * this product is built from one. A colon is legal in an HTML id and in a URI
 * fragment, and browsers do resolve the reference, so this is not a bug anyone
 * has watched happen. It is a hazard sitting on a path with no margin for one:
 *
 * - **`document.querySelector('#:r1:')` throws**, because a colon is a
 *   pseudo-class in CSS selector syntax. Nothing does that today. Anything that
 *   ever does — a test, a screenshot tool, a future renderer — fails oddly.
 * - **E9 renders these SVGs through Playwright rather than a browser tab**, and
 *   the print pipeline is the one place where a paint server that fails to
 *   resolve produces a flyer with a black rectangle on it.
 * - **No seeded block carries a gradient** (`usesOnlyRoles` refuses one), so
 *   until the page background shipped, this scheme had most likely never painted
 *   anything. It had no track record to trust.
 *
 * Stripping to alphanumerics and dashes costs nothing and removes the class.
 * Uniqueness survives: what makes an id unique is the `useId` counter, not its
 * punctuation.
 */
function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, '')
}

/**
 * One element, painted.
 *
 * **Rotation and opacity are applied here, once, around whatever the kind
 * draws.** Doing it per kind would be six places to forget it, and an element
 * that ignores its own rotation in one renderer and honours it in another is the
 * drift `packages/engine` exists to prevent. Rotation is about the element's own
 * centre, which is what an owner means by "turn it".
 */
export function drawElement(
  element: BlockElement,
  box: Rect,
  ctx: DrawContext
): React.ReactNode {
  const inner = drawInner(element, box, ctx)
  const rotation = element.rotation ?? 0
  const opacity = element.opacity ?? 1
  if (rotation === 0 && opacity === 1) return inner

  return (
    <g
      {...(rotation === 0
        ? {}
        : { transform: `rotate(${rotation} ${box.x + box.width / 2} ${box.y + box.height / 2})` })}
      {...(opacity === 1 ? {} : { opacity })}
    >
      {inner}
    </g>
  )
}

/**
 * How many rings a shadow becomes on this surface, and how dark each one is.
 *
 * **Derived at paint, never stored.** The same shadow is about 16 paths on a
 * screen and about 48 at 300 dpi, because banding disappears once the rings are
 * roughly a device pixel apart. `dpi` is what an export surface raises; the box
 * has already been scaled to output pixels by the time a painter has it, so `s`
 * is 1 here. E14 §2.4.
 */
const outputFor = (ctx: DrawContext) => ({ scale: 1, dpi: ctx.dpi ?? 96 })

/** The shadow's offsets and blur, as painted pixels rather than fractions. */
const shadowPx = (shadow: Shadow, ctx: DrawContext): Shadow => ({
  ...shadow,
  x: shadow.x * ctx.blockSize,
  y: shadow.y * ctx.blockSize,
  blur: shadow.blur * ctx.blockSize,
})

/**
 * A soft shadow, as concentric vector copies of the element's own silhouette.
 *
 * **Not a filter, and that is measured rather than preferred.** `feDropShadow`
 * and `feGaussianBlur` rasterize the element they are applied to at a
 * resolution Chromium picks and nothing in the document can set — about 220dpi
 * for a card on an A4 page, under the 300dpi target. `filter: drop-shadow()`
 * over text is worse: the font leaves the PDF and the price becomes a picture,
 * unselectable and resampled by any printer that reprocesses it.
 * `harness/export-check.ts` is that measurement and it still runs.
 *
 * Painted before the element, so it sits underneath.
 */
function ShadowLayer({
  shadow,
  box,
  ctx,
  element,
}: {
  shadow: Shadow
  box: Rect
  ctx: DrawContext
  element: BlockElement
}) {
  const css = paint(ctx, shadow.color)
  const rings = shadowRings(shadowPx(shadow, ctx), box, radiusOf(element), {
    ...outputFor(ctx),
    // The shop's own darkness when they set one. `shadowRings` already took a
    // `peak`; nothing was passing it, so every shadow accumulated to the
    // engine's constant and the only way to soften one was to lighten its
    // colour — which is how a shadow becomes a glow.
    ...(shadow.opacity === undefined ? {} : { peak: shadow.opacity }),
  })
  const path = element.kind === 'shape' ? asPathShape(element.variant) : null
  const ellipse = element.kind === 'shape' && element.variant === 'ellipse'
  // The shadow of a pentagon has five sides, and the shadow of a three-wave
  // header has three waves. Every parameter travels, or the shadow is a
  // different shape from the thing casting it.
  const shapeOptions: ShapeOptions = element.kind === 'shape' ? shapeParams(element) : {}

  /**
   * **An outline-only shape casts from its outline, not from its silhouette.**
   *
   * The rings are filled copies of the shape, which is right while the shape is
   * filled — and visibly wrong the moment it is not: the shadow shows *through*
   * the hole, so a hairline rule box comes out as a grey panel. What casts the
   * shadow is whatever draws, and on an unfilled shape that is the border.
   *
   * So each ring becomes the grown path *stroked* rather than filled. Constant
   * alpha accumulates the same way — the rule §2.4 derives — and a `blur: 0`
   * shadow is one offset outline, which is what it should be.
   */
  const outlineOnly =
    element.kind === 'shape' && element.fill === undefined && element.stroke !== undefined
  const outlineWidth =
    element.kind === 'shape' && element.stroke !== undefined
      ? element.stroke.width * ctx.blockSize
      : 0

  // Nothing draws, so nothing casts. An element with neither a fill nor a
  // border is not invisible-with-a-shadow, it is invisible.
  if (element.kind === 'shape' && element.fill === undefined && element.stroke === undefined) {
    return null
  }

  const ink = outlineOnly
    ? { fill: 'none', stroke: css, strokeWidth: outlineWidth }
    : { fill: css }

  return (
    <>
      {rings.map((ring, index) => {
        const key = `${element.id}-shadow-${index}`
        const alpha = outlineOnly ? { strokeOpacity: ring.alpha } : { fillOpacity: ring.alpha }
        // A twelve-point burst offsets by growing its radius and the shadow
        // follows its points, which is what makes this work on an arbitrary
        // path rather than only on a box.
        if (path !== null) {
          return (
            <path
              key={key}
              // `ring.radius` rather than the element's: a shadow ring is the
              // shape grown outward, and a corner that did not grow with it
              // draws a sharp shadow under a rounded polygon.
              d={shapePath(path, ring.rect, ctx.direction, {
                ...shapeOptions,
                radius: ring.radius,
              })}
              {...ink}
              {...alpha}
              {...(needsEvenOdd(path) && !outlineOnly ? { fillRule: 'evenodd' as const } : {})}
            />
          )
        }
        if (ellipse) {
          return (
            <ellipse
              key={key}
              cx={ring.rect.x + ring.rect.width / 2}
              cy={ring.rect.y + ring.rect.height / 2}
              rx={ring.rect.width / 2}
              ry={ring.rect.height / 2}
              {...ink}
              {...alpha}
            />
          )
        }
        return (
          <rect key={key} {...xywh(ring.rect)} rx={ring.radius} {...ink} {...alpha} />
        )
      })}
    </>
  )
}

/**
 * What a shadow's corners have to follow.
 *
 * **The three variants that have corners, rather than the absent variant
 * alone.** A rectangle that says so — which is every rectangle the palette
 * makes, since it writes `variant: 'rect'` — was answering 0 here and casting a
 * square-cornered shadow out from under its rounded self. A polygon rounds
 * through `shapePath`, so it needs the same number for the same reason. The
 * rest compute their own corners and take none.
 */
function radiusOf(element: BlockElement): number {
  if (element.kind === 'shape') {
    return element.variant === undefined ||
      element.variant === 'rect' ||
      element.variant === 'polygon'
      ? element.radius
      : 0
  }
  if (element.kind === 'image') return element.radius ?? 0
  return 0
}

/**
 * A text shadow, as the same rings — grown with a stroke rather than a box.
 *
 * **A glyph has no rectangle to expand**, so each ring is the string again at a
 * stroke twice the step width with `paint-order: stroke fill`, which grows the
 * outline outward by the step. The text stays text in the PDF, which is the
 * whole reason a filter is not used here.
 */
function textShadowRings(
  shadow: Shadow,
  box: Rect,
  ctx: DrawContext
): { dx: number; dy: number; width: number; alpha: number }[] {
  const px = shadowPx(shadow, ctx)
  return shadowRings(px, box, 0, outputFor(ctx)).map((ring) => ({
    dx: px.x,
    dy: px.y,
    // `shadowRings` grew the box by `grow` on every side; the same growth on a
    // glyph is a centred stroke of twice that.
    width: (ring.rect.width - box.width),
    alpha: ring.alpha,
  }))
}

/**
 * The shadowed rendition this element should draw, or null.
 *
 * **Three conditions, and each one has a reason.** The element has to name a
 * preset; the picture has to be the *product*, because that is the only source
 * whose pixels are rendered ahead of time by the pipeline that made the cutout;
 * and the rendition has to already exist, because a URL built optimistically is
 * a broken picture on a printed page. When any of them fails the element draws
 * its plain picture and — if it has one — its ring shadow.
 */
function tracedShadowUrl(element: BlockElement, ctx: DrawContext): string | null {
  if (element.kind !== 'image') return null
  const preset = element.shadowPreset
  if (preset === undefined || element.source.from !== 'product') return null
  return ctx.offer?.imageShadowUrls?.[preset] ?? null
}

/**
 * How much bigger the rendition is than its source, as a fraction of the
 * rendition's own width — which is what the drawn box has to grow by.
 *
 * The renderer pads by `pad` on each side of a source of width 1, so the
 * rendition is `1 + 2·pad` wide and the padding is `pad / (1 + 2·pad)` of it.
 */
function tracedGrowth(element: BlockElement): number {
  if (element.kind !== 'image' || element.shadowPreset === undefined) return 0
  const pad = SHADOW_PRESET_SPECS[element.shadowPreset].pad
  return pad / (1 + pad * 2)
}

function drawInner(element: BlockElement, box: Rect, ctx: DrawContext): React.ReactNode {
  /**
   * **The shadow is painted here rather than inside each kind**, so one
   * element cannot grow a second reading of the rule. Text is the exception and
   * paints its own: a glyph has no box to expand, so its rings are strokes on
   * the string rather than shapes behind it.
   */
  /**
   * **A traced shadow is drawn *into* the picture, so it cancels the rings.**
   * `shadowPreset` names a rendition whose shadow is already in its pixels;
   * drawing rings behind it as well would put a rounded rectangle under a
   * silhouette. The preset wins, which is what the field's own note promises.
   */
  const traced =
    element.kind === 'image' &&
    element.shadowPreset !== undefined &&
    tracedShadowUrl(element, ctx) !== null

  const shadow =
    !traced && (element.kind === 'shape' || element.kind === 'image')
      ? element.shadow
      : undefined

  const body = drawBody(element, box, ctx)
  if (shadow === undefined) return body

  return (
    <>
      <ShadowLayer shadow={shadow} box={box} ctx={ctx} element={element} />
      {body}
    </>
  )
}

function drawBody(element: BlockElement, box: Rect, ctx: DrawContext): React.ReactNode {
  switch (element.kind) {
    case 'shape':
      return <Shape element={element} box={box} ctx={ctx} />
    case 'image':
      return <Packshot element={element} box={box} ctx={ctx} />
    case 'logo':
      return <rect {...xywh(box)} rx={3} fill={ARTBOARD_PLACEHOLDER.onTint} />
    case 'chip':
      return <Chip element={element} box={box} ctx={ctx} />
    case 'priceMark':
      return <PriceMark element={element} box={box} ctx={ctx} />
    case 'text':
      return <Text element={element} box={box} ctx={ctx} />
  }
}

/**
 * A ground, a panel, a rule.
 *
 * Three variants rather than three element kinds, because they are the same
 * thing to everything downstream: a box with a fill. A line is the degenerate
 * case — it draws its stroke along its own middle and no fill at all, which is
 * what an owner dragging a divider expects.
 */
function Shape({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'shape' }>
  box: Rect
  ctx: DrawContext
}) {
  const stroke = element.stroke
  const strokeProps =
    stroke === undefined
      ? {}
      : { stroke: paint(ctx, stroke.color), strokeWidth: stroke.width * ctx.blockSize }

  // The only fill in the model that may be a gradient — see `ColorValue`. A
  // stroke, a chip and the price mark are flat by type, so `paint` still serves
  // them and no other kind grew a second code path.
  const { fill, defs } = fillPaint(ctx, element.fill, `${element.id}-fill`)

  if (element.variant === 'line') {
    return (
      <>
        {defs}
        <line
          x1={box.x}
          y1={box.y + box.height / 2}
          x2={box.x + box.width}
          y2={box.y + box.height / 2}
          stroke={fill}
          strokeWidth={Math.max(1, (stroke?.width ?? 0.004) * ctx.blockSize)}
          strokeLinecap="round"
        />
      </>
    )
  }

  if (element.variant === 'ellipse') {
    return (
      <>
        {defs}
        <ellipse
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          rx={box.width / 2}
          ry={box.height / 2}
          fill={fill}
          {...strokeProps}
        />
      </>
    )
  }

  /**
   * **The outline the owner uploaded**, scaled into the box they dragged.
   *
   * Before the computed shapes rather than after, because `asPathShape` does
   * not know this one and the fall-through below would draw their drawing as a
   * plain rectangle — the exact failure the note on that branch describes.
   *
   * `vector-effect` is what keeps a border honest. The outline is scaled by a
   * transform, so a border drawn on it would be scaled too, and a drawing
   * stretched wide would wear a stroke thick on one side and thin on the other.
   * Ignoring the transform for the stroke alone leaves its width in artboard
   * units, which is what it means on every other shape.
   */
  if (element.variant === 'art' && element.art !== undefined) {
    const art = element.art
    return (
      <>
        {defs}
        <g transform={artTransform(art, box)}>
          {art.paths.map((outline, index) => (
            <path
              // Index as the key: these are geometry in a fixed order, minted
              // once by the parser and never inserted into or reordered.
              key={index}
              d={outline.d}
              {...(outline.transform === undefined ? {} : { transform: outline.transform })}
              fill={fill}
              {...(outline.evenOdd === true ? { fillRule: 'evenodd' as const } : {})}
              {...strokeProps}
              {...(strokeProps.stroke === undefined
                ? {}
                : { vectorEffect: 'non-scaling-stroke' as const })}
            />
          ))}
        </g>
      </>
    )
  }

  // **Everything else is a path the engine computed**, and the branch is here
  // rather than in a `default` because falling through to the rectangle is what
  // this code did before the shapes existed: a burst drawn as a plain box, with
  // nothing failing and nothing to see but a card that came out wrong.
  const path = asPathShape(element.variant)
  if (path !== null) {
    return (
      <>
        {defs}
        <path
          d={shapePath(path, box, ctx.direction, shapeParams(element))}
          fill={fill}
          {...(needsEvenOdd(path) ? { fillRule: 'evenodd' as const } : {})}
          {...strokeProps}
        />
      </>
    )
  }

  return (
    <>
      {defs}
      <rect {...xywh(box)} rx={element.radius} fill={fill} {...strokeProps} />
    </>
  )
}

/**
 * What the owner set on a parametric shape, as the path function takes it.
 *
 * **One reader, called by the shape and by its shadow.** They were two spellings
 * of the same object and the shadow's was already a version behind — it carried
 * the side count and not the corner radius, so a rounded hexagon cast a sharp
 * one. A shape and its shadow disagreeing is the kind of thing nobody reports
 * and everybody notices.
 */
function shapeParams(element: Extract<BlockElement, { kind: 'shape' }>): ShapeOptions {
  return {
    sides: element.sides,
    curve: element.curve,
    waves: element.waves,
    tail: element.tail,
    radius: element.radius,
  }
}

/** The variant as a path shape, or null for the three that draw as elements. */
const asPathShape = (variant: string | undefined): PathShape | null =>
  variant !== undefined && (PATH_SHAPES as string[]).includes(variant)
    ? (variant as PathShape)
    : null

export const xywh = (r: Rect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })

/**
 * The product photo, or the placeholder that says there is not one.
 *
 * **The placeholder is not a failure state and must not look like one.** 4.2% of
 * the catalog has an image today, so a page of real offers is mostly this. It
 * reads as a reserved space rather than as a broken image, and the editor's
 * quality flag — `no-image` on the offer — is what actually tells the owner.
 *
 * `preserveAspectRatio` letterboxes rather than crops. A packshot cropped to fill
 * loses the top of the bottle, and the whole point of the CUTOUT variant is that
 * the product is the whole subject.
 */
function Packshot({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'image' }>
  box: Rect
  ctx: DrawContext
}) {
  // **Artwork the owner placed fills its box; a product photo is inset.** A
  // background image or a decorative panel is *meant* to reach the edges, and
  // the 12% breathing room that keeps a packshot off its card's border would
  // read as a mistake on both.
  const source = element.source
  const traced = tracedShadowUrl(element, ctx)
  const url =
    traced ??
    resolveImageBinding(source, {
      product: ctx.offer?.imageUrl ?? null,
      brandLogo: ctx.brand.logo,
      ...(ctx.asset === undefined ? {} : { asset: ctx.asset }),
    })
  // **A logo is artwork, not a packshot.** It reaches its box like an upload
  // does: a mark inset by 12% inside a header that was already sized for it
  // reads as a mark that did not fit. E14 §3.1 — the whole reason `logo`
  // stopped being its own kind is that every image property now applies to it,
  // and this is one of them.
  const artwork = source.from !== 'product'
  const inset = artwork ? 0 : Math.min(box.width, box.height) * 0.12
  const cover = element.fit === 'cover'

  /**
   * **A shadowed rendition is bigger than the picture it shadows**, by `pad` on
   * every side, so drawn into the same box the *product* would come out about
   * 40% smaller than its unshadowed neighbours. The box is grown by the same
   * proportion instead, which puts the product back at the size the layout
   * chose and lets the shadow fall outside — which is what §2.4 says a shadow
   * does: it is paint, and the box is layout.
   */
  const grow = traced === null ? 0 : tracedGrowth(element)
  const drawn = {
    x: box.x + inset - (box.width - inset * 2) * grow,
    y: box.y + inset - (box.height - inset * 2) * grow,
    width: (box.width - inset * 2) * (1 + grow * 2),
    height: (box.height - inset * 2) * (1 + grow * 2),
  }

  if (url !== null) {
    /**
     * **`ctx.uid` is what keeps this unique, for the reason `fillPaint` states
     * one screen above.** `element.id` is the *template's* id, so every card
     * drawn from a repeating block carries the same one — `photo` on all nine
     * cards of a page. Ids are document-global, so nine `clip-photo`
     * definitions resolve to whichever came first, and every card after the
     * first clipped its packshot to the *first card's* box. The box does not
     * overlap them, so the image loaded, decoded and painted nothing.
     *
     * It only shows on a `cover` element: `contain` emits no clipPath at all,
     * which is why the seeded blocks never tripped it and a full-bleed card
     * does.
     */
    const clip = safeId(`${ctx.uid}-clip-${element.id}`)
    return (
      <>
        {/* `cover` crops, so it has to be clipped to its own box or the
            overflow paints across the card. `contain` cannot overflow. */}
        {cover ? (
          <defs>
            <clipPath id={clip}>
              <rect {...xywh(box)} rx={element.radius ?? 0} />
            </clipPath>
          </defs>
        ) : null}
        <image
          x={drawn.x}
          y={drawn.y}
          width={drawn.width}
          height={drawn.height}
          href={url}
          preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
          {...(cover ? { clipPath: `url(#${clip})` } : {})}
        />
      </>
    )
  }

  /**
   * **A shop with no logo yet gets a reserved slot, not nothing.**
   *
   * It is the common case on day one, and §8 leaves "what a missing logo draws"
   * open between collapsing and reserving. Reserving is what this answers,
   * because the alternative is an element that cannot be seen and therefore
   * cannot be positioned — a header designed around a hole the owner never
   * sees. Translucent rather than the packshot's grey: a mark sits on a
   * footer's ink band or a hero's tint almost every time, and an opaque light
   * box there reads as a broken image. `harness/svg.ts` draws the same thing.
   */
  if (source.from === 'brand') {
    return <rect {...xywh(box)} rx={element.radius ?? 3} fill={ARTBOARD_PLACEHOLDER.onTint} />
  }

  // Artwork the owner uploaded that has not loaded draws nothing rather than a
  // grey box: the placeholder below says "this product has no photograph",
  // which is a fact about the catalog, and saying it about a background the
  // owner chose would be wrong.
  if (artwork) return null

  return (
    <>
      <rect {...xywh(box)} rx={3} fill={ARTBOARD_PLACEHOLDER.imageOuter} />
      <rect
        x={box.x + inset}
        y={box.y + inset}
        width={box.width - inset * 2}
        height={box.height - inset * 2}
        rx={3}
        fill={ARTBOARD_PLACEHOLDER.imageInner}
      />
    </>
  )
}

/**
 * The promo tier badge.
 *
 * **Its colour comes from a different vocabulary than everything else here.** A
 * block element names a brand-kit slot; a promo tier names a `--sq-tpl-*`
 * template token, because a "Half price" flash that is sand on one account and
 * navy on another stops reading as a discount. So this is the one fill on the
 * artboard that resolves through CSS rather than through the palette.
 *
 * **That works in a browser and will not work in the PDF pipeline**, which has
 * no stylesheet. `docs/E6-pending.md` §6 carries the decision that is still open.
 */
function Chip({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'chip' }>
  box: Rect
  ctx: DrawContext
}) {
  const tier = ctx.offer?.tierLabel ?? ''
  const extra = ctx.offer?.chips ?? []
  if (tier === '' && extra.length === 0) return null

  // **The block's chip element is a slot, and the stack grows from it.** A block
  // carries one chip element; an offer may carry the tier plus up to four
  // authored chips, and E6 §7 puts all of them at the top of the z-order. So the
  // tier draws in the box the block gave it and the rest stack below, one box
  // height apart.
  //
  // This is a rendering decision rather than something the model states, and the
  // alternative is a `chipStack` element kind in the block designer — see
  // `docs/E6-pending.md` and `docs/offer-chip-design.md`. The geometry itself is
  // `layoutChipStack`'s, in the engine, so the gallery cannot draw this one way
  // and the page another. It used to be here, and they did.
  const shape = element.shape ?? 'pill'
  const rows: ChipStackRow[] = []
  // Colour stays the painter's: it resolves brand and template tokens the engine
  // has no access to. Keyed by row, so the two lists cannot fall out of step.
  const fills = new Map<string, string>()

  /**
   * What the label reads in.
   *
   * **An owner's choice, then contrast, then the old rule.** The badge drew in
   * the surface colour unconditionally, which is right for a saturated tier tint
   * and invisible on a pale one — and an owner who picks a pale badge gets a
   * badge with nothing written on it and no control that would have fixed it.
   *
   * The automatic branch only fires on a colour this can actually read: a tier
   * token resolves to `var(--sq-…)`, which has no luminance until the browser
   * paints it. That case keeps the old answer, which is the one it was designed
   * for anyway.
   */
  const inkFor = (badge: string): string => {
    if (element.ink !== undefined) return paint(ctx, element.ink)

    // **With no badge behind it, the badge's colour becomes the text's.** It is
    // the colour the owner already chose for this thing, and the alternative —
    // falling through to a readable ink over a ground that is not there — would
    // compute contrast against a rectangle nobody can see.
    if (!drawsGround(shape)) return badge

    const rgb = fromHex(badge)
    return rgb === null ? ctx.token('surface') : readableInkOn(rgb)
  }

  if (tier !== '') {
    rows.push({ key: 'tier', label: tier, align: 'start' })
    // The element's own fill wins over the tier's colour: an owner who picked
    // one has said what they want, and the tier token is the default for a
    // block that has never met this shop.
    fills.set(
      'tier',
      element.fill !== undefined
        ? paint(ctx, element.fill)
        : ctx.offer?.tierToken
          ? `var(${ctx.offer.tierToken})`
          : ctx.token('accent')
    )
  }

  for (const chip of extra) {
    rows.push({
      key: chip.id,
      label: chip.label,
      align: chip.anchor === 'TOP_END' ? 'end' : 'start',
    })
    // Not the tier's colour. A "Half price" flash and a "Limit 2" note are
    // different kinds of statement, and giving them one colour makes the
    // discount look like small print.
    fills.set(chip.id, ctx.token('secondary'))
  }

  const placed = layoutChipStack(rows, box, shape, ctx.direction, ctx.measure)

  return (
    <>
      {placed.map((row) => {
        // Every number here is `layoutChipStack`'s. The painter's job is paint:
        // a badge whose geometry is decided in two places is a badge the gallery
        // and the page draw differently, which is what this had become.
        const badge: Rect = row.rect
        const path = chipPathShape(shape)
        const fill = fills.get(row.key) ?? ctx.token('secondary')

        return (
          <React.Fragment key={row.key}>
            {!drawsGround(shape) ? null : path === null ? (
              <rect {...xywh(badge)} rx={box.height / 2} fill={fill} />
            ) : (
              <path
                d={shapePath(path, badge, ctx.direction)}
                fill={fill}
                {...(needsEvenOdd(path) ? { fillRule: 'evenodd' as const } : {})}
              />
            )}
            <text
              x={badge.x + badge.width / 2}
              y={badge.y + badge.height / 2}
              fontSize={row.fontSize}
              fontWeight={700}
              fill={inkFor(fill)}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {row.label}
            </text>
          </React.Fragment>
        )
      })}
    </>
  )
}

/**
 * Drawn from `layoutPriceMark`. The raised minor, the attached tab and the LTR
 * ordering that survives an Arabic edition are all decided there, not here.
 */
/**
 * The price mark.
 *
 * **What is drawn here is styling; what is decided in `layoutPriceMark` is
 * composition, and the split is the whole point.** The raised minor, the
 * attached tab, the three-decimal branch and the LTR ordering that survives an
 * Arabic edition are the engine's and are not open to an owner — E6 §3. The
 * colour of the tab, the ground it sits on, whether there is a frame at all:
 * those are the shop's brand, and refusing them is what made the mark feel like
 * somebody else's component sitting in the middle of their card.
 */
function PriceMark({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'priceMark' }>
  box: Rect
  ctx: DrawContext
}) {
  if (ctx.offer === undefined) return null

  const style = element.style ?? {}

  /**
   * The mark's palette, resolved slot by slot.
   *
   * **Narrow slot, then broad slot, then what the painter used to hard-code.**
   * Three colours were drawing seven parts and three of the seven — the
   * currency, the was-price and the FROM line — had no control at any price;
   * `PriceMarkStyle` now carries one field each, and every one of them resolves
   * through the value it replaced. So a block authored before today draws the
   * same pixels, and a shop that wants a red was-price sets one field.
   */
  const tint =
    style.tint !== undefined
      ? paint(ctx, style.tint)
      : ctx.offer.tierToken
        ? `var(${ctx.offer.tierToken})`
        : ctx.token('accent')
  const ink = style.ink === undefined ? ctx.token('ink') : paint(ctx, style.ink)
  const ground = style.surface === undefined ? ctx.token('surface') : paint(ctx, style.surface)

  /** A slot, or the colour that slot used to be welded to. */
  const slot = (value: FlatColor | undefined, fallback: string): string =>
    value === undefined ? fallback : paint(ctx, value)

  const muted = ctx.token('inkMuted')
  const majorInk = slot(style.majorInk, ink)
  const minorInk = slot(style.minorInk, ink)
  const currencyInk = slot(style.currencyInk, muted)
  const compareInk = slot(style.compareInk, muted)
  const prefixInk = slot(style.prefixInk, muted)
  const groundFill = slot(style.groundFill, ground)
  const groundStroke = slot(style.groundStroke, tint)
  const tabFill = slot(style.tabFill, tint)
  // **The old default, deliberately.** A tab's label reading in the ground
  // colour is right for a saturated tab on a pale ground and invisible when the
  // two are the same — which is why the slot exists. Changing the *default*
  // would redraw every block already published, so the fix is offered rather
  // than imposed; `ElementProperties` warns when the two resolve alike.
  const tabInk = slot(style.tabInk, groundFill)
  const family = fontStack(ctx.scale.families.price)

  const l = layoutPriceMark(ctx.offer.priceMark, box, {
    tierLabel: ctx.offer.tierLabel.toUpperCase(),
    // The shape kit, which the mark was the one element denied. `markGround`
    // reads the old `frame` spelling too, so a document written before this
    // draws exactly as it did.
    ground: markGround(style),
    // The interior arrangement. `markRecipe` merges the preset with the
    // owner's overrides and applies every bound, so the painter never sees a
    // half-specified recipe and there is one place the defaults live.
    recipe: markRecipe(style),
  })

  return (
    <>
      {l.tab && style.tab !== 'none' ? (
        <>
          <rect {...xywh(l.tab.rect)} rx={l.tab.rect.height / 2} fill={tabFill} />
          <text
            x={l.tab.rect.x + l.tab.rect.width / 2}
            y={l.tab.rect.y + l.tab.rect.height / 2}
            fontSize={l.tab.fontSize}
            fontWeight={700}
            fill={tabInk}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {l.tab.text}
          </text>
        </>
      ) : null}

      {/*
        * The ground, drawn as whatever shape it asked for.
        *
        * **One `d` string, from the same generator the badge uses.** A burst
        * here and a burst on a chip have to be the same burst, and a second
        * implementation is how the screen and the PDF stop matching — which is
        * the whole reason `shapes.ts` lives in the engine.
        *
        * **`ltr`, never the edition's direction.** The mark does not mirror —
        * E6 §6, and `price-mark.test.ts` asserts the pieces lay out start to
        * end at every size. A ribbon or an arrow flipped for an Arabic edition
        * would point away from digits that had not moved.
        */}
      {l.groundShape === 'none' ? null : l.groundShape === 'box' ? (
        <>
          <rect {...xywh(l.mark)} rx={3} fill={groundFill} />
          <rect
            {...xywh(l.mark)}
            rx={3}
            fill="none"
            stroke={groundStroke}
            strokeWidth={Math.max(1, l.mark.height * 0.035)}
          />
        </>
      ) : (
        <>
          <path d={shapePath(l.groundShape, l.mark, 'ltr')} fill={groundFill} />
          <path
            d={shapePath(l.groundShape, l.mark, 'ltr')}
            fill="none"
            stroke={groundStroke}
            strokeWidth={Math.max(1, l.mark.height * 0.035)}
          />
        </>
      )}

      {/* Western numerals, LTR, in an Arabic edition too. E6 §6. */}
      <text
        x={l.currency.x}
        y={l.currency.baseline}
        fontSize={l.currency.fontSize}
        fontWeight={700}
        fontFamily={family}
        fill={currencyInk}
        direction="ltr"
      >
        {l.currency.text}
      </text>
      <text
        x={l.major.x}
        y={l.major.baseline}
        fontSize={l.major.fontSize}
        fontWeight={800}
        fontFamily={family}
        fill={majorInk}
        direction="ltr"
      >
        {l.major.text}
      </text>
      {l.minor ? (
        <text
          x={l.minor.x}
          y={l.minor.baseline}
          fontSize={l.minor.fontSize}
          fontWeight={800}
          fontFamily={family}
          fill={minorInk}
          direction="ltr"
        >
          {l.minor.text}
        </text>
      ) : null}
      {l.compare ? (
        <text
          x={l.compare.x}
          y={l.compare.baseline}
          fontSize={l.compare.fontSize}
          fontFamily={family}
          fill={compareInk}
          textDecoration="line-through"
          direction="ltr"
        >
          {l.compare.text}
        </text>
      ) : null}
      {/*
        * FROM / EACH / PER KG.
        *
        * **The engine has always laid this out and this painter never drew
        * it**, so an offer priced per kilo said so in the render harness and
        * said nothing in the app — on all four surfaces, since all four share
        * this painter. It is not a recipe feature; it is the gap the recipe
        * work found, and a unit-priced offer that does not name its unit is a
        * price that means nothing.
        */}
      {l.prefix ? (
        <text
          x={l.prefix.x}
          y={l.prefix.baseline}
          fontSize={l.prefix.fontSize}
          fontWeight={700}
          fontFamily={family}
          fill={prefixInk}
          direction="ltr"
        >
          {l.prefix.text}
        </text>
      ) : null}
    </>
  )
}

/**
 * The fit this element gets, or null when it draws nothing.
 *
 * **Exported because the editor has to know what the ladder *did*, not only
 * what it produced.** `fit-escalated` is a quality flag an owner must see
 * before a book prints, and it is a property of a rendered card at a particular
 * size rather than of the offer. It cannot be read back out of the painted
 * output, and a second ladder beside this one would be two answers that can
 * disagree — so the caller runs this one.
 */
export function fitTextElement(
  element: Extract<BlockElement, { kind: 'text' }>,
  box: Rect,
  ctx: DrawContext
): { content: string; fitted: ReturnType<typeof fitText>; step: TypeStep } | null {
  const content = contentFor(element, ctx)
  if (content === '') return null

  const level = ctx.scale.levels[element.level]
  // **The element's own typography wins over the level's**, per field rather
  // than all-or-nothing: an owner who set a weight has not thereby chosen a
  // face, and a size set by hand still steps down the ladder when the string is
  // long. Setting none of them is what "snap to the brand scale" means.
  const step: TypeStep = {
    ...level,
    ...(element.family === undefined ? {} : { family: element.family }),
    ...(element.weight === undefined ? {} : { weight: element.weight }),
    ...(element.letterSpacing === undefined ? {} : { letterSpacing: element.letterSpacing }),
    ...(element.transform === undefined ? {} : { transform: element.transform }),
  }

  // The block's declared policy wins over the derived one. It is what the
  // designer's overflow control writes, and it travels in the block so every
  // renderer reads the same answer.
  const policy = fitPolicy(element.source, element.overflow)

  const fitted = fitText({
    text: step.transform === 'uppercase' ? content.toUpperCase() : content,
    box: { width: box.width, height: box.height },
    level: element.level,
    scale: ctx.scale,
    blockSize: ctx.blockSize,
    measure: ctx.measure,
    truncatable: policy.truncatable,
    /*
     * **The merged step's, not the level's.** `step` above is the level
     * overlaid with whatever the element set, and it is what the `<text>`
     * below is rendered with — so it has to be what the ladder measures with
     * too. The uppercase brand line tracked at 0.08em is the visible case:
     * unmeasured, it draws about 8% per character wider than it was wrapped
     * for.
     */
    style: {
      weight: step.weight,
      ...(step.letterSpacing === undefined ? {} : { letterSpacing: step.letterSpacing }),
    },
    ...(element.size === undefined ? {} : { size: element.size }),
    ...(policy.floor === undefined ? {} : { floor: policy.floor }),
    ...(policy.maxLines === undefined ? {} : { maxLines: policy.maxLines }),
  })

  return { content, fitted, step }
}

/**
 * Where an element's paint actually lands inside its box.
 *
 * **The box is the layout and it is not always the picture.** A caption in a
 * tall box draws one line at the top of it; a packshot is inset by 12% and then
 * letterboxed inside that. The designer's selection outline is the box —
 * correctly, because the box is what a handle moves — so on those two kinds the
 * ring can sit a long way from anything the owner can see, and the only way to
 * tell what is selected is to drag it and watch what moves.
 *
 * This is the other half of that answer: the canvas draws it as a faint inner
 * mark, so the ring keeps saying *what will resize* while the mark says *what
 * is there*. It lives beside the painter rather than in the designer because it
 * is a statement about what the painter does, and a second reading of that in a
 * component is a second reading that will drift.
 *
 * `null` means the element fills its box, so there is nothing extra to say. A
 * `contain` image is a third case and deliberately not answered: where it
 * letterboxes depends on the file's own proportions, which nothing here has
 * until the browser has fetched it.
 */
export function paintedRect(element: BlockElement, box: Rect, ctx: DrawContext): Rect | null {
  if (element.kind === 'text') {
    const measured = fitTextElement(element, box, ctx)
    if (measured === null) return null

    const { content, fitted, step } = measured
    const family = fontStack(ctx.scale.families[step.family])
    const { anchor, x, direction } = placeText(content, element.align, box, ctx.direction)

    // The tracking, added here exactly as `advance` adds it in the engine — the
    // measurer is told the weight and never the letter spacing, or the width
    // would be counted twice.
    const tracking = step.letterSpacing ?? 0
    const widest = fitted.lines.reduce(
      (widest, line) =>
        Math.max(
          widest,
          ctx.measure(line, fitted.fontSize, family, { weight: step.weight }) +
            tracking * fitted.fontSize * line.length
        ),
      0
    )

    // `start` is the start of the *string*, which is the right edge when the
    // string reads right to left — the same reconciliation `placeText` makes,
    // read back the other way.
    const atLeft = (anchor === 'start') === (direction === 'ltr')
    return {
      x: anchor === 'middle' ? x - widest / 2 : atLeft ? x : x - widest,
      y: box.y,
      width: widest,
      height: fitted.lines.length * fitted.fontSize * fitted.lineHeight,
    }
  }

  // **A shape that holds its proportion draws in the largest square in its
  // box**, which on a 3:1 panel is the middle third of it. `shapeExtent` is the
  // engine's own answer, so the mark cannot drift from the drawing.
  if (element.kind === 'shape') {
    const path = asPathShape(element.variant)
    return path === null ? null : shapeExtent(path, box)
  }

  // The packshot's breathing room, from `Packshot` — artwork and logos reach
  // their box and are not inset, so they have nothing to report.
  if (element.kind === 'image' && element.source.from === 'product') {
    const inset = Math.min(box.width, box.height) * 0.12
    return {
      x: box.x + inset,
      y: box.y + inset,
      width: box.width - inset * 2,
      height: box.height - inset * 2,
    }
  }

  return null
}

function Text({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  box: Rect
  ctx: DrawContext
}) {
  const measured = fitTextElement(element, box, ctx)
  if (measured === null) return null

  const { content, fitted, step } = measured
  const family = fontStack(ctx.scale.families[step.family])

  // Position, anchor and direction together, from the engine. They cannot be
  // decided separately: `start` and `end` resolve against the *element's* own
  // direction, so a Latin pack label on an Arabic artboard anchored by the
  // page's reading order draws out through the edge of its box.
  const { anchor, x, direction } = placeText(content, element.align, box, ctx.direction)

  // A colour the owner picked wins outright. Otherwise the old rule stands:
  // static and shop text sits on a tinted band and reads in the surface colour,
  // a caption is muted, everything else is ink.
  /**
   * Whether this line is drawn in the surface colour rather than the ink.
   *
   * **`shop` used to be in here and that was a guess about the ground.** A
   * shop's name, address and phone were assumed to sit on a tinted band,
   * because in the seeded library they usually do — so they were painted white
   * whatever was behind them. The moment an owner drags a shop line onto a
   * plain card in the designer it is white on white, and the library itself
   * was already arguing with the rule: most `shopField` calls passed
   * `color: 'ink'` explicitly to get out from under it, and the six that did
   * not now say `color: 'surface'` instead of relying on it.
   *
   * `static` stays, for now, because eighty-one seeded lines depend on it and
   * unpicking those is a library change rather than a painter one. It has the
   * same defect and it is on the same list.
   *
   * The real answer is to decide the ink from what is *behind* the text —
   * `readableInkOn` already exists — but the painter draws one element at a
   * time and has no sibling in scope. Whoever resolves the block does; that is
   * where it belongs.
   */
  const onTint = element.source.from === 'static'

  /**
   * A rule through the text — whatever the owner set, and nothing else.
   *
   * **It does not read the binding.** It briefly did: a layer showing the
   * was-price struck itself because the painter recognised the source. That is
   * the system making a design decision the owner is looking straight at on the
   * canvas, and worse, one they had no control to reverse. Strikethrough is a
   * formatting option like bold — it belongs to the layer, not to what the
   * layer happens to be bound to.
   */
  const struck = element.decoration === 'line-through'

  /**
   * The face of the glyphs — a flat colour, or an opaque gradient down them.
   *
   * **A gradient is admissible here and an alpha one is not.** What
   * `export-check.ts` bans is the page-sized soft mask Chromium emits to carry a
   * stop's alpha, at a resolution nothing in the document can set. An opaque
   * gradient emits a shading pattern instead: vector, no mask, and the price is
   * still text — 5.1 kB against 4.7 kB flat, measured. `TextFill` in
   * `@souqstudio/types` carries the numbers; the schema refuses a stop with an
   * `opacity`, so anything arriving here is already opaque.
   *
   * It is also the cheapest three-dimensional cue there is, and the one every
   * retail price ticket already wears.
   */
  const face =
    element.color === undefined
      ? null
      : paintFill(element.color, { token: ctx.token, palette: ctx.palette ?? [], id: `${ctx.uid}-tf` })

  const fill =
    face !== null
      ? face.fill
      : onTint
        ? ctx.token('surface')
        : element.level === 'caption'
          ? ctx.token('inkMuted')
          : ctx.token('ink')

  /**
   * Everything that positions a run, shared by the text, its outline and its
   * shadow — so three copies of a line cannot drift apart by a letter.
   */
  const runProps = (i: number) => ({
    x,
    y: box.y + fitted.fontSize * (0.85 + i * fitted.lineHeight),
    fontSize: fitted.fontSize,
    fontWeight: step.weight,
    fontFamily: family,
    textAnchor: anchor,
    direction,
    ...(element.italic === true ? { fontStyle: 'italic' as const } : {}),
    ...(step.letterSpacing === undefined
      ? {}
      : { letterSpacing: step.letterSpacing * fitted.fontSize }),
  })

  /**
   * The outline, and the one rule that makes it look like one.
   *
   * **`paint-order: stroke fill`, and the width doubled.** SVG centres a stroke
   * on the path, so half of it falls *inside* the glyph. Painted in the default
   * order it eats the counters and the digits come out thin and muddy at
   * exactly the size a price is read; painted stroke-first the fill covers the
   * inner half and what survives is an outside outline of half the declared
   * width — so the declared width is doubled here and `stroke.width` means the
   * outline the owner sees. Chromium supports the property, so Playwright does,
   * and `export-check.ts` proves the text stays text in the PDF. E14 §2.4.
   */
  const outline = element.stroke
  const outlineProps =
    outline === undefined
      ? {}
      : {
          stroke: paint(ctx, outline.color),
          strokeWidth: outline.width * ctx.blockSize * 2,
          paintOrder: 'stroke fill',
          strokeLinejoin: 'round' as const,
        }

  // A glyph has no box to expand, so each ring is the string again under a
  // stroke of twice the step — which grows the outline outward by the step.
  const shadow = element.shadow
  const rings = shadow === undefined ? [] : textShadowRings(shadow, box, ctx)
  const shadowInk = shadow === undefined ? '' : paint(ctx, shadow.color)

  /**
   * The side of the letters, as copies of the string offset toward a vanishing
   * point — an extrusion.
   *
   * **Copies, never a filter, and that is what makes it affordable.** A ring is
   * the string again under a *stroke* and Chromium outlines stroked text into
   * path geometry, which is the 24 kB a ring that makes a blurred text shadow
   * impossible. A copy carries no stroke: it is another text run, the font stays
   * in the PDF, and it costs about a fifth of a kilobyte. The whole effect —
   * eight copies, a gradient face and an outline — measured 17.3 kB for one
   * price, against the 274 kB page of ringed bursts this product already prints.
   *
   * **How many copies is decided here rather than stored**, from the same
   * `outputFor(ctx)` the rings use: how many it takes to read as solid depends
   * on the surface, and a stored count is a price that looks right on screen and
   * striped at 300 dpi.
   *
   * **Drawn under the cast shadow as well as under the face.** The shadow is
   * cast by the whole solid, so it belongs beneath all of it.
   */
  const extrude = element.extrude
  const sides =
    extrude === undefined
      ? []
      : extrudeCopies(
          { x: extrude.x * ctx.blockSize, y: extrude.y * ctx.blockSize },
          outputFor(ctx)
        )
  const sideInk = extrude === undefined ? '' : paint(ctx, extrude.color)

  return (
    <>
      {face?.defs}
      {fitted.lines.map((line, i) =>
        sides.map((copy, c) => (
          <text
            key={`e-${i}-${c}`}
            {...runProps(i)}
            x={x + copy.dx}
            y={box.y + fitted.fontSize * (0.85 + i * fitted.lineHeight) + copy.dy}
            fill={sideInk}
          >
            {line}
          </text>
        ))
      )}
      {fitted.lines.map((line, i) =>
        rings.map((ring, r) => (
          <text
            key={`s-${i}-${r}`}
            {...runProps(i)}
            x={x + ring.dx}
            y={box.y + fitted.fontSize * (0.85 + i * fitted.lineHeight) + ring.dy}
            fill={shadowInk}
            fillOpacity={ring.alpha}
            stroke={shadowInk}
            strokeOpacity={ring.alpha}
            strokeWidth={ring.width}
            paintOrder="stroke fill"
            strokeLinejoin="round"
          >
            {line}
          </text>
        ))
      )}
      {fitted.lines.map((line, i) => (
        <text
          key={i}
          {...runProps(i)}
          fill={fill}
          {...outlineProps}
          {...(struck ? { textDecoration: 'line-through' } : {})}
        >
          {line}
        </text>
      ))}
    </>
  )
}

/**
 * The string an element binds to.
 *
 * A `product` field on a static block resolves to nothing rather than to a
 * placeholder — a footer has no product in scope, which is what `repeats: false`
 * means, and drawing sample text there would invent content the book does not
 * have.
 */
/**
 * What a text element says.
 *
 * **Exported because it was written twice.** `BookPage` had its own copy for a
 * line-count estimate, and adding the offer tier to the vocabulary made that
 * copy return `undefined` for the new source — caught by the compiler here and
 * only because the return type is declared. A second reading of "what does this
 * text show" is the same class of divergence `packages/engine` exists to stop,
 * arriving in the app rather than in a renderer.
 */
/**
 * The subjects this artboard's vocabulary resolves against.
 *
 * **The adapter, and it is where this surface's fallbacks live** — the
 * currency label the shop chose, the empty-rather-than-zero was-price. The
 * resolver in `@souqstudio/engine` takes strings and knows nothing about a
 * `ComposedOffer`, which is what stops this file and `harness/svg.ts` being two
 * readings of one vocabulary. E14 §3.5.
 */
function subjectsFor(ctx: DrawContext): BindingSubjects {
  const offer = ctx.offer
  return {
    product:
      offer === undefined
        ? undefined
        : {
            name: offer.name,
            spec: offer.spec ?? '',
            brand: offer.brand ?? '',
            origin: offer.origin ?? '',
            packSize: offer.packSize ?? '',
          },
    offer: offer === undefined ? undefined : offerSubjects(offer),
    shop: ctx.shop,
    brand: { name: ctx.brand.name },
    book: ctx.book,
    ar: ctx.ar,
  }
}

/**
 * The offer's own words, as strings.
 *
 * Its own function rather than a nested literal: exhaustiveness over
 * `OfferField` is what makes adding a binding safe, and the compiler names the
 * missing key here rather than letting it resolve to `undefined` at runtime.
 */
function offerSubjects(offer: ArtboardOffer): Record<OfferField, string> {
  return {
    // The digits, joined the way a single bound run holds them. The fils is
    // raised against the glyphs at paint — it is kerning, not layout, so it
    // never becomes a second element. E14 §4.
    price: offer.priceMark.minor
      ? `${offer.priceMark.major}.${offer.priceMark.minor}`
      : offer.priceMark.major,
    // The label the shop chose — its symbol, or the ISO code. Resolved by the
    // composer, so this and the price mark cannot disagree about it.
    currency: offer.priceMark.currencyLabel ?? offer.priceMark.currency,
    // **Empty rather than a zero when there is no was-price**, and the
    // difference matters: a card with nothing to compare against draws no line
    // at all, where "0.00" struck through is a claim about a price.
    compare: offer.priceMark.comparePrice ?? '',
    prefix:
      offer.priceMark.prefixLabel === undefined ? '' : PREFIX_TEXT[offer.priceMark.prefixLabel],
    tier: offer.tierLabel,
    unitPrice: offer.unitPrice ?? '',
    // Computed by the composer, empty when there is no was-price. This is what
    // makes "SAVE 20%" conditional content without a predicate in the engine.
    saveAmount: offer.saveAmount ?? '',
    savePercent: offer.savePercent ?? '',
  }
}

export function contentFor(
  element: Extract<BlockElement, { kind: 'text' }>,
  ctx: DrawContext
): string {
  return resolveTextBinding(element.source, subjectsFor(ctx))
}

// ─── Measuring ────────────────────────────────────────────────────────────────

/**
 * What the server and the first client paint both use.
 *
 * Crude, and it has to be: it must produce the same answer in Node and in the
 * browser or the two renders disagree and React reports a hydration mismatch.
 */
export const estimateWidth: TextMeasurer = (text, fontSize, _family, style) =>
  // A bold face is wider, and the estimator is what runs on the server and in
  // tests — so it carries the same lean the real measurement does, or the two
  // disagree about whether a name wraps and the preview differs from the page.
  text.length * fontSize * ((style?.weight ?? 400) >= 600 ? 0.55 : 0.52)

/**
 * Real metrics, from a canvas the browser already has.
 *
 * The engine takes its measurer as an argument precisely so it can be real here
 * and an estimate in a test. One module-level context: measuring is read-only
 * and constructing the context is the expensive part.
 */
let context: CanvasRenderingContext2D | null = null

export const measureText: TextMeasurer = (text, fontSize, family, style) => {
  if (typeof document === 'undefined') return estimateWidth(text, fontSize, family, style)
  context ??= document.createElement('canvas').getContext('2d')
  if (context === null) {
    // No canvas — a hardened environment, or one where the context was refused.
    // Estimate rather than throw: a slightly wrong preview beats a blank card.
    return estimateWidth(text, fontSize, family, style)
  }

  /*
   * **The weight is part of the font shorthand, and leaving it out was the
   * bug.** Omitted, the context measures at `normal`; a product name draws at
   * 700 — `DEFAULT_STEPS` puts h3 and h4 there — and bold glyphs are wider. So
   * every wrap decision for the largest, boldest string on a card was made
   * against light metrics, and a name that measured inside its box drew
   * outside it. Two cards in the same book could differ only by which side of
   * that error their name landed.
   *
   * The family is quoted. Unquoted it is still valid CSS when every part is an
   * identifier, but a face whose name begins with a digit is not — and an
   * invalid shorthand is *ignored*, leaving the context on whatever it
   * measured last. A silent wrong answer rather than an error.
   *
   * `letterSpacing` is deliberately not set here: the engine adds tracking in
   * `advance`, and doing it in both places would count it twice.
   */
  context.font = `${style?.weight ?? 400} ${fontSize}px '${family}'`
  return context.measureText(text).width
}
