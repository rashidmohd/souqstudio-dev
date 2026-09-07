import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-02 — a second product on an existing offer.
 *
 * *"Pesto Rosso **or** Pasta Sauce Basilico"* — the epic calls this a
 * first-class action rather than an edge case, and it is what `OfferItem`
 * exists for. `composeOffer` has rendered it since the compose path was
 * written; nothing could author one until now.
 *
 * **A multi-item offer is one card at one price, not two cards.** Item 0
 * supplies the brand lockup and the packshot — the schema's own note on
 * `OfferItem.position` — and later items contribute their name and spec joined
 * by the connector. So this appends; it never inserts at 0.
 */

const schema = z.object({
  catalogProductId: z.string().min(1),
  /** Rendered before this item's name. Required here because an appended item
   *  always has something in front of it — the null is only ever item 0's. */
  connector: z.enum(['OR', 'AND']),
})

/**
 * `plans.maxProductsPerBook` bounds a book, not an offer. This bounds the
 * *card*: past a handful of names joined by "or" the card stops being a card,
 * and the fit ladder is shrinking type to fit a paragraph.
 */
const MAX_ITEMS = 4

async function ownedOffer(bookId: string, offerId: string, organizationId: string) {
  return prisma.offer.findFirst({
    where: {
      id: offerId,
      bookId,
      book: { shop: { organizationId } },
    },
    select: { id: true },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const offer = await ownedOffer(params.id, params.offerId, session.user.organizationId)
  if (offer === null) return fail('not_found', 'That offer does not exist.', 404)

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Pick a product and how to join it.', 422)
  }

  // Visible to this organization: its own rows plus the universal catalog.
  const product = await prisma.catalogProduct.findFirst({
    where: {
      id: parsed.data.catalogProductId,
      archivedAt: null,
      OR: [{ organizationId: null }, { organizationId: session.user.organizationId }],
    },
    select: { id: true },
  })
  if (product === null) {
    return fail('not_found', 'That product is not in your catalog.', 404)
  }

  const created = await prisma.$transaction(async (tx) => {
    const items = await tx.offerItem.findMany({
      where: { offerId: offer.id },
      orderBy: { position: 'desc' },
      take: 1,
      select: { position: true },
    })

    const last = items[0]
    // Read inside the transaction: two tabs adding at once would otherwise
    // compute the same position and `@@unique([offerId, position])` would
    // reject the second — the right outcome, but not one an owner should see.
    if (last !== undefined && last.position + 1 >= MAX_ITEMS) return null

    return tx.offerItem.create({
      data: {
        offerId: offer.id,
        catalogProductId: product.id,
        position: (last?.position ?? -1) + 1,
        connector: parsed.data.connector,
      },
      select: { id: true },
    })
  })

  if (created === null) {
    return fail(
      'too_many_items',
      `An offer holds at most ${MAX_ITEMS} products. Make a separate offer instead.`,
      422
    )
  }

  return ok(created, 201)
}
