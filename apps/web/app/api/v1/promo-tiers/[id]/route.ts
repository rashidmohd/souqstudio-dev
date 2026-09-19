import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { TIER_TOKENS } from '@souqstudio/types'

/**
 * One promo tier: rename it, recolour it, make it the default, or remove it.
 *
 * The list route carries the reasoning about what a tier is and why its colour
 * is a system token rather than the shop's.
 */

const patchSchema = z
  .object({
    labelEn: z.string().trim().min(1).max(24).optional(),
    labelAr: z.string().trim().max(24).nullable().optional(),
    tokenRef: z.enum(TIER_TOKENS).optional(),
    emphasis: z.number().int().min(1).max(3).optional(),
    /**
     * Only `true` is accepted. An organization always has exactly one default
     * — `offers.promoTierId` is NOT NULL and a new offer has to be given one —
     * so "stop being the default" is not an operation, it is what happens to
     * the old one when another is promoted.
     */
    isDefault: z.literal(true).optional(),
  })
  .strict()

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That change could not be applied to the tier.', 422)
  }

  // Scoped in the query, as every route here is: another organization's id
  // simply does not match, and the answer is the same as one that does not
  // exist.
  const tier = await prisma.promoTier.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (tier === null) return fail('not_found', 'That tier does not exist.', 404)

  const updated = await prisma.$transaction(async (tx) => {
    // **Demote the old default in the same transaction as promoting the new
    // one.** Two defaults is a state the schema cannot refuse — `isDefault` is
    // a plain boolean with no partial unique index — and the code that reads
    // it takes the first, so the book an owner creates next would depend on
    // row order.
    if (parsed.data.isDefault === true) {
      await tx.promoTier.updateMany({
        where: { organizationId: session.user.organizationId, isDefault: true },
        data: { isDefault: false },
      })
    }

    return tx.promoTier.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.labelEn === undefined ? {} : { labelEn: parsed.data.labelEn }),
        ...(parsed.data.labelAr === undefined ? {} : { labelAr: parsed.data.labelAr }),
        ...(parsed.data.tokenRef === undefined ? {} : { tokenRef: parsed.data.tokenRef }),
        ...(parsed.data.emphasis === undefined ? {} : { emphasis: parsed.data.emphasis }),
        ...(parsed.data.isDefault === undefined ? {} : { isDefault: true }),
      },
      select: {
        id: true,
        labelEn: true,
        labelAr: true,
        tokenRef: true,
        emphasis: true,
        isDefault: true,
      },
    })
  })

  return ok(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const tier = await prisma.promoTier.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, isDefault: true, _count: { select: { offers: true } } },
  })
  if (tier === null) return fail('not_found', 'That tier does not exist.', 404)

  /**
   * **Refused rather than cascaded, and rather than reassigned.**
   * `offers.promoTierId` is NOT NULL, so a delete would either fail on the
   * foreign key as a 500 or — if it cascaded — take published offer books with
   * it. Moving those offers to another tier silently would repaint cards in
   * books that are already printed and shared.
   *
   * So it says which books are holding it and leaves the owner to change them.
   */
  if (tier._count.offers > 0) {
    return fail(
      'tier_in_use',
      `That tier is on ${tier._count.offers} ${tier._count.offers === 1 ? 'offer' : 'offers'}. Move them to another tier first.`,
      409
    )
  }

  // An organization with no tiers cannot hold an offer at all — the same dead
  // state `seedPromoTiers` exists to prevent. The default is the one that must
  // survive, because it is what a new offer is given.
  if (tier.isDefault) {
    return fail(
      'tier_is_default',
      'That is the tier new offers start with. Make another one the default first.',
      409
    )
  }

  await prisma.promoTier.delete({ where: { id: params.id } })

  return ok({ deleted: true })
}
