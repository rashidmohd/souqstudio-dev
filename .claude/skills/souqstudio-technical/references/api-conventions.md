# API conventions

All HTTP lives in `apps/web/app/api/v1/`. There is no separate backend server. Route
files are always named `route.ts` and export named HTTP method functions.

---

## Response shape

Every route returns one of two shapes. No exceptions, including errors.

```typescript
{ data: T,    error: null }
{ data: null, error: { code: string, message: string } }
```

`code` is a stable machine-readable string the client can branch on
(`insufficient_credits`, `shop_limit_reached`, `invalid_barcode`). `message` is written
for a shop owner to read — see the Voice section of the design skill. Never return a raw
exception string or a stack trace.

Shared type: `ApiResult<T>` from `@souqstudio/types`.

---

## Authentication and org context

**`middleware.ts` does not authenticate.** It checks that a session cookie is
present and redirects to `/login` when it is not — nothing more. Next 14 pins
middleware to the Edge runtime with no opt-out (`export const runtime = 'nodejs'`
is ignored), so Prisma cannot run there; importing `@souqstudio/db` fails the build.

Every route handler and every protected page verifies for itself, in Node, by
calling `requireSession()` from `lib/session.ts`. A present cookie may be expired,
revoked, or a replayed token from a rotated family. **Treating "middleware did not
redirect me" as proof of a valid session is a vulnerability, not a shortcut.**

Middleware is excluded from `/api/*` entirely for this reason — a weaker second
answer there would only invite reliance on it.

**JSON routes call `requireApiSession()` from `lib/api-session.ts`, not
`requireSession()`.** The latter calls `redirect()`, which is right for a page and
wrong for a fetch — a client wants a 401 it can branch on, not a 307 to HTML.
`requireApiSession` wraps the session read with the two-factor enrollment gate;
routes that must stay reachable for someone who still owes enrollment (the 2FA
endpoints themselves, email verification) opt out with
`{ allowPendingTwoFactor: true }`, visible at the call site. One chokepoint
rather than a helper each route remembers to call: an opt-in gate is a gate that
eventually gets forgotten, and the route that forgets is the one that matters.

The one public exception is `/api/v1/auth/2fa/challenge`, which by definition has
no session — the challenge cookie is its credential.

**Never read `organizationId` from the request body or a query parameter.** Read it from
the session. A client-supplied org ID is a cross-tenant read waiting to happen.

Role checks happen server-side in the route. The client's idea of the user's role is a
display concern only.

---

## Route groups

