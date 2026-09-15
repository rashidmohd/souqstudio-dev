import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { adoptRowsIntoCatalog, browseCatalog } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'

/**
 * E5-02 — the products inside a category, cursor-paged.
 *
 * Separate from `/catalog/search` because the two return different shapes and
 * mean different things: search is a ranked top ten with no paging, browsing is
 * an ordered page of everything under a heading. One route serving both would
 * have to return a union the client branches on, which is the same mistake as a
 * single empty-state component for empty and zero-results.
 *
 * `category` is required. Browsing with no category is the tile screen, and
 * that is a different endpoint rather than an unbounded read of the table.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const params = req.nextUrl.searchParams
  const category = params.get('category')?.trim()
  if (!category) {
    return fail('category_required', 'Choose a category to browse.', 422)
  }

  const subcategory = params.get('subcategory')?.trim()
  const cursor = params.get('cursor')?.trim()
  const limit = Number(params.get('limit'))

  return ok(
    await browseCatalog(session, {
      category,
      ...(subcategory ? { subcategory } : {}),
      ...(cursor ? { cursor } : {}),
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    })
  )
}

/**
 * Add price-list rows the matcher could not place to this shop's own
 * collection. `docs/E6-create-flow.md` §16.
 *
 * **Not `/catalog/contributions`, and the difference is a photograph.** E5-04
 * takes one product *with an image* and writes a `product_contributions` row for
 * the E5-05 review queue, because what it is doing is offering a product to the
 * universal catalog. This takes a page of names off a spreadsheet, writes them
 * into the organization's private collection, and queues nothing — there is no
 * image to remove a background from and nothing for a reviewer to promote.
 *
 * **It is the answer to "a shop's own lines are in nobody's universal catalog".**
 * Private label, the bakery counter, local brands: the matcher will never place
 * them, and before this the flow listed them and skipped them, so a grocery got
 * a book missing exactly the products they make the most margin on.
 *
 * **Bounded by the same 200 as the sheet.** Longer than that is a request that
 * runs for a long time on somebody else's behalf, which is the reason
 * `/offer-books/match` carries the same number.
 *
 * `viewer` is refused, as it is on every other write in the catalog. Adding
 * products is an edit to shared organization data, which is the permission
 * question `E6-create-flow.md` §8.1 raised when it deferred this.
 */
const MAX_ROWS = 200

const adoptSchema = z.object({
  rows: z
    .array(
      z.object({
        /** Position in the sheet, so the client can put the id back on its row. */
        index: z.number().int().min(0).max(MAX_ROWS - 1),
        nameEn: z.string().trim().min(1).max(200),
        barcode: z.string().trim().max(64).optional(),
      })
    )
    .min(1)
    .max(MAX_ROWS),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)
  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to add products.', 403)
  }

  const parsed = adoptSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_input', 'Those rows could not be added. Try matching again.', 422)
  }

  const rows = parsed.data.rows.map((row) => {
    /*
     * **The same barcode guard as everywhere else, and it matters more here.**
     * A value that fails the GS1 check digit is an internal item code rather
     * than an identity, and writing one into `barcode` would claim the column
     * for a number no scanner will ever produce — then collide with a real GTIN
     * on `@@unique([organizationId, barcode])` the day one arrives.
     */
    const barcode = row.barcode === undefined ? null : normalizeBarcode(row.barcode)
    return {
      index: row.index,
      nameEn: row.nameEn,
      ...(barcode !== null && hasValidCheckDigit(barcode) ? { barcode } : {}),
    }
  })

  const adopted = await adoptRowsIntoCatalog(session, rows)
  return ok({ rows: adopted, added: adopted.length }, 201)
}
