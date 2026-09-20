/**
 * The binding vocabulary, and the one place it is resolved.
 *
 * **Two painters each had their own `switch`, and they agreed with each other
 * and with nothing else.** `draw.tsx` and `harness/svg.ts` both answered
 * `shop.address` and `shop.phone` with `''`, and had done for as long as those
 * bindings had existed, because a binding is *declared* in `@souqstudio/types`
 * and *resolved* in a painter and nothing ever checked that the two lists
 * matched. A footer bound to the shop's phone number rendered an empty box and
 * said nothing about why. E14 §3.4 and §3.5.
 *
 * So there is one resolver, here, and every painter calls it. That is the same
 * argument `shapes.ts` makes about a burst and `price-mark.ts` makes about a
 * price: the screen and the export must not be two readings of one rule.
 *
 * **The vocabulary is enumerable, and that is the point.** `TEXT_BINDINGS`
 * lists every binding the type permits, and `bindings.test.ts` walks it and
 * asserts each one draws something for a fixture. A test that listed cases
 * would have the same defect as the thing it is testing.
 *
 * Nothing here formats. A date arrives as a string the composer resolved, a
 * price arrives as digits the composer split, a save amount arrives already
 * computed. The engine has no locale, no currency table and no calendar, and
 * §8's date rule is what keeps it that way.
 */

import type { ImageSource, TextSource } from '@souqstudio/types'

// ─── The vocabulary ───────────────────────────────────────────────────────────

/** What the catalog knows about the thing on the card. */
export const PRODUCT_FIELDS = ['name', 'spec', 'brand', 'origin', 'packSize'] as const
/**
 * The offer's own words, as opposed to the product's.
 *
 * A product has no tier and no price until it is put in a book at one, which is
 * why these are not `product` fields.
 */
export const OFFER_FIELDS = [
  'price',
  'currency',
  'compare',
  'prefix',
  'tier',
  'unitPrice',
  'saveAmount',
  'savePercent',
] as const
export const SHOP_FIELDS = ['name', 'address', 'phone'] as const
/** One entry. There is no second identity source — §3.2. */
export const BRAND_TEXT_FIELDS = ['name'] as const
export const BOOK_FIELDS = ['title', 'validFrom', 'validTo'] as const

export type ProductField = (typeof PRODUCT_FIELDS)[number]
export type OfferField = (typeof OFFER_FIELDS)[number]
export type ShopField = (typeof SHOP_FIELDS)[number]
export type BrandTextField = (typeof BRAND_TEXT_FIELDS)[number]
export type BookField = (typeof BOOK_FIELDS)[number]

/**
 * Every binding the vocabulary offers, as documents.
 *
 * `static` is excluded: it carries its own words rather than naming a subject,
 * so there is nothing to look up and nothing that can silently be missing.
 */
export const TEXT_BINDINGS: readonly TextSource[] = [
  ...PRODUCT_FIELDS.map((field) => ({ from: 'product', field }) as const),
  ...OFFER_FIELDS.map((field) => ({ from: 'offer', field }) as const),
  ...SHOP_FIELDS.map((field) => ({ from: 'shop', field }) as const),
  ...BRAND_TEXT_FIELDS.map((field) => ({ from: 'brand', field }) as const),
  ...BOOK_FIELDS.map((field) => ({ from: 'book', field }) as const),
]

/** Every image binding except `asset`, which names an upload rather than a subject. */
export const IMAGE_BINDINGS: readonly ImageSource[] = [
  { from: 'product' },
  { from: 'brand', field: 'logo' },
]

// ─── What a painter hands over ────────────────────────────────────────────────

/**
 * The subjects in scope, already resolved to strings.
 *
 * **Strings rather than the shapes each surface happens to hold.** The editor
 * has a `ComposedOffer`, the harness has a catalog row, the designer has a
 * sample; making the resolver take all three is how it grows three code paths
 * that disagree. Each surface adapts *into* this, once, and the adapter is
 * where that surface's fallbacks live — the harness's `nameAr ?? nameEn`, the
 * app's `currencyLabel ?? currency`.
 *
 * **An absent subject is `undefined`, not a record of empty strings.** A header
 * is a static block and has no product in scope; that is a different fact from
 * a product whose spec is blank, and §3.6 scopes the picker on it.
 */
export interface BindingSubjects {
  /** Absent on a block that does not repeat — `Block.repeats`, and §3.6. */
  product?: Readonly<Record<ProductField, string>> | undefined
  /** Absent for the same reason as `product`: no offer, no offer words. */
  offer?: Readonly<Record<OfferField, string>> | undefined
  shop: Readonly<Record<ShopField, string>>
  brand: Readonly<Record<BrandTextField, string>>
  book: Readonly<Record<BookField, string>>
  /** Which edition is being drawn. Read only by `static`. */
  ar: boolean
}

/** What an image binding resolves to, and `null` when there is nothing to draw. */
export interface ImageSubjects {
  /** The product's packshot. Absent on a static block. */
  product?: string | null | undefined
  /** The identity this book carries, through `brandOverride`. */
  brandLogo?: string | null | undefined
  /** Artwork the owner uploaded, by `image_assets` id. */
  asset?: ((assetId: string) => string | null) | undefined
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * One binding, as the string it draws.
 *
 * **Empty is a legitimate answer and is never a bug on its own.** A shop with
 * no was-price, a product with no spec, a book with no end date: each resolves
 * to `''`, and §3.7 makes that a layout decision — the element collapses and
 * the gap beside it goes too, unless it says `reserve`. What is a bug is a
 * binding that returns `''` because *nothing was ever wired up*, and that is
 * what `bindings.test.ts` exists to tell apart.
 */
export function resolveTextBinding(source: TextSource, subjects: BindingSubjects): string {
  switch (source.from) {
    case 'static':
      return subjects.ar ? source.textAr : source.textEn
    case 'product':
      return subjects.product?.[source.field] ?? ''
    case 'offer':
      return subjects.offer?.[source.field] ?? ''
    case 'shop':
      return subjects.shop[source.field]
    case 'brand':
      return subjects.brand[source.field]
    case 'book':
      return subjects.book[source.field]
  }
}

/** One image binding, as the URL it draws, or `null` for nothing. */
export function resolveImageBinding(source: ImageSource, subjects: ImageSubjects): string | null {
  switch (source.from) {
    case 'product':
      return subjects.product ?? null
    case 'brand':
      return subjects.brandLogo ?? null
    case 'asset':
      return subjects.asset?.(source.assetId) ?? null
  }
}

// ─── Scope — §3.6 ─────────────────────────────────────────────────────────────

/**
 * Whether a binding may be offered on a block of this kind.
 *
 * **`repeats` already draws this line** and `validateBlock` already reports
 * crossing it as `product-binding-on-static-block`. This generalises it rather
 * than changing it: `product` and `offer` need a repeating block; `shop`,
 * `brand`, `book` and `static` are available everywhere. A header is a static
 * block, so it gets four of the six text sources and both non-product images.
 *
 * It is here rather than in the designer because the picker and the validator
 * have to agree, and they are in different packages.
 */
export const bindingInScope = (source: TextSource | ImageSource, repeats: boolean): boolean =>
  repeats || (source.from !== 'product' && source.from !== 'offer')
