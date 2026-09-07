'use client'

import * as React from 'react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { resolveBlock, toPriceMark } from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { resolveScale } from '@/lib/brand-fonts'
import { PREVIEW_PRODUCT } from '@/lib/preview-product'
import {
  drawElement,
  estimateWidth,
  measureText,
  type ArtboardOffer,
  type DrawContext,
} from '@/components/blocks/draw'

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
 * **It computes no geometry, and since the editor arrived it does not paint
 * either.** Every rectangle, font size, line break and price position comes from
 * `@souqstudio/engine`; every fill and glyph comes from `components/blocks/draw`,
 * which the editor's artboard also uses. That is what stops a second renderer
 * drifting from the first: one implementation of *where things go*, one of *how
 * to paint*, and thin callers.
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
    offer: sampleOffer(direction === 'rtl'),
    shopName: 'Al Nakheel Market',
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
        <React.Fragment key={index}>{drawElement(element, rect, ctx)}</React.Fragment>
      ))}
    </svg>
  )
}

/**
 * `PREVIEW_PRODUCT` in the shape the artboard draws.
 *
 * Adapted rather than kept as a second product type, so the preview and a real
 * book cannot disagree about what a card shows. The sample is deliberately the
 * worst case — see the note on `lib/preview-product.ts`, including the one
 * respect in which real catalog rows are worse than it.
 *
 * `tierToken` is empty on purpose: the preview has no promo tier row behind it,
 * and `draw` falls back to the brand kit's accent rather than to a
 * `--sq-tpl-*` colour this block never chose.
 */
function sampleOffer(ar: boolean): ArtboardOffer {
  return {
    name: ar ? PREVIEW_PRODUCT.nameAr : PREVIEW_PRODUCT.nameEn,
    spec: ar ? PREVIEW_PRODUCT.specAr : PREVIEW_PRODUCT.specEn,
    brand: PREVIEW_PRODUCT.brandEn,
    imageUrl: null,
    priceMark: toPriceMark(PREVIEW_PRODUCT.amount, PREVIEW_PRODUCT.currency, 'preview', {
      comparePrice: PREVIEW_PRODUCT.comparePrice,
    }),
    tierLabel: ar ? PREVIEW_PRODUCT.tierLabelAr : PREVIEW_PRODUCT.tierLabelEn,
    tierToken: '',
  }
}
