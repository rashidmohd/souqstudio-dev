import 'server-only'

import { prisma, Prisma } from '@souqstudio/db'
import type { BrandKit } from '@souqstudio/types'
import {
  keepOnReset,
  levelFor,
  resolveBrandKit,
  routePatch,
  type BrandOverride,
  type EffectiveBrand,
} from '@/lib/brand-inheritance'

/**
 * Reading and writing `shops.brandKit` and `organizations.brandKit`. E1-04, E4,
 * and E2-05's inheritance.
 *
 * The storage layer only. The *rule* — which level owns which facet — lives in
 * lib/brand-inheritance.ts, which is pure and tested. This file decides where
 * bytes go; that one decides what the answer is.
 *
 * The kit is a JSONB blob, which Prisma can only replace wholesale. That makes
 * every write a read-modify-write, and it makes **partial** writes the rule
 * here: the setup wizard saves one step at a time while a background-removal
 * job may be writing `logoStatus` underneath it. Whole-object overwrites from
 * either side would silently discard the other's work.
 */

/** The wizard's five steps. Step 5 is the finish screen, not a choice. */
export const ONBOARDING_STEPS = 5

export async function readBrandKit(shopId: string): Promise<BrandKit> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { brandKit: true },
  })
  return (shop?.brandKit ?? {}) as BrandKit
}

/**
 * Merge a patch into the kit.
 *
 * `onboardingStep` only ever moves forward — going back a step in the wizard
 * must not throw away the fact that later steps were already reached, or a
 * refresh after using the back button would drop the owner somewhere earlier
 * than they had got to.
 */
export async function patchBrandKit(
  shopId: string,
  patch: Partial<BrandKit>,
  logoUrl?: string
): Promise<BrandKit> {
  const existing = await readBrandKit(shopId)

  const merged: BrandKit = { ...existing, ...patch }
  if (patch.onboardingStep !== undefined) {
    merged.onboardingStep = Math.max(existing.onboardingStep ?? 0, patch.onboardingStep)
  }

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: {
      // Prisma's JSON input type demands an index signature, which BrandKit
      // deliberately lacks — an unknown key should be a compile error, not a
      // silently stored typo. Every field on it is JSON-serialisable by
      // construction, so the cast is safe and the narrower type is worth it.
      brandKit: merged as Prisma.InputJsonObject,
      ...(logoUrl !== undefined ? { logoUrl } : {}),
    },
    select: { brandKit: true },
  })

  return (shop.brandKit ?? {}) as BrandKit
}

/**
 * The organization's own kit — the defaults every shop inherits. E2-05.
 */
export async function readOrgBrandKit(
  organizationId: string
): Promise<{ logoUrl: string | null; brandKit: BrandKit }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoUrl: true, brandKit: true },
  })
  return {
    logoUrl: org?.logoUrl ?? null,
    brandKit: (org?.brandKit ?? {}) as BrandKit,
  }
}

/** The org-level twin of patchBrandKit. Same read-modify-write, same reason. */
export async function patchOrgBrandKit(
  organizationId: string,
  patch: Partial<BrandKit>,
  logoUrl?: string
): Promise<BrandKit> {
  const existing = await readOrgBrandKit(organizationId)

  const merged: BrandKit = { ...existing.brandKit, ...patch }
  if (patch.onboardingStep !== undefined) {
    merged.onboardingStep = Math.max(
      existing.brandKit.onboardingStep ?? 0,
      patch.onboardingStep
    )
  }

  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      brandKit: merged as Prisma.InputJsonObject,
      ...(logoUrl !== undefined ? { logoUrl } : {}),
    },
    select: { brandKit: true },
  })

  return (org.brandKit ?? {}) as BrandKit
}

/**
 * Write a patch to whichever level owns it.
 *
 * Callers pass the shop and its override level and let this decide; splitting
 * the patch is `routePatch`'s job and applying it is this one's. Both halves
 * are written, because a single patch can legitimately span levels — a shop on
 * `colors` saving its colours and its template touches both rows.
 */