```
POST   /api/v1/auth/signup
POST   /api/v1/auth/login              # our session layer, not next-auth
POST   /api/v1/auth/logout            # built by E1-03 — the forced-enrollment
                                       # screen needs an exit that is not itself
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
        (next-auth handles Google OAuth only, at /api/v1/auth/[...nextauth];
         it does not own the session — see references/auth.md)

GET    /api/v1/auth/2fa                 # status: enabled, codes remaining, org policy
GET    /api/v1/auth/2fa/challenge       # is a login challenge pending
POST   /api/v1/auth/2fa/challenge       # { method, code } → session. No session yet.
DELETE /api/v1/auth/2fa/challenge       # "use a different account"
POST   /api/v1/auth/2fa/enroll          # password → QR + manual key. Enables nothing.
POST   /api/v1/auth/2fa/enroll/confirm  # live code → on, returns backup codes ONCE
POST   /api/v1/auth/2fa/disable         # password + live second factor
POST   /api/v1/auth/2fa/backup-codes    # regenerate. There is deliberately no GET.
PATCH  /api/v1/auth/2fa/org-policy      # owner requires 2FA org-wide
POST   /api/v1/auth/2fa/reset           # owner clears a teammate's 2FA
        (org-policy belongs under /organizations/:id once E2 builds that resource;
         it lives here so every 2FA re-auth path stays in one module)

GET    /api/v1/brand                    # kit + logo status. Also the wizard's poll.
PATCH  /api/v1/brand                    # partial save, one wizard step at a time
POST   /api/v1/brand/logo/upload-url    # presigned PUT — bytes never touch a route
POST   /api/v1/brand/logo               # verify the upload, extract colours, queue removal

GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id

GET    /api/v1/shops
POST   /api/v1/shops                    # triggers Stripe subscription item add
PATCH  /api/v1/shops/:id
DELETE /api/v1/shops/:id                # triggers prorated Stripe credit

GET    /api/v1/catalog/search?q=&category=&limit=    # E5-01. Ranked top 10, no paging
GET    /api/v1/catalog/categories                    # E5-02. ?parent=<name> for subcategories
GET    /api/v1/catalog/products?category=&subcategory=&cursor=   # E5-02. Cursor-paged
GET    /api/v1/catalog/barcode/:ean                  # E5-03. Equality, not search
POST   /api/v1/catalog/upload-url                    # E5-04. Presigned PUT for a photo
POST   /api/v1/catalog/contributions    # shop submits a missing product

POST   /api/v1/catalog/imports/upload-url            # E5-06. Presigned PUT for a CSV
POST   /api/v1/catalog/imports                       # parse, infer the column map
PATCH  /api/v1/catalog/imports/:id                   # confirm the map, resolve every row
GET    /api/v1/catalog/imports/:id?cursor=           # the review screen's read
POST   /api/v1/catalog/imports/:id/commit            # apply the owner's decisions
        (This file used to list a `lang` parameter on search. There is none:
         every row carries both languages and the client picks, because one
         fetch feeds an English panel and an Arabic one, and the E5-06 import
         review screen needs the pair regardless. Ranking does not vary by
         language either — the vector spans nameEn and nameAr at equal weight,
         which is what makes an English and an Arabic query find the same row.
         `products` is a separate route from `search` rather than the same one
         with an optional `q`: search is a ranked top ten and browsing is an
         ordered page, so one route would return a union the client branches on.
         `barcode/:ean` is separate for a harder reason — `barcode` is not in
         `search_vector`, so a code passed to `search` matches nothing at all.
         It returns three answers, not two: `invalid_barcode` for a failed
         check digit, a 200 with `product: null` for a valid code we do not
         hold — that is the E5-04 prompt, not an error — and the product.
         `contributions` creates the catalog row, its ORIGINAL image asset and
         the review-queue entry in one transaction, then queues the cutout;
         a dead queue does not fail the request.
         The import is four routes rather than one because it is four separate
         decisions by the owner, each of which can be abandoned: the file, the
         column map, the per-row review, the commit. `PATCH :id` re-reads the
         file from `sourceKey` rather than trusting a client-held parse — the
         file is kept precisely so the rows reviewed are the rows in it. The
         commit takes an explicit decision per row and defaults nothing: a row
         it is not told about keeps its status and is not committed.)

GET    /api/v1/offer-books
POST   /api/v1/offer-books
GET    /api/v1/offer-books/:id
PATCH  /api/v1/offer-books/:id          # auto-save, partial update
POST   /api/v1/offer-books/:id/publish
DELETE /api/v1/offer-books/:id

POST   /api/v1/export/pdf               # queues job, returns jobId
GET    /api/v1/export/jobs/:jobId       # poll status

POST   /api/v1/ai/character
POST   /api/v1/ai/pose
POST   /api/v1/ai/cover
POST   /api/v1/ai/background-remove
GET    /api/v1/ai/jobs/:jobId           # poll status

GET    /api/v1/analytics/summary
GET    /api/v1/analytics/offer-books/:id

GET    /api/v1/billing                  # plan, usage, next invoice — the screen's whole read
POST   /api/v1/billing/checkout         # first subscription only → Stripe Checkout URL
GET    /api/v1/billing/plan?planId=     # direction, downgrade conflicts, needsCheckout
POST   /api/v1/billing/plan             # change plan. Direction is derived, never sent
DELETE /api/v1/billing/subscription?confirm=true
POST   /api/v1/billing/subscription     # undo a scheduled cancellation
POST   /api/v1/billing/credits/topup
GET    /api/v1/billing/credits/allocation
PATCH  /api/v1/billing/credits/allocation
GET    /api/v1/billing/invoices
POST   /api/v1/billing/portal           # Stripe Customer Portal session
        (E3 replaced the single POST /billing/upgrade this file used to list.
         One route handles both directions because the difference — charge now
         versus schedule for the period end — falls out of the target plan's
         tier, and a request that could name its own direction could name its
         own price. Every route above is owner-only, including the reads.)

POST   /api/v1/webhooks/stripe          # public, signature-verified

# Public — no auth
GET    /api/v1/public/o/:shortCode      # viewer data
POST   /api/v1/t/v                      # track page view
POST   /api/v1/t/c                      # track product click
```

---

## Long-running operations

No route blocks on work that can exceed a second. PDF generation and every AI operation
follow the same shape:

1. Route validates input and checks the credit balance
2. Route writes a job row (`ai_jobs` or `export_jobs`) with status `queued`
3. Route enqueues to BullMQ and returns `{ jobId }` immediately
4. Client polls `GET .../jobs/:jobId`
5. Worker updates the row; credits are deducted on completion, refunded on failure

Details in `background-jobs.md`.

---

## Pagination

Cursor-based on every list endpoint. Never page numbers — offsets drift when rows are
inserted mid-scroll, and they get slow on large tables.

```
GET /api/v1/offer-books?cursor=<id>&limit=20

{ data: { items: [...], nextCursor: "clx..." | null }, error: null }
```

---

## Stripe webhook

`POST /api/v1/webhooks/stripe` is public and must verify the signature before doing
anything else. It is the only route exempt from the session middleware.

Events handled:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**Subscription state lives in Stripe, not in the database.** The `organizations` table
stores only `stripeCustomerId`, `stripeSubscriptionId`, `planId` and `billingStatus`.
Never reimplement proration, trial logic or invoice arithmetic — Stripe already did it,
and a second implementation will disagree with the first.

Webhook handlers must be idempotent. Stripe retries, and duplicate delivery is normal.

---

## Public tracking endpoints

`POST /api/v1/t/v` and `/api/v1/t/c` are fired from the offer book viewer by people who
have never heard of SouqStudio. They are unauthenticated and must be:

- Fast — the viewer must not wait on them
- Fire-and-forget from the client's perspective
- Tolerant of missing or malformed data rather than erroring
- Filtered for bot user agents before a row is written

No cookies. Session identity is an anonymous fingerprint that does not persist beyond
the session. See E11.

**Not yet specified: rate limiting.** These endpoints are trivially floodable and
nothing currently prevents it.

---

## Validation

Zod schemas at the route boundary. Parse, do not cast. The parsed result is the only
thing that reaches business logic.

```typescript
const body = createShopSchema.parse(await req.json())
```

A `ZodError` maps to `{ error: { code: 'validation_failed', message: ... } }` with a 400.
