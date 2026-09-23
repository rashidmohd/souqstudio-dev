'use client'

import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import type { CatalogProductSummary } from '@souqstudio/types'
import { cn } from '@souqstudio/designer/lib/utils'

/**
 * A catalog row's packshot at control size, for lists rather than grids.
 *
 * **The picture is what makes a result list scannable.** Three rows reading
 * `Almarai Full Cream Milk 1 L`, `... 1.5 L` and `... 2 L` are a
 * spot-the-difference puzzle; three packshots are a glance. `PriceListMatcher`
 * learned this first and drew its own — this is that tile, lifted so the offer
 * tray and the create-flow search cannot drift from it or from each other.
 *
 * `ProductCard` stays separate on purpose: it is a grid tile with a full-bleed
 * square image area and its own sizes attribute, not a row thumbnail.
 *
 * **A product with no photograph keeps the space and shows the absence**, so a
 * list of results stays one rhythm and the owner learns before they add it that
 * this one will print a placeholder.
 */
export function ProductThumb({
  product,
  className,
}: {
  product: Pick<CatalogProductSummary, 'imageUrl'>
  className?: string
}) {
  return (
    // `relative`, because `fill` measures against the nearest positioned
    // ancestor. Square at the large control height: a cutout's aspect ratio is
    // whatever the packshot was, and a column of mixed widths reads as broken
    // rather than as varied.
    <span
      className={cn(
        'relative flex size-control-lg shrink-0 items-center justify-center overflow-hidden rounded-control bg-sand-tint',
        className
      )}
    >
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          // Decorative: the name sits beside it in the same control.
          alt=""
          aria-hidden="true"
          fill
          sizes="48px"
          // `unoptimized`, for the reason `ProductCard` states: `R2_PUBLIC_URL`
          // is per-environment while `remotePatterns` is a hardcoded pair of
          // hosts, so the optimizer refuses any bucket that is not one of those
          // two — and the failure is every picture in the list, in exactly the
          // environment nobody checked.
          unoptimized
          className="object-contain p-1"
        />
      ) : (
        // A missing-asset marker inside a tile, not an illustration —
        // `illustration-selection.md` bars decoration at this size.
        <ImageOff className="size-4 text-secondary" aria-hidden="true" strokeWidth={1.75} />
      )}
    </span>
  )
}
