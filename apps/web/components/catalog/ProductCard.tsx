'use client'

import * as React from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import type { CatalogProductSummary } from '@souqstudio/types'
import { Figure } from '@/components/ui/figure'
import {
  displayBrand,
  displayName,
  displaySpec,
  packLabel,
  type CatalogLanguage,
} from '@/lib/catalog-display'
import { cn } from '@/lib/utils'

/**
 * One catalog row, as the search grid and the category grid both draw it.
 *
 * Cutout, name, brand, pack size — the four things E5-01 says a result shows,
 * in the order an owner scans them. Not `Card` from the inventory: this is a
 * grid tile with a full-bleed image area, and `Card`'s padding wraps its
 * children on every side, so using it would mean cancelling the padding it
 * exists to apply.
 *
 * **A row from the organization's own collection says so.** An owner needs to
 * know whether they are looking at their own record or the shared one before
 * they edit it, and once E5-04 lets them create rows the two sit side by side
 * in the same grid.
 */
export function ProductCard({
  product,
  lang,
}: {
  product: CatalogProductSummary
  lang: CatalogLanguage
}) {
  const name = displayName(product, lang)
  const brand = displayBrand(product, lang)
  const spec = displaySpec(product, lang)
  const pack = packLabel(product)

  return (
    <li className="flex flex-col overflow-hidden rounded-card border-hairline border-border-subtle bg-surface">
      {/* Square, because a cutout's aspect ratio is whatever the packshot was
          and a grid of mixed heights reads as broken rather than as varied. */}
      <div className="relative flex aspect-square items-center justify-center bg-sand-tint">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            // `unoptimized`, same as the logo preview and for a sharper reason
            // here: `R2_PUBLIC_URL` is per-environment while `remotePatterns`
            // in next.config.mjs is a hardcoded pair of hosts, so the optimizer
            // refuses any bucket that is not one of those two — and the failure
            // is every product image in the grid, in exactly the environment
            // nobody checked.
            unoptimized
            className="object-contain p-3"
          />
        ) : (
          // Not an illustration: this is a missing-asset marker inside a tile,
          // and illustration-selection.md bars decoration at this size.
          <ImageOff aria-hidden="true" className="size-icon-lg text-secondary" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {brand ? (
          <p className="font-ui text-eyebrow uppercase text-muted">{brand}</p>
        ) : null}

        {/* `lang` on the element, not on the page: a product name in Arabic
            inside an English interface must still shape and wrap as Arabic. */}
        <p
          lang={product.nameAr && lang === 'ar' ? 'ar' : 'en'}
          className="font-ui text-body font-medium text-primary"
        >
          {name}
        </p>

        {spec ? <p className="font-ui text-body-sm text-secondary">{spec}</p> : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {pack ? (
            <Figure value={pack} size="data-sm" className="text-secondary" />
          ) : null}
          {product.collection === 'organization' ? <OwnRecordMark /> : null}
        </div>
      </div>
    </li>
  )
}

function OwnRecordMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'rounded-pill bg-sky-tint px-2 py-px font-ui text-eyebrow uppercase text-secondary',
        className
      )}
    >
      Your catalog
    </span>
  )
}
