import type { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { listCategories, listSubcategories } from '@/lib/catalog'

/**
 * E5-02 — the category tiles, and the subcategories inside one.
 *
 * One route rather than two because they are one question asked at two depths,
 * and the breadcrumb walks between them. `parent` names a category by the same
 * string `catalog_products.category` carries; there is no id involved, because
 * the product column is a plain string rather than a foreign key.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const parent = req.nextUrl.searchParams.get('parent')?.trim()

  if (parent) {
    return ok({ subcategories: await listSubcategories(session, parent) })
  }

  return ok({ categories: await listCategories(session) })
}
