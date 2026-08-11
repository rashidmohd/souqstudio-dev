import 'server-only'

import { prisma } from '@souqstudio/db'
import { stripe } from '@/lib/stripe'
import { ensurePlanPrices } from '@/lib/plans'

/**
 * The one seam between E2 and billing. E3 owns everything on the other side.
 *
 * E2 changes how many shops an organization has, which changes what it owes.
 * That is the entire overlap, and it is deliberately one function wide so that
 * E3 has one place to fill in and E2 has no reason to import Stripe.
 *
 * **E2's own spec is wrong about the mechanism.** docs/E2-organization-management.md
 * says "shop add/remove triggers Stripe subscription item update via webhook".
 * The webhook is inbound — it is how Stripe tells us what it did. Adding a shop
 * is an *outbound* call, and the webhook only reconciles afterwards. E3-02 has
 * it right; follow E3.
 */

/**
 * Shops allowed when the organization has no plan.
 *
 * The seed now writes the four plans, but `planId` is still null on every
 * organization until a subscription starts — signup does not choose a plan, and
 * E3 does not require one before the product is usable. So this remains what
 * governs an account that has never subscribed.
 *
 * Three is the smallest number that lets a real customer exercise multi-shop
 * (which is the whole point of E2) without letting an unbilled account grow
 * without limit.
 */
export const DEFAULT_MAX_SHOPS = 3

export type ShopLimit = { ok: true } | { ok: false; limit: number; current: number }

/**
 * May this organization add another shop?
 *
 * Counts non-archived shops, including deactivated ones: a deactivated shop
 * still holds its name, its brand and its offer books, and reactivating it is a
 * button. If a deactivated shop did not count, the limit could be walked past
 * by deactivating and adding in a loop.
 */
export async function assertShopLimit(organizationId: string): Promise<ShopLimit> {
  const [organization, current] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: { select: { maxShops: true } } },
    }),
    prisma.shop.count({ where: { organizationId, archivedAt: null } }),
  ])

  // `null` on the plan means unlimited, per the schema comment on Plan.maxShops.
  // No plan at all is a different case and falls back to the constant above.
  const limit = organization?.plan ? organization.plan.maxShops : DEFAULT_MAX_SHOPS
  if (limit === null || limit === undefined) return { ok: true }
  if (current < limit) return { ok: true }
  return { ok: false, limit, current }
}

/** E3-04. Days between the first failed payment and the account being restricted. */
export const GRACE_PERIOD_DAYS = 7

/**
 * What an unpaid account may still do. E3-04.
 *
 * - `none` — normal.
 * - `read_only` — inside the grace period. Existing work stays visible and
 *   editable; nothing new can be created. E3-04 says "can still view but cannot
 *   create new offer books", and the shape of that rule is read-only, not a
 *   lockout: a shop owner whose card expired must not lose the campaign they
 *   are in the middle of.
 * - `suspended` — past the grace period. Data is retained; the product is not
 *   usable until payment succeeds.
 *
 * **This is the gate other epics call**, not `billingStatus` directly. The
 * status alone does not carry the seven-day clock, and a route that reads it
 * raw will either restrict too early or never.
 */
export type BillingRestriction = 'none' | 'read_only' | 'suspended'

export function restrictionFor(
  organization: { billingStatus: string; pastDueSince: Date | null },
  now: Date = new Date()
): BillingRestriction {
  if (organization.billingStatus === 'suspended') return 'suspended'
  if (organization.billingStatus !== 'past_due') return 'none'

  // Past due with no timestamp means the webhook set the status without the
  // clock. Failing to `read_only` rather than `suspended` keeps the customer
  // working while the discrepancy is visible in the data.
  if (!organization.pastDueSince) return 'read_only'

  const graceEnds = new Date(organization.pastDueSince)
  graceEnds.setUTCDate(graceEnds.getUTCDate() + GRACE_PERIOD_DAYS)
  return now >= graceEnds ? 'suspended' : 'read_only'
}

export type UserLimit = { ok: true } | { ok: false; limit: number; current: number }

