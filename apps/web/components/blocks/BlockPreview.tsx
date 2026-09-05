'use client'

import * as React from 'react'
import type { Arrangement, BlockElement, BrandKit, TokenRef } from '@souqstudio/types'
import {
  fitPolicy,
  fitText,
  layoutPriceMark,
  resolveBlock,
  type Rect,
  type TextMeasurer,
} from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { fontStack, resolveScale } from '@/lib/brand-fonts'
import { PREVIEW_PRODUCT } from '@/lib/preview-product'
import { ARTBOARD_PLACEHOLDER } from '@/lib/color'

/**
 * A seeded block, drawn in the shop's own brand.
 *
 * **Inline SVG, not a Fabric canvas.** The same call the old brand preview made,
 * for the same reason: Fabric, its font loading and a canvas context per block
 * would land in the bundle of a screen a shop owner opens on a mid-range Android
 * over 4G. Fabric is the *editor's* renderer, where dragging and nudging need an
 * object model; a static picture needs neither.
 *
 * **`direction` is the book's, never the interface's.** It defaults to `ltr` and
 * is not wired to the chrome's `dir` on purpose: the design system is explicit
 * that the artboard follows the offer book's own language, so an owner working
 * in an Arabic UI who is producing an English flyer must see an English flyer.
 * A language toggle on the preview is a feature, not a default.
 *
 * **It computes no geometry.** Every rectangle, font size, line break and price
 * position comes from `@souqstudio/engine` — the same functions the export
 * worker runs. That is what stops a second renderer drifting from the first:
 * one implementation of *where things go*, two thin ones of *how to paint*.
 */
type Props = {
  arrangements: Arrangement[]
  kit: BrandKit
  width: number
  height: number
  direction?: 'ltr' | 'rtl'
  className?: string
}

export function BlockPreview({
  arrangements,
  kit,
  width,
  height,
  direction = 'ltr',
  className,
}: Props) {
  const palette = resolvePalette(kit)
  const scale = resolveScale(kit)
  const blockSize = Math.sqrt(width * height)

  // Real font metrics need a canvas, and a canvas needs a browser. Measuring
  // with an estimate on the server and the real thing on the client would break
  // lines differently in each and React would flag the mismatch — so the first
  // paint uses the estimate on both sides and the real measurer takes over once
  // mounted. The type steps rarely differ; the line breaks sometimes do.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const { elements } = resolveBlock(
    {
      id: 'preview',
      organizationId: null,
      name: 'preview',
      repeats: true,
      arrangements,
      thumbnailUrl: null,
    },
    { x: 0, y: 0, width, height },
    direction
  )

  const ctx: DrawContext = {
    token: (ref) => resolveToken(palette, ref),
    scale,
    blockSize,
    ar: direction === 'rtl',
    direction,
    measure: mounted ? measureText : estimateWidth,
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={className}
      role="img"
      aria-label="Block preview"
    >
      {elements.map(({ element, rect }, index) => (
        <React.Fragment key={index}>{draw(element, rect, ctx)}</React.Fragment>
      ))}
    </svg>
  )
}

type DrawContext = {
  token: (ref: TokenRef) => string
  scale: ReturnType<typeof resolveScale>
  blockSize: number
  ar: boolean
  direction: 'ltr' | 'rtl'
  measure: TextMeasurer
}

function draw(element: BlockElement, box: Rect, ctx: DrawContext): React.ReactNode {
  switch (element.kind) {
    case 'shape':
      return <rect {...xywh(box)} rx={element.radius} fill={ctx.token(element.surface)} />
    case 'image':
      return <ImagePlaceholder box={box} />
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

const xywh = (r: Rect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })

function ImagePlaceholder({ box }: { box: Rect }) {
  const inset = Math.min(box.width, box.height) * 0.12
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

function Chip({ box, ctx }: { box: Rect; ctx: DrawContext }) {
  const label = ctx.ar ? PREVIEW_PRODUCT.tierLabelAr : PREVIEW_PRODUCT.tierLabelEn
  const size = Math.min(box.height * 0.52, (box.width * 0.86) / (label.length * 0.56))
  return (
    <>
      <rect {...xywh(box)} rx={box.height / 2} fill={ctx.token('accent')} />
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
  const tint = ctx.token('accent')
  const family = fontStack(ctx.scale.families.price)
  const [, minor = ''] = PREVIEW_PRODUCT.amount.toFixed(3).split('.')

  const l = layoutPriceMark(
    {
      tierId: 'preview',
      major: String(Math.floor(PREVIEW_PRODUCT.amount)),
      minor,
      currency: PREVIEW_PRODUCT.currency,
      currencyPlacement: 'PREFIX',
      shape: 'TAG',
      comparePrice: PREVIEW_PRODUCT.comparePrice,
    },
    box,
    { tierLabel: PREVIEW_PRODUCT.tierLabelEn.toUpperCase() }
  )

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
  const content = contentFor(element, ctx.ar)
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

  const anchor =
    element.align === 'center' ? 'middle' : element.align === 'end' ? 'end' : 'start'
  const x =
    element.align === 'center'
      ? box.x + box.width / 2
      : (element.align === 'end') === !ctx.ar
        ? box.x + box.width
        : box.x

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
          direction={ctx.direction}
        >
          {line}
        </text>
      ))}
    </>
  )
}

function contentFor(element: Extract<BlockElement, { kind: 'text' }>, ar: boolean): string {
  switch (element.source.from) {
    case 'static':
      return ar ? element.source.textAr : element.source.textEn
    case 'shop':
      return element.source.field === 'name' ? 'Al Nakheel Market' : ''
    case 'product':
      if (element.source.field === 'name')
        return ar ? PREVIEW_PRODUCT.nameAr : PREVIEW_PRODUCT.nameEn
      if (element.source.field === 'spec')
        return ar ? PREVIEW_PRODUCT.specAr : PREVIEW_PRODUCT.specEn
      if (element.source.field === 'brand') return PREVIEW_PRODUCT.brandEn
      return ''
  }
}

/**
 * What the server and the first client paint both use.
 *
 * Crude, and it has to be: it must produce the same answer in Node and in the
 * browser or the two renders disagree and React reports a hydration mismatch.
 */
const estimateWidth: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.52

/**
 * Real metrics, from a canvas the browser already has.
 *
 * The engine takes its measurer as an argument precisely so it can be real here
 * and an estimate in a test. One module-level context: measuring is read-only
 * and constructing the context is the expensive part.
 */
let context: CanvasRenderingContext2D | null = null

const measureText: TextMeasurer = (text, fontSize, family) => {
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
