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

/**
 * The derived unit price — `(1 kg = 1.76)`. E5 §4.
 *
 * Not legally required in the GCC, and it costs nothing and reads as credible,
 * so it defaults on.
 *
 * **Normalised to a base unit**, so two packs of the same product are
 * comparable: grams and millilitres resolve to kilograms and litres, pieces
 * stay pieces. A shelf figure quoted per 100 g beside one quoted per kilo is
 * two numbers a customer cannot use.
 *
 * **The one place this codebase divides money, and deliberately not the place
 * it stores it.** A rate is not an amount: `price ÷ quantity` has no exact
 * decimal representation in general — a third of a dirham is 0.333… — so the
 * question is not whether to round but where. Three decimals, matching
 * `offers.unitPriceValue`, and E5 §4 requires the result to be *frozen on the
 * offer at publish* so a reprint reproduces the number that was printed rather
 * than recomputing against pack data since corrected.
 *
 * Returns null rather than a wrong number whenever the pack cannot answer:
 * E5 §4 is explicit that a null reads as no line at all, because "500g" in a
 * free-text column cannot be split reliably and a wrong rate on a printed page
 * is worse than a missing one.
 */
export interface DerivedUnitPrice {
  /** To three decimals, as text — the same discipline every price here follows. */
  value: string
  unit: 'KG' | 'L' | 'PIECE'
}

/** How much of the base unit one pack holds. Grams and millilitres scale down. */
const BASE_OF: Record<PackUnit, { unit: DerivedUnitPrice['unit']; per: number }> = {
  G: { unit: 'KG', per: 1000 },
  KG: { unit: 'KG', per: 1 },
  ML: { unit: 'L', per: 1000 },
  L: { unit: 'L', per: 1 },
  PIECE: { unit: 'PIECE', per: 1 },
}

export function deriveUnitPrice(
  price: string | number,
  pack: PackFields
): DerivedUnitPrice | null {
  if (pack.packSize === null || pack.packUnit === null) return null

  const size = Number(pack.packSize)
  const amount = Number(price)
  const count = pack.packCount === null || pack.packCount < 1 ? 1 : pack.packCount
  const base = BASE_OF[pack.packUnit]

  if (!Number.isFinite(size) || !Number.isFinite(amount) || size <= 0) return null
  // A zero price is unset rather than free — `createBook` writes it as the only
  // honest placeholder — so deriving `0.000 per kg` from it would print a
  // number nobody chose beside a card already flagged as unpriced.
  if (amount <= 0) return null

  const quantity = (size * count) / base.per
  if (quantity <= 0) return null

  return { value: (amount / quantity).toFixed(3), unit: base.unit }
}

/** `(1 kg = 1.760)` — the line as a card prints it, currency added by the caller. */
export function unitPriceLabel(derived: DerivedUnitPrice): string {
  const unit = derived.unit === 'PIECE' ? 'each' : UNIT_LABEL[derived.unit]
  return derived.unit === 'PIECE' ? `${derived.value} ${unit}` : `1 ${unit} = ${derived.value}`
}
