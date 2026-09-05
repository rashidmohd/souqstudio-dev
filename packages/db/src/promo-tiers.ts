import type { Prisma } from '@prisma/client'

/**
 * The promo tiers every organization starts with. E5 §5.
 *
 * **`offers.promoTierId` is NOT NULL, so an organization with no tiers cannot
 * hold an offer at all.** The E5 migration seeded these two for the
 * organizations that existed then and nothing seeded them since, so every
 * account created afterwards hit a NOT NULL violation on its first offer, with
 * no way back for a shop owner. Signup now creates them in the same transaction
 * as the organization; `prisma/seed.ts` backfills the accounts that fell in the
 * gap.
 *
 * **Here rather than in `apps/web/lib`, for two reasons.** It was in both and
 * that is one copy too many — the seed and the signup path have to agree or the
 * gap reopens. And `tokenRef` is a `--sq-tpl-*` name, which the design lint
 * rightly refuses in application chrome: a promo badge is offer book content,
 * not chrome, so the data belongs with the database rather than with the UI.
 *
 * `emphasis` is 1..3 and drives badge scale in the layout engine, and which
 * offers bid first for a spanning region.
 */
export const DEFAULT_PROMO_TIERS = [
  {
    labelEn: 'Deal',
    labelAr: 'صفقة',
    tokenRef: '--sq-tpl-offer-red',
    emphasis: 2,
    isDefault: true,
  },
  {
    labelEn: 'Offer',
    labelAr: 'عرض',
    tokenRef: '--sq-tpl-save-yellow',
    emphasis: 1,
    isDefault: false,
  },
] as const

/**
 * Give an organization its starting tiers.
 *
 * Takes a transaction client so signup can create them alongside the
 * organization: an org without tiers is the same class of dead account as an org
 * without an owner, which is why that transaction exists at all.
 */
export async function seedPromoTiers(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  await tx.promoTier.createMany({
    data: DEFAULT_PROMO_TIERS.map((tier) => ({ ...tier, organizationId })),
  })
}
