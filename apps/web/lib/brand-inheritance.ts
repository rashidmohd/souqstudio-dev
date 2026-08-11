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
export type BrandFacet = 'logo' | 'colors' | 'layout' | 'progress'
export type BrandLevel = 'org' | 'shop'

const FACET_OF: Record<keyof BrandKit, BrandFacet> = {
  logoStatus: 'logo',
  logoOriginalUrl: 'logo',
  primaryColor: 'colors',
  secondaryColor: 'colors',
  accentColor: 'colors',
  suggestedColors: 'colors',
  gridId: 'layout',
  templateId: 'layout',
  fontDisplay: 'layout',
  fontPrice: 'layout',
  fontBody: 'layout',
  onboardingStep: 'progress',
  onboardingCompletedAt: 'progress',
}

export function facetOf(key: keyof BrandKit): BrandFacet {
  return FACET_OF[key]
}

/**
 * Which level owns each facet, per override level.
 *
 * Grid, template and fonts sit in `layout` and move only at `full`, because the
 * spec names no level for them. If a shop should be able to keep the
 * organization's colours while picking its own template, that is a fifth level
 * and a spec change, not a tweak here.
 */
const LEVELS: Record<BrandOverride, Record<BrandFacet, BrandLevel>> = {
  inherit: { logo: 'org', colors: 'org', layout: 'org', progress: 'shop' },
  logo: { logo: 'shop', colors: 'org', layout: 'org', progress: 'shop' },
  colors: { logo: 'org', colors: 'shop', layout: 'org', progress: 'shop' },
  full: { logo: 'shop', colors: 'shop', layout: 'shop', progress: 'shop' },
}

export function levelFor(override: BrandOverride, facet: BrandFacet): BrandLevel {
  return LEVELS[override][facet]
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
