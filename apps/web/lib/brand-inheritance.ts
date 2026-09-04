import { BRAND_OVERRIDES, type BrandKit, type BrandOverride } from '@souqstudio/types'

/**
 * How a shop's brand resolves against its organization's. E2-05.
 *
 * No prisma and no `server-only` here on purpose: this is the rule, not the
 * storage. Keeping it pure is what lets `brand-inheritance.test.ts` cover the
 * whole matrix without a database, and what will let a client-side preview call
 * it later. `lib/brand-kit.ts` owns the reads and writes and imports this. Same
 * split as `lib/color.ts` against its callers.
 */

export { BRAND_OVERRIDES }
export type { BrandOverride }

export function isBrandOverride(value: string): value is BrandOverride {
  return (BRAND_OVERRIDES as readonly string[]).includes(value)
}

/**
 * A value read from `shops.brandOverride`, made safe.
 *
 * The column is a plain String with a default and, until E2, nothing ever wrote
 * it. Anything unrecognised resolves as `inherit` — the safe direction, because
 * inheriting shows the organization's brand rather than nothing at all. Routes
 * reject bad values at the boundary; this is the read-side floor.
 */
export function toBrandOverride(value: string | null | undefined): BrandOverride {
  return value && isBrandOverride(value) ? value : 'inherit'
}

/**
 * Four facets, not eleven fields.
 *
 * The spec names three override levels — logo, colours, full — so the fields
 * group into facets that move together. `progress` is the odd one: the wizard's
 * own state always belongs to the shop, because a second branch must not
 * inherit "setup finished" from the first and skip its own setup.
 */
export type BrandFacet = 'logo' | 'colors' | 'typography' | 'progress'
export type BrandLevel = 'org' | 'shop'

const FACET_OF: Record<keyof BrandKit, BrandFacet> = {
  logoStatus: 'logo',
  logoOriginalUrl: 'logo',
  primaryColor: 'colors',
  secondaryColor: 'colors',
  accentColor: 'colors',
  suggestedColors: 'colors',
  fontDisplay: 'typography',
  fontPrice: 'typography',
  fontBody: 'typography',
  typeScale: 'typography',
  onboardingStep: 'progress',
  onboardingCompletedAt: 'progress',
}

export function facetOf(key: keyof BrandKit): BrandFacet {
  return FACET_OF[key]
}

/**
 * Which level owns each facet, per override level.
 *
 * Typography moves only at `full`, because the spec names no level for it. If a
 * shop should be able to keep the organization's colours while picking its own
 * typeface, that is a fifth level and a spec change, not a tweak here.
 *
 * The facet was called `layout` while the kit still carried a grid and a
 * template. It holds typography alone now; layout is a decision about a book,
 * not about a shop.
 */
const LEVELS: Record<BrandOverride, Record<BrandFacet, BrandLevel>> = {
  inherit: { logo: 'org', colors: 'org', typography: 'org', progress: 'shop' },
  logo: { logo: 'shop', colors: 'org', typography: 'org', progress: 'shop' },
  colors: { logo: 'org', colors: 'shop', typography: 'org', progress: 'shop' },
  full: { logo: 'shop', colors: 'shop', typography: 'shop', progress: 'shop' },
}

export function levelFor(override: BrandOverride, facet: BrandFacet): BrandLevel {
  return LEVELS[override][facet]
}

/**
 * What survives "reset to organization defaults". E4-05.
 *
 * Everything in the `logo`, `colors` and `typography` facets goes; the `progress`
 * facet stays. `onboardingStep` and `onboardingCompletedAt` are shop-level for
 * a reason — dropping them would tell the owner their setup was never finished
 * and send them back through the wizard for a brand they just chose to inherit.
 *
 * Derived from `FACET_OF` rather than listing the fields, so a field added to
 * `BrandKit` cannot quietly survive a reset by being forgotten here. A key that
 * is not in `FACET_OF` at all is dropped: an unrecognised key is not something
 * this shop chose, and a reset is the right moment to be rid of it.
 *
 * **This is only half of a reset.** `resolveBrandKit` is facet-level and has no
 * per-field fallback, so a shop left on `full` with the kit cleared resolves to
 * an empty kit rather than to its organization's — `isBrandSetupComplete` goes
 * false and the editor gate closes. The caller must write `brandOverride` back
 * to `inherit` in the same breath. `resetShopBrandToOrg` in lib/brand-kit.ts is
 * the only intended caller and does exactly that.
 */
