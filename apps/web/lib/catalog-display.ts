import type { CatalogProductSummary } from '@souqstudio/types'

/**
 * Turning a catalog row into the strings a card shows.
 *
 * **Separate from `lib/catalog.ts`, and it has to be.** That module is
 * `server-only` — it holds Prisma, raw SQL and the R2 client — and a product
 * card is a client component. Importing the queries to reach `displayName()`
 * pulls the whole server module into the browser bundle, which is exactly what
 * the `server-only` guard refuses. `next build` is where that surfaces:
 * typecheck and lint both pass on it.
 *
 * Everything here is pure and language-facing. Nothing reads the database.
 */

export type CatalogLanguage = 'en' | 'ar'

export function toCatalogLanguage(value: string | null | undefined): CatalogLanguage {
  return value === 'ar' ? 'ar' : 'en'
}

/**
 * The name to show, in the interface language, falling back to the other one.
 *
 * A universal row may have no `nameAr` yet — that is a completeness warning at
 * publish time (E5 §2), never a blank line in the catalog. Falling back is
 * right in both directions: an Arabic interface showing an English product name
 * is legible; showing nothing is not.
 */
export function displayName(
  product: Pick<CatalogProductSummary, 'nameEn' | 'nameAr'>,
  lang: CatalogLanguage
): string {
  return lang === 'ar' ? (product.nameAr ?? product.nameEn) : product.nameEn
}

export function displayBrand(
  product: Pick<CatalogProductSummary, 'brandEn' | 'brandAr'>,
  lang: CatalogLanguage
): string | null {
  return lang === 'ar'
    ? (product.brandAr ?? product.brandEn)
    : (product.brandEn ?? product.brandAr)
}

export function displaySpec(
  product: Pick<CatalogProductSummary, 'specEn' | 'specAr'>,
  lang: CatalogLanguage
): string | null {
  return lang === 'ar'
    ? (product.specAr ?? product.specEn)
    : (product.specEn ?? product.specAr)
}

/**
 * Re-exported, not reimplemented — the same move the barcode helpers below made,
 * and for the same reason. The render harness composes real catalog rows into
 * pages and must draw the pack line the product card draws; `apps/web` is not
 * importable from `packages/`, so the rule lives in `@souqstudio/types`.
 *
 * Kept re-exported from here so every existing call site reads the same.
 */
export { formatPackSize, packLabel, type PackFields } from '@souqstudio/types'

// ─── Barcodes — E5-03 ─────────────────────────────────────────────────────────

/**
 * Re-exported, not reimplemented. The rule moved to `@souqstudio/types` when the
 * Open Food Facts importer needed the same answer as the search box: that package
 * is the only one with no dependencies, so it is the only one a browser bundle and
 * a CLI script can both import.
 *
 * Kept re-exported from here so every existing call site reads the same, and so a
 * component still imports its barcode helpers from the module that holds the rest
 * of its display logic.
 */
export { hasValidCheckDigit, isBarcode, normalizeBarcode } from '@souqstudio/types'
