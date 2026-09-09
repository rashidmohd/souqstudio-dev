'use client'

import * as React from 'react'
import type {
  BlockElement,
  BrandColor,
  ColorValue,
  FlatColor,
  TokenRef,
  TypeStep,
} from '@souqstudio/types'
import {
  fitPolicy,
  fitText,
  layoutPriceMark,
  CHIP_FIT,
  chipPathShape,
  needsEvenOdd,
  placeText,
  resolveColor,
  resolvePaint,
  shapePath,
  PATH_SHAPES,
  type PathShape,
  type Rect,
  type TextMeasurer,
} from '@souqstudio/engine'
import { fontStack, type resolveScale } from '@/lib/brand-fonts'
import { ARTBOARD_PLACEHOLDER, fromHex, readableInkOn } from '@/lib/color'
import type { ComposedOffer } from '@/lib/offer-book-compose'

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
  'name' | 'spec' | 'brand' | 'imageUrl' | 'priceMark' | 'tierLabel' | 'tierToken' | 'chips'
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
  shopName: string
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
  value: ColorValue,
  slot: string
): { fill: string; defs: React.ReactNode } {
  const resolved = resolvePaint(value, ctx.token, ctx.palette ?? [])
  if (resolved.kind === 'flat') return { fill: resolved.css, defs: null }

  const id = `${ctx.uid}-${slot}`
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

function drawInner(element: BlockElement, box: Rect, ctx: DrawContext): React.ReactNode {
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
          d={shapePath(path, box, ctx.direction)}
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
  const artwork = source.from === 'asset'
  const url = artwork
    ? (ctx.asset?.(source.assetId) ?? null)
    : (ctx.offer?.imageUrl ?? null)
  const inset = artwork ? 0 : Math.min(box.width, box.height) * 0.12
  const cover = element.fit === 'cover'

  if (url !== null) {
    const clip = `clip-${element.id}`
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
          x={box.x + inset}
          y={box.y + inset}
          width={box.width - inset * 2}
          height={box.height - inset * 2}
          href={url}
          preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
          {...(cover ? { clipPath: `url(#${clip})` } : {})}
        />
      </>
    )
  }

  // Artwork that has not loaded draws nothing rather than a grey box: the
  // placeholder below says "this product has no photograph", which is a fact
  // about the catalog, and saying it about a background the owner chose would
  // be wrong.
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
  // `docs/E6-pending.md`. Stacking downward is direction-neutral: the box itself
  // has already been mirrored by `resolveBlock`, so an Arabic edition puts the
  // whole stack on the correct corner with no second rule.
  const shape = element.shape ?? 'pill'
  const gap = box.height * 0.25
  const rows: { key: string; label: string; fill: string; align: 'start' | 'end' }[] = []

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
    const rgb = fromHex(badge)
    return rgb === null ? ctx.token('surface') : readableInkOn(rgb)
  }

  if (tier !== '') {
    rows.push({
      key: 'tier',
      label: tier,
      // The element's own fill wins over the tier's colour: an owner who
      // picked one has said what they want, and the tier token is the default
      // for a block that has never met this shop.
      fill:
        element.fill !== undefined
          ? paint(ctx, element.fill)
          : ctx.offer?.tierToken
            ? `var(${ctx.offer.tierToken})`
            : ctx.token('accent'),
      align: 'start',
    })
  }

  for (const chip of extra) {
    rows.push({
      key: chip.id,
      label: chip.label,
      // Not the tier's colour. A "Half price" flash and a "Limit 2" note are
      // different kinds of statement, and giving them one colour makes the
      // discount look like small print.
      fill: ctx.token('secondary'),
      align: chip.anchor === 'TOP_END' ? 'end' : 'start',
    })
  }

  return (
    <>
      {rows.map((row, index) => {
        const y = box.y + index * (box.height + gap)
        // Sized to its own label rather than to the slot: "Limit 2 per customer"
        // and "Halal" are not the same width, and a stack of identical pills
        // padded to the longest reads as a table.
        //
        // **How much of the badge the label may use comes from `CHIP_FIT`**, not
        // from a number here: a word centred in the *bounding box* of a burst
        // runs over the spikes, and every renderer inventing its own padding is
        // two badges that disagree about where the text sits.
        const fit = CHIP_FIT[shape]
        const size = Math.min(box.height * fit.height, (box.width * fit.width) / (row.label.length * 0.56))

        // A burst holds its proportion, so a wide rect would draw the same burst
        // with empty space beside it. It stays square and the label shrinks —
        // the fit ladder's answer everywhere else in this system.
        const width = fit.square
          ? box.height
          : Math.min(
              box.width * 2,
              Math.max(box.width * 0.5, ctx.measure(row.label, size, '') + size * 1.6)
            )
        const x = row.align === 'end' ? box.x + box.width - width : box.x
        const badge: Rect = { x, y, width, height: box.height }
        const path = chipPathShape(shape)

        return (
          <React.Fragment key={row.key}>
            {path === null ? (
              <rect {...xywh(badge)} rx={box.height / 2} fill={row.fill} />
            ) : (
              <path
                d={shapePath(path, badge, ctx.direction)}
                fill={row.fill}
                {...(needsEvenOdd(path) ? { fillRule: 'evenodd' as const } : {})}
              />
            )}
            <text
              x={x + width / 2}
              y={y + box.height / 2}
              fontSize={size}
              fontWeight={700}
              fill={inkFor(row.fill)}
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
  const tint =
    style.tint !== undefined
      ? paint(ctx, style.tint)
      : ctx.offer.tierToken
        ? `var(${ctx.offer.tierToken})`
        : ctx.token('accent')
  const ink = style.ink === undefined ? ctx.token('ink') : paint(ctx, style.ink)
  const ground = style.surface === undefined ? ctx.token('surface') : paint(ctx, style.surface)
  const framed = style.frame !== 'plain'
  const family = fontStack(ctx.scale.families.price)

  const l = layoutPriceMark(ctx.offer.priceMark, box, {
    tierLabel: ctx.offer.tierLabel.toUpperCase(),
  })

  return (
    <>
      {l.tab && style.tab !== 'none' ? (
        <>
          <rect {...xywh(l.tab.rect)} rx={l.tab.rect.height / 2} fill={tint} />
          <text
            x={l.tab.rect.x + l.tab.rect.width / 2}
            y={l.tab.rect.y + l.tab.rect.height / 2}
            fontSize={l.tab.fontSize}
            fontWeight={700}
            fill={ground}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {l.tab.text}
          </text>
        </>
      ) : null}

      {framed ? (
        <>
          <rect {...xywh(l.mark)} rx={3} fill={ground} />
          <rect
            {...xywh(l.mark)}
            rx={3}
            fill="none"
            stroke={tint}
            strokeWidth={Math.max(1, l.mark.height * 0.035)}
          />
        </>
      ) : null}

      {/* Western numerals, LTR, in an Arabic edition too. E6 §6. */}
      <text
        x={l.currency.x}
        y={l.currency.baseline}
        fontSize={l.currency.fontSize}
        fontWeight={700}
        fontFamily={family}
        fill={ctx.token('inkMuted')}
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
        fill={ink}
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
          fill={ink}
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
          fill={ctx.token('inkMuted')}
          textDecoration="line-through"
          direction="ltr"
        >
          {l.compare.text}
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
    ...(element.size === undefined ? {} : { size: element.size }),
    ...(policy.floor === undefined ? {} : { floor: policy.floor }),
    ...(policy.maxLines === undefined ? {} : { maxLines: policy.maxLines }),
  })

  return { content, fitted, step }
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
  const onTint = element.source.from === 'static' || element.source.from === 'shop'
  const fill =
    element.color !== undefined
      ? paint(ctx, element.color)
      : onTint
        ? ctx.token('surface')
        : element.level === 'caption'
          ? ctx.token('inkMuted')
          : ctx.token('ink')

  return (
    <>
      {fitted.lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={box.y + fitted.fontSize * (0.85 + i * fitted.lineHeight)}
          fontSize={fitted.fontSize}
          fontWeight={step.weight}
          fontFamily={family}
          fill={fill}
          textAnchor={anchor}
          direction={direction}
          {...(element.italic === true ? { fontStyle: 'italic' } : {})}
          {...(step.letterSpacing === undefined
            ? {}
            : { letterSpacing: step.letterSpacing * fitted.fontSize })}
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
function contentFor(
  element: Extract<BlockElement, { kind: 'text' }>,
  ctx: DrawContext
): string {
  switch (element.source.from) {
    case 'static':
      return ctx.ar ? element.source.textAr : element.source.textEn
    case 'shop':
      return element.source.field === 'name' ? ctx.shopName : ''
    case 'product': {
      if (ctx.offer === undefined) return ''
      if (element.source.field === 'name') return ctx.offer.name
      if (element.source.field === 'spec') return ctx.offer.spec ?? ''
      if (element.source.field === 'brand') return ctx.offer.brand ?? ''
      return ''
    }
  }
}

// ─── Measuring ────────────────────────────────────────────────────────────────

/**
 * What the server and the first client paint both use.
 *
 * Crude, and it has to be: it must produce the same answer in Node and in the
 * browser or the two renders disagree and React reports a hydration mismatch.
 */
export const estimateWidth: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.52

/**
 * Real metrics, from a canvas the browser already has.
 *
 * The engine takes its measurer as an argument precisely so it can be real here
 * and an estimate in a test. One module-level context: measuring is read-only
 * and constructing the context is the expensive part.
 */
let context: CanvasRenderingContext2D | null = null

export const measureText: TextMeasurer = (text, fontSize, family) => {
  if (typeof document === 'undefined') return estimateWidth(text, fontSize, family)
  context ??= document.createElement('canvas').getContext('2d')
  if (context === null) {
    // No canvas — a hardened environment, or one where the context was refused.
    // Estimate rather than throw: a slightly wrong preview beats a blank card.
    return estimateWidth(text, fontSize, family)
  }
  context.font = `${fontSize}px ${family}`
  return context.measureText(text).width
}
