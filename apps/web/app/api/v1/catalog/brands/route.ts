import type { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { suggestBrands } from '@/lib/catalog'

/**
 * E5-04 — brand suggestions for the add-a-product form.
 *
 * Its own route rather than a branch of `/catalog/search`, because it answers a
 * different question about a different column: search ranks *products*, this
 * returns distinct *brand strings*. Folding them together would mean a response
 * the client has to branch on, which is the same mistake as one empty-state
 * component serving both empty and zero-results.
 *
 * **Suggestions, not a vocabulary.** The field they feed accepts anything typed
 * into it. See `suggestBrands` for why brands stay free text.
 *
 * Empty `q` returns an empty list rather than every brand in the catalog: this
 * feeds a datalist as the owner types, and the whole catalog is neither useful
 * to show nor cheap to send once the Open Food Facts seed has run.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const q = req.nextUrl.searchParams.get('q') ?? ''

  return ok({ brands: await suggestBrands(session, q) })
}
