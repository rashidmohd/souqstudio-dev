# E3 — Billing & Subscription

## Overview

Fully self-served billing. The customer manages their own plan, shops, credits, and payment method without any involvement from the SouqStudio team. Stripe handles all payment logic.

**Priority:** MVP

---

## Billing Entity

Billing is at the **Organization** level. One invoice per organization per month regardless of how many shops or users they have.

---

## Features

### E3-01 Plan Management

**View Current Plan**
- Plan name, price, included shops, included users, AI credits/month
- Current usage vs limits (shops used, credits used this month)
- Next billing date and amount

**Upgrade Plan**
- Instant access to new features on upgrade
- Prorated charge for remainder of current billing cycle
- No confirmation email needed — reflected immediately in UI

**Downgrade Plan**
- Takes effect at end of current billing cycle
- Warning shown if current usage exceeds new plan limits (e.g. 5 shops on Pro, downgrading to Starter which includes 1)
- User must resolve conflicts before downgrade confirms

**Cancel Subscription**
- Self-served — no "call to cancel"
- Confirmation step with clear consequence summary
- Access continues until end of paid period
- Data retained for 90 days after cancellation then purged (with warning)
- Option to pause instead of cancel (V2)

### E3-02 Shop Add-on Billing (Metered)

- Base plan includes a set number of shops
- Each shop above the base is billed as a Stripe subscription item
- Adding a shop: Stripe prorates the charge for the remainder of the billing cycle
- Removing a shop: Stripe prorates a credit for the remainder of the cycle
- All of this is automatic — no manual calculation

### E3-03 AI Credit System

**Monthly Allocation**
- Credits reset on billing cycle date each month
- Credits do not roll over on Starter plan
- Credits roll over (up to 2x monthly allocation) on Pro and above

**Credit Costs**

| Action | Credits |
|---|---|
| Generate base character (4 variations) | 10 |
| Generate new pose | 3 |
| Custom prompt generation | 5 |
| Regenerate / variation | 2 |
| AI cover generation | 5 |
| Background removal | 1 |

**Credit Top-up (Self-Served)**
- Buy additional credits any time: 100 credits = $8
- One-click purchase — charged immediately to card on file
- Top-up credits do not expire
- Top-up credits are used after monthly allocation is exhausted

**Credit Pooling Options**
- Pooled (default): all shops share the org credit balance
- Allocated (Business plan+): org owner assigns credits per shop manually

### E3-04 Invoices & Payment Methods

**Invoices**
- Auto-generated monthly by Stripe
- Downloadable as PDF from billing portal
- Includes VAT/TRN if set on organization
- Sent to billing contact email automatically

**Payment Methods**
- Add / remove credit cards
- Set default payment method
- Card update triggers retry of any failed payments

**Failed Payments**
- Stripe retries automatically (1, 3, 5 days)
- Email notification on each failed attempt
- Grace period: 7 days before account is restricted
- During grace period: can still view but cannot create new offer books
- After grace period: account suspended, data retained

### E3-05 Stripe Customer Portal

Native Stripe Customer Portal embedded in billing settings. Handles:
- Payment method management
- Invoice history and download
- Subscription cancellation

Custom-built UI handles:
- Plan upgrade / downgrade (better UX than Stripe portal)
- Shop add-on management
- AI credit top-ups
- Credit allocation per shop

---

## Stripe Architecture

```
Stripe Customer    = Organization
Stripe Subscription = Plan (one per org)
Subscription Items  = Base plan + each extra shop
Stripe Meter        = AI credit usage tracking
Stripe Invoice      = Auto-generated monthly
```

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Billing page shows clear usage meters (credits used / total, shops used / included)
- Plan comparison table visible on upgrade flow
- Credit top-up is a single click with amount confirmation modal

---

## Backend Notes

- All billing logic lives in Stripe — never replicate subscription state in your own DB
- Store only: `stripe_customer_id`, `stripe_subscription_id`, `plan_id`, `billing_status` in organizations table
- Listen to Stripe webhooks for all state changes: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- AI credit usage written to `usage_events` table on every AI action — Stripe Meter updated via API

---

## Database Tables

```
organizations (stripe_customer_id, stripe_subscription_id, plan_id, billing_status)
plans
usage_events
```

---

## Out of Scope

- Annual billing discount (V2)
- Pause subscription (V2)
- Refunds (handled manually via Stripe dashboard for now)
- Crypto / regional payment methods (V3 — mada for KSA, KNET for Kuwait)
