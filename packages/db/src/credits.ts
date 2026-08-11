import { prisma, withOrg } from './client'

/**
 * AI credit accounting. E3-03.
 *
 * **Why this lives in packages/db and not apps/web/lib.** Credits are checked by
 * a route in the web app and *deducted by the worker on job completion* —
 * souqstudio-technical → references/background-jobs.md is explicit that nothing
 * deducts at queue time, because a shop must not pay for a job that failed. Two
 * processes therefore write this balance, and the same argument that put
 * `queue-client.ts` here applies: one definition, or they drift.
 *
 * **This is the one part of billing that is not a cache of Stripe.** Stripe
 * meters consumption; it does not hold an entitlement balance with rollover
 * rules and non-expiring purchased credits stacked on top. That arithmetic is
 * ours, so the balance is ours.
 */

// ─── Costs ────────────────────────────────────────────────────────────────────

/**
 * What an action costs, from docs/E3-billing-subscription.md → Credit Costs.
 *
 * `variation` is E3's "Regenerate / variation" row. It is deliberately *not* in
 * `AiJobType` in packages/types, which lists the five job types the AI worker
 * runs — a regeneration is one of those five re-run, and what makes it cheaper
 * is that it reuses an existing result. Whichever epic builds regeneration has
 * to decide how it is recorded in `usage_events.eventType`; until then the price
 * is written down here and nothing charges it. See docs/E3-pending.md.
 */
export type CreditAction =
  | 'character_gen'
  | 'pose_gen'
  | 'cover_gen'
  | 'background_removal'
  | 'prompt_gen'
  | 'variation'

export const CREDIT_COSTS: Readonly<Record<CreditAction, number>> = {
  /** Generate base character — four variations. */
  character_gen: 10,
  pose_gen: 3,
  /** Custom prompt generation. */
  prompt_gen: 5,
  /** Regenerate / variation. */
  variation: 2,
  /** AI cover generation. */
  cover_gen: 5,
  background_removal: 1,
}

/** One top-up pack: 100 credits for $8, per docs/project.md. */
export const TOPUP_PACK = { credits: 100, price: 8 } as const

/**
 * The ceiling on a rolled-over balance, as a multiple of the monthly
 * allocation. E3-03: "Credits roll over (up to 2x monthly allocation)".
 *
 * Read as a cap on the *balance*, not on the amount carried — a Pro shop on 200
 * a month can start a period with at most 400 monthly credits, never 600. The
 * other reading (carry up to 2x, so hold up to 3x) makes an idle account
 * accumulate faster than an active one can spend, which is not what a cap is
 * for. Purchased credits sit outside this entirely; they never expire.
 */
export const CREDIT_ROLLOVER_MULTIPLE = 2

/** Below this fraction of the monthly allocation, warn the owner (E12). */
export const LOW_BALANCE_FRACTION = 0.15

// ─── Pure arithmetic ──────────────────────────────────────────────────────────

/**
 * What survives the reset, given what was left when the period ended.
 *
 * Zero on a plan without rollover, and never more than would take the new
 * balance past the cap. Both arguments are monthly credits only — purchased
 * credits are not part of this calculation and are not touched by a reset.
 */
export function rolloverAmount(input: {
  remaining: number
  allocation: number
  rollover: boolean
}): number {
  if (!input.rollover || input.remaining <= 0) return 0
  const headroom = input.allocation * (CREDIT_ROLLOVER_MULTIPLE - 1)
  return Math.min(input.remaining, Math.max(headroom, 0))
}

/**
 * How a spend of `cost` splits across the two buckets.
 *
 * Monthly credits are spent first, always. They are the ones that expire, so
 * spending purchased credits ahead of them would quietly destroy something the
 * customer paid for.
 */
export function splitSpend(input: {
  cost: number
  monthlyRemaining: number
  topupRemaining: number
}): { fromMonthly: number; fromTopup: number; sufficient: boolean } {
  const fromMonthly = Math.min(input.cost, Math.max(input.monthlyRemaining, 0))
  const fromTopup = input.cost - fromMonthly
  return {
    fromMonthly,
    fromTopup,
    sufficient: fromTopup <= Math.max(input.topupRemaining, 0),
  }
}

