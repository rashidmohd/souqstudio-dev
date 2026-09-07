import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-02 — the offers on a book: adding them, and putting them in order.
 *
 * **`offers.position` is what the engine paginates from**, and it carries
 * `@@unique([bookId, position])`. That constraint is the whole difficulty here
 * and is worth keeping: without it two offers can claim the same slot and the
 * page they land on is decided by whatever `orderBy` happens to do with a tie.
 */

/** Shared by both handlers: the book must be this organization's. */
async function ownedBook(bookId: string, organizationId: string) {
  return prisma.offerBook.findFirst({
    where: { id: bookId, shop: { organizationId } },
    select: { id: true },
  })
}

const addSchema = z.object({
  /** Appended in the order given. Each becomes its own single-item offer —
   *  grouping two under one price is a separate, deliberate action. */
  productIds: z.array(z.string().min(1)).min(1).max(50),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const book = await ownedBook(params.id, session.user.organizationId)
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  const parsed = addSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_request', 'Pick at least one product.', 422)

  // Visible to this organization: its own rows plus the universal catalog.
  // Without it a caller could name another tenant's private product and have it
  // rendered into their book.
  const visible = await prisma.catalogProduct.findMany({
    where: {
      id: { in: parsed.data.productIds },
      archivedAt: null,
      OR: [{ organizationId: null }, { organizationId: session.user.organizationId }],
    },
    select: { id: true },
  })
  const allowed = new Set(visible.map((product) => product.id))
  const ordered = parsed.data.productIds.filter((id) => allowed.has(id))
  if (ordered.length === 0) {
    return fail('no_products', 'None of those products are in your catalog.', 422)
  }

  const tier = await prisma.promoTier.findFirst({
    where: { organizationId: session.user.organizationId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  if (tier === null) {
    return fail('no_tier', 'This organization has no promo tiers.', 409)
  }

  const created = await prisma.$transaction(async (tx) => {
    // Appended after the last one. Read inside the transaction: two tabs adding
    // at once would otherwise compute the same starting position and the unique
    // index would reject the second — which is the right outcome, but the owner
    // should not see it.
    const last = await tx.offer.findFirst({
      where: { bookId: book.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const start = (last?.position ?? -1) + 1

    // Two statements rather than two per product — the lesson `createBook`
    // learned by blowing the 5s interactive transaction timeout at eleven rows.
    const offers = await tx.offer.createManyAndReturn({
      data: ordered.map((_, index) => ({
        bookId: book.id,
        position: start + index,
        price: 0,
        currency: 'AED',
        promoTierId: tier.id,
      })),
      select: { id: true, position: true },
    })

    // Keyed by position rather than trusting the returned order: a mispaired
    // item prints the wrong price against the wrong product.
    const byPosition = new Map(offers.map((offer) => [offer.position, offer.id]))
    await tx.offerItem.createMany({
      data: ordered.flatMap((productId, index) => {
        const offerId = byPosition.get(start + index)
        return offerId === undefined ? [] : [{ offerId, catalogProductId: productId, position: 0 }]
      }),
    })

    return offers
  })

  return ok({ added: created.length }, 201)
}

const reorderSchema = z.object({
  /** Every offer in the book, in the order it should appear. */
  offerIds: z.array(z.string().min(1)).min(1).max(500),
})

/**
 * Reorder.
 *
 * **Two passes, because of the unique index.** Writing the new positions
 * directly collides the moment any offer moves into a slot another still holds —
 * which is every reorder that is not a no-op. So the first pass parks every
 * affected row at a position no row can legitimately hold, and the second writes
 * the real ones. Negative numbers are the parking space: `position` is a
 * non-negative index everywhere else, so nothing else can be sitting there.
 *
 * **The whole order is sent, not a move.** A `{from, to}` request has to be
 * applied to the order the server currently holds, and two tabs reordering the
 * same book would then interleave into something neither owner asked for.
 * Sending the full list makes the last write win, which is at least an order
 * somebody chose.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const book = await ownedBook(params.id, session.user.organizationId)
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_request', 'Send the offers in their new order.', 422)

  const existing = await prisma.offer.findMany({
    where: { bookId: book.id },
    select: { id: true },
  })
  const ids = new Set(existing.map((offer) => offer.id))
  const sent = parsed.data.offerIds

  // A partial list would leave the offers it omits holding positions the sent
  // ones are about to claim. Refuse rather than guess where the rest go.
  if (sent.length !== ids.size || sent.some((id) => !ids.has(id))) {
    return fail(
      'order_mismatch',
      'The book changed while you were reordering. Reload and try again.',
      409
    )
  }

  await prisma.$transaction([
    // Park. One statement, not one per row.
    prisma.$executeRaw`
      UPDATE offers SET position = -position - 1
      WHERE "bookId" = ${book.id}`,
    // Then write the real order, also in one statement, from a pair of arrays
    // that `unnest` walks together — the same fan-out the spreadsheet import
    // uses, and for the same reason.
    prisma.$executeRaw`
      UPDATE offers AS o SET position = v.position
      FROM unnest(${sent}::text[], ${sent.map((_, index) => index)}::int[]) AS v(id, position)
      WHERE o.id = v.id AND o."bookId" = ${book.id}`,
  ])

  return ok({ reordered: sent.length })
}
