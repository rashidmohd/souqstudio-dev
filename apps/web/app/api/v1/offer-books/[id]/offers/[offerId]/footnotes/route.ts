import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-03 — footnotes on an offer.
 *
 * **No marker number is stored, and that is E6 §8's rule rather than an
 * omission.** Markers are assigned at render time in reading order, so an
 * Arabic edition numbers right-to-left and an English one left-to-right from
 * the same rows. Storing the number would give two answers that can disagree,
 * and the one on paper would be the wrong one.
 *
 * `PAGE` scope collects into the page's footer band; `BOOK` scope collects into
 * a terms block on the last page. Identical text within a scope dedupes to one
 * marker — `assignFootnoteMarkers` in the engine is where that happens.
 */

const createSchema = z.object({
  textEn: z.string().trim().min(1).max(240),
  textAr: z.string().trim().max(240).nullable().optional(),
  scope: z.enum(['PAGE', 'BOOK']).default('PAGE'),
})

/** Three notes on one offer is already a card arguing with itself. */
const MAX_FOOTNOTES = 3

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Write the note, then try again.', 422)
  }

  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true },
  })
  if (offer === null) return fail('not_found', 'That offer does not exist.', 404)

  const note = await prisma.$transaction(async (tx) => {
    const existing = await tx.offerFootnote.count({ where: { offerId: offer.id } })
    if (existing >= MAX_FOOTNOTES) return null

    return tx.offerFootnote.create({
      data: {
        offerId: offer.id,
        textEn: parsed.data.textEn,
        textAr: parsed.data.textAr ?? null,
        scope: parsed.data.scope,
      },
      select: { id: true, textEn: true, textAr: true, scope: true },
    })
  })

  if (note === null) {
    return fail(
      'too_many_footnotes',
      `An offer carries at most ${MAX_FOOTNOTES} notes. Remove one first.`,
      422
    )
  }

  return ok(note, 201)
}
