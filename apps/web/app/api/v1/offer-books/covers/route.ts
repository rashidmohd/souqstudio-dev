import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { BookCover } from '@souqstudio/designer/lib/offer-book-compose'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { composeCover } from '@/lib/offer-book'

/**
 * First pages for a handful of books, drawn on demand.
 * `docs/E6-create-flow.md` §23.
 *
 * **The home screen composes its six on the server and this serves the rest.**
 * The "earlier books" dialog had no pictures precisely because a cover is a full
 * composition, and forty of them are not something to do before a page paints.
 * Doing them when the dialog is opened, a page at a time, puts the cost where
 * somebody has actually asked for it.
 *
 * **A read that takes a body, hence `POST`** — the same shape and the same
 * reason as `/offer-books/match`: a list of ids does not belong in a query
 * string, and nothing here is a write.
 *
 * **Twelve at a time.** Each one runs the engine, so the bound is what stops a
 * client asking for a hundred and holding a connection open while they compose.
 * The dialog asks for the next twelve when the owner says so.
 *
 * A book that will not compose is simply **absent** from the answer rather than
 * an error: its tile falls back to a glyph and still opens, and one bad book
 * must not cost the other eleven their pictures.
 */
const MAX_COVERS = 12

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_COVERS),
})

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_request', 'Those books could not be drawn.', 422)

  /*
   * `composeCover` filters by organization itself — `loadBook` takes the id and
   * the organization in one predicate — so a book belonging to somebody else
   * comes back null and is absent from the answer. **A book that is not theirs
   * and a book that does not exist are the same answer on purpose**, which is
   * the rule the preview route already states: a different response for the
   * second confirms the id.
   */
  const composed = await Promise.all(
    [...new Set(parsed.data.ids)].map(async (id): Promise<[string, BookCover] | null> => {
      const cover = await composeCover(id, session.user.organizationId)
      return cover === null ? null : [id, cover]
    })
  )

  return ok({ covers: Object.fromEntries(composed.filter((entry) => entry !== null)) })
}
