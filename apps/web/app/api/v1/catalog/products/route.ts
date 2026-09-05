import type { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { browseCatalog } from '@/lib/catalog'

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
