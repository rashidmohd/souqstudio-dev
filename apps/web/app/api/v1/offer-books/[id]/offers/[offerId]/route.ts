import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import {
  AMOUNT_PATTERN,
  amountFitsCurrency,
  isCurrency,
  minorUnits,
  type Currency,
} from '@souqstudio/types'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import type { OfferSnapshot } from '@/lib/offer-snapshot'

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
/**
 * The grammar only. **How many decimals are actually allowed depends on the
 * offer's currency**, which this route has not read yet at parse time — a yen
 * has no sen and a dinar has a thousand fils. `amountFitsCurrency` is checked
 * below, once the offer is in hand.
 */
const MONEY = AMOUNT_PATTERN

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
  /**
   * **Wrapped, because an unhandled throw here is a 500 nobody can read.** Next
   * renders one as an HTML error page, so the browser's `response.json()` fails
   * on an angle bracket, the client reports something generic, and the actual
   * error exists only in a server log nobody thought to open. E8-05's manual
   * cutout cost a whole session to that exact shape in September — see
   * `products/[id]/cutout`, which now wraps for the same reason.
   *
   * **This route is the most-used write in the product.** The editor patches it
   * as the owner leaves each field, so a fault here is a price that silently
   * does not save, which is the worst thing a flyer tool can do quietly.
   */
  try {
    return await patchOffer(request, params)
  } catch (problem) {
    console.error(`[offer-patch] ${params.id}/${params.offerId} failed`, problem)
    return fail('unavailable', 'That change did not save. Try again in a moment.', 503)
  }
}

async function patchOffer(
  request: NextRequest,
  params: { id: string; offerId: string }
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
    select: { id: true, currency: true },
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

  /**
   * **The decimals the offer's own currency allows**, which the schema could
   * not check because the currency is on the row rather than in the body.
   *
   * A yen has no sen; a dinar has a thousand fils. Letting `12.75` into a KWD
   * offer stores twelve dinars and seven hundred *fifty* fils — a different
   * price, rounded silently, printed on a flyer somebody carries to a till.
   * Refusing it names the currency rather than repeating the generic hint.
   */
  /**
   * **Checked rather than asserted, because `offers.currency` is a `String`
   * column.** It carries a comment naming six codes and no constraint enforcing
   * them, so `as Currency` is a claim about data rather than a fact about it —
   * and `minorUnits()` indexes `CURRENCY_INFO` unguarded, which turns a row
   * holding anything else into `Cannot read properties of undefined` and an
   * HTML 500. A price edit is the most-used write in the editor; it should not
   * be the place a bad row is discovered by crashing.
   */
  if (!isCurrency(offer.currency)) {
    console.error(`[offer-patch] offer ${offer.id} has an unknown currency: ${offer.currency}`)
    return fail(
      'unknown_currency',
      'This offer is priced in a currency we no longer recognise. Contact support.',
      409
    )
  }

  const currency: Currency = offer.currency
  const allowed = minorUnits(currency)
  const misfit = [price, comparePrice].find(
    (value) => typeof value === 'string' && !amountFitsCurrency(value, currency)
  )
  if (misfit !== undefined && misfit !== null) {
    return fail(
      'invalid_request',
      allowed === 0
        ? `${currency} prices are whole numbers. Enter ${misfit.split('.')[0] ?? ''}.`
        : `${currency} prices carry ${allowed} decimal places. Enter a price like ${(1.5).toFixed(allowed)}.`,
      422
    )
  }

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
 *
 * **It returns everything needed to put it back.** The design skill →
 * Destructive actions asks for undo rather than a confirm dialog on exactly
 * this action, and undo cannot restore what it was never given: the row is gone
 * the moment this responds. The snapshot travels to the client, sits on the
 * undo stack, and comes back to `POST .../restore`. It is read *before* the
 * delete rather than assembled from what the client already has — the client
 * holds a `ComposedOffer`, which is what the card draws and not what the row
 * contains, and half of these columns have never reached it.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  // Wrapped for the reason `PATCH` above is: an unhandled throw is an HTML 500
  // the client cannot parse and nobody reads. It is how the position-shift bug
  // below presented — a bare 500 on removing a card, with the duplicate-key
  // error it actually was visible only in the server log.
  try {
    return await deleteOffer(params)
  } catch (problem) {
    console.error(`[offer-delete] ${params.id}/${params.offerId} failed`, problem)
    return fail('unavailable', 'That card could not be removed. Try again in a moment.', 503)
  }
}

