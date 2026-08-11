import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Organization, Plan } from '@souqstudio/db'
import { stripe, toMinorUnits, isCardError, BILLING_CURRENCY, type Stripe } from '@/lib/stripe'
import { ensurePlanPrices, isSelfServe, planDirection } from '@/lib/plans'

/**
 * Subscribing, changing plan, cancelling, and buying credits. E3-01 and E3-03.
 *
 * Every function here makes an outbound call to Stripe and returns. **None of
 * them writes `billingStatus`, `planId` or the period cache** — that is the
 * webhook's job, and having two writers is how a subscription ends up in a
 * state neither side agrees with. The one exception is the pending-downgrade
 * marker, which Stripe has no field for and which the webhook clears.
 *
 * Nothing in this file computes money. Proration, tax and invoice arithmetic
 * are Stripe's; a second implementation would eventually disagree with the
 * first, and the customer would be the one to find out.
 */

// ─── The Stripe customer ──────────────────────────────────────────────────────

/**
 * The organization's Stripe customer, created on first need.
 *
 * Idempotent through the id stored on the organization, and through an
 * idempotency key on the create — two requests racing to subscribe must not
 * leave a duplicate customer holding half the history.
 */
export async function ensureCustomer(organization: Organization): Promise<string> {
  if (organization.stripeCustomerId) return organization.stripeCustomerId

  const customer = await stripe.customers.create(
    {
      name: organization.name,
      email: organization.email,
      metadata: { organizationId: organization.id },
      // E3-04: invoices carry the TRN when the organization has set one.
      ...(organization.vatNumber
        ? { tax_id_data: [{ type: 'ae_trn' as const, value: organization.vatNumber }] }
        : {}),
      address: { country: organization.country },
    },
    { idempotencyKey: `customer_${organization.id}` }
  )

  await prisma.organization.update({
    where: { id: organization.id },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

// ─── Starting a subscription ──────────────────────────────────────────────────

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_self_serve' | 'already_subscribed' }

/**
 * A Stripe Checkout session for an organization that has no subscription yet.
 *
 * Checkout rather than an in-app card form: it is the only path that collects a
 * payment method, handles 3-D Secure and stays PCI-out-of-scope without the
 * card details ever touching this app. Once there *is* a subscription, plan
 * changes go through `changePlan()` and never through Checkout — E3-01 wants an
 * upgrade to be instant, not a second trip through a payment page.
 */
export async function startCheckout(input: {
  organization: Organization
  plan: Plan
  successUrl: string
  cancelUrl: string
}): Promise<CheckoutResult> {
  if (input.organization.stripeSubscriptionId) return { ok: false, reason: 'already_subscribed' }
  if (!isSelfServe(input.plan)) return { ok: false, reason: 'not_self_serve' }

  const prices = await ensurePlanPrices(input.plan)
  if (!prices) return { ok: false, reason: 'not_self_serve' }

  const customerId = await ensureCustomer(input.organization)
  const extraShops = await countExtraShops(input.organization.id, input.plan)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      { price: prices.basePriceId, quantity: 1 },
      ...(prices.shopPriceId && extraShops > 0
        ? [{ price: prices.shopPriceId, quantity: extraShops }]
        : []),
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Read back by the webhook. The session is the only place the chosen plan
    // is known — Stripe's subscription carries prices, not our plan ids.
    metadata: { organizationId: input.organization.id, planId: input.plan.id },
    subscription_data: {
      metadata: { organizationId: input.organization.id, planId: input.plan.id },
    },
    // E3-04: the customer keeps their card for the top-up charges, which are
    // off-session by definition.
    payment_method_collection: 'always',
  })

  if (!session.url) return { ok: false, reason: 'not_self_serve' }
  return { ok: true, url: session.url }
}

// ─── Changing plan ────────────────────────────────────────────────────────────

export type PlanChangeResult =
  | { ok: true; effect: 'immediate' }
  | { ok: true; effect: 'end_of_period'; effectiveAt: Date }
  | { ok: false; reason: 'no_subscription' | 'not_self_serve' | 'same_plan' }

/**
 * Move an organization between plans. E3-01.
 *
 * The two directions are genuinely different operations, and the difference is
 * the whole feature:
 *
 * - **Upgrade** applies now. `create_prorations` charges the difference for the
 *   remainder of the cycle and the customer has the new limits immediately,
 *   which is what "instant access to new features" means.
 * - **Downgrade** is scheduled for the period end. The customer has paid for
 *   the current cycle and keeps what they paid for. `pendingPlanId` records it
 *   so the screen can say so; the webhook clears it when it applies.
 *
 * Whether the customer's current usage *fits* the new plan is not decided here
 * — see `downgradeConflicts()`. This function is what runs after they have
 * resolved it.
 */
export async function changePlan(input: {
  organization: Organization
  from: Plan | null
  to: Plan
}): Promise<PlanChangeResult> {
  if (!input.organization.stripeSubscriptionId) return { ok: false, reason: 'no_subscription' }
  if (!isSelfServe(input.to)) return { ok: false, reason: 'not_self_serve' }

  const direction = planDirection(input.from, input.to)
  if (direction === 'same') return { ok: false, reason: 'same_plan' }

  const prices = await ensurePlanPrices(input.to)
  if (!prices) return { ok: false, reason: 'not_self_serve' }

  const subscription = await stripe.subscriptions.retrieve(input.organization.stripeSubscriptionId)

  const extraShops = await countExtraShops(input.organization.id, input.to)

  if (direction === 'downgrade') {
    await scheduleDowngrade({ subscription, prices, extraShops, organizationId: input.organization.id, planId: input.to.id })
    await prisma.organization.update({
      where: { id: input.organization.id },
      data: { pendingPlanId: input.to.id },
    })
    return {
      ok: true,
      effect: 'end_of_period',
      effectiveAt: new Date(subscription.current_period_end * 1000),
    }
  }

  await stripe.subscriptions.update(subscription.id, {
    items: buildItemUpdate({ subscription, prices, extraShops }),
    // Invoice the difference now rather than folding it into next month's bill.
    // "Instant access" that arrives with an unexplained charge four weeks later
    // is not what E3-01 promises. `always_invoice` implies prorations — Stripe
    // computes them, as it does for every other money question here.
    proration_behavior: 'always_invoice',
    metadata: { organizationId: input.organization.id, planId: input.to.id },
  })

  return { ok: true, effect: 'immediate' }
}

/**
 * Put the cheaper plan on a schedule that starts when the paid period ends.
 *
 * A subscription schedule is what applies a change at a boundary without this
 * app having to remember to do it on the night. `end_behavior: 'release'` hands
 * the subscription back to ordinary billing once the second phase begins, so
 * there is no permanent second object to reconcile afterwards.
 *
 * A subscription can carry only one schedule, and a customer may downgrade
 * twice before the first lands — so an existing schedule is updated rather than
 * created, and the second choice replaces the first.
 */
async function scheduleDowngrade(input: {
  subscription: Stripe.Subscription
  prices: { basePriceId: string; shopPriceId: string | null }
  extraShops: number
  organizationId: string
  planId: string
}): Promise<void> {
  const existingId =
    typeof input.subscription.schedule === 'string'
      ? input.subscription.schedule
      : (input.subscription.schedule?.id ?? null)

  const scheduleId =
    existingId ??
    (await stripe.subscriptionSchedules.create({ from_subscription: input.subscription.id })).id

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases: [
      // What they are on now, ending at the boundary they have already paid to.
      {
        items: input.subscription.items.data.map((item) => ({
          price: item.price.id,
          quantity: item.quantity ?? 1,
        })),
        start_date: input.subscription.current_period_start,
        end_date: input.subscription.current_period_end,
      },
      // The cheaper plan, starting the moment that period ends. No proration:
      // nothing is owed for a period that has not run.
      {
        items: [
          { price: input.prices.basePriceId, quantity: 1 },
          ...(input.prices.shopPriceId && input.extraShops > 0
            ? [{ price: input.prices.shopPriceId, quantity: input.extraShops }]
            : []),
        ],
        metadata: { organizationId: input.organizationId, planId: input.planId },
        proration_behavior: 'none',
      },
    ],
  })
}

