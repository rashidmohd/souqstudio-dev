import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { CatalogProductSummary, ImportRowStatus } from '@souqstudio/types'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { matchImportRows, summariesByIds } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'
import { resolveRow } from '@/lib/catalog-import'

/**
 * Match a price list against the catalog, without importing anything.
 * E6 — `docs/E6-create-flow.md` §2.3.
 *
 * **The whole point is what it does not do.** An owner holding the sheet they
 * were going to make a flyer from used to have no way to say so: the creation
 * screen offered "from a spreadsheet" only when `listImportsForBook` returned
 * something, which required having already gone to `/catalog/import` on an
 * earlier visit, mapped columns, reviewed matches and committed the sheet **into
 * the catalog**. That flow exists for a different job — adding products a shop
 * sells — and dragging it in front of someone making a flyer means editing the
 * catalog as a side effect of a promotion.
 *
 * So this matches and returns. No `catalog_imports` row, no
 * `catalog_import_rows`, no `catalog_products`, nothing written at all. The
 * owner resolves what they see, the answers go to `POST /api/v1/offer-books` as
 * `rows`, and the catalog is exactly as it was.
 *
 * **The matching itself is E5-06's, unchanged and not reimplemented.**
 * `matchImportRows` resolves a whole sheet in two queries that fan out over
 * `unnest` — tsvector for recall, trigram `similarity()` for a true 0..1 score —
 * and `resolveRow` turns that into a status against thresholds already tuned for
 * the asymmetry that matters here: an extra ambiguous row costs one click, and a
 * wrong matched row puts the wrong product on a printed flyer at the right
 * price, where nobody catches it until it is on a shelf. Both are pure functions
 * over data the caller supplies. Neither ever needed an import row to run; that
 * they only had one caller is what made them look like they did.
 *
 * **A read that takes a body, hence `POST`.** A sheet does not fit in a query
 * string. Nothing about it is a write.
 *
 * **The rows are parsed in the browser**, unlike E5-06's `PATCH
 * /api/v1/catalog/imports/:id`, which re-reads the file from `sourceKey` rather
 * than trusting a client-held parse. That rule is about a flow spanning several
 * visits whose commit writes to the catalog, where the rows reviewed must
 * provably be the rows in the file. Here nothing is persisted, the sitting is
 * one, and every product id the client sends back is filtered against what the
 * organization can see before it becomes an offer — `visibleProductIds` in
 * `lib/offer-book.ts`. `lib/csv.ts` and `lib/catalog-import.ts` are both pure
 * and both already documented as running in the browser for exactly this.
 */

/** The same bound the create route puts on a book. A sheet longer than this is
 *  a request that can run for a long time on somebody else's behalf. */
const MAX_ROWS = 200

const matchSchema = z.object({
  rows: z
    .array(
      z.object({
        /** The product name as the sheet spells it. What gets matched. */
        name: z.string().trim().min(1).max(300),
        /** Optional and worth a lot when present: a barcode match is an identity. */
        barcode: z.string().trim().max(64).optional(),
        /** Carried through untouched, as text. This route does not read it. */
        price: z.string().trim().max(32).nullable().default(null),
      })
    )
    .min(1)
    .max(MAX_ROWS),
})

export interface MatchedRow {
  /** Position in the sheet. The client keys its table on this. */
  index: number
  name: string
  price: string | null
  status: ImportRowStatus
  /** Set only on `MATCHED`. */
  product: CatalogProductSummary | null
  /** Ranked, on `AMBIGUOUS`. Empty on the other two. */
  candidates: Array<{ product: CatalogProductSummary; score: number }>
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const body = await request.json().catch(() => null)
  const parsed = matchSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Check the file has a product name in every row.')
  }

  const needles = parsed.data.rows.map((row, index) => {
    // A barcode that fails its check digit is a mistyped number, not an
    // identity, and feeding it to the matcher would let a typo claim a row
    // outright — `resolveRow` trusts a barcode hit over any name score. Same
    // guard the E5-06 route applies before matching.
    const barcode = row.barcode === undefined ? null : normalizeBarcode(row.barcode)
    return {
      index,
      name: row.name,
      barcode: barcode !== null && hasValidCheckDigit(barcode) ? barcode : null,
    }
  })

  const matches = await matchImportRows(session, needles)

  // Paired with its row rather than kept in a parallel array indexed by
  // position. Two arrays that must stay aligned is the shape the CSV parser and
  // `insertBook` both go out of their way to avoid, and for the same reason: a
  // mispairing here puts one row's match against another row's price.
  const resolved = parsed.data.rows.map((row, index) => ({
    row,
    index,
    resolution: resolveRow({
      barcodeMatchId: matches.byBarcode.get(index) ?? null,
      candidates: matches.byName.get(index) ?? [],
    }),
  }))

  // One query for every product any row referred to, rather than one per row.
  // The same reason `matchImportRows` fans out: a two-hundred-row sheet doing a
  // round trip per row is minutes against a hosted database.
  const referenced = new Set<string>()
  for (const { resolution } of resolved) {
    if (resolution.catalogProductId !== null) referenced.add(resolution.catalogProductId)
    for (const candidate of resolution.candidates) referenced.add(candidate.catalogProductId)
  }
  const summaries = await summariesByIds(session, [...referenced])

  const rows: MatchedRow[] = resolved.map(({ row, index, resolution }) => {
    const product =
      resolution.catalogProductId === null
        ? null
        : summaries.get(resolution.catalogProductId) ?? null

    return {
      index,
      name: row.name,
      price: row.price,
      // A row whose match was dropped by the tenancy filter in `summariesByIds`
      // is unmatched, not matched-to-nothing. Reporting it as MATCHED with a
      // null product would put a blank card in the owner's table.
      status: resolution.status === 'MATCHED' && product === null ? 'UNMATCHED' : resolution.status,
      product,
      candidates: resolution.candidates.flatMap((candidate) => {
        const summary = summaries.get(candidate.catalogProductId)
        return summary === undefined ? [] : [{ product: summary, score: candidate.score }]
      }),
    }
  })

  return ok({
    rows,
    matched: rows.filter((row) => row.status === 'MATCHED').length,
    ambiguous: rows.filter((row) => row.status === 'AMBIGUOUS').length,
    unmatched: rows.filter((row) => row.status === 'UNMATCHED').length,
  })
}
