import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { loadBook } from '@/lib/offer-book'

/**
 * E6 — one book, composed into pages.
 *
 * **This returns engine output, not rows.** The offers are resolved into the
 * edition's strings with their fallbacks and quality flags, and `pages` is what
 * `flowBook` produced: which block renders where, at what rectangle, carrying
 * which offer. A client that wanted the rows would be re-implementing the
 * composition, and two implementations of *where things go* is the one thing
 * `packages/engine` exists to prevent.
 *
 * The editor screen does **not** call this — it is a server component and reads
 * `loadBook` directly, the same way `/catalog` reads `lib/catalog.ts`. This
 * route exists for anything outside the render tree: the export worker, and for
 * now, looking at a composed book before a screen draws one.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const book = await loadBook(params.id, session.user.organizationId)

  // Not found and not yours are the same answer on purpose. Telling a caller
  // that a book exists but belongs to someone else confirms the id.
  if (book === null) {
    return fail('not_found', 'That offer book does not exist.', 404)
  }

  return ok(book)
}