/**
 * Replace the subscription's items with the target plan's, deleting whatever
 * belonged to the old plan.
 *
 * Stripe's `items` array on an update is not a patch — an item left out is left
 * alone, not removed. Removing one takes an explicit `deleted: true`, so the old
 * base price and old shop price have to be named.
 */
function buildItemUpdate(input: {
  subscription: Stripe.Subscription
  prices: { basePriceId: string; shopPriceId: string | null }
  extraShops: number
}): Stripe.SubscriptionUpdateParams.Item[] {
  const keep = new Set([input.prices.basePriceId, input.prices.shopPriceId].filter(Boolean))
  const removals: Stripe.SubscriptionUpdateParams.Item[] = input.subscription.items.data
    .filter((item) => !keep.has(item.price.id))
    .map((item) => ({ id: item.id, deleted: true }))

  const base = input.subscription.items.data.find(
    (item) => item.price.id === input.prices.basePriceId
  )
  const shop = input.prices.shopPriceId
    ? input.subscription.items.data.find((item) => item.price.id === input.prices.shopPriceId)
    : undefined

  const items: Stripe.SubscriptionUpdateParams.Item[] = [
    base ? { id: base.id, quantity: 1 } : { price: input.prices.basePriceId, quantity: 1 },
  ]

  if (input.prices.shopPriceId) {
    if (shop) {
      items.push({ id: shop.id, quantity: input.extraShops })
    } else if (input.extraShops > 0) {
      items.push({ price: input.prices.shopPriceId, quantity: input.extraShops })
    }
  }

  return [...removals, ...items]
}

