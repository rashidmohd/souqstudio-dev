import type { NextRequest } from 'next/server'
import { Prisma, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { offerSnapshotSchema } from '@/lib/offer-snapshot'

/**
 * Put back an offer that was removed. The undo half of `DELETE`.
 *
 * **This is not a general create, and the id in the path is the point.** The
 * snapshot carries the id the row had, and restoring under it is what makes
 * every reference that outlived the delete correct again — a slot override
 * lives on the *page* and carries an `offerId`, so it does not cascade, and a
 * restore under a fresh id would leave the nudge stranded and the card back in
 * the wrong place. Undo returns the book to the state it was in, not to one
 * that resembles it.
 *
 * **Everything in the body is re-validated against the session's
 * organization.** The snapshot came from this server, but it arrived by way of
 * a browser, so it is treated as though it did not: the book, the tier, every
 * product and every shop are checked exactly as `POST /offers` and `PATCH
 * /offers/:offerId` check them. That is what keeps this route no more powerful
 * than the two it undoes.
 *
 * **Idempotent by refusal, not by overwrite.** An id that is already in the
 * book is a second undo of the same removal — a double-tap, a stale tab — and
 * writing over the row would discard whatever the owner has done to it since.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const book = await prisma.offerBook.findFirst({
    where: { id: params.id, shop: { organizationId: session.user.organizationId } },
    select: { id: true },
  })
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  const parsed = offerSnapshotSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That offer cannot be put back. Add it again instead.', 422)
  }
  const snapshot = parsed.data

  // The path and the body have to agree, or a caller could restore one offer
  // under another's address and the response would name a row it did not write.
  if (snapshot.id !== params.offerId) {
    return fail('invalid_request', 'That offer cannot be put back. Add it again instead.', 422)
  }

  const existing = await prisma.offer.findUnique({
    where: { id: snapshot.id },
    select: { id: true },
  })
  if (existing !== null) {
    return fail('already_restored', 'That offer is already back in the book.', 409)
  }

  // The tier: `offers.promoTierId` has no tenant column of its own, so an
  // unchecked one points an offer at another organization's badge.
  const tier = await prisma.promoTier.findFirst({
    where: { id: snapshot.promoTierId, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (tier === null) {
    return fail('invalid_tier', 'That offer cannot be put back. Add it again instead.', 422)
  }

  // Visible to this organization: its own rows plus the universal catalog.
  // **Archived products are allowed back**, unlike on `POST /offers` — the
  // product was in the book a moment ago, and refusing to undo a removal
  // because the catalog changed in between is a worse answer than the flag the
  // composer already raises for it.
  const productIds = [...new Set(snapshot.items.map((item) => item.catalogProductId))]
  const visible = await prisma.catalogProduct.findMany({
    where: {
      id: { in: productIds },
      OR: [{ organizationId: null }, { organizationId: session.user.organizationId }],
    },
    select: { id: true },
  })
  if (visible.length !== productIds.length) {
    return fail('invalid_products', 'That offer cannot be put back. Add it again instead.', 422)
  }

  // Per-branch pricing, if it had any. A shop id from another organization
  // would attach this offer's price to a branch that is not theirs.
  const shopIds = snapshot.shopOverrides.map((override) => override.shopId)
  if (shopIds.length > 0) {
    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds }, organizationId: session.user.organizationId },
      select: { id: true },
    })
    if (shops.length !== new Set(shopIds).size) {
      return fail('invalid_shops', 'That offer cannot be put back. Add it again instead.', 422)
    }
  }

  const restored = await prisma.$transaction(async (tx) => {
    // Where it goes back. Clamped to the end, because the book may be shorter
    // than it was: removing two offers and undoing the first one has a snapshot
    // position that no longer exists, and an index past the end leaves a hole
    // in a column the engine paginates from.
    const count = await tx.offer.count({ where: { bookId: book.id } })
    const position = Math.min(snapshot.position, count)

    // **Park, then write.** Shifting rows up collides the moment one moves into
    // a slot the row above still holds, so the affected rows go negative first
    // and come back one higher. Same two-pass idiom as the reorder route, and
    // for the same constraint — negative positions are the parking space
    // because `position` is a non-negative index everywhere else.
    await tx.$executeRaw`
      UPDATE offers SET position = -position - 1
      WHERE "bookId" = ${book.id} AND position >= ${position}`
    await tx.$executeRaw`
      UPDATE offers SET position = -position
      WHERE "bookId" = ${book.id} AND position < 0`

    const offer = await tx.offer.create({
      data: {
        id: snapshot.id,
        bookId: book.id,
        position,
        price: snapshot.price,
        priceMode: snapshot.priceMode,
        comparePrice: snapshot.comparePrice,
        currency: snapshot.currency,
        promoTierId: snapshot.promoTierId,
        unitPriceMode: snapshot.unitPriceMode,
        unitPriceValue: snapshot.unitPriceValue,
        unitPriceUnit: snapshot.unitPriceUnit,
        legalLines: snapshot.legalLines,
      },
      select: { id: true, position: true },
    })

    // The children keep their ids too — an image pinned to an item, a chip an
    // owner had positioned, are all things something else may name.
    await tx.offerItem.createMany({
      data: snapshot.items.map((item) => ({ ...item, offerId: offer.id })),
    })
    if (snapshot.chips.length > 0) {
      await tx.offerChip.createMany({
        data: snapshot.chips.map(({ value, ...chip }) => ({
          ...chip,
          offerId: offer.id,
          // `DbNull` rather than omitting the key or passing `null`: the column
          // is nullable JSONB, and Prisma makes you say which null you mean.
          // `JsonNull` would write the JSON literal `null` into the column,
          // which is a payload — and a chip with no payload has none.
          value: value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue),
        })),
      })
    }
    if (snapshot.footnotes.length > 0) {
      await tx.offerFootnote.createMany({
        data: snapshot.footnotes.map((footnote) => ({ ...footnote, offerId: offer.id })),
      })
    }
    if (snapshot.shopOverrides.length > 0) {
      await tx.offerShopOverride.createMany({
        data: snapshot.shopOverrides.map((override) => ({ ...override, offerId: offer.id })),
      })
    }

    return offer
  })

  return ok({ id: restored.id, position: restored.position }, 201)
}
