import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-02 — taking a product back off a multi-item offer.
 *
 * **The last item cannot be removed.** `composeOffer` throws on an offer with no
 * items, and rightly: an offer with no product is not a card with a hole in it,
 * it is a price attached to nothing. Removing the last product is *deleting the
 * offer*, which is a different action with a different confirmation, and it is
 * one the tray already offers. Refusing here and saying so is better than
 * quietly turning one action into the other.
 *
 * **Removing item 0 is allowed**, and it hands the brand lockup and the packshot
 * to whatever was second — that is what item 0 *means*, rather than a property
 * of a particular row. The positions close up so the rule still holds.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; offerId: string; itemId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const item = await prisma.offerItem.findFirst({
    where: {
      id: params.itemId,
      offerId: params.offerId,
      offer: {
        bookId: params.id,
        book: { shop: { organizationId: session.user.organizationId } },
      },
    },
    select: { id: true, position: true, offerId: true },
  })
  if (item === null) {
    return fail('not_found', 'That product is not on this offer.', 404)
  }

  const remaining = await prisma.offerItem.count({ where: { offerId: item.offerId } })
  if (remaining <= 1) {
    return fail(
      'last_item',
      'An offer needs at least one product. Remove the offer instead.',
      422
    )
  }

  await prisma.$transaction([
    prisma.offerItem.delete({ where: { id: item.id } }),
    // Close the gap, one statement. Every later item moves *down* into a slot
    // the one before it has already vacated, so no parking pass is needed —
    // Postgres checks `@@unique([offerId, position])` at statement end rather
    // than per row. Same reasoning as removing an offer from a book.
    prisma.$executeRaw`
      UPDATE offer_items SET position = position - 1
      WHERE "offerId" = ${item.offerId} AND position > ${item.position}`,
    // **The new item 0 must not carry a connector.** A connector is rendered
    // *before* its item, so a leading "or" would print at the head of the card.
    // This is the one thing that makes removing item 0 safe rather than merely
    // allowed.
    prisma.$executeRaw`
      UPDATE offer_items SET connector = NULL
      WHERE "offerId" = ${item.offerId} AND position = 0`,
  ])

  return ok({ id: item.id })
}
