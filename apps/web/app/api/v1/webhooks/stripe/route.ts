import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma, enqueueEmail, grantTopupCredits, startBillingPeriod } from '@souqstudio/db'
import { env } from '@/lib/env'
import { stripe, type Stripe } from '@/lib/stripe'
import { GRACE_PERIOD_DAYS } from '@/lib/billing'

/**
 * The Stripe webhook. E3-01 through E3-04.
 *
 * **This is the only writer of subscription state.** Every route in
 * `app/api/v1/billing/` makes its change at Stripe and returns; the change
 * arrives back here and is what updates `billingStatus`, `planId` and the
 * period cache. One writer is the whole reason the two sides cannot disagree
 * about what a customer is on.
 *
 * Three properties this handler has to have, in order:
 *
 * 1. **Signature first.** The endpoint is public. Nothing is read out of the
 *    body — not even to log it — before `constructEvent` has verified it.
 * 2. **Idempotent.** Stripe retries, and duplicate delivery is normal rather
 *    than exceptional. Every event is claimed by id in `stripe_events` before
 *    the work runs, and the work itself is written so that a replay changes
 *    nothing.
 * 3. **Fast, and honest about failure.** A 2xx tells Stripe to stop retrying,
 *    so a handler that threw must return 500 and let it come back.
 *
 * It does not return the API envelope. Stripe is not a client of ours and reads
 * the status code only; wrapping the response in `{ data, error }` would be
 * decoration for an audience of nobody.
 */

/** Stripe signs the exact bytes. Any parsing before verification breaks it. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HANDLED = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new NextResponse('missing signature', { status: 400 })

  const payload = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch {
    // A bad signature is either a misconfigured secret or someone probing the
    // endpoint. 400 either way, with nothing from the body echoed back.
    return new NextResponse('invalid signature', { status: 400 })
  }

  if (!(HANDLED as readonly string[]).includes(event.type)) {
    // Acknowledged, not processed. Stripe sends whatever the endpoint is
    // subscribed to, and retrying something we will never handle helps nobody.
    return new NextResponse(null, { status: 204 })
  }

  // Claim the event before doing the work. `create` on a primary key that
  // already exists throws, and that throw is the duplicate check — a second
  // delivery that arrives while the first is still running loses the race here
  // rather than halfway through granting credits.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } })
  } catch {
    const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } })
    // Already processed: acknowledge and stop. Still in flight or previously
    // failed: let Stripe retry rather than running two copies at once.
    if (seen?.processedAt) return new NextResponse(null, { status: 200 })
    return new NextResponse('in progress', { status: 409 })
  }

  try {
    await handle(event)
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null },
    })
    return new NextResponse(null, { status: 200 })
  } catch (error) {
    // `processedAt` stays null so the retry actually reprocesses, and the
    // reason is kept on the row for whoever looks at why it did not.
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { error: error instanceof Error ? error.message : String(error) },
    })
    console.error(`[stripe] ${event.type} ${event.id} failed`, error)
    return new NextResponse('handler failed', { status: 500 })
  }
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      return onCheckoutCompleted(event.data.object)
    case 'invoice.paid':
      return onInvoicePaid(event.data.object)
    case 'invoice.payment_failed':
      return onPaymentFailed(event.data.object)
    case 'customer.subscription.updated':
      return onSubscriptionUpdated(event.data.object)
    case 'customer.subscription.deleted':
      return onSubscriptionDeleted(event.data.object)
    default:
      return undefined
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * The subscription exists. Attach it to the organization and open the first
 * credit period.
 *
 * The organization id comes from the session metadata we set when creating it,
 * never from anything the browser could have supplied on the way back.
 */
