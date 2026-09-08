import type { Currency } from '@souqstudio/types'
import { toPriceMark } from '@souqstudio/engine'
import type { ArtboardOffer } from '@/components/blocks/draw'

/**
 * A sample product, in the shape an artboard draws.
 *
 * **One adapter, three surfaces.** `/brand` previews a seeded block, the
 * designer draws the card being authored, and the designer's stress panel draws
 * the same card against the worst case. Each of them had to turn a literal
 * product into a `ComposedOffer`-shaped thing, and three copies of that mapping
 * is three chances for a preview to disagree with the artboard beside it about
 * what a card shows.
 *
 * Nulls are load-bearing rather than tidy: a real catalog row has no Arabic name
 * 96% of the time and no image 96% of the time, and a preview whose product
 * cannot be missing anything is a preview of a catalog nobody has.
 */
export interface SampleProduct {
  nameEn: string
  nameAr: string | null
  specEn: string | null
  specAr: string | null
  brandEn: string | null
  amount: number
  currency: Currency
  comparePrice: string | null
  tierLabelEn: string
  tierLabelAr: string
}

/**
 * `tierToken` is empty on purpose. A sample has no promo tier row behind it, and
 * `draw` falls back to the brand kit's accent rather than to a `--sq-tpl-*`
 * colour this block never chose — the two vocabularies do not overlap, and
 * `docs/E6-pending.md` §6 is the write-up of why.
 *
 * An Arabic edition falls back to the English name when the row has no Arabic
 * one, which is what the composer does with a real product and therefore what a
 * preview has to show. Drawing an empty card instead would hide the case.
 */
export function toArtboardOffer(product: SampleProduct, ar: boolean): ArtboardOffer {
  return {
    name: (ar ? product.nameAr : product.nameEn) ?? product.nameEn,
    spec: (ar ? product.specAr : product.specEn) ?? null,
    brand: product.brandEn,
    imageUrl: null,
    priceMark: toPriceMark(product.amount, product.currency, 'preview', {
      ...(product.comparePrice === null ? {} : { comparePrice: product.comparePrice }),
    }),
    tierLabel: ar ? product.tierLabelAr : product.tierLabelEn,
    tierToken: '',
  }
}
