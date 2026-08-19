import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { requireOrgRole } from '@/lib/authz'
import {
  isBrandSetupComplete,
  readEffectiveBrand,
  resetShopBrandToOrg,
} from '@/lib/brand-kit'

/**
 * E4-05 — reset a shop to its organization's brand.
 *
 * **This deletes the shop's own kit. It never touches the organization's.** The
 * distinction is the whole endpoint: for an inheriting shop `PATCH /api/v1/brand`
 * writes the *organization's* kit, so a reset that worked the same way would
 * wipe the brand for every shop in the account.
 *
 * A verb sub-route rather than `DELETE /api/v1/brand`, matching
 * `shops/:id/deactivate` and `shops/:id/reactivate`. "Delete the brand" would
 * not say whose, and this is the one operation here where that ambiguity is
 * expensive.
 *
 * **Distinct from switching back to `inherit`** on the shop settings screen,
 * which leaves the shop's kit in place and dormant and is therefore reversible.
 * This is not; `lib/brand-kit.ts` explains why the two writes cannot be split.
 *
 * Owner-only, matching the second gate `PATCH /shops/:id` puts on
 * `brandOverride`. This writes that column, so a lower bar here would be a way
 * around that gate rather than a separate policy. A manager may change the
 * brand and may not fork or unfork it.
 */
export async function POST() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // Nothing to undo, and saying so is better than a silent success that leaves
  // the owner wondering which of the two brands they are now looking at.
  if (shop.brandOverride === 'inherit') {
    return fail(
      'nothing_to_reset',
      'This shop already uses your organization’s brand.',
      409
    )
  }

  await resetShopBrandToOrg(shop.id)

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: 'inherit',
  })

  return ok({
    brandKit: brand.brandKit,
    brandOverride: brand.override,
    source: brand.source,
    complete: isBrandSetupComplete(brand.brandKit),
  })
}
