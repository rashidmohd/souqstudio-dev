import 'server-only'

import { prisma, getCreditSnapshot, TOPUP_PACK } from '@souqstudio/db'
import { stripe } from '@/lib/stripe'
import { listPublicPlans, planFeatures } from '@/lib/plans'
import { restrictionFor, type BillingRestriction } from '@/lib/billing'

/**
 * Everything the billing screen shows, in one read. E3-01.
 *
 * The screen and `GET /api/v1/billing` return the same object because they
 * answer the same question, and two assemblies of "what does this organization
 * owe and have" would eventually disagree about a limit.
 *
 * Stripe is consulted for exactly one field — the upcoming invoice — and a
 * failure there degrades to `null` rather than failing the read. A customer who
 * cannot see next month's estimate can still cancel, top up and change plan; a
 * billing page that 500s because Stripe is slow can do none of those.
 */

export type PlanSummary = {
  id: string
  name: string
  tier: number
  basePrice: number
  pricePerShop: number
  maxShops: number | null
  maxUsers: number | null
  aiCreditsMonth: number
  creditsRollover: boolean
  features: ReturnType<typeof planFeatures>
}

export type BillingSummary = {
  status: string
  restriction: BillingRestriction
  plan: PlanSummary | null
  /** A downgrade that applies at the end of the period (E3-01). */
  pendingPlan: { id: string; name: string } | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  dataPurgeAt: string | null
  usage: {
    shops: { used: number; included: number | null }
    users: { used: number; included: number | null }
    credits: {
      usedThisPeriod: number
      allocation: number
      monthlyRemaining: number
      topupRemaining: number
      total: number
      periodEnd: string
      pooling: string
    }
  }
  /** Null when there is no subscription, or when Stripe could not be reached. */
  nextInvoice: { amount: number; currency: string; date: string } | null
  topupPack: { credits: number; price: number }
  /** The comparison table on the upgrade flow. Cheapest first. */
  plans: PlanSummary[]
}

export async function getBillingSummary(organizationId: string): Promise<BillingSummary> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      billingStatus: true,
      pastDueSince: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
      dataPurgeAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      plan: true,
      pendingPlan: { select: { id: true, name: true } },
    },
  })

  const [shops, users, credits, plans] = await Promise.all([
    prisma.shop.count({ where: { organizationId, archivedAt: null } }),
    prisma.user.count({ where: { organizationId, removedAt: null } }),
    getCreditSnapshot(organizationId),
    listPublicPlans(),
  ])

  return {
    status: organization.billingStatus,
    restriction: restrictionFor(organization),
    plan: organization.plan ? toPlanSummary(organization.plan) : null,
    pendingPlan: organization.pendingPlan,
    cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
    currentPeriodEnd: organization.currentPeriodEnd?.toISOString() ?? null,
    dataPurgeAt: organization.dataPurgeAt?.toISOString() ?? null,
    usage: {
      shops: { used: shops, included: organization.plan?.maxShops ?? null },
      users: { used: users, included: organization.plan?.maxUsers ?? null },
      credits: {
        usedThisPeriod: credits.usedThisPeriod,
        allocation: credits.allocation,
        monthlyRemaining: credits.monthlyRemaining,
        topupRemaining: credits.topupRemaining,
        total: credits.total,
        periodEnd: credits.periodEnd.toISOString(),
        pooling: credits.pooling,
      },
    },
    nextInvoice: await upcomingInvoice(organization.stripeCustomerId, organization.stripeSubscriptionId),
    topupPack: { credits: TOPUP_PACK.credits, price: TOPUP_PACK.price },
    plans: plans.map(toPlanSummary),
  }
}

function toPlanSummary(plan: {
  id: string
  name: string
  tier: number
  basePrice: unknown
  pricePerShop: unknown
  maxShops: number | null
  maxUsers: number | null
  aiCreditsMonth: number
  creditsRollover: boolean
  features: unknown
}): PlanSummary {
  return {
    id: plan.id,
    name: plan.name,
    tier: plan.tier,
    // Prisma Decimal. Number() is safe at these magnitudes — a plan price is
    // two figures, not a balance — and the screen needs a JSON number.
    basePrice: Number(plan.basePrice),
    pricePerShop: Number(plan.pricePerShop),
    maxShops: plan.maxShops,
    maxUsers: plan.maxUsers,
    aiCreditsMonth: plan.aiCreditsMonth,
    creditsRollover: plan.creditsRollover,
    features: planFeatures({ features: plan.features as never }),
  }
}

/**
 * Next month's estimate, straight from Stripe. E3-01 "next billing date and
 * amount".
 *
 * Never computed here. The amount depends on proration, tax and any credit
 * balance sitting on the customer — all of which Stripe already knows and any
 * local sum would eventually get wrong.
 */
async function upcomingInvoice(
  customerId: string | null,
  subscriptionId: string | null
): Promise<BillingSummary['nextInvoice']> {
  if (!customerId || !subscriptionId) return null
  try {
    const invoice = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
      subscription: subscriptionId,
    })
    return {
      amount: invoice.total / 100,
      currency: invoice.currency,
      date: new Date(invoice.period_end * 1000).toISOString(),
    }
  } catch {
    // No upcoming invoice (cancelled, or a subscription that has not billed
    // yet), or Stripe is unreachable. Either way the rest of the page stands.
    return null
  }
}
