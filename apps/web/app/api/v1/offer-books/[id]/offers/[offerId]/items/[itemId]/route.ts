import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-03 — the per-item half: what this product is called *in this book*, how it
 * joins the one before it, and where it sits on the card.
 *
 * **Overrides write to `offer_items` and never back to the catalog.** A shop
 * renaming a product for one flyer is not a catalog edit — the catalog is shared
 * with every other account, and a correction made for one week's headline would
 * follow the product everywhere and outlive the book it was made for.
 *
 * `null` clears an override and falls back to the catalog's own name;
 * `undefined` leaves it alone. Two different requests, and a single optional
 * would conflate them.
 */

const patchSchema = z
  .object({
    nameOverrideEn: z.string().trim().max(200).nullable().optional(),
    nameOverrideAr: z.string().trim().max(200).nullable().optional(),
    specOverrideEn: z.string().trim().max(200).nullable().optional(),
    specOverrideAr: z.string().trim().max(200).nullable().optional(),
    /** Only meaningful on an item that is not first — item 0 has nothing in
     *  front of it to join, which is what the schema's null means. */
    connector: z.enum(['OR', 'AND']).optional(),
    /** Where this item sits on the card. Zero is the lead. */
    position: z.number().int().min(0).max(3).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to change' })

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string; itemId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That change could not be applied to this product.', 422)
  }

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

  const { position, connector, ...raw } = parsed.data

  // An empty box is a cleared override, not an override to the empty string.
  // Without this an owner who deletes the text they typed gets a card with no
  // name on it rather than the catalog's own.
  const blankIsNull = (value: string | null | undefined) =>
    value === undefined ? undefined : value === '' ? null : value

  const overrides = {
    nameOverrideEn: blankIsNull(raw.nameOverrideEn),
    nameOverrideAr: blankIsNull(raw.nameOverrideAr),
    specOverrideEn: blankIsNull(raw.specOverrideEn),
    specOverrideAr: blankIsNull(raw.specOverrideAr),
  }

  // A connector on the lead item would print an "or" at the head of the card,
  // which is the one thing `position` 0 means. Refused rather than silently
  // dropped: the client asked for something, and being told it is impossible
  // beats being ignored.
  if (connector !== undefined && position === undefined && item.position === 0) {
    return fail(
      'lead_connector',
      'The first product on a card has nothing in front of it to join.',
      422
    )
  }

  // Each field spread rather than passed as possibly-undefined:
  // `exactOptionalPropertyTypes` refuses `{ nameOverrideEn: undefined }` on
  // Prisma's update input, and undefined is precisely what "leave it alone"
  // means here.
  const data = {
    ...(overrides.nameOverrideEn === undefined ? {} : { nameOverrideEn: overrides.nameOverrideEn }),
    ...(overrides.nameOverrideAr === undefined ? {} : { nameOverrideAr: overrides.nameOverrideAr }),
    ...(overrides.specOverrideEn === undefined ? {} : { specOverrideEn: overrides.specOverrideEn }),
    ...(overrides.specOverrideAr === undefined ? {} : { specOverrideAr: overrides.specOverrideAr }),
    ...(connector === undefined ? {} : { connector }),
  }

  if (Object.keys(data).length > 0) {
    await prisma.offerItem.update({ where: { id: item.id }, data })
  }

  if (position !== undefined && position !== item.position) {
    await moveItem(item.offerId, item.id, item.position, position)
  }

  return ok({ id: item.id })
}

/**
 * Move an item within its offer.
 *
 * **The connector belongs to the slot, not to the item**, and that is the whole
 * of the rule. "Pesto Rosso **or** Pasta Sauce" reordered is "Pasta Sauce **or**
 * Pesto Rosso": the joining word describes the relationship between neighbours,
 * so it stays where it was while the names move through it. Carrying the
 * connector with the item instead would leave the new lead holding an "or" and
 * the new second holding nothing, and the only way out of that is to invent a
 * word the owner never chose.
 *
 * Read and written in one transaction, and the positions are rewritten from a
 * computed order rather than shuffled in place: `@@unique([offerId, position])`
 * rejects a collision, and a shuffle collides on every move that is not a swap
 * at the end.
 */
async function moveItem(offerId: string, itemId: string, from: number, to: number) {
  await prisma.$transaction(async (tx) => {
    const items = await tx.offerItem.findMany({
      where: { offerId },
      orderBy: { position: 'asc' },
      select: { id: true, connector: true },
    })

    const target = Math.min(Math.max(to, 0), items.length - 1)
    if (from === target) return

    // The connectors, in slot order, before anything moves.
    const connectors = items.map((row) => row.connector)

    const ordered = items.filter((row) => row.id !== itemId)
    const moved = items.find((row) => row.id === itemId)
    if (moved === undefined) return
    ordered.splice(target, 0, moved)

    // Park first: every row moves through a position another still holds, and
    // negative numbers are the only space a real position never occupies.
    await tx.$executeRaw`
      UPDATE offer_items SET position = -position - 1 WHERE "offerId" = ${offerId}`

    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index]
      if (row === undefined) continue
      await tx.offerItem.update({
        where: { id: row.id },
        data: {
          position: index,
          // Slot 0 never carries one; every other slot keeps the connector it
          // had before the move.
          connector: index === 0 ? null : (connectors[index] ?? 'OR'),
        },
      })
    }
  })
}

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
