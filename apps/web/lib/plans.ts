import 'server-only'

import { prisma, Prisma } from '@souqstudio/db'
import type { Plan } from '@souqstudio/db'
import { stripe, toMinorUnits, BILLING_CURRENCY } from '@/lib/stripe'

/**
 * Plans: what a tier includes, and where its Stripe prices live. E3-01.
 *
 * The `plans` table is seeded reference data (packages/db/prisma/seed.ts) and
 * is the only place a limit or a price is written down. Nothing in the app
 * hardcodes "Pro includes three shops" — that sentence exists once, as a row.
 *
 * The Stripe price ids are the exception: they are per-account and per-mode, so
 * they cannot be seeded. `ensurePlanPrices()` provisions them on first use and
 * caches them back onto the row, which is what lets a developer with nothing
 * but a fresh test key run the whole billing flow.
 */

/**
 * Prisma types the `features` column as JsonValue. This narrows it once, here,
 * so no caller has to index into an unknown.
 */
type JsonRecord = Record<string, unknown>

/** The feature flags carried on `plans.features`. All optional, all boolean. */
export type PlanFeatures = {
  /** E3-03 allocated credit pooling. Business and above. */
  allocatedCredits: boolean
  customTemplates: boolean
  prioritySupport: boolean
  whiteLabel: boolean
  apiAccess: boolean
}

const NO_FEATURES: PlanFeatures = {
  allocatedCredits: false,
  customTemplates: false,
  prioritySupport: false,
  whiteLabel: false,
  apiAccess: false,
}

/**
 * Read the feature flags off a plan.
 *
 * Everything defaults to false, including for an organization with no plan at
 * all. The failure direction of an unreadable `features` column has to be less
 * capability, never more — the same rule `toRole()` follows in lib/authz.ts.
 */
export function planFeatures(plan: Pick<Plan, 'features'> | null): PlanFeatures {
  if (!plan || typeof plan.features !== 'object' || plan.features === null) return NO_FEATURES
  const raw = plan.features as JsonRecord
  return {
    allocatedCredits: raw.allocatedCredits === true,
    customTemplates: raw.customTemplates === true,
    prioritySupport: raw.prioritySupport === true,
    whiteLabel: raw.whiteLabel === true,
    apiAccess: raw.apiAccess === true,
  }
}

/**
 * Which direction is this plan change?
 *
 * The whole of E3-01's split behaviour hangs on this one comparison: an upgrade
 * applies immediately with a prorated charge, a downgrade waits for the end of
 * the period. `tier` is the only thing that decides it — never price, which
 * would make a discounted plan change direction, and never name.
 */
export type PlanDirection = 'upgrade' | 'downgrade' | 'same'

export function planDirection(from: Pick<Plan, 'tier'> | null, to: Pick<Plan, 'tier'>): PlanDirection {
  const current = from?.tier ?? 0
  if (to.tier > current) return 'upgrade'
  if (to.tier < current) return 'downgrade'
  return 'same'
}

/** Every plan a customer may choose for themselves, cheapest first. */
export async function listPublicPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({ where: { isPublic: true }, orderBy: { tier: 'asc' } })
}

export async function getPlan(planId: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id: planId } })
}

/**
 * Is this plan something a customer can buy without talking to anyone?
 *
 * Enterprise is not: it has no published price, so there is nothing to charge.
 * Routes check this before building a subscription rather than discovering it
 * as a null price id three calls later.
 */
export function isSelfServe(plan: {
  isPublic: boolean
  /**
   * A Prisma `Decimal` off a plan row, or a plain number. Both, because the
   * only thing this needs is a magnitude, and requiring a Decimal would force
   * every caller that has an ordinary number to construct one.
   */
  basePrice: Prisma.Decimal | number
}): boolean {
  return plan.isPublic && Number(plan.basePrice) > 0
}

export type PlanPrices = {
  /** The base subscription price. */
  basePriceId: string
  /** The per-extra-shop price, absent on a plan with no shop add-on (E3-02). */
  shopPriceId: string | null
}

