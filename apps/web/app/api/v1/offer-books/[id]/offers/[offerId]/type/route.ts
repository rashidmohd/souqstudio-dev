import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { OFFER_TYPES, OFFER_TYPE_CHIP_KIND, type OfferTypeKey } from '@souqstudio/designer/lib/offer-types'

/**
 * What kind of promotion this offer is. E6-03, and the editor's half of
 * `docs/E6-create-flow.md` §18.
 *
 * **A `PUT`, because an offer has one mechanic and not a list of them.** The
 * chips route next door appends — a card may carry four — and appending here
 * would let an owner set buy-2-get-1 over buy-1-get-1 and print both. So this
 * replaces: it deletes whatever offer-type chip the offer had and writes the
 * new one, in one transaction, and `null` clears it.
 *
 * **The mechanic is identified by chip kind rather than by a column.** `SCALE`
 * has meant "Buy N of M" since E5 and the editor's own dropdown said so; at
 * most one per offer is this. That is what makes "replace" expressible without
 * a migration — see `lib/offer-types.ts`.
 *
 * **The words come from the vocabulary, never from the client.** A request
 * names a *key*; the route looks up the bilingual phrase. If the label were
 * sent, a book built by hand and a book built from a sheet would drift apart
 * the first time somebody typed "BOGO" instead — which is the whole reason the
 * set is closed. `custom` is the one exception and it is explicitly the owner's
 * own words.
 */

const schema = z.union([
  /**
   * A mechanic from the closed set. The key is validated against the table
   * itself, so adding a row to `OFFER_TYPES` extends this route with no edit.
   */
  z.object({
    kind: z.literal('known'),
    key: z.string().refine((value): value is OfferTypeKey => value in OFFER_TYPES, {
      message: 'Unknown offer type.',
    }),
  }),
  /**
   * The owner's own promotion. Bounded at 40 for the same reason the import's
   * is: it lands on a card and the fit ladder will shrink it until it is
   * illegible rather than refuse it.
   *
   * `labelAr` is theirs to supply and its absence is not a publish blocker —
   * a chip is copy, not catalog data, and E5 §2's rule is about the latter.
   */
  z.object({
    kind: z.literal('custom'),
    labelEn: z.string().trim().min(1).max(40),
    labelAr: z.string().trim().max(60).nullable().optional(),
  }),
  /** No promotion beyond what the prices say. Clears the chip. */
  z.object({ kind: z.literal('none') }),
])

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That offer type could not be applied.', 422)
  }

  // The offer, its book and the organization in one predicate — the rule every
  // route in this epic follows.
  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true },
  })
  if (offer === null) return fail('not_found', 'That offer does not exist.', 404)

  /**
   * The phrase to write, or null to leave the offer with no mechanic.
   *
   * `discount` resolves to null here and that is not a special case bolted on:
   * it is a row in the table whose phrase *is* null, because the two prices are
   * the whole message. An owner picking it means the same as picking none.
   */
  const phrase: { labelEn: string; labelAr: string | null } | null =
    parsed.data.kind === 'none'
      ? null
      : parsed.data.kind === 'custom'
        ? { labelEn: parsed.data.labelEn, labelAr: parsed.data.labelAr ?? null }
        : OFFER_TYPES[parsed.data.key]

  const chip = await prisma.$transaction(async (tx) => {
    // Delete then write, inside one transaction: two tabs setting a mechanic at
    // once must not leave a card carrying both.
    await tx.offerChip.deleteMany({
      where: { offerId: offer.id, kind: OFFER_TYPE_CHIP_KIND },
    })

    if (phrase === null) return null

    return tx.offerChip.create({
      data: {
        offerId: offer.id,
        kind: OFFER_TYPE_CHIP_KIND,
        labelEn: phrase.labelEn,
        labelAr: phrase.labelAr,
        // The corner a mechanic belongs in, not a choice. A promotion is the
        // second-loudest thing on a card after the price, and letting it move
        // per offer is how sixty cards get sixty layouts — the same argument
        // §3a makes about the price mark's own arrangement.
        anchor: 'TOP_START',
      },
      select: { id: true, kind: true, labelEn: true, labelAr: true, anchor: true },
    })
  })

  return ok({ chip })
}
