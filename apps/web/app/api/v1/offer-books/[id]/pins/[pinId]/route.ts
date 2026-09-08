import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * Unpinning. Composition model §6.
 *
 * The products that were displaced flow back into the cells the pin was holding,
 * because they were never consumed — the book gets shorter by exactly what the
 * pin was taking up. Nothing else has to be put back.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; pinId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const pin = await prisma.bookPin.findFirst({
    where: {
      id: params.pinId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true },
  })
  if (pin === null) return fail('not_found', 'That pin does not exist.', 404)

  await prisma.bookPin.delete({ where: { id: pin.id } })
  return ok({ id: pin.id })
}