async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const organizationId = session.metadata?.organizationId
  const planId = session.metadata?.planId
  if (!organizationId || !planId || !session.subscription) return

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId =
    typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null)

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeSubscriptionId: subscriptionId,
      // Spread rather than a possibly-undefined property:
      // exactOptionalPropertyTypes rejects `{ field: undefined }`, and leaving
      // the customer id alone is the right behaviour when the session did not
      // carry one — it was set when the customer was created.
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      planId,
      billingStatus: 'active',
      pastDueSince: null,
      dataPurgeAt: null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  })

  await openPeriod(organizationId, planId, subscription)
}

/**
 * A payment succeeded. Two different invoices arrive here.
 *
 * A **subscription** invoice starts a new credit period and clears any past-due
 * state. A **top-up** invoice grants purchased credits and does neither — a
 * credit purchase is not a billing cycle, and treating it as one would reset
 * the monthly allocation early and destroy rolled-over credits.
 *
 * Both are idempotent: the period is keyed on its start date, the top-up on its
 * own `pending` row.
 */
async function onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const topupId = invoice.metadata?.topupId
  const organizationId = invoice.metadata?.organizationId

  if (topupId && organizationId) {
    await grantTopupCredits({ organizationId, topupId })
    return
  }

  const organization = await organizationForInvoice(invoice)
  if (!organization) return

  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      billingStatus: 'active',
      pastDueSince: null,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })

  await openPeriod(organization.id, organization.planId, subscription)

  await enqueueEmail({
    template: 'payment-succeeded',
    to: organization.email,
    props: {
      organizationName: organization.name,
      amount: formatAmount(invoice.total, invoice.currency),
      invoiceUrl: invoice.hosted_invoice_url ?? '',
      period: formatPeriod(subscription),
    },
  })
}

/**
 * A payment failed. E3-04.
 *
 * The status goes to `past_due` and the seven-day clock starts — but only on
 * the *first* failure. Stripe retries on days 1, 3 and 5, and each retry lands
 * here; resetting `pastDueSince` on every one would extend the grace period
 * indefinitely and the account would never be restricted.
 *
 * The email goes out on every attempt, which is what E3-04 asks for: the
 * customer needs to know it is still failing.
 */
async function onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const organization = await organizationForInvoice(invoice)
  if (!organization) return

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      billingStatus: 'past_due',
      pastDueSince: organization.pastDueSince ?? new Date(),
    },
  })

  await enqueueEmail({
    template: 'payment-failed',
    to: organization.email,
    props: {
      organizationName: organization.name,
      amount: formatAmount(invoice.total, invoice.currency),
      updateUrl: `${env.NEXTAUTH_URL}/settings/billing`,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    },
  })
}

/**
 * The subscription changed — a plan swap landing, a cancellation being
 * scheduled, a shop quantity moving, or Stripe's own status transitions.
 *
 * The plan is read back from the price on the subscription rather than from
 * what this app last asked for. A scheduled downgrade applies at Stripe's clock,
 * not ours, and this is the only event that observes it happening.
 */
async function onSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const organization = await organizationForCustomer(subscription.customer)
  if (!organization) return

  const planId = await planIdForSubscription(subscription)

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      stripeSubscriptionId: subscription.id,
      ...(planId ? { planId } : {}),
      // The scheduled downgrade has landed once the subscription is actually on
      // that plan. Clearing it on any other update would lose a pending change.
      ...(planId && planId === organization.pendingPlanId ? { pendingPlanId: null } : {}),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      billingStatus: statusFor(subscription.status, organization.billingStatus),
      ...(subscription.status === 'past_due'
        ? { pastDueSince: organization.pastDueSince ?? new Date() }
        : { pastDueSince: null }),
    },
  })

  // A plan change moves the monthly allocation. The current period keeps the
  // credits it was opened with — an upgrade mid-cycle does not retroactively
  // grant the difference, and a downgrade does not take credits away that the
  // customer may already have spent against. The new allocation applies from
  // the next invoice, which is where `startBillingPeriod` reads it.
}

/**
 * The subscription is over. E3-01.
 *
 * Access has already run to the end of the paid period by the time Stripe sends
 * this — `cancel_at_period_end` is what held it open. So this is the moment the
 * account becomes cancelled and the ninety-day retention clock starts.
 *
 * **Nothing is deleted here.** The purge is a separate, later job that has to
 * be able to look at what it is about to destroy; E3 promises the data is kept
 * for ninety days and warned about first.
 */