/**
 * Add whole months, clamped to the end of the target month.
 *
 * `setMonth` alone turns 31 January into 3 March, which would walk the billing
 * anniversary forward a few days every year. 28 February is the correct answer
 * and is what Stripe does with its own cycle anchor.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const targetMonth = result.getUTCMonth() + months
  const dayOfMonth = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(targetMonth)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(dayOfMonth, lastDay))
  return result
}

/**
 * The period the given moment falls in, walking forward from `start`.
 *
 * Several months can have elapsed if the webhook was down or the organization
 * was dormant. That is one reset, not one per month — otherwise a dormant
 * account would accrue a rolled-over balance for months it never paid for.
 */
export function currentPeriod(start: Date, now: Date): { start: Date; end: Date } {
  let periodStart = start
  let periodEnd = addMonths(periodStart, 1)
  // Bounded so a corrupt far-past date cannot spin. Ten years of months is far
  // beyond any real gap and still terminates immediately in the normal case.
  for (let i = 0; i < 120 && periodEnd <= now; i += 1) {
    periodStart = periodEnd
    periodEnd = addMonths(periodStart, 1)
  }
  return { start: periodStart, end: periodEnd }
}

// ─── Reading the balance ──────────────────────────────────────────────────────

export type CreditSnapshot = {
  organizationId: string
  /** Credits from this period's allocation, including anything rolled over. */
  monthlyRemaining: number
  /** Purchased credits. Never expire. */
  topupRemaining: number
  /** What can actually be spent right now. */
  total: number
  /** The plan's monthly allocation, for the usage meter's denominator. */
  allocation: number
  /** Credits consumed since `periodStart`, for the same meter. */
  usedThisPeriod: number
  periodStart: Date
  periodEnd: Date
  /** `pooled` or `allocated` — E3-03 credit pooling. */
  pooling: string
}

type PlanAllocation = { allocation: number; rollover: boolean }

/**
 * An organization with no plan row still has to have an answer here.
 *
 * Every organization is in that state today — nothing sets `planId` until a
 * subscription starts — and an AI action taken during a trial or between plans
 * must not divide by an absent allocation. Zero credits and no rollover is the
 * honest answer: the balance screen reads "no plan", not "0 of 0".
 */
const NO_PLAN: PlanAllocation = { allocation: 0, rollover: false }

/**
 * Read the balance, resetting the period first if it has ended.
 *
 * The reset is lazy as well as webhook-driven, on purpose. `invoice.paid` is
 * what normally starts a period; if it is missed or late, a shop owner who
 * opens the app on the first of the month must still see their credits. A
 * missed webhook then delays the *invoice*, not the entitlement.
 */
export async function getCreditSnapshot(organizationId: string): Promise<CreditSnapshot> {
  const now = new Date()
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      creditPooling: true,
      createdAt: true,
      plan: { select: { aiCreditsMonth: true, creditsRollover: true } },
      creditBalance: true,
    },
  })
  if (!organization) {
    throw new Error(`[credits] no organization ${organizationId}`)
  }

  const plan: PlanAllocation = organization.plan
    ? { allocation: organization.plan.aiCreditsMonth, rollover: organization.plan.creditsRollover }
    : NO_PLAN

  let balance = organization.creditBalance
  if (!balance) {
    balance = await openFirstPeriod(organizationId, organization.createdAt, plan, now)
  } else if (balance.periodEnd <= now) {
    balance = await rollPeriod(organizationId, balance.periodEnd, balance.monthlyRemaining, plan, now)
  }

  const usedThisPeriod = await sumUsage({
    organizationId,
    since: balance.periodStart,
  })

  return {
    organizationId,
    monthlyRemaining: balance.monthlyRemaining,
    topupRemaining: balance.topupRemaining,
    total: balance.monthlyRemaining + balance.topupRemaining,
    allocation: plan.allocation,
    usedThisPeriod,
    periodStart: balance.periodStart,
    periodEnd: balance.periodEnd,
    pooling: organization.creditPooling,
  }
}

