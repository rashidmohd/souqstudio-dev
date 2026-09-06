/**
 * The shape the harness composes, and the display fallbacks that go with it.
 *
 * **Split out of `dummy.ts` when real catalog rows arrived.** The dummies always
 * carried every field, so the renderer could read `product.nameAr` and trust it.
 * A real row cannot be trusted that way: of 2,140 rows in the dev catalog, 99
 * have an Arabic name, 1,238 have a brand, and 571 have a category. Every field
 * below except `nameEn` is therefore nullable, and the renderer has to decide
 * what to draw when one is missing.
 *
 * **The fallbacks here are the app's, deliberately copied in behaviour rather
 * than invented.** `apps/web/lib/catalog-display.ts` falls back from `nameAr` to
 * `nameEn`, and that is what a shop owner sees on an Arabic screen today. If the
 * harness substituted a placeholder or drew a blank instead, the Arabic page
 * would show a problem the product does not have, or hide one it does.
 *
 * `apps/web` is not importable from `packages/`, so this cannot literally import
 * those three functions. It is four lines of `??`; the pack label — the one
 * piece with a real rule in it — moved to `@souqstudio/types` instead of being
 * copied.
 */

import type { TokenRef } from '@souqstudio/types'

export interface HarnessTier {
  labelEn: string
  labelAr: string
  token: TokenRef
}

export interface HarnessProduct {
  id: string
  nameEn: string
  nameAr: string | null
  specEn: string | null
  specAr: string | null
  brandEn: string | null
  major: string
  minor: string
  currency: string
  comparePrice?: string
  tier: HarnessTier
  /**
   * Where the row came from — `dummy` for the hand-written sets, otherwise the
   * `catalog_products.source` value. On screen it is a caption; in a finding it
   * is the difference between "the block is wrong" and "the data is thin".
   */
  origin?: string
}

/** Falls back to English. An Arabic screen showing an English product name is
 *  legible; showing nothing is not. */
export function nameFor(product: HarnessProduct, rtl: boolean): string {
  return rtl ? (product.nameAr ?? product.nameEn) : product.nameEn
}

/** Either direction. A row with only an Arabic spec should still show it on an
 *  English page rather than dropping the line. */
export function specFor(product: HarnessProduct, rtl: boolean): string {
  return (rtl ? (product.specAr ?? product.specEn) : (product.specEn ?? product.specAr)) ?? ''
}

/** There is no `brandAr` on the harness shape: the catalog's is null on all but
 *  a handful of rows, and a brand lockup is not built yet either way. */
export function brandFor(product: HarnessProduct): string {
  return product.brandEn ?? ''
}