/**
 * Make sure this plan's Stripe prices exist, and return their ids.
 *
 * Idempotent in three layers, because this can run concurrently on two requests
 * for the same plan:
 *
 *  1. The cached id on the plan row short-circuits almost every call.
 *  2. The Stripe product carries a deterministic id, so a second create is a
 *     recognised conflict rather than a duplicate product.
 *  3. The price carries a `lookup_key`, which is unique per account — so the
 *     lookup happens before any create, and a race loses cleanly.
 *
 * **An existing Stripe price is never replaced, even if its amount disagrees
 * with the plan row.** Stripe prices are immutable, and the price a customer is
 * already subscribed to is the price they agreed to. A mismatch is a deliberate
 * price change that needs migrating subscriptions, not something a seed re-run
 * should do silently at 2am. The disagreement is logged and the Stripe amount
 * wins.
 */
export async function ensurePlanPrices(plan: Plan): Promise<PlanPrices | null> {
  if (!isSelfServe(plan)) return null

  const needsShopPrice = Number(plan.pricePerShop) > 0
  if (plan.stripePriceId && (!needsShopPrice || plan.stripeShopPriceId)) {
    return { basePriceId: plan.stripePriceId, shopPriceId: plan.stripeShopPriceId }
  }

  const productId = await ensureProduct(plan)

  const basePriceId =
    plan.stripePriceId ??
    (await ensurePrice({
      productId,
      lookupKey: `souqstudio_${plan.id}_base_monthly`,
      amount: Number(plan.basePrice),
      nickname: `${plan.name} — base`,
    }))

  const shopPriceId = !needsShopPrice
    ? null
    : (plan.stripeShopPriceId ??
      (await ensurePrice({
        productId,
        lookupKey: `souqstudio_${plan.id}_shop_monthly`,
        amount: Number(plan.pricePerShop),
        nickname: `${plan.name} — extra shop`,
      })))

  await prisma.plan.update({
    where: { id: plan.id },
    data: { stripePriceId: basePriceId, stripeShopPriceId: shopPriceId },
  })

  return { basePriceId, shopPriceId }
}

/**
 * The Stripe product for a plan, created with a deterministic id.
 *
 * Specifying the id is what makes this safe to call twice. Stripe rejects a
 * duplicate with `resource_already_exists`, which is the success case here —
 * the product exists, which is all the caller asked for.
 */
async function ensureProduct(plan: Plan): Promise<string> {
  const id = `souqstudio_plan_${plan.id}`
  try {
    const existing = await stripe.products.retrieve(id)
    if (!existing.deleted) return existing.id
  } catch {
    // Not found. Fall through and create it.
  }

  try {
    const created = await stripe.products.create({
      id,
      name: `SouqStudio ${plan.name}`,
      metadata: { planId: plan.id },
    })
    return created.id
  } catch (error) {
    // Lost a race with another request. The product is there, which is what
    // was wanted; anything else is a real failure and rethrows.
    if (isAlreadyExists(error)) return id
    throw error
  }
}

async function ensurePrice(input: {
  productId: string
  lookupKey: string
  amount: number
  nickname: string
}): Promise<string> {
  const found = await stripe.prices.list({
    lookup_keys: [input.lookupKey],
    active: true,
    limit: 1,
  })
  const existing = found.data[0]
  if (existing) {
    if (existing.unit_amount !== toMinorUnits(input.amount)) {
      console.warn(
        `[plans] ${input.lookupKey} is ${existing.unit_amount} in Stripe but ` +
          `${toMinorUnits(input.amount)} in the plans table. Stripe wins — ` +
          'a price change needs a migration, not a silent swap.'
      )
    }
    return existing.id
  }

  const created = await stripe.prices.create({
    product: input.productId,
    lookup_key: input.lookupKey,
    nickname: input.nickname,
    currency: BILLING_CURRENCY,
    unit_amount: toMinorUnits(input.amount),
    recurring: { interval: 'month' },
  })
  return created.id
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'resource_already_exists'
  )
}