/**
 * What stands in the way of moving to a smaller plan. E3-01.
 *
 * Returned rather than enforced, because the customer resolves these — archive
 * a shop, remove a teammate — and the screen has to be able to say which. An
 * empty array means the downgrade can proceed.
 */
export type DowngradeConflict =
  | { kind: 'shops'; current: number; allowed: number }
  | { kind: 'users'; current: number; allowed: number }

export async function downgradeConflicts(
  organizationId: string,
  target: Plan
): Promise<DowngradeConflict[]> {
  const [shops, users] = await Promise.all([
    prisma.shop.count({ where: { organizationId, archivedAt: null } }),
    prisma.user.count({ where: { organizationId, removedAt: null } }),
  ])

  const conflicts: DowngradeConflict[] = []
  if (target.maxShops !== null && shops > target.maxShops) {
    conflicts.push({ kind: 'shops', current: shops, allowed: target.maxShops })
  }
  if (target.maxUsers !== null && users > target.maxUsers) {
    conflicts.push({ kind: 'users', current: users, allowed: target.maxUsers })
  }
  return conflicts
}

// ─── Cancelling ───────────────────────────────────────────────────────────────

export type CancelResult =
  | { ok: true; accessUntil: Date }
  | { ok: false; reason: 'no_subscription' }

/**
 * Cancel at the end of the paid period. E3-01.
 *
 * Never an immediate cancellation: the customer has paid through the end of the
 * cycle and keeps their access until then, which is what the confirmation
 * screen tells them. Immediate cancellation would also mean a refund, and E3
 * puts refunds in the Stripe dashboard for now.
 *
 * Reversible until it lands — `resumeSubscription()` is the same call with the
 * flag cleared, which is what makes this safe to offer without a support step.
 */
export async function cancelSubscription(organization: Organization): Promise<CancelResult> {
  if (!organization.stripeSubscriptionId) return { ok: false, reason: 'no_subscription' }

  const updated = await stripe.subscriptions.update(organization.stripeSubscriptionId, {
    cancel_at_period_end: true,
  })
  return { ok: true, accessUntil: new Date(updated.current_period_end * 1000) }
}

export async function resumeSubscription(organization: Organization): Promise<CancelResult> {
  if (!organization.stripeSubscriptionId) return { ok: false, reason: 'no_subscription' }

  const updated = await stripe.subscriptions.update(organization.stripeSubscriptionId, {
    cancel_at_period_end: false,
  })
  return { ok: true, accessUntil: new Date(updated.current_period_end * 1000) }
}

// ─── Credit top-ups ───────────────────────────────────────────────────────────

export type TopupResult =
  | { ok: true; topupId: string; credits: number; invoiceId: string }
  | { ok: false; reason: 'no_customer' | 'no_payment_method' | 'declined'; message?: string }

