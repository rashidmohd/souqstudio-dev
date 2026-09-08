import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * E6-03 — chips on an offer.
 *
 * A chip is the small flash a card carries beside its price: `Limit 2 per
 * customer`, `Product of UAE`, `Halal`, `Buy 3 of 5`. E6 §7 puts them at the top
 * of the z-order and lets an anchored one overhang the card by up to half its
 * own width, which the engine reserves for in gap calculation.
 *
 * **A chip is not the promo tier.** The tier is the one authoring control on the
 * price mark and there is exactly one per offer; chips are additional and there
 * may be several. They are drawn from the block's chip element outward — see
 * `components/blocks/draw.tsx`.
 *
 * **`labelAr` is optional and its absence is not flagged.** Unlike a product
 * name, a chip is the shop's own words: an owner writing only English has
 * written a card that is English, and E5 §2's publish blocker is about catalog
 * data rather than about copy they chose.
 */

/** Kind-specific payload. `SCALE` is "3 of 5"; `LOYALTY` is an amount. */
const valueSchema = z
  .object({
    scale: z.number().int().min(1).max(99).optional(),
    of: z.number().int().min(1).max(99).optional(),
    amount: z.number().min(0).max(100000).optional(),
  })
  .strict()

const createSchema = z.object({
  kind: z.enum(['COUNTER', 'ORIGIN', 'CERT', 'SCALE', 'LOYALTY', 'CUSTOM']),
  labelEn: z.string().trim().min(1).max(40),
  labelAr: z.string().trim().max(40).nullable().optional(),
  anchor: z.enum(['TOP_START', 'TOP_END', 'INLINE']).default('TOP_START'),
  value: valueSchema.nullable().optional(),
})

/**
 * Four, and it is the card that decides the number rather than the schema.
 * Chips sit at the top of the z-order over the corner of a card that also has
 * to show a product; past four they are the card.
 */
const MAX_CHIPS = 4

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; offerId: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Give the chip a label, then try again.', 422)
  }

  // The offer, its book and the organization in one predicate — the rule every
  // route in this epic follows.
  const offer = await prisma.offer.findFirst({
    where: {
      id: params.offerId,
      bookId: params.id,
      book: { shop: { organizationId: session.user.organizationId } },
    },
    select: { id: true },
  })
  if (offer === null) return fail('not_found', 'That offer does not exist.', 404)

  const chip = await prisma.$transaction(async (tx) => {
    // Counted inside the transaction: two tabs adding at once would otherwise
    // both see three and both write a fourth.
    const existing = await tx.offerChip.count({ where: { offerId: offer.id } })
    if (existing >= MAX_CHIPS) return null

    return tx.offerChip.create({
      data: {
        offerId: offer.id,
        kind: parsed.data.kind,
        labelEn: parsed.data.labelEn,
        labelAr: parsed.data.labelAr ?? null,
        anchor: parsed.data.anchor,
        ...(parsed.data.value === undefined || parsed.data.value === null
          ? {}
          : { value: parsed.data.value }),
      },
      select: { id: true, kind: true, labelEn: true, labelAr: true, anchor: true },
    })
  })

  if (chip === null) {
    return fail(
      'too_many_chips',
      `A card holds at most ${MAX_CHIPS} chips. Remove one first.`,
      422
    )
  }

  return ok(chip, 201)
}