async function onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const organization = await organizationForCustomer(subscription.customer)
  if (!organization) return

  const purgeAt = new Date()
  purgeAt.setUTCDate(purgeAt.getUTCDate() + 90)

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      billingStatus: 'cancelled',
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      dataPurgeAt: purgeAt,
    },
  })
}

// ─── Shared ───────────────────────────────────────────────────────────────────

type OrganizationRow = {
  id: string
  name: string
  email: string
  planId: string | null
  pendingPlanId: string | null
  pastDueSince: Date | null
  billingStatus: string
}

const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  email: true,
  planId: true,
  pendingPlanId: true,
  pastDueSince: true,
  billingStatus: true,
} as const

async function organizationForCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): Promise<OrganizationRow | null> {
  const id = typeof customer === 'string' ? customer : customer.id
  return prisma.organization.findUnique({
    where: { stripeCustomerId: id },
    select: ORGANIZATION_SELECT,
  })
}

async function organizationForInvoice(invoice: Stripe.Invoice): Promise<OrganizationRow | null> {
  if (invoice.metadata?.organizationId) {
    return prisma.organization.findUnique({
      where: { id: invoice.metadata.organizationId },
      select: ORGANIZATION_SELECT,
    })
  }
  if (!invoice.customer) return null
  return organizationForCustomer(invoice.customer)
}

/**
 * Which plan the subscription is actually on, by looking up its prices.
 *
 * The base price is the one that identifies the plan — the per-shop price
 * belongs to the same plan and would resolve to it too, but only the base is
 * guaranteed to be present.
 */
async function planIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const priceIds = subscription.items.data.map((item) => item.price.id)
  const plan = await prisma.plan.findFirst({
    where: { stripePriceId: { in: priceIds } },
    select: { id: true },
  })
  if (plan) return plan.id
  // Falls back to the metadata this app set when it made the change. Stripe
  // copies subscription metadata across a schedule phase, so a downgrade that
  // landed without a matching price row still resolves.
  return subscription.metadata?.planId ?? null
}

/**
 * Open the credit period for the Stripe cycle. Idempotent by period start.
 *
 * An organization with no plan gets no allocation rather than an error: the
 * subscription may be mid-creation and the plan attaches a moment later, at
 * which point the next invoice opens the period properly.
 */
async function openPeriod(
  organizationId: string,
  planId: string | null,
  subscription: Stripe.Subscription
): Promise<void> {
  if (!planId) return
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { aiCreditsMonth: true, creditsRollover: true },
  })
  if (!plan) return

  await startBillingPeriod({
    organizationId,
    periodStart: new Date(subscription.current_period_start * 1000),
    periodEnd: new Date(subscription.current_period_end * 1000),
    allocation: plan.aiCreditsMonth,
    rollover: plan.creditsRollover,
  })
}

/**
 * Stripe's subscription status, mapped onto ours.
 *
 * `suspended` is *our* state, not Stripe's — it is what the grace period
 * expiring produces, and no Stripe status means it. So an account already
 * suspended stays suspended until a payment actually succeeds, rather than
 * being quietly walked back to `past_due` by an unrelated update event.
 */
function statusFor(stripeStatus: Stripe.Subscription.Status, current: string): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return current === 'suspended' ? 'suspended' : 'past_due'
    case 'canceled':
      return 'cancelled'
    default:
      return current
  }
}

/** `AED 1,842.00` — code first, per the design system's currency rule. */
function formatAmount(minorUnits: number, currency: string): string {
  return `${currency.toUpperCase()} ${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPeriod(subscription: Stripe.Subscription): string {
  const from = new Date(subscription.current_period_start * 1000)
  const to = new Date(subscription.current_period_end * 1000)
  const format = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${format(from)} – ${format(to)}`
}
