import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/** Removing a footnote. E6-03. The remaining markers renumber on the next
 *  render, which is what assigning them at render time buys. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; offerId: string; footnoteId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const note = await prisma.offerFootnote.findFirst({
    where: {
      id: params.footnoteId,
      offerId: params.offerId,
      offer: {
        bookId: params.id,
        book: { shop: { organizationId: session.user.organizationId } },
      },
    },
    select: { id: true },
  })
  if (note === null) return fail('not_found', 'That note is not on this offer.', 404)

  await prisma.offerFootnote.delete({ where: { id: note.id } })
  return ok({ id: note.id })
}
