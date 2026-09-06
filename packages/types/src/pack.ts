/**
 * The pack line under a product name — "500 g", "8 × 25 g", "1 kg".
 *
 * **Moved here from `apps/web/lib/catalog-display.ts` for the same reason
 * `barcode.ts` moved**: a second caller outside the web app needs the identical
 * answer. The render harness composes real catalog rows into pages, and the pack
 * line it draws has to be the string the product card draws, or a block sized
 * against the harness is sized against a label the app never shows.
 *
 * `packages/types` is the only package with no dependencies, so a browser
 * bundle, a CLI script and the engine harness can all import it. `packages/db`
 * owns the three columns but pulls Prisma and BullMQ with it.
 *
 * Everything here is pure. Nothing reads the database.
 */

import type { PackUnit } from './index'

/** Just the three pack columns — anything carrying them can be labelled. */
export interface PackFields {
  packSize: string | null
  packUnit: PackUnit | null
  packCount: number | null
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
const UNIT_LABEL: Record<PackUnit, string> = {
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
export function packLabel(product: PackFields): string | null {
  if (!product.packSize) return null

  const unit = product.packUnit ? UNIT_LABEL[product.packUnit] : ''
  const size = unit ? `${product.packSize} ${unit}` : product.packSize

  // The multiplication sign, not the letter x. A multipack is 8 × 25 g.
  return product.packCount && product.packCount > 1
    ? `${product.packCount} × ${size}`
    : size
}
