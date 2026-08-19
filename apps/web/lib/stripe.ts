import 'server-only'

import Stripe from 'stripe'
import { env } from '@/lib/env'

let instance: Stripe | null = null

/**
 * **The API version is pinned.** Stripe changes response shapes between
 * versions, and an account whose dashboard default drifts ahead of the SDK
 * would start returning fields this code does not expect — at the worst
 * possible moment, on a live invoice. `2024-06-20` is what `stripe@16` types
 * itself against; upgrade the pin and the package together, never separately.
 */
function client(): Stripe {
  if (!instance) {
    instance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
      appInfo: { name: 'SouqStudio', url: 'https://souqstudio.com' },
      // Stripe's own retry, which is idempotency-key aware. Two attempts,
      // because a route holds a shop owner waiting; anything that needs more
      // persistence than this belongs in a reconciliation job, not a request.
      maxNetworkRetries: 2,
    })
  }
  return instance
}

/**
 * The Stripe client. Server-side only — `server-only` makes importing this from
 * a client component a build error rather than a leaked secret key.
 *
 * **Built on first use, not on import.** `next build` executes every module in
 * every route's import graph to collect page data, and the Stripe constructor
 * throws on an absent key — so constructing here would make a secret that only
 * the running app needs into a requirement for compiling it. The deferral is
 * also plain sense: a request for the offer book editor has no business
 * opening a billing client.
 *
 * The proxy exists so this stays an implementation detail. Every call site
 * keeps reading `stripe.subscriptions.retrieve(...)`, and the cast is the only
 * way to type a target that is deliberately empty until first access.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const resolved = client()
    const value = Reflect.get(resolved, property)
    // Methods reached directly off the client would otherwise run with the
    // proxy as `this`, which Stripe's internals do not survive.
    return typeof value === 'function' ? value.bind(resolved) : value
  },
})

/** Cents, the unit every Stripe amount is in. Prices are stored in dollars. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}

/** The inverse, for displaying an amount that came back from Stripe. */
export function fromMinorUnits(amount: number): number {
  return amount / 100
}

/**
 * The currency every price is created in.
 *
 * **This is an open question, not a settled decision.** docs/project.md prices
 * every plan in dollars and the design system formats money as `AED 1,842.00`.
 * Dollars are what the product spec says, so dollars are what is charged; the
 * display format in a billing screen is a separate question from the currency
 * on the Stripe price. Raised in docs/E3-pending.md — changing it later means
 * new Stripe prices, because a Stripe price's currency is immutable.
 */
export const BILLING_CURRENCY = 'usd'

/**
 * Is this a Stripe error the caller can do something about?
 *
 * A card decline is the customer's problem and has a message worth showing. An
 * API error is ours and must not reach them as a raw string — see the response
 * shape rules in souqstudio-technical → references/api-conventions.md.
 */
export function isCardError(error: unknown): error is Stripe.errors.StripeCardError {
  return error instanceof Stripe.errors.StripeCardError
}

export type { Stripe }
