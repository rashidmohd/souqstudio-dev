# E3 — what is still pending

Working note against `docs/E3-billing-subscription.md`. Last updated 11 August 2026.

**Status: E3-01 through E3-05 are built and reachable.** `pnpm lint`, `pnpm typecheck`,
`pnpm build` and 182 tests pass. What follows is what is *not* done, why, and where to
pick it up.

---

## 1. Blocking before a customer can be charged

### Nobody has run this against a real Stripe account

Every path here is written against the Stripe API and typechecks against `stripe@16`, and
**none of it has been exercised end to end.** There is no Stripe test key in this
environment, so no Checkout session has been created, no webhook has been delivered, and
no invoice has been paid. That is the single largest risk in this epic.

What a first pass needs, in order:

1. `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe` and the resulting
   `whsec_` in `.env.local`.
2. Subscribe → confirm `checkout.session.completed` attaches `stripeSubscriptionId`,
   `planId` and opens a credit period.
3. Upgrade → confirm the proration invoice is raised *immediately*
   (`proration_behavior: 'always_invoice'`), not deferred.
4. Downgrade → confirm the subscription schedule's second phase starts at
   `current_period_end`, and that `pendingPlanId` clears when it lands.
5. Add a shop past the included count → confirm one subscription item with a quantity,
   prorated.
6. Buy credits → confirm the balance moves only after `invoice.paid`.
7. Fail a payment with card `4000 0000 0000 0341` → confirm `past_due`, the email, and
   that a retry does **not** reset `pastDueSince`.

### The purge job does not exist

`organizations.dataPurgeAt` is written on `customer.subscription.deleted` and read by
nothing. E3-01 promises the data is kept for 90 days "then purged (with warning)", and
today it is kept forever with no warning. Needs a scheduled job and a decision about what
purge means — rows deleted, or R2 objects too.

### No route tests

Twelve new routes, no tests, consistent with every route in the repo (see E2-pending §1).
The billing ones are worth doing first: they move money. The highest-value cases are the
owner-only gates, `DELETE /billing/subscription` without `?confirm=true`, and the webhook
rejecting a bad signature.

### The webhook's idempotency claim is untested

`stripe_events` is claimed before the work runs and the handlers are written to be
replay-safe, but nothing has replayed one. `stripe events resend <id>` twice against a
top-up is the test that matters — a second grant would be free credits.

---

## 2. Where this build departs from the spec

Both of these are corrections, not omissions. Recorded here rather than edited into
`docs/E3-billing-subscription.md`, which stays the record of what was asked for.

### Extra shops are one subscription item with a quantity, not one item each

E3's Stripe Architecture block says `Subscription Items = Base plan + each extra shop`,
and `shops.stripeSubscriptionItemId` was added in E2 to hold the per-shop id. **Stripe
permits only one subscription item per price per subscription**, so five shops on one
per-shop price cannot be five items. The alternative — a distinct Price object per shop —
buys nothing and multiplies what has to be reconciled.

So `syncShopQuantity()` sets a quantity, and `shops.stripeSubscriptionItemId` is never
written. It is `@unique` and could not hold a shared item id anyway. Either drop the
column or repurpose it; leaving it as a permanently null field with a comment claiming E3
owns it is the worst of the three.

### `plans.id` is the tier name

`starter`, `pro`, `business`, `enterprise` — not `plan_starter`. `templates.planTier`
already carries those exact strings, so the template gate E4/E7 will need is
`template.planTier === organization.planId` with no mapping between two spellings of the
same four words.

---

## 3. Specified but not built

### Credit pooling has an API and no screen

`GET` and `PATCH /api/v1/billing/credits/allocation` are built and enforced —
`consumeCredits()` checks the per-shop ceiling when `creditPooling` is `allocated`. There
is no UI for it. A Business customer can set allocations through the API and cannot see
them in the product. The screen is a table of shops with a number field each, and belongs
on `/settings/billing` behind the `allocatedCredits` feature flag.

### Low-credit warning email

`LowCreditsWarningEmail` exists in `packages/email` and nothing sends it.
`credit_balances.lowBalanceNotifiedAt` and `LOW_BALANCE_FRACTION` are in place for it, so
the remaining work is one check at the point credits are consumed — which is the AI
worker, which is still a stub.

### Plan-change and cancellation emails