/**
 * Buy credits with the card on file. E3-03.
 *
 * A one-off invoice, charged immediately, rather than a Checkout redirect:
 * "one-click purchase — charged immediately to card on file" is the
 * requirement, and an invoice also gives the customer a downloadable receipt in
 * the same place as everything else (E3-04).
 *
 * **The credits are not granted here.** The row is written `pending` and the
 * `invoice.paid` webhook grants them, so a payment that succeeds after a retry
 * still lands, and a duplicate webhook cannot grant twice. The one cost is that
 * a successful purchase can take a second or two to show — which is the right
 * trade against granting credits for a payment that later fails.
 */
export async function purchaseCredits(input: {
  organization: Organization
  packs: number
  pack: { credits: number; price: number }
}): Promise<TopupResult> {
  const customerId = input.organization.stripeCustomerId
  if (!customerId) return { ok: false, reason: 'no_customer' }

  const credits = input.pack.credits * input.packs
  const amount = input.pack.price * input.packs

  const topup = await prisma.creditTopup.create({
    data: {
      organizationId: input.organization.id,
      credits,
      amount,
      currency: BILLING_CURRENCY,
      status: 'pending',
    },
  })

  try {
    await stripe.invoiceItems.create({
      customer: customerId,
      currency: BILLING_CURRENCY,
      unit_amount: toMinorUnits(input.pack.price),
      quantity: input.packs,
      description: `${credits} AI credits`,
      metadata: { organizationId: input.organization.id, topupId: topup.id },
    })

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'charge_automatically',
      // Off the subscription cycle: this is a one-off purchase and must not
      // wait for the next monthly invoice to be finalized.
      auto_advance: false,
      metadata: { organizationId: input.organization.id, topupId: topup.id },
    })

    await prisma.creditTopup.update({
      where: { id: topup.id },
      data: { stripeInvoiceId: invoice.id },
    })

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)
    const paid = await stripe.invoices.pay(finalized.id)

    return { ok: true, topupId: topup.id, credits, invoiceId: paid.id }
  } catch (error) {
    await prisma.creditTopup.update({ where: { id: topup.id }, data: { status: 'failed' } })

    if (isCardError(error)) return { ok: false, reason: 'declined', message: error.message }
    if (isMissingPaymentMethod(error)) return { ok: false, reason: 'no_payment_method' }
    throw error
  }
}

// ─── Invoices and the customer portal ─────────────────────────────────────────

export type InvoiceSummary = {
  id: string
  number: string | null
  status: string | null
  /** Major units, in `currency`. */
  total: number
  currency: string
  createdAt: string
  /** Stripe-hosted PDF. Short-lived — never store it. */
  pdfUrl: string | null
  hostedUrl: string | null
}

export async function listInvoices(
  organization: Organization,
  limit = 12
): Promise<InvoiceSummary[]> {
  if (!organization.stripeCustomerId) return []

  const invoices = await stripe.invoices.list({
    customer: organization.stripeCustomerId,
    limit,
  })

  return invoices.data.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    total: invoice.total / 100,
    currency: invoice.currency,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    // Both are optional on a draft invoice, which has not been rendered yet.
    pdfUrl: invoice.invoice_pdf ?? null,
    hostedUrl: invoice.hosted_invoice_url ?? null,
  }))
}

/**
 * A Stripe Customer Portal session. E3-05.
 *
 * The portal owns payment methods, invoice history and nothing else here. Plan
 * changes, shop add-ons and credit top-ups are built in-app, because the portal
 * cannot express a downgrade that has to resolve a shop conflict first, and
 * because a redirect out of the product for a one-click credit purchase is not
 * one click.
 */
export async function createPortalSession(
  organization: Organization,
  returnUrl: string
): Promise<string | null> {
  if (!organization.stripeCustomerId) return null
  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: returnUrl,
  })
  return session.url
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function countExtraShops(organizationId: string, plan: Plan): Promise<number> {
  if (plan.maxShops === null) return 0
  const shops = await prisma.shop.count({ where: { organizationId, archivedAt: null } })
  return Math.max(shops - plan.maxShops, 0)
}

/**
 * The customer has no usable card. Distinct from a decline: the fix is "add a
 * payment method", not "try a different card", and the screen says so.
 */
function isMissingPaymentMethod(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: string }).code
  return (
    code === 'invoice_no_customer_line_items' ||
    code === 'invoice_payment_intent_requires_action' ||
    code === 'missing'
  )
}
