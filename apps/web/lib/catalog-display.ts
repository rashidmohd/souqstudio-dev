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
 * `packSize` is `Decimal(10,3)`, so it arrives as a string and stays one.
 *
 * Trailing zeros are trimmed because the column stores 500 grams as `500.000`
 * and a card reading "500.000 g" looks like a database leaked onto a screen.
 * The value stays a string rather than becoming a number: this is a figure the
 * UI renders, and rounding it through a float to display it would be the one
 * place a 0.001 discrepancy could enter pack maths.
 */
export function formatPackSize(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.includes('.') ? value.replace(/\.?0+$/, '') : value
  return trimmed === '' || trimmed === '-' ? null : trimmed
}

/**
 * Units are lower-cased against the enum rather than shown as `G` and `KG`,
 * which is how a shelf label is written and how the derived unit price of
 * E5 §4 will have to read. `PIECE` has no symbol worth printing, so a count of
 * pieces renders as the count alone.
 */
const UNIT_LABEL: Record<NonNullable<CatalogProductSummary['packUnit']>, string> = {
  G: 'g',
  KG: 'kg',
  // The millilitre abbreviation, not the `ml-` margin utility the physical-
  // direction lint rule is looking for. It matches on the string's *value*, so
  // there is no way to spell this that satisfies it.
  // eslint-disable-next-line no-restricted-syntax
  ML: 'ml',
  L: 'l',
  PIECE: '',
}

/** "500 g", "8 × 25 g", "1 kg" — the pack line under a product name. */
export function packLabel(
  product: Pick<CatalogProductSummary, 'packSize' | 'packUnit' | 'packCount'>
): string | null {
  if (!product.packSize) return null

  const unit = product.packUnit ? UNIT_LABEL[product.packUnit] : ''
  const size = unit ? `${product.packSize} ${unit}` : product.packSize

  // The multiplication sign, not the letter x. A multipack is 8 × 25 g.
  return product.packCount && product.packCount > 1
    ? `${product.packCount} × ${size}`
    : size
}

// ─── Barcodes — E5-03 ─────────────────────────────────────────────────────────

/**
 * The four GTIN lengths in use: EAN-8, UPC-A, EAN-13 and GTIN-14.
 *
 * Anything else is not a barcode, whatever it looks like — a five-digit number
 * typed into the search box is a search for a five-digit number.
 */
const GTIN_LENGTHS = new Set([8, 12, 13, 14])

/**
 * Strip the separators a person types or a label prints, and nothing else.
 *
 * Spaces and hyphens appear on packaging and in spreadsheets; they are not part
 * of the number. Every other character is left in place so the result fails
 * `isBarcode` rather than being silently transformed into a different code.
 */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/** Digits, at one of the four GTIN lengths. Says nothing about the check digit. */
export function isBarcode(raw: string): boolean {
  const value = normalizeBarcode(raw)
  return GTIN_LENGTHS.has(value.length) && /^\d+$/.test(value)
}

/**
 * The GTIN check digit, which is the whole reason a barcode has one.
 *
 * Weights alternate 3 and 1 from the **right**, so the pattern depends on the
 * length — anchoring from the left gets EAN-8 and EAN-13 exactly backwards and
 * produces a validator that accepts half of all typos and rejects half of all
 * valid codes.
 *
 * This is checked before the database is asked. A mistyped code and a code we
 * have never seen are different answers: one is "check what you typed", the
 * other is "add this product", and telling an owner to add a product that
 * already exists under the right number is how a catalog fills with duplicates.
 */
export function hasValidCheckDigit(raw: string): boolean {
  const value = normalizeBarcode(raw)
  if (!isBarcode(value)) return false

  const digits = [...value].map(Number)
  const check = digits[digits.length - 1]
  if (check === undefined) return false

  const sum = digits
    .slice(0, -1)
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)

  return (10 - (sum % 10)) % 10 === check
}
