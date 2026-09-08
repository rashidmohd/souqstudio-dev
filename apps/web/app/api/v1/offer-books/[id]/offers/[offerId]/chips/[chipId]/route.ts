import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * Removing a chip. E6-03.
 *
 * Deleted rather than hidden: a chip is one line of the shop's own copy, it
 * carries no history worth keeping, and an offer with a chip nobody can see is
 * a card whose corner is reserved for nothing.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; offerId: string; chipId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const chip = await prisma.offerChip.findFirst({
    where: {
      id: params.chipId,
      offerId: params.offerId,
      offer: {
        bookId: params.id,
        book: { shop: { organizationId: session.user.organizationId } },
      },
    },
    select: { id: true },
  })
  if (chip === null) return fail('not_found', 'That chip is not on this offer.', 404)

  await prisma.offerChip.delete({ where: { id: chip.id } })
  return ok({ id: chip.id })
}
