'use client'

import * as React from 'react'
import type { Block, BrandKit } from '@souqstudio/types'
import { compactBlock, resolveBlock, type CompactionPolicy, type FlowPage } from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { resolveScale } from '@/lib/brand-fonts'
import {
  drawElement,
  estimateWidth,
  measureText,
  type DrawContext,
} from '@/components/blocks/draw'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * One page of an offer book, drawn.
 *
 * **The first thing in the product that draws a page from database rows.**
 * Everything before it drew literals: the render harness composes invented
 * products, and `BlockPreview` draws one block against a sample. This takes what
 * `loadBook` composed and paints it.
 *
 * **Inline SVG, not Fabric, and that is not a shortcut.** Fabric is the
 * *editor's* renderer, where dragging and nudging need an object model. A page
 * that is only looked at needs neither, and going through Fabric would mean
 * loading it — plus `document.fonts.load()` for every family and weight before a
 * single text object, or every bounding box is measured against the fallback —
 * on a screen that has nothing to drag yet.
 *
 * **It computes no geometry and paints nothing itself.** `flowBook` decided which
 * block sits in which rectangle carrying which offer; `resolveBlock` turns a
 * block into element rectangles; `components/blocks/draw` paints them, and
 * `/brand` uses the same painter. Two implementations of a card is how the PDF
 * stops matching the screen.
 */
type Props = {
  page: FlowPage
  size: { width: number; height: number }
  offers: Record<string, ComposedOffer>
  blocks: Record<string, Block>
  kit: BrandKit
  /** The shop's name, for a block binding `shop.name` — a footer, a hero band.
   *  Not on the brand kit: the kit is identity, and which shop is printing this
   *  book is a property of the book. */
  shopName: string
  /** The **book's** language, never the interface's. */
  direction: 'ltr' | 'rtl'
  /** Where a card's unused height goes. See `compactBlock`. */
  compaction?: CompactionPolicy
  className?: string
}

export function BookPage({
  page,
  size,
  offers,
  blocks,
  kit,
  shopName,
  direction,
  compaction = 'balance',
  className,
}: Props) {
  const palette = resolvePalette(kit)
  const scale = resolveScale(kit)

  // Estimate on the server and the first client paint, real metrics after mount
  // — otherwise the two renders break lines differently and React flags the
  // mismatch. Same reasoning as `BlockPreview`.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const measure = mounted ? measureText : estimateWidth

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      width="100%"
      className={className}
      role="img"
      aria-label={`Page ${page.index + 1}`}
    >
      {/* The paper. `--sq-tpl-paper`, not a `--sq-ui-*` surface: this is offer
          book content and the two namespaces never cross. A block's own `shape`
          element usually covers it — this is what shows in the gaps and margins,
          which is exactly what paper is. */}
      <rect width={size.width} height={size.height} fill="var(--sq-tpl-paper)" />

      {page.placements.map((placement, index) => {
        const block = blocks[placement.blockId]
        if (block === undefined) return null

        const offer = placement.offerId === null ? undefined : offers[placement.offerId]

        // Type levels size against the block, not the element box — that is what
        // keeps h1 larger than h2 in a 1080px post and a 380px booklet cell
        // alike. Geometric mean rather than the shorter edge: a footer band is
        // wide and short, and anchoring to its shorter edge collapses its type.
        const blockSize = Math.sqrt(placement.rect.width * placement.rect.height)

        const ctx: DrawContext = {
          token: (ref) => resolveToken(palette, ref),
          scale,
          blockSize,
          ar: direction === 'rtl',
          direction,
          measure,
          offer,
          shopName,
        }

        const resolved = resolveBlock(block, placement.rect, direction)

        // Two passes, and only two: fit against the box the block designed to
        // learn what the content used, reclaim the rest, then fit again against
        // the box that came back. It converges because compaction changes
        // heights only and line breaking is driven by width.
        const compacted = compactBlock(
          resolved,
          ({ element, rect }) => neededHeight(element, rect, ctx),
          compaction
        )

        return (
          <React.Fragment key={`${placement.blockId}-${index}`}>
            {compacted.elements.map(({ element, rect }, elementIndex) => (
              <React.Fragment key={elementIndex}>
                {drawElement(element, rect, ctx)}
              </React.Fragment>
            ))}
          </React.Fragment>
        )
      })}
    </svg>
  )
}

/**
 * How much of its box an element's content actually needs.
 *
 * **A missing packshot is deliberately not reported as absent.** 4.2% of the
 * catalog has an image, and a card that quietly closes up around the hole looks
 * finished when it is not. The `no-image` flag on the offer is what tells the
 * owner; the reserved space is what keeps the page honest until they act on it.
 */
function neededHeight(
  element: Parameters<typeof drawElement>[0],
  rect: Parameters<typeof drawElement>[1],
  ctx: DrawContext
): number | null {
  if (element.kind !== 'text') return rect.height

  const content = textFor(element, ctx)
  if (content === '') return null

  // Line count at the box the block designed. The second fit inside `drawElement`
  // runs against the compacted box and produces the same count, because width
  // does not change.
  const step = ctx.scale.levels[element.level]
  const perLine = step.size * ctx.scale.base * ctx.blockSize
  const measured = ctx.measure(content, perLine, '')
  const lines = Math.max(1, Math.ceil(measured / Math.max(rect.width, 1)))
  return Math.min(rect.height, lines * perLine * step.lineHeight)
}

function textFor(
  element: Extract<Parameters<typeof drawElement>[0], { kind: 'text' }>,
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
