/**
 * What a barcode is. E5-03, and the E5-06 import.
 *
 * **Here rather than in `apps/web`, because three callers need the same
 * answer**: the search box routing a scanned code, the contribution route
 * refusing a mistyped one, and the Open Food Facts importer deciding which of
 * several million public rows carries a code worth trusting. A second copy of
 * the check-digit rule is a copy that eventually disagrees, and the direction it
 * disagrees in is a bad barcode in the universal catalog shadowing the real
 * product it will never match.
 *
 * `packages/types` is the only package with no dependencies at all, so it is the
 * only one both a browser bundle and a CLI script can import. `packages/db`
 * would be the natural home — it owns the column and its two unique indexes —
 * but importing it pulls Prisma and BullMQ into the client.
 */

/** The four GTIN lengths in use: EAN-8, UPC-A, EAN-13, GTIN-14. */
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
 * Checked before the database is asked. A mistyped code and a code we have never
 * seen are different answers: one is "check what you typed", the other is "add
 * this product", and telling an owner to add a product that already exists under
 * the right number is how a catalog fills with duplicates.
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