/**
 * May this organization take on another user? E3-01 "included users".
 *
 * Counts users who have not been removed, plus invites still outstanding — an
 * invite that has been sent is a seat that is spoken for, and counting only
 * accepted ones lets an organization sit N invites above its limit and have
 * them all land at once.
 *
 * A plan with a null `maxUsers` is unlimited. No plan at all is *also*
 * unlimited here, deliberately: an unbilled account is already capped by
 * DEFAULT_MAX_SHOPS, and refusing a teammate to someone who has not been asked
 * to pay yet is the wrong first impression. Shops are the billable unit; seats
 * are an entitlement.
 */
export async function assertUserLimit(organizationId: string): Promise<UserLimit> {
  const [organization, users, invites] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: { select: { maxUsers: true } } },
    }),
    prisma.user.count({ where: { organizationId, removedAt: null } }),
    // Live invites only. An expired one cannot be accepted, so it is not a
    // seat anybody holds.
    prisma.invite.count({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ])

  const limit = organization?.plan?.maxUsers
  if (limit === null || limit === undefined) return { ok: true }

  const current = users + invites
  if (current < limit) return { ok: true }
  return { ok: false, limit, current }
}

/**
 * Tell Stripe that the organization's billable shop count changed. E3-02.
 *
 * **One subscription item with a quantity, not one item per shop.** E3's Stripe
 * Architecture block reads "Subscription Items = Base plan + each extra shop",
 * and `shops.stripeSubscriptionItemId` was added for it — but Stripe permits
 * only one subscription item per price per subscription, so N shops on one
 * per-shop price cannot be N items. The alternative, a distinct Price object
 * per shop, buys nothing and multiplies the objects to reconcile. So the extra
 * shops are a quantity, `shops.stripeSubscriptionItemId` stays null (it is
 * `@unique`, and could not hold a shared item id anyway), and E3's architecture
 * note is wrong on this point in the same way E2's was wrong about the webhook
 * direction. See docs/E3-pending.md.
 *
 * Proration is Stripe's: `create_prorations` charges for the remainder of the
 * cycle when the count goes up and credits it when the count comes down, which
 * is exactly what E3-02 describes. Never compute it here.
 *
 * Callers must not fail a request because this failed. Adding a shop that is
 * not yet billed is recoverable by reconciliation; refusing to add a shop the
 * customer is entitled to is not.
 */
export async function syncShopQuantity(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true, plan: true },
  })

  // No subscription means nothing to bill — an account still inside
  // DEFAULT_MAX_SHOPS, or one whose subscription has been cancelled.
  if (!organization?.stripeSubscriptionId || !organization.plan) return

  const plan = organization.plan
  const included = plan.maxShops
  // Unlimited shops on this plan: there is no overage to charge for.
  if (included === null) return

  const billable = await prisma.shop.count({ where: { organizationId, archivedAt: null } })
  const extra = Math.max(billable - included, 0)

  const prices = await ensurePlanPrices(plan)
  if (!prices?.shopPriceId) {
    if (extra > 0) {
      // Starter is the case: one shop, no per-shop price. assertShopLimit
      // refuses the second shop rather than billing for it, so reaching here
      // means the limit was bypassed and the account is under-charged.
      console.warn(
        `[billing] organization ${organizationId} is ${extra} shops over ` +
          `${plan.name}, which has no per-shop price. Not billed.`
      )
    }
    return
  }

  const subscription = await stripe.subscriptions.retrieve(organization.stripeSubscriptionId)
  const item = subscription.items.data.find((entry) => entry.price.id === prices.shopPriceId)

  if (item) {
    if (item.quantity === extra) return
    await stripe.subscriptionItems.update(item.id, {
      quantity: extra,
      proration_behavior: 'create_prorations',
    })
    return
  }

  // Nothing to add an item for, and adding one at zero would put an empty line
  // on the invoice.
  if (extra === 0) return

  await stripe.subscriptionItems.create({
    subscription: organization.stripeSubscriptionId,
    price: prices.shopPriceId,
    quantity: extra,
    proration_behavior: 'create_prorations',
  })
}
