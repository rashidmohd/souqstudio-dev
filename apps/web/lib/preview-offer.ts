import type { Currency } from '@souqstudio/types'
import { minorDigits, toPriceMark } from '@souqstudio/engine'
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
  /** The country line and the pack line, as a real catalog row carries them. */
  originEn?: string | null
  originAr?: string | null
  packLabel?: string | null
  /**
   * A stand-in packshot, or null for the surfaces where its absence is the
   * point. Same field a real row has, so the adapter below stays one mapping.
   */
  imageUrl: string | null
  amount: number
  currency: Currency
  comparePrice: string | null
  /**
   * The FROM / EACH / PER KG line and the derived `(1 kg = 1.76)` rate.
   *
   * **Present so the canvas has something to lay out.** Both resolved to an
   * empty string, so an element bound to either drew nothing at all and could
   * not be positioned — the same hole `product.origin` and `product.packSize`
   * were in. A block is designed before it meets an offer, so the sample is
   * where the words have to come from.
   */
  prefixLabel?: 'FROM' | 'EACH' | 'PER_KG' | null
  unitPrice?: string | null
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
    origin: (ar ? product.originAr : product.originEn) ?? product.originEn ?? null,
    packSize: product.packLabel ?? null,
    imageUrl: product.imageUrl,
    priceMark: toPriceMark(product.amount, product.currency, 'preview', {
      ...(product.comparePrice === null ? {} : { comparePrice: product.comparePrice }),
      ...(product.prefixLabel ? { prefixLabel: product.prefixLabel } : {}),
    }),
    tierLabel: ar ? product.tierLabelAr : product.tierLabelEn,
    tierToken: '',
    // The same arithmetic the composer does, so a preview of a card with a
    // was-price shows the same "SAVE" line the book will print. Both null
    // together when there is nothing to compare against — §3.7 collapses the
    // element rather than drawing a zero.
    ...previewSavings(product),
    // **A sample carries one now, and the reason it did not is worth keeping.**
    // A rate invented for a preview is a number an owner could read as real —
    // true, and the cost of the alternative turned out to be higher: an element
    // bound to the unit price drew nothing on the designer canvas, so it could
    // not be laid out at all. A visible sample on a surface that draws no real
    // product beats an invisible element on the one surface for designing.
    unitPrice: product.unitPrice ?? null,
    // A sample has no chips. The tier flash is the one every card carries, and
    // inventing a "Limit 2" beside it would show a block preview that no real
    // offer produces until an owner asks for it.
    chips: [],
  }
}

/**
 * A preview's save figures.
 *
 * A second copy of `savings` in the composer, and deliberately a small one: the
 * composer reads a `Decimal` off an offer row and this reads a number off a
 * literal, so there is no shared input to factor over. The rule they share —
 * **both null unless the was-price is strictly higher** — is asserted in both
 * places rather than assumed in one.
 */
function previewSavings(product: SampleProduct): {
  saveAmount: string | null
  savePercent: string | null
} {
  if (product.comparePrice === null) return { saveAmount: null, savePercent: null }
  const was = Number(product.comparePrice)
  if (!Number.isFinite(was) || was <= product.amount) {
    return { saveAmount: null, savePercent: null }
  }
  return {
    saveAmount: (was - product.amount).toFixed(minorDigits(product.currency)),
    savePercent: `${Math.round(((was - product.amount) / was) * 100)}%`,
  }
}
