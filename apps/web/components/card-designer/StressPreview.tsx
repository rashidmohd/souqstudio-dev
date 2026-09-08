'use client'

import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import type { BlockElement, BrandKit } from '@souqstudio/types'
import { Figure } from '@/components/ui/figure'
import { BlockArtboard } from '@/components/card-designer/BlockArtboard'
import { toArtboardOffer } from '@/lib/preview-offer'
import { PREVIEW_PRODUCT } from '@/lib/preview-product'

/**
 * The stress preview. E7, and a requirement rather than a nicety.
 *
 * **Always visible, never behind a tab.** Its whole value is that the owner sees
 * the failure while they are causing it: a shop designing against a short name
 * and discovering the overflow after a customer has seen the flyer is the exact
 * failure this exists to prevent.
 *
 * **Same scale as the canvas**, so the comparison is honest — a worst case shown
 * smaller reads as "it fits", which is the opposite of what it is for.
 *
 * The worst case is fixed and the owner cannot change it, which puts the burden
 * on us: the longest Arabic name in a GCC grocery catalog, a two-line spec and
 * a three-decimal Kuwaiti price. See `lib/preview-product.ts`, including the one
 * respect in which real catalog rows are *worse* than this — they have no Arabic
 * name at all, which is what the direction rule in the engine exists for.
 */

type Props = {
  elements: BlockElement[]
  kit: BrandKit
  width: number
  height: number
  direction: 'ltr' | 'rtl'
  shopName: string
  asset?: ((assetId: string) => string | null) | undefined
  /** Text elements the fit ladder could not place. Counted by the caller, which
   *  already runs the ladder to draw. */
  escalated?: number
}

export function StressPreview({
  elements,
  kit,
  width,
  height,
  direction,
  shopName,
  asset,
  escalated = 0,
}: Props) {
  const offer = React.useMemo(() => toArtboardOffer(PREVIEW_PRODUCT, direction === 'rtl'), [direction])

  return (
    <figure className="flex w-full flex-col gap-2">
      <figcaption className="flex items-center justify-between gap-2 rounded-pill bg-surface px-3 py-1">
        <span className="font-ui text-body-sm text-secondary">Worst case</span>
        {escalated > 0 ? (
          <span className="flex items-center gap-1 font-ui text-body-sm text-caution-fg">
            <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            <Figure value={escalated} size="data-sm" /> too long
          </span>
        ) : null}
      </figcaption>

      <BlockArtboard
        elements={elements}
        kit={kit}
        width={width}
        height={height}
        direction={direction}
        offer={offer}
        shopName={shopName}
        asset={asset}
        ariaLabel="The same card under the longest product in the catalog"
        className="rounded-artboard"
      />
    </figure>
  )
}
