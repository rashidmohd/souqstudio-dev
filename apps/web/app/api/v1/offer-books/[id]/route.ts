import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { deleteDraftBook, loadBook, renameBook } from '@/lib/offer-book'

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

/**
 * Rename a book. E6 — `docs/E6-create-flow.md` §4.
 *
 * **This route is what makes the generated name defensible**, and it shipped in
 * the same change that stopped asking for one. The creation screen used to open
 * with a title field and refuse to submit without it, which asked the least
 * consequential question on the screen first, about a thing that did not exist
 * yet. Now a book is named for the week or the day and the owner renames it in
 * the editor, once they have seen what they made.
 *
 * Without this, every book a shop owns is called "Week 37 offers" forever and
 * the list they pick from is unusable. It is not a follow-up.
 *
 * **A rename and not a general patch.** `apps/web/CLAUDE.md` is explicit that
 * autosave is per resource — a price patches the offer, a nudge patches the
 * page, a block patches the block — and that there is no whole-book patch,
 * because a partial write of one is a book that is half one version and half
 * another. The title is a property of the book itself, which is why it is here
 * and why `title` is the only field.
 */
const renameSchema = z.object({
  // The same bound the column and the create route both carry. Trimmed first,
  // so a title of three spaces is rejected rather than stored.
  title: z.string().trim().min(1).max(160),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const body = await request.json().catch(() => null)
  const parsed = renameSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Give the book a name of up to 160 characters.')
  }

  const renamed = await renameBook(params.id, session.user.organizationId, parsed.data.title)

  if (renamed === null) {
    return fail('not_found', 'That offer book does not exist.', 404)
  }

  return ok(renamed)
}

/**
 * Discard a draft. E6 — `docs/E6-create-flow.md` §2.4.
 *
 * **The preview's second action.** A book is written before its preview is drawn
 * — `loadBook` runs the engine over database rows and there is no second path
 * that composes from a request body — so an owner who looks at what they made
 * and does not want it needs a way to take it back. Leaving it is a home screen
 * that fills with abandoned attempts and teaches the owner to ignore the list.
 *
 * **Draft only**, and `deleteDraftBook` enforces that in the query rather than
 * here. A published book has a short code that may be printed on a flyer, view
 * counts, export jobs and a share link; deleting one is E10's problem and wants
 * a dialog that names it. This one is seconds old and has none of that.
 *
 * No dialog in front of it, per the design system: prefer undo over confirm for
 * anything a screen can offer back. The creation flow is still open behind the
 * preview, so discarding returns the owner to the choices they just made rather
 * than losing them.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const deleted = await deleteDraftBook(params.id, session.user.organizationId)

  // Not yours, already gone, and published are one answer on purpose. The first
  // two must not be distinguishable, and the third is reachable only by a client
  // that raced its own publish.
  if (!deleted) {
    return fail(
      'not_draft',
      'That offer book is not a draft you can discard.',
      404
    )
  }

  return ok({ id: params.id })
}
