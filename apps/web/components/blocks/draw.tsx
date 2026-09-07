'use client'

import * as React from 'react'
import type { BlockElement, TokenRef } from '@souqstudio/types'
import {
  fitPolicy,
  fitText,
  layoutPriceMark,
  placeText,
  type Rect,
  type TextMeasurer,
} from '@souqstudio/engine'
import { fontStack, type resolveScale } from '@/lib/brand-fonts'
import { ARTBOARD_PLACEHOLDER } from '@/lib/color'
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
  'name' | 'spec' | 'brand' | 'imageUrl' | 'priceMark' | 'tierLabel' | 'tierToken'
>

export type DrawContext = {
  /** A brand-kit slot — `primary`, `accent`, `ink` — resolved to the shop's colour. */
  token: (ref: TokenRef) => string
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

export function drawElement(
  element: BlockElement,
  box: Rect,
  ctx: DrawContext
): React.ReactNode {
  switch (element.kind) {
    case 'shape':
      return <rect {...xywh(box)} rx={element.radius} fill={ctx.token(element.surface)} />
    case 'image':
      return <Packshot box={box} ctx={ctx} />
    case 'logo':
      return <rect {...xywh(box)} rx={3} fill={ARTBOARD_PLACEHOLDER.onTint} />
    case 'chip':
      return <Chip box={box} ctx={ctx} />
    case 'priceMark':
      return <PriceMark box={box} ctx={ctx} />
    case 'text':
      return <Text element={element} box={box} ctx={ctx} />
  }
}

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
function Packshot({ box, ctx }: { box: Rect; ctx: DrawContext }) {
  const inset = Math.min(box.width, box.height) * 0.12

  if (ctx.offer?.imageUrl) {
    return (
      <image
        x={box.x + inset}
        y={box.y + inset}
        width={box.width - inset * 2}
        height={box.height - inset * 2}
        href={ctx.offer.imageUrl}
        preserveAspectRatio="xMidYMid meet"
      />
    )
  }

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
function Chip({ box, ctx }: { box: Rect; ctx: DrawContext }) {
  const label = ctx.offer?.tierLabel ?? ''
  if (label === '') return null

  const size = Math.min(box.height * 0.52, (box.width * 0.86) / (label.length * 0.56))
  const fill = ctx.offer?.tierToken ? `var(${ctx.offer.tierToken})` : ctx.token('accent')

  return (
    <>
      <rect {...xywh(box)} rx={box.height / 2} fill={fill} />
      <text
        x={box.x + box.width / 2}
        y={box.y + box.height / 2}
        fontSize={size}
        fontWeight={700}
        fill={ctx.token('surface')}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </>
  )
}

/**
 * Drawn from `layoutPriceMark`. The raised minor, the attached tab and the LTR
 * ordering that survives an Arabic edition are all decided there, not here.
 */
function PriceMark({ box, ctx }: { box: Rect; ctx: DrawContext }) {
  if (ctx.offer === undefined) return null

  const tint = ctx.offer.tierToken ? `var(${ctx.offer.tierToken})` : ctx.token('accent')
  const family = fontStack(ctx.scale.families.price)

  const l = layoutPriceMark(ctx.offer.priceMark, box, {
    tierLabel: ctx.offer.tierLabel.toUpperCase(),
  })

  return (
    <>
      {l.tab ? (
        <>
          <rect {...xywh(l.tab.rect)} rx={l.tab.rect.height / 2} fill={tint} />
          <text
            x={l.tab.rect.x + l.tab.rect.width / 2}
            y={l.tab.rect.y + l.tab.rect.height / 2}
            fontSize={l.tab.fontSize}
            fontWeight={700}
            fill={ctx.token('surface')}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {l.tab.text}
          </text>
        </>
      ) : null}

      <rect {...xywh(l.mark)} rx={3} fill={ctx.token('surface')} />
      <rect
        {...xywh(l.mark)}
        rx={3}
        fill="none"
        stroke={tint}
        strokeWidth={Math.max(1, l.mark.height * 0.035)}
      />

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
        fill={ctx.token('ink')}
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
          fill={ctx.token('ink')}
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

function Text({
  element,
  box,
  ctx,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  box: Rect
  ctx: DrawContext
}) {
  const content = contentFor(element, ctx)
  if (content === '') return null

  const step = ctx.scale.levels[element.level]
  const family = fontStack(ctx.scale.families[step.family])
  const policy = fitPolicy(element.source)

  const fitted = fitText({
    text: step.transform === 'uppercase' ? content.toUpperCase() : content,
    box: { width: box.width, height: box.height },
    level: element.level,
    scale: ctx.scale,
    blockSize: ctx.blockSize,
    measure: ctx.measure,
    truncatable: policy.truncatable,
    ...(policy.floor === undefined ? {} : { floor: policy.floor }),
  })

  // Position, anchor and direction together, from the engine. They cannot be
  // decided separately: `start` and `end` resolve against the *element's* own
  // direction, so a Latin pack label on an Arabic artboard anchored by the
  // page's reading order draws out through the edge of its box.
  const { anchor, x, direction } = placeText(content, element.align, box, ctx.direction)

  const onTint = element.source.from === 'static' || element.source.from === 'shop'
  const fill = onTint
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
