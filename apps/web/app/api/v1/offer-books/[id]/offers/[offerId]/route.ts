import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-03 — the offer properties an owner actually sets.
 *
 * **Price first, because until this exists no book can publish.** `createBook`
 * writes zero — a catalog product has no price, and `offers.price` is NOT NULL —
 * and `composeOffer` raises `no-price` for it. This is the route that clears
 * that flag.
 *
 * **Money arrives as a string and stays one until Prisma takes it.** The column
 * is `Decimal(10,2)` and a price routed through a JavaScript float is the one
 * place a rounding error could enter a number a customer reads off a flyer. The
 * schema below validates the *text*, so `12.345` is rejected rather than
 * silently rounded, and `.50` and `12.` never reach the database as something
 * other than what was typed.
 *
 * The editor patches this per field as the owner leaves it — the design system
 * asks for optimistic updates, so a failure here has to be specific enough for
 * the client to revert one field and name it rather than discard the batch.
 */

/**
 * Up to two decimals, and at least one digit before the point.
 *
 * Not `z.number()`: a number has already lost the distinction between `12.5` and
 * `12.50`, and has already been through a float. Not `z.coerce` either, for the
 * same reason.
 */
const MONEY = /^\d{1,8}(\.\d{1,2})?$/

/** A rate, to the three decimals the column carries. */
const RATE = /^\d{1,7}(\.\d{1,3})?$/

const schema = z
  .object({
    price: z.string().trim().regex(MONEY).optional(),
    /** Null clears the was-price. `undefined` leaves it alone — the two are
     *  different requests and a single optional would conflate them. */
    comparePrice: z.string().trim().regex(MONEY).nullable().optional(),
    promoTierId: z.string().min(1).optional(),
    priceMode: z.enum(['FIXED', 'FROM', 'PER_UNIT']).optional(),
    unitPriceMode: z.enum(['AUTO', 'MANUAL', 'HIDDEN']).optional(),
    /**
     * The unit price an owner typed, when they have taken it off `AUTO`.
     *
     * Three decimals, not two: the column is `Decimal(10,3)` because a unit
     * price is a *rate* — `AED 1.765 per 100 g` — and rounding a rate to the
     * currency's own precision is how a shelf-edge figure stops matching the
     * pack it is on.
     */
    unitPriceValue: z.string().trim().regex(RATE).nullable().optional(),
    unitPriceUnit: z.enum(['G', 'KG', 'ML', 'L', 'PIECE']).nullable().optional(),
    /**
     * Deposit lines and service fees, rendered under the card rather than as
     * footnotes — they are part of the price, not a caveat about it.
     *
     * Bounded at four because a card that needs five is a card with no room
     * left for the product.
     */
    legalLines: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
  })
  // An empty patch is a client bug, not a no-op to be absorbed quietly.
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to change' })

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Enter a price like 12.90, then try again.', 422)
  }

  // **The offer, its book and the organization in one predicate.** Reading the
  // offer and then checking who owns it is the shape that lets a mistake
  // through; this cannot return a row that is not theirs. Same rule as
  // `loadBook`.
  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true },
  })
  if (offer === null) {
    return fail('not_found', 'That offer does not exist.', 404)
  }

  // A tier belongs to the organization, and `offers.promoTierId` has no
  // tenant column of its own — so the check has to happen here or an owner
  // could point an offer at another organization's badge.
  if (parsed.data.promoTierId !== undefined) {
    const tier = await prisma.promoTier.findFirst({
      where: { id: parsed.data.promoTierId, organizationId: session.user.organizationId },
      select: { id: true },
    })
    if (tier === null) {
      return fail('invalid_tier', 'That promo tier is not one of yours.', 422)
    }
  }

  const {
    price,
    comparePrice,
    promoTierId,
    priceMode,
    unitPriceMode,
    unitPriceValue,
    unitPriceUnit,
    legalLines,
  } = parsed.data

  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: {
      ...(price === undefined ? {} : { price }),
      ...(comparePrice === undefined ? {} : { comparePrice }),
      ...(promoTierId === undefined ? {} : { promoTierId }),
      ...(priceMode === undefined ? {} : { priceMode }),
      ...(unitPriceMode === undefined ? {} : { unitPriceMode }),
      ...(unitPriceValue === undefined ? {} : { unitPriceValue }),
      ...(unitPriceUnit === undefined ? {} : { unitPriceUnit }),
      // Replaced whole, not appended to. The panel edits the list and sends it,
      // which is the only shape that can express a removal.
      ...(legalLines === undefined ? {} : { legalLines }),
    },
    select: {
      id: true,
      price: true,
      comparePrice: true,
      promoTierId: true,
      unitPriceMode: true,
      unitPriceValue: true,
      unitPriceUnit: true,
      legalLines: true,
    },
  })

  return ok({
    id: updated.id,
    price: updated.price.toString(),
    comparePrice: updated.comparePrice?.toString() ?? null,
    promoTierId: updated.promoTierId,
    unitPriceMode: updated.unitPriceMode,
    unitPriceValue: updated.unitPriceValue?.toString() ?? null,
    unitPriceUnit: updated.unitPriceUnit,
    legalLines: updated.legalLines,
  })
}

/**
 * Remove an offer from a book.
 *
 * **The gap it leaves is closed in the same transaction.** `position` is a dense
 * index — `flowBook` walks the list in order and the unique constraint assumes
 * nothing about density, but a hole means the next append computes its position
 * from a `max` that no longer matches the count, and every later reorder has to
 * reason about it. Closing it here keeps `position` meaning "nth in the book"
 * rather than "some increasing number".
 *
 * **Delete rather than archive, and that is a real difference from the
 * catalog.** A catalog product is archived because a published book references
 * it; an offer *is* the reference, and removing it from a draft is the owner
 * saying it does not belong. `offer_items` and the rest cascade from the row.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true, position: true },
  })
  if (offer === null) {
    return fail('not_found', 'That offer does not exist.', 404)
  }

  await prisma.$transaction([
    prisma.offer.delete({ where: { id: offer.id } }),
    // One statement for the shift, not one per row. Safe against the unique
    // index without parking: every row moves *down* into a slot the row before
    // it has already vacated, and Postgres checks the constraint at statement
    // end rather than per row.
    prisma.$executeRaw`
      UPDATE offers SET position = position - 1
      WHERE "bookId" = ${params.id} AND position > ${offer.position}`,
  ])

  return ok({ id: offer.id })
}
