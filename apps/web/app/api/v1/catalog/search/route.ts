import type { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { searchCatalog } from '@/lib/catalog'

/**
 * E5-01 — catalog search.
 *
 * **`lang` is deliberately not a parameter here**, though api-conventions.md
 * listed one. Every row carries both languages and the client picks with
 * `displayName()`, because the same fetch feeds an English panel and an Arabic
 * one — a server that resolved the name would have to be called twice to show
 * both, and the import review screen needs the pair regardless. Ranking does
 * not vary by language either: the vector spans `nameEn` and `nameAr` at the
 * same weight, which is what makes an English and an Arabic query return the
 * same row.
 *
 * An empty or all-punctuation query returns an empty list, not an error. The
 * screen answers it by showing the category browser, which is E5-02's job — a
 * 400 here would make the owner's first keystroke look like a failure.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const params = req.nextUrl.searchParams
  const limit = Number(params.get('limit'))
  const category = params.get('category')?.trim()

  const items = await searchCatalog(session, {
    q: params.get('q') ?? '',
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    ...(category ? { category } : {}),
  })

  return ok({ items })
}
