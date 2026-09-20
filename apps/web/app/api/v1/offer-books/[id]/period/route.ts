import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireApiSession } from '@/lib/api-session'
import { fail, ok } from '@/lib/api'
import { setBookPeriod } from '@/lib/offer-book'

/**
 * The offer period a book's header prints. E14 §3.4.
 *
 * ```
 * PATCH /api/v1/offer-books/:id/period  { validFrom, validTo }
 * ```
 *
 * **Its own route rather than a field on the rename.** `apps/web/CLAUDE.md` is
 * explicit that autosave is per resource — a price patches the offer, a nudge
 * patches the page — and that there is no whole-book patch, because a partial
 * write of one is a book half in each version. The rename route says the same
 * thing about itself and gives `title` as its only field; this is the sibling
 * that argument implies, not an exception to it.
 *
 * **Not `expiresAt`, which is the neighbouring column and the wrong one.** That
 * is when the share *link* stops working, a fact about a URL. This is a claim a
 * flyer makes about when prices hold, and the two are set for different reasons
 * and to different days — borrowing one for the other prints a date the shop
 * never chose.
 */
const periodSchema = z
  .object({
    // A date, not a timestamp: an offer period has no time of day, and one would
    // put a Dubai shop's Friday in another timezone's Thursday. The column is
    // `date` for the same reason.
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .refine(
    (value) => value.validFrom === null || value.validTo === null || value.validFrom <= value.validTo,
    // ISO dates sort lexicographically, so this needs no parsing to be correct.
    { message: 'end-before-start' }
  )

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const body = await request.json().catch(() => null)
  const parsed = periodSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Give a start and end date, with the end on or after the start.')
  }

  // **Parsed as UTC midnight.** `new Date('2026-10-01')` is UTC by definition
  // where `new Date('2026-10-01T00:00:00')` is local, and the server's local
  // zone is a deployment detail. The column is a `date`, so only the calendar
  // day survives — but it has to be the right one.
  const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value))

  const saved = await setBookPeriod(params.id, session.user.organizationId, {
    validFrom: toDate(parsed.data.validFrom),
    validTo: toDate(parsed.data.validTo),
  })

  if (saved === null) {
    return fail('not_found', 'That offer book does not exist.', 404)
  }

  return ok({
    id: saved.id,
    validFrom: parsed.data.validFrom,
    validTo: parsed.data.validTo,
  })
}
