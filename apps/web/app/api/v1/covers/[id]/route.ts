import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'

/**
 * Remove one cover from the shop's library. E8-04.
 *
 * **It exists because keeping is no longer a choice.** The worker writes a row
 * for every option it draws — an owner paid for three and gets three — so the
 * filtering that used to happen at thumbnail size, before anything was saved,
 * has to happen afterwards instead, against pictures they can actually see. A
 * library nothing can be taken out of is the cost of keeping everything, and
 * this is what pays it.
 *
 * **The object stays in the bucket, and that is not an oversight.** A cover is
 * referenced by its R2 key, and a page that already uses one holds the key
 * rather than this row — `offer_book_pages.background` and the block documents
 * both. Deleting the object would blank a printed page an owner set up weeks
 * ago to tidy a list they were looking at today. What is removed here is the
 * library entry: the cover stops being offered, and every page already using it
 * carries on drawing. The same reasoning `POST /covers` records for the options
 * it never wrote rows for.
 *
 * Shop-scoped in the query, never checked afterwards — `covers` has no
 * `organizationId`, the same deliberate shape `characters` has, so the active
 * shop is the whole tenancy boundary and it belongs in the `where`.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to remove a cover.', 403)
  }

  // `deleteMany` rather than `delete`, so the shop scope is part of the write
  // itself: a `findUnique` plus an `if` is the same thing right up until
  // somebody deletes the `if`. A count of zero is a cover that is not theirs
  // and a cover that never existed, answered identically on purpose.
  const removed = await prisma.cover.deleteMany({ where: { id: params.id, shopId: shop.id } })
  if (removed.count === 0) return fail('not_found', 'That cover does not exist.', 404)

  return ok({ id: params.id })
}
