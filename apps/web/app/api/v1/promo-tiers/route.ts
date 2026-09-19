import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { TIER_TOKENS } from '@souqstudio/types'

/**
 * The promo tiers an organization prints. E5 §5, E6-03.
 *
 * **The tier is described everywhere as "a row the organization configures
 * once", and until now there was nowhere to configure it.** Two are seeded —
 * *Deal* and *Offer* — signup creates them, the seed backfills them, and
 * nothing in the product could add a third. So every card in every book said
 * "Deal", the one authoring control on the price mark had two values, and a
 * shop wanting *Half price* had to reach for a free-text chip instead, which
 * puts it in the wrong place on the card at the wrong size.
 *
 * **A manager's decision, not an editor's.** A tier decides what every future
 * book looks like, which is the same bar `PATCH /api/v1/brand` and
 * `POST /api/v1/blocks` both apply.
 *
 * **`tokenRef` is a `--sq-tpl-*` name and never a hex.** A promo badge is
 * offer book content rather than chrome, and the fixed system colours are
 * deliberately not the shop's: a "Half price" flash that comes out sand on one
 * account and navy on another stops reading as a discount. The closed list is
 * `lib/promo-tier-tokens.ts`.
 */

const createSchema = z.object({
  labelEn: z.string().trim().min(1).max(24),
  labelAr: z.string().trim().max(24).nullable().optional(),
  tokenRef: z.enum(TIER_TOKENS),
  /** 1..3. Drives badge scale, and which offers bid first for a large region. */
  emphasis: z.number().int().min(1).max(3),
})

/**
 * Enough for a real promotional calendar and short of a list nobody can choose
 * from. The tier is a *select* in the offer panel; past this it stops being one
 * decision and becomes a search.
 */
const MAX_TIERS = 12

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  return ok(
    await prisma.promoTier.findMany({
      where: { organizationId: session.user.organizationId },
      // The default first, then oldest — the order the editor already lists
      // them in, so the two screens agree about which is "first".
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        labelEn: true,
        labelAr: true,
        tokenRef: true,
        emphasis: true,
        isDefault: true,
      },
    })
  )
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Give the tier a name and a colour.', 422)
  }

  const tier = await prisma.$transaction(async (tx) => {
    // Counted inside the transaction, as the chips route counts its own: two
    // tabs adding at once would otherwise both see eleven.
    const existing = await tx.promoTier.count({
      where: { organizationId: session.user.organizationId },
    })
    if (existing >= MAX_TIERS) return null

    return tx.promoTier.create({
      data: {
        organizationId: session.user.organizationId,
        labelEn: parsed.data.labelEn,
        labelAr: parsed.data.labelAr ?? null,
        tokenRef: parsed.data.tokenRef,
        emphasis: parsed.data.emphasis,
        // Never on create. The default is what a new offer gets, and quietly
        // repointing that because somebody added a tier would change what the
        // next card says. `PATCH` is where it moves, deliberately.
        isDefault: false,
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

  if (tier === null) {
    return fail('too_many_tiers', `You can have up to ${MAX_TIERS} tiers.`, 422)
  }

  return ok(tier, 201)
}