export async function patchBrandAtLevel(
  target: { organizationId: string; shopId: string; brandOverride: BrandOverride },
  patch: Partial<BrandKit>,
  logoUrl?: string
): Promise<EffectiveBrand> {
  const split = routePatch(patch, target.brandOverride)
  const logoLevel = levelFor(target.brandOverride, 'logo')

  if (Object.keys(split.org).length > 0 || (logoUrl !== undefined && logoLevel === 'org')) {
    await patchOrgBrandKit(
      target.organizationId,
      split.org,
      logoUrl !== undefined && logoLevel === 'org' ? logoUrl : undefined
    )
  }

  if (Object.keys(split.shop).length > 0 || (logoUrl !== undefined && logoLevel === 'shop')) {
    await patchBrandKit(
      target.shopId,
      split.shop,
      logoUrl !== undefined && logoLevel === 'shop' ? logoUrl : undefined
    )
  }

  return readEffectiveBrand(target)
}

/**
 * Reset a shop to its organization's brand, destructively. E4-05.
 *
 * **Not `patchBrandKit`.** That merges, so it can set a key and never remove
 * one; a reset is exactly the removal. This writes the kit whole, which is safe
 * here and nowhere else: the wizard's read-modify-write exists because a
 * background-removal job may be writing `logoStatus` underneath it, and this
 * deliberately discards `logoStatus` along with the logo it described.
 *
 * **The three writes are one act and must stay together.** `resolveBrandKit`
 * has no per-field fallback, so clearing the kit while leaving `brandOverride`
 * at `full` leaves the shop resolving to *nothing* — an empty kit, a false
 * `isBrandSetupComplete`, and a closed editor gate. Setting `inherit` is what
 * makes the organization's kit the answer. Prisma applies a single `UPDATE`, so
 * there is no window where one has landed and another has not.
 *
 * The R2 objects are left where they are. `lib/r2.ts` has no delete and the keys
 * are deterministic, so a later upload overwrites at the same path; nulling
 * `logoUrl` is what stops the old mark being used. Deleting the bytes is an
 * object-lifecycle question, not this one.
 */
export async function resetShopBrandToOrg(shopId: string): Promise<BrandKit> {
  const existing = await readBrandKit(shopId)
  const kept = keepOnReset(existing)

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: {
      brandKit: kept as Prisma.InputJsonObject,
      logoUrl: null,
      brandOverride: 'inherit',
    },
    select: { brandKit: true },
  })

  return (shop.brandKit ?? {}) as BrandKit
}

/** The brand a shop actually renders with, org and shop resolved together. */
export async function readEffectiveBrand(shop: {
  organizationId: string
  shopId: string
  brandOverride: BrandOverride
}): Promise<EffectiveBrand> {
  const [org, row] = await Promise.all([
    readOrgBrandKit(shop.organizationId),
    prisma.shop.findUnique({
      where: { id: shop.shopId },
      select: { logoUrl: true, brandKit: true },
    }),
  ])

  return resolveBrandKit({
    org,
    shop: {
      logoUrl: row?.logoUrl ?? null,
      brandKit: (row?.brandKit ?? {}) as BrandKit,
    },
    override: shop.brandOverride,
  })
}

/**
 * Is brand setup finished?
 *
 * Judged on the choices, not on a flag. `onboardingCompletedAt` records when it
 * happened, but a kit missing its colours or its template is unfinished no
 * matter what any flag says — and the editor gate in E1-04 depends on this
 * being true only when the editor actually has something to render with.
 *
 * The logo is deliberately not required. A shop with no logo yet can still
 * produce an offer book, and blocking on an upload would strand anyone whose
 * file will not go through.
 */
export function isBrandSetupComplete(kit: BrandKit): boolean {
  return Boolean(kit.primaryColor && kit.secondaryColor && kit.accentColor && kit.gridId && kit.templateId)
}