async function deleteOffer(params: { id: string; offerId: string }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: {
      id: true,
      position: true,
      price: true,
      priceMode: true,
      comparePrice: true,
      currency: true,
      promoTierId: true,
      unitPriceMode: true,
      unitPriceValue: true,
      unitPriceUnit: true,
      legalLines: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          catalogProductId: true,
          position: true,
          connector: true,
          nameOverrideEn: true,
          nameOverrideAr: true,
          specOverrideEn: true,
          specOverrideAr: true,
          imageAssetId: true,
        },
      },
      chips: {
        select: { id: true, kind: true, labelEn: true, labelAr: true, value: true, anchor: true },
      },
      footnotes: { select: { id: true, textEn: true, textAr: true, scope: true } },
      overrides: { select: { shopId: true, price: true, isAvailable: true } },
    },
  })
  if (offer === null) {
    return fail('not_found', 'That offer does not exist.', 404)
  }

  await prisma.$transaction([
    prisma.offer.delete({ where: { id: offer.id } }),
    /*
     * **Parked, then brought back — the same two passes the reorder route
     * makes, and for the same reason.**
     *
     * This used to be one statement, `position = position - 1`, under a comment
     * claiming Postgres checks the constraint at statement end rather than per
     * row. **It does not.** `offers_bookId_position_key` is a plain unique
     * *index*, which is verified as each row is updated, and only a `UNIQUE`
     * constraint declared `DEFERRABLE` can be checked any later — Prisma
     * declares none. So the single statement was safe only if Postgres happened
     * to update the rows in ascending position order, which nothing guarantees:
     * the plan returns them in physical order, and physical order stops
     * matching position order as soon as a book has been edited. When it came
     * back the other way, row 5 moved into 4 while 4 was still there and the
     * delete died on a duplicate key — a 500 on removing a card, reproducible
     * on that book and absent on a fresh one.
     *
     * Negative slots cannot collide with positive ones, so after the first pass
     * every positive slot above the hole is empty and the second pass cannot
     * collide whatever order it runs in. `-position - 1` parks (3 → -4) and
     * `-position - 2` returns one lower (-4 → 2).
     */
    prisma.$executeRaw`
      UPDATE offers SET position = -position - 1
      WHERE "bookId" = ${params.id} AND position > ${offer.position}`,
    prisma.$executeRaw`
      UPDATE offers SET position = -position - 2
      WHERE "bookId" = ${params.id} AND position < 0`,
  ])

  // Decimals become strings on the way out, as everywhere else money crosses
  // this boundary. `value` is a chip's JSONB payload; anything that is not an
  // object is not a payload this app wrote, so it restores as absent rather
  // than as a shape the chip renderer has no branch for.
  const snapshot: OfferSnapshot = {
    id: offer.id,
    position: offer.position,
    price: offer.price.toString(),
    priceMode: offer.priceMode,
    comparePrice: offer.comparePrice?.toString() ?? null,
    currency: offer.currency,
    promoTierId: offer.promoTierId,
    unitPriceMode: offer.unitPriceMode,
    unitPriceValue: offer.unitPriceValue?.toString() ?? null,
    unitPriceUnit: offer.unitPriceUnit,
    legalLines: offer.legalLines,
    items: offer.items,
    chips: offer.chips.map((chip) => ({
      ...chip,
      value:
        chip.value !== null && typeof chip.value === 'object' && !Array.isArray(chip.value)
          ? (chip.value as Record<string, unknown>)
          : null,
    })),
    footnotes: offer.footnotes,
    shopOverrides: offer.overrides.map((override) => ({
      shopId: override.shopId,
      price: override.price?.toString() ?? null,
      isAvailable: override.isAvailable,
    })),
  }

  return ok({ id: offer.id, snapshot })
}
