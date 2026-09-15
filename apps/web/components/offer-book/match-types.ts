import type { CatalogProductSummary, ImportRowStatus } from '@souqstudio/types'

/**
 * What `POST /api/v1/offer-books/match` says about one row of a price list.
 *
 * **Here rather than imported from the route**, which is the same boundary
 * `PickableBlock` sits on: the route module imports `lib/catalog.ts`, which is
 * `server-only`, so a `'use client'` component that imported the type from there
 * would pull the module graph with it. A type is erased at build; the import
 * that carries it is not.
 *
 * The route re-exports its own `MatchedRow` for a server-side caller, and the
 * two are checked against each other by `match-types.test.ts` — a structural
 * assignment in both directions, which is the cheapest way to make a drift
 * between them a compile error rather than a runtime surprise.
 */
export type MatchedRow = {
  /** Position in the sheet. Keys the table, and orders the resulting book. */
  index: number
  /** The row as the sheet spells it. Shown back to the owner in their words. */
  name: string
  /** A decimal string as `parsePrice` read it, or null for a row with no price. */
  price: string | null
  status: ImportRowStatus
  /** Set only when the matcher decided on its own. */
  product: CatalogProductSummary | null
  /** Ranked, when it could not. Empty otherwise. */
  candidates: Array<{ product: CatalogProductSummary; score: number }>
}

/**
 * What to say under the barcode select.
 *
 * **Three states, because there are three situations and they want different
 * sentences.** No column is a suggestion; a column that checks out is a
 * reassurance; a column that does not is the one that matters — it names what
 * the owner probably picked and says what will happen instead, rather than
 * leaving them to infer it from a match rate.
 *
 * It never refuses the column. A sheet can carry barcodes for its branded lines
 * and internal codes for the rest, and a partial column is still worth sending.
 */
export function barcodeHint(stats: { valid: number; total: number } | null): string {
  if (stats === null) {
    return 'Strongly recommended. A barcode is an exact match where a name is a guess.'
  }
  if (stats.valid === 0) {
    return 'No value in this column is a barcode — it looks like an internal code. Those rows will be matched on their name instead.'
  }
  if (stats.valid < stats.total) {
    return `${stats.valid} of ${stats.total} rows carry a barcode. The rest will be matched on their name.`
  }
  return 'Every row carries a barcode. These will match exactly.'
}