`EmailTemplate` in `packages/types` lists `plan-upgraded`, `plan-downgraded` and
`subscription-cancelled`. None has a template in `packages/email`, and nothing enqueues
them. `payment-succeeded` and `payment-failed` do exist and are sent by the webhook.

### Pause instead of cancel

V2 in the spec. Not started, and deliberately: `pause_collection` interacts with the
credit period in a way that needs deciding before it is built — a paused month either
grants credits or does not, and the spec does not say.

---

## 4. Decisions taken that someone should confirm

### `maxUsers` per plan is invented

Starter 2, Pro 5, Business 20, Enterprise unlimited. **No document in the repo states a
seat limit.** E3-01 only says the plan screen shows "included users". These numbers are
now enforced — `assertUserLimit()` refuses an invite past them — so they are
customer-visible. Confirm before launch pricing goes out; lowering them later is a
downgrade for existing customers.

### Everything is billed in USD

`docs/project.md` prices every plan in dollars; the design system formats money as
`AED 1,842.00` and the market is the UAE. Dollars are what the spec says, so
`BILLING_CURRENCY` is `usd`. **A Stripe price's currency is immutable**, so switching to
AED later means new Price objects and migrating every subscription — cheap now, expensive
after the first hundred customers.

### Stripe prices are provisioned on first use, not seeded

`ensurePlanPrices()` creates the Product and Price in Stripe if they are missing and
caches the ids on the plan row. A price that already exists is never replaced, even if
its amount disagrees with `plans.basePrice` — Stripe wins and the mismatch is logged. The
alternative was a manual dashboard step plus four more environment variables per
environment.

The consequence to know about: **changing a price in the seed does not change what
anybody pays.** A real price change needs new Stripe Prices and a subscription migration.

### `variation` costs 2 credits and nothing charges it

E3's credit table has a "Regenerate / variation" row. It is not one of the five job types
in `AiJobType`, because a regeneration is one of those five re-run more cheaply. The price
is recorded in `CREDIT_COSTS`; whichever epic builds regeneration decides how it lands in
`usage_events.eventType`.

---

## 5. Smaller things

- **Rollover reads as a cap on the balance, not on the amount carried.** "Up to 2x monthly
  allocation" is ambiguous; a Pro account on 200/month can start a period with at most 400
  monthly credits. The other reading lets an idle account accumulate faster than an active
  one can spend. `rolloverAmount()` carries the comment and the test.

- **The rail shows Billing to managers, who are redirected.** Every settings screen turns
  away the roles that cannot use it, but the rail does not know that, so a manager sees an
  item that bounces them home. Filtering `ORG_SCOPE` by role is a small change to
  `dashboard-rail.tsx` and applies to more than billing.

- **A top-up invoice sweeps up pending invoice items.** `stripe.invoices.create` collects
  the customer's pending invoice items that are not tied to a subscription, and there is
  no way to scope it to the one item just written. Subscription prorations are tied to the
  subscription and are excluded, so in practice the top-up invoice contains only its own
  line — but this is worth watching on the first real purchase, because the failure mode
  is a customer being charged for something else at the same time.

- **Migration drift left by E2.** `prisma migrate diff` still reports
  `ALTER TABLE "user_shop_access" ALTER COLUMN "updatedAt" DROP DEFAULT` — E2 added the
  column with a default so its backfill had a value, and the model declares `@updatedAt`
  with none. Harmless, and it will appear in every future diff until someone clears it.
  Deliberately not folded into the E3 migration.

- **The consistency checklist has not been run** against `/settings/billing`. The three
  that will bite: Arabic at real string lengths (the plan comparison is three columns of
  English that Arabic will run longer in), the error state on the invoice table, and one
  primary action per region — the plan card has a primary while the credits panel has a
  secondary, which is correct, but the plan comparison dialog has three primaries in a row.

- **`UsageMeter` was added to the design system** (`components/ui/usage-meter.tsx`),
  registered in `SKILL.md` → Components → Usage meters and in the component inventory. It
  is the one component that sets `style`, for the fill width; the deviation is stated in
  the inventory entry.

- **RLS.** `credit_balances`, `credit_topups` and `shop_credit_allocations` are tenant
  tables and carry no policy, like every other tenant table (E2-pending §1). `stripe_events`
  is correctly exempt — the webhook has no org context until it has parsed the event.
  `consumeCredits()` and `grantTopupCredits()` already go through `withOrg`; the reads in
  `getCreditSnapshot()` do not, and should when the policies land.