export function keepOnReset(kit: BrandKit): BrandKit {
  const kept: BrandKit = {}
  // Same widening as resolveBrandKit, and for the same reason: the loop erases
  // the per-key value types and TypeScript cannot re-derive them from a dynamic
  // key. The read and the write are the same key on the same interface.
  const sink = kept as Record<string, unknown>

  for (const [key, value] of Object.entries(kit)) {
    if (value === undefined) continue
    if (FACET_OF[key as keyof BrandKit] !== 'progress') continue
    sink[key] = value
  }

  return kept
}

export type BrandSide = { logoUrl: string | null; brandKit: BrandKit }

export type EffectiveBrand = {
  logoUrl: string | null
  brandKit: BrandKit
  override: BrandOverride
  /** Where each facet actually came from. The shop settings screen shows this. */
  source: Record<BrandFacet, BrandLevel>
}

/**
 * Resolve the brand a shop actually renders with.
 *
 * **Facet-level, all or nothing — there is no per-field fallback.** A shop on
 * `full` with an empty kit resolves to an empty kit, and `isBrandSetupComplete`
 * on that result is false. That is correct: silently filling the gaps from the
 * organization would make "full override" mean "full override except where you
 * left something blank", and the shop settings screen could never explain what
 * the shop is actually using.
 */
export function resolveBrandKit(input: {
  org: BrandSide
  shop: BrandSide
  override: BrandOverride
}): EffectiveBrand {
  const { org, shop, override } = input
  const source = LEVELS[override]

  const brandKit: BrandKit = {}
  // Every key maps to its own type on both sides; the loop erases that and
  // TypeScript cannot re-derive it from a dynamic key across a union of value
  // types. The read and the write are the same key on the same interface, so
  // widening the write target is sound and keeps BrandKit itself strict.
  const sink = brandKit as Record<string, unknown>

  for (const key of Object.keys(FACET_OF) as Array<keyof BrandKit>) {
    const from = source[FACET_OF[key]] === 'org' ? org.brandKit : shop.brandKit
    const value = from[key]
    if (value !== undefined) sink[key] = value
  }

  return {
    logoUrl: source.logo === 'org' ? org.logoUrl : shop.logoUrl,
    brandKit,
    override,
    source,
  }
}

/**
 * Split an incoming patch so each half lands at the level that owns it.
 *
 * This is what makes inheritance work rather than merely display: editing the
 * brand of an inheriting shop edits the *organization's* kit, because that is
 * the kit the shop is showing. Onboarding for a fresh signup therefore writes
 * the org kit, which is exactly what E4-05's "reset to organization defaults"
 * presupposes there being.
 */
export function routePatch(
  patch: Partial<BrandKit>,
  override: BrandOverride
): { org: Partial<BrandKit>; shop: Partial<BrandKit> } {
  const org: Partial<BrandKit> = {}
  const shop: Partial<BrandKit> = {}
  const sinks = {
    org: org as Record<string, unknown>,
    shop: shop as Record<string, unknown>,
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const facet = FACET_OF[key as keyof BrandKit]
    // A key that is not in the kit is not routable. Callers zod-parse first, so
    // this only fires if BrandKit gains a field and FACET_OF is not updated —
    // in which case dropping it silently would be the worse failure.
    if (!facet) continue
    sinks[LEVELS[override][facet]][key] = value
  }

  return { org, shop }
}
