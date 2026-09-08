import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { duplicateBook } from '@/lib/offer-book'

/**
 * E6 — "Duplicate last week".
 *
 * **The control the design skill expects to be the most-used in the product**,
 * and the whole reason the flow model exists: a `flow` region binds to a
 * *position* in the product list rather than to a product, so last week's book
 * with this week's prices is a copy plus some typing, not a rebuild.
 *
 * A copy is a **draft with its own short code**. Nothing about the original's
 * reach comes with it — not the link, not the password, not the expiry, and not
 * a view count. A duplicate that inherited `shortCode` would be two books at one
 * public address; one that inherited `linkActive` would publish itself the
 * moment it was made.
 */

const schema = z.object({
  /** Defaults to "<title> copy", uniqueness left to the owner. */
  title: z.string().trim().min(1).max(160).optional(),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // An empty body is the ordinary case — the button sends nothing — so a parse
  // failure here is a malformed title rather than a missing one.
  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    return fail('invalid_request', 'Give the copy a title, then try again.')
  }

  const copy = await duplicateBook(
    params.id,
    session.user.organizationId,
    parsed.data.title === undefined ? {} : { title: parsed.data.title }
  )

  if (copy === null) {
    return fail('not_found', 'That offer book does not exist.', 404)
  }

  return ok(copy, 201)
}
