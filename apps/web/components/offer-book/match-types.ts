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
/**
 * One resolved row on its way to `POST /api/v1/offer-books`.
 *
 * **Declared here rather than in either component**, because the matcher
 * produces it and the wizard posts it, and a shape spelled out twice is a shape
 * that drifts — the price columns were added on 15 September and would have had
 * to be added in both places.
 */
export type ResolvedRow = {
  /**
   * The catalog row this offer draws from, or **null when the sheet named a
   * product the catalog has never heard of**.
   *
   * Null is not a failure and does not drop the row. The catalog is how an offer
   * finds its *photograph*; a shop's own lines — private label, the bakery
   * counter — are in nobody's universal catalog and are still the products they
   * are promoting. `POST /api/v1/offer-books` writes them into the
   * organization's own collection as it creates the book, and the card draws the
   * placeholder until somebody adds a picture.
   */
  catalogProductId: string | null
  /** The sheet's spelling, carried so the server can create the row. */
  name: string
  /** Validated on the server before it is written. */
  barcode?: string
  /** The mark. What the customer pays. */
  price: string | null
  /** The strikethrough, where the sheet gave a genuine was-price. */
  comparePrice: string | null
  /** A promotion the two prices cannot express. */
  chip?: { labelEn: string; labelAr: string | null }
}

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
    return 'No value in this column is a barcode. It looks like an internal code. Those rows will be matched on their name instead.'
  }
  if (stats.valid < stats.total) {
    return `${stats.valid} of ${stats.total} rows carry a barcode. The rest will be matched on their name.`
  }
  return 'Every row carries a barcode. These will match exactly.'
}

/**
 * Header spellings for the promotion columns, guessed here rather than by
 * `inferColumnMap`.
 *
 * **`HEADER_HINTS` is the *catalog's* vocabulary and none of these are catalog
 * fields** — a catalog product has no price at all, let alone a was-price or a
 * promotion. Teaching it promo semantics to serve this screen would risk the
 * import that writes products to serve the one that writes a flyer.
 *
 * **Matched exactly, where `inferColumnMap` matches on substrings**, and that
 * difference is the whole reason this exists. Substring matching claimed
 * `Price before` for `price` because it contains "price", left `Price now` with
 * nothing, and claimed `Offer type` for `specEn` because it contains "type" —
 * on the template this app hands out. Exact matching cannot do any of that; the
 * cost is that an unlisted spelling is guessed as nothing rather than guessed
 * as the wrong thing, which on a screen with four selects and a visible result
 * is the better failure.
 */
const NOW_HINTS = ['pricenow', 'nowprice', 'newprice', 'offerprice', 'promoprice', 'specialprice', 'price', 'sellingprice', 'rate', 'amount', 'السعر']
const WAS_HINTS = ['pricebefore', 'beforeprice', 'wasprice', 'oldprice', 'was', 'old', 'regularprice', 'normalprice', 'listprice', 'mrp', 'السعرالقديم', 'قبل']
const PERCENT_HINTS = ['discount', 'discountpercent', 'discountpct', 'percent', 'percentage', 'off', 'savepercent', 'نسبةالخصم', 'الخصم']
const TYPE_COLUMN_HINTS = ['offertype', 'promotype', 'promotiontype', 'dealtype', 'type', 'promotion', 'deal', 'نوعالعرض']

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** First header matching one of `hints` exactly, and not already claimed. */
export function guessHeader(headers: string[], hints: string[], taken: string[]): string {
  return (
    headers.find(
      (header) => !taken.includes(header) && hints.includes(normalizeHeader(header))
    ) ?? ''
  )
}

/**
 * All four promotion columns at once, each claiming a header the others cannot
 * then take.
 *
 * **Was before now**, because a sheet with only `Price` means the price — and a
 * sheet with `Old Price` and `Price` means both, with the second being the
 * promotion. Claiming `now` first would take `Price` from a sheet that has a
 * was-price to pair it with, which is the same answer, and claiming `was` first
 * costs nothing when there is no was-price column at all.
 */
export function guessOfferColumns(headers: string[]): {
  was: string
  now: string
  percent: string
  type: string
} {
  const was = guessHeader(headers, WAS_HINTS, [])
  const now = guessHeader(headers, NOW_HINTS, [was])
  const percent = guessHeader(headers, PERCENT_HINTS, [was, now])
  const type = guessHeader(headers, TYPE_COLUMN_HINTS, [was, now, percent])
  return { was, now, percent, type }
}