/**
 * The first period, anchored on the organization's own creation date so that
 * an account created on the 8th resets on the 8th. `invoice.paid` re-anchors it
 * to the Stripe cycle as soon as there is a subscription.
 */
async function openFirstPeriod(
  organizationId: string,
  anchor: Date,
  plan: PlanAllocation,
  now: Date
) {
  const period = currentPeriod(anchor, now)
  return prisma.creditBalance.upsert({
    where: { organizationId },
    // Empty: another request created the row a moment ago, which is the whole
    // point of an upsert here. Its values are as good as the ones computed on
    // this path.
    update: {},
    create: {
      organizationId,
      monthlyRemaining: plan.allocation,
      topupRemaining: 0,
      periodStart: period.start,
      periodEnd: period.end,
    },
  })
}

async function rollPeriod(
  organizationId: string,
  previousEnd: Date,
  previousRemaining: number,
  plan: PlanAllocation,
  now: Date
) {
  const period = currentPeriod(previousEnd, now)
  const carried = rolloverAmount({
    remaining: previousRemaining,
    allocation: plan.allocation,
    rollover: plan.rollover,
  })

  // Conditional on the period we read, so two concurrent requests cannot both
  // apply the reset. The loser sees `count: 0` and re-reads the winner's row.
  const applied = await prisma.creditBalance.updateMany({
    where: { organizationId, periodEnd: previousEnd },
    data: {
      monthlyRemaining: plan.allocation + carried,
      periodStart: period.start,
      periodEnd: period.end,
      lowBalanceNotifiedAt: null,
    },
  })
  if (applied.count === 0) {
    const current = await prisma.creditBalance.findUniqueOrThrow({ where: { organizationId } })
    return current
  }
  return prisma.creditBalance.findUniqueOrThrow({ where: { organizationId } })
}

async function sumUsage(input: {
  organizationId: string
  shopId?: string
  since: Date
}): Promise<number> {
  const where = input.shopId
    ? { organizationId: input.organizationId, shopId: input.shopId, createdAt: { gte: input.since } }
    : { organizationId: input.organizationId, createdAt: { gte: input.since } }
  const total = await prisma.usageEvent.aggregate({ where, _sum: { creditsUsed: true } })
  return total._sum.creditsUsed ?? 0
}

// ─── Spending ─────────────────────────────────────────────────────────────────

export type SpendResult =
  | { ok: true; charged: number; monthlyRemaining: number; topupRemaining: number }
  | { ok: false; reason: 'insufficient_credits'; required: number; available: number }
  | { ok: false; reason: 'shop_allocation_exhausted'; required: number; available: number }

/**
 * Charge an organization for an AI action and record it.
 *
 * **Call this on completion, never at queue time.** The route checks
 * `getCreditSnapshot()` first so it can refuse an action nobody can pay for;
 * the worker calls this once the work succeeded. Because nothing is deducted
 * early, a failed job needs no refund path — there is nothing to refund, which
 * is the only version of this that cannot leak credits.
 *
 * The deduction is a compare-and-set, not a read-then-write: two poses
 * finishing in the same instant against a balance that covers one must not both
 * succeed. The loser gets `insufficient_credits`, which is the truth.
 */
export async function consumeCredits(input: {
  organizationId: string
  shopId?: string | null
  action: CreditAction
  /** Overrides the table. For a job whose cost was quoted at a different time. */
  cost?: number
}): Promise<SpendResult> {
  const cost = input.cost ?? CREDIT_COSTS[input.action]
  const snapshot = await getCreditSnapshot(input.organizationId)

  if (snapshot.pooling === 'allocated' && input.shopId) {
    const allocation = await prisma.shopCreditAllocation.findUnique({
      where: { shopId: input.shopId },
      select: { allocated: true },
    })
    if (allocation) {
      const spentByShop = await sumUsage({
        organizationId: input.organizationId,
        shopId: input.shopId,
        since: snapshot.periodStart,
      })
      const shopRemaining = allocation.allocated - spentByShop
      if (shopRemaining < cost) {
        return {
          ok: false,
          reason: 'shop_allocation_exhausted',
          required: cost,
          available: Math.max(shopRemaining, 0),
        }
      }
    }
  }

  const split = splitSpend({
    cost,
    monthlyRemaining: snapshot.monthlyRemaining,
    topupRemaining: snapshot.topupRemaining,
  })
  if (!split.sufficient) {
    return { ok: false, reason: 'insufficient_credits', required: cost, available: snapshot.total }
  }

  return withOrg(input.organizationId, async (tx) => {
    const applied = await tx.creditBalance.updateMany({
      where: {
        organizationId: input.organizationId,
        monthlyRemaining: { gte: split.fromMonthly },
        topupRemaining: { gte: split.fromTopup },
      },
      data: {
        monthlyRemaining: { decrement: split.fromMonthly },
        topupRemaining: { decrement: split.fromTopup },
      },
    })
    if (applied.count === 0) {
      return {
        ok: false as const,
        reason: 'insufficient_credits' as const,
        required: cost,
        available: snapshot.total,
      }
    }

    await tx.usageEvent.create({
      data: {
        organizationId: input.organizationId,
        shopId: input.shopId ?? null,
        // `variation` is not one of the five recorded types; it is a cheaper
        // re-run of whichever action produced the original. Recording it as
        // itself keeps the ledger honest about what was charged.
        eventType: input.action,
        creditsUsed: cost,
      },
    })

    const after = await tx.creditBalance.findUniqueOrThrow({
      where: { organizationId: input.organizationId },
      select: { monthlyRemaining: true, topupRemaining: true },
    })
    return {
      ok: true as const,
      charged: cost,
      monthlyRemaining: after.monthlyRemaining,
      topupRemaining: after.topupRemaining,
    }
  })
}

// ─── Granting ─────────────────────────────────────────────────────────────────

/**
 * Add purchased credits. Called only by the `invoice.paid` webhook, which is
 * what makes a duplicate delivery harmless: the top-up row moves out of
 * `pending` in the same transaction, so the second attempt grants nothing.
 */
export async function grantTopupCredits(input: {
  organizationId: string
  topupId: string
}): Promise<{ granted: number }> {
  return withOrg(input.organizationId, async (tx) => {
    const claimed = await tx.creditTopup.updateMany({
      where: { id: input.topupId, organizationId: input.organizationId, status: 'pending' },
      data: { status: 'succeeded', grantedAt: new Date() },
    })
    if (claimed.count === 0) return { granted: 0 }

    const topup = await tx.creditTopup.findUniqueOrThrow({
      where: { id: input.topupId },
      select: { credits: true },
    })
    await tx.creditBalance.update({
      where: { organizationId: input.organizationId },
      data: { topupRemaining: { increment: topup.credits } },
    })
    return { granted: topup.credits }
  })
}

/**
 * Start a new allocation period on the Stripe cycle. Called by `invoice.paid`.
 *
 * Idempotent by period: a duplicate delivery of the same invoice finds the
 * period already open and does nothing, so credits are granted once.
 */
export async function startBillingPeriod(input: {
  organizationId: string
  periodStart: Date
  periodEnd: Date
  allocation: number
  rollover: boolean
}): Promise<{ opened: boolean }> {
  const existing = await prisma.creditBalance.findUnique({
    where: { organizationId: input.organizationId },
    select: { periodStart: true, monthlyRemaining: true },
  })

  if (!existing) {
    await prisma.creditBalance.create({
      data: {
        organizationId: input.organizationId,
        monthlyRemaining: input.allocation,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    })
    return { opened: true }
  }

  if (existing.periodStart >= input.periodStart) return { opened: false }

  const carried = rolloverAmount({
    remaining: existing.monthlyRemaining,
    allocation: input.allocation,
    rollover: input.rollover,
  })
  const applied = await prisma.creditBalance.updateMany({
    where: { organizationId: input.organizationId, periodStart: existing.periodStart },
    data: {
      monthlyRemaining: input.allocation + carried,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lowBalanceNotifiedAt: null,
    },
  })
  return { opened: applied.count > 0 }
}
