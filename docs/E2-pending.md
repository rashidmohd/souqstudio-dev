# E2 — what is still pending

Working note against `docs/E2-organization-management.md`. Last updated 11 August 2026.

**Status: E2-01 through E2-05 are built and reachable.** `pnpm lint`, `pnpm typecheck`,
`pnpm build` and 144 tests pass. What follows is what is *not* done, why, and where to
pick it up.

---

## 1. Blocking before deploy

### Row-level security

The largest outstanding item, and the reason the root `CLAUDE.md` known-gaps entry cannot
be struck yet.

**Done:** the baseline migration exists and is recorded, `withOrg()` ships in
`packages/db/src/client.ts`, and the pattern documented in
`souqstudio-technical → references/database.md` has been corrected (it was wrong in three
ways — see §5).

**Not done:** no policy has been written. Tenancy today is enforced by `apps/web/lib/authz.ts`
alone, which is application filtering, not a control.

Remaining work:

1. Add `Session.organizationId`, denormalized, and write it in `lib/session.ts` on issue
   and rotate. This is what lets `getSession()` learn the org from the RLS-exempt
   `sessions` table and set the context *before* reading `users` — without it, `users` and
   `organizations` have to stay exempt and E2's own tables are the ones left unprotected.
2. Migration: `ENABLE` + `FORCE ROW LEVEL SECURITY` and an `org_isolation` policy with
   both `USING` and `WITH CHECK` on every tenant table in the model map, plus
   `user_shop_access` and `invites`.
3. Convert every tenant read to `withOrg`, including `apps/worker/src/jobs/bg.job.ts`,
   which reads and writes `shops` with no org context today.

**The hazard:** `current_setting(…, true)` returns NULL when unset, so a missed call site
returns *zero rows* rather than an error. It fails closed, which is correct, and which
also means a mistake looks like an empty screen in production rather than a stack trace.
This needs a manual pass across a fresh account and an existing one, plus the bg job end
to end — not just a green typecheck.

### API route tests

E2 added 16 routes. None has a test; no route in the repo ever has.
`souqstudio-technical → SKILL.md` says every API route gets one. The library layer is
covered (`authz`, `brand-inheritance`, `invites` — 50 tests), so the gap is the routes
themselves, and the highest-value ones are the authorization boundaries: a foreign shop
id returning 404, the last-owner guards, and `POST /invites` refusing to hand out a role
above the inviter's.

### The consistency checklist

`souqstudio-design → references/consistency-checklist.md` has not been run against the
four new screens. Four of the twelve checks will actually bite:

- **Arabic at real string lengths.** The shop and team rows stack a name, a status word
  and a metadata line; none has been seen in `dir="rtl"`.
- **Every state present.** The team list and the shop detail page have no empty or error
  state — only loaded and loading.
- **One primary per region.** The shop detail page has three sections, each of which can
  show a save button at once.
- **Every figure through `[data-figure]`.** Believed done, unverified by eye.

---

## 2. Specified but not built

### E2-01 — organization logo upload

No dedicated route or control. An organization logo *is* settable today, but only as a
side effect: `POST /api/v1/brand/logo` writes to whichever level owns the logo, and for
an inheriting shop that is the organization. So it is reachable by accident rather than
by design, and there is no control on `/settings/organization`.

Needs `POST /organizations/:id/logo/upload-url` and `POST /organizations/:id/logo`,
cloning the two-step in `app/api/v1/brand/logo/`. `orgAssetKey()` already exists in
`lib/r2.ts`.

### Shop switcher in the rail

`layout-map.md` puts a switcher at the top of the shop-scope zone. It does not exist.
The interim is a "Switch to" row action on `/settings/shops`, which writes the same
`sq_shop` cookie through `PUT /api/v1/shops/active` — functional, but it means changing
shop is a trip to settings rather than one control in the rail.

Blocked on two questions the component inventory would have forced (both now recorded in
that file):

- Does the switcher use `components/ui/select.tsx`, or is it its own component? A native
  select in a navigation column reads as a form field.
- Does `Select` need `Input`'s `size: 'default' | 'lg'`? Without it a select beside a
  `size="lg"` input will not line up.

Also unbuilt from the same diagram: the `[org name]` zone header.

### E2-01 — delete organization

**Deferred by decision**, gated behind `ORG_DELETE_BUILT` in `lib/features.ts` and shown
on the settings page as a disabled section with the reason visible.

Three independent blockers, none of which E2 can resolve alone:

- The spec gives it one clause — "exports data first" — with no format, no delivery
  mechanism and no retention rule.
- There is no export queue. `ExportJob` is offer-book-scoped (E9) and is the wrong model.
- `docs/E3-billing-subscription.md` separately promises data is kept for 90 days after
  cancellation, which this would contradict; and deleting an organization while E3-01
  cannot cancel the subscription would leave a live Stripe subscription pointing at
  nothing.

Needs a spec before it is worth building.

---

## 3. Deliberate compromises

Not oversights. Each is a place where the honest option was chosen over the specified
one, and each has a note at the call site.

| Thing | What shipped | Why |
| --- | --- | --- |
| Status badges | Plain coloured text on the shop and team lists | `StatusPill`'s enum is `live \| failed \| attention \| draft \| archived \| generated`. Nothing covers active/paused or pending/expired, and `attention` would be a lie. Adding values is an inventory amendment — proposed in `component-inventory.md`, not made unilaterally. |
| Toasts | Inline `role="alert"` / `role="status"` banners | `Toast` has a signature in the inventory and no mounting mechanism — no provider, portal or store. Building one would invent a second API. |
| Reversible actions | Pause and reactivate use a confirm dialog | The design system prefers undo over confirm, and undo lives in the toast that does not exist. |
| `select.tsx` | Built and added to the inventory after the fact | The inventory listed no select, dropdown or combobox at all, and E2 needed one in four places. |
| Checkboxes and radios | Native inputs, inline, styled at the call site | Neither is in the inventory. Same reasoning — flagged rather than invented as a shared primitive. |
| Shop and team lists | `<ul>` of rows, not `DataTable` | A shop row stacks a logo, name, branch and status; as table columns that is a horizontal scroll at 375px. `DataTable` is built and unused, waiting for a list that is genuinely tabular. |

---

## 4. Cross-epic seams left open

- **Stripe.** `lib/billing.ts` `syncShopQuantity()` is a logged no-op with a `TODO(E3)`.
  Shop add, remove, pause and reactivate all call it. E3 fills the body — an outbound
  `subscriptionItems.update` with `proration_behavior`, reconciled by the webhook. Note
  E2's own spec line 112 says this happens "via webhook", which is backwards; E3-02 has
  it right.
- **`DEFAULT_MAX_SHOPS = 3`** in `lib/billing.ts` is a number with no authority behind
  it. `plans` has no rows — the seed writes grids and templates only — and no signup path
  sets `planId`, so every organization is on this constant rather than a plan. It stops
  being used the moment E3 seeds plans.
- **In-app notification** on "new user joined your organization" is E12's (`docs/E12`,
  line 59). E2 fires nothing.
- **`/settings/billing`** is still a link to a 404 in the rail. It predates E2 and
  removing it is E3's call.

---

## 5. Things found wrong along the way

Recorded because they were load-bearing and are easy to reintroduce.

- **The documented RLS pattern never worked.**
  `await prisma.$executeRaw\`SET app.current_org_id = ${organizationId}\`` fails twice
  over: `SET` is a utility statement and will not take a bind parameter, and it is
  session-scoped, so on a pooled connection the value outlives the request and the next
  one inherits the previous tenant's id. Corrected in `references/database.md` and
  `packages/db/CLAUDE.md`; `withOrg` uses `set_config(…, true)`.
- **The policy examples named the wrong columns.** No Prisma field in this schema carries
  an `@map`, so only *tables* are snake_case. Policies must quote `"organizationId"`.
- **`WITH CHECK` was missing.** `USING` alone filters reads and lets an INSERT or UPDATE
  write another tenant's id.
- **`FORCE ROW LEVEL SECURITY` is required.** The app connects as the table owner, and
  policies do not apply to the owner without it.
- **The organization brand kit needed a backfill.** Every shop already carried
  `brandOverride = 'inherit'` while no organization had a kit, so the moment
  `resolveBrandKit()` went live every existing account would have lost its brand. Shipped
  as BACKFILL 2 in the E2 migration.

---

## 6. Open questions for a human

1. **`StatusPill` enum** — extend it with `active | paused | pending | expired` and add a
   separate `RoleBadge`, or leave the lists as text? A third screen will otherwise invent
   a fourth treatment.
2. **Audit log.** Nothing records a role change, a removal or an access grant.
   `AdminAuditLog` is E13's and keyed to `admin_users`. `user_shop_access.grantedById`
   is the only trace E2 leaves. Is org-facing audit in MVP?
3. **`User.email` is globally unique.** One person cannot belong to two organizations,
   and an address freed by a removal in one is still claimed. `POST /invites` surfaces
   this as a hard 409 with honest copy. Schema-level product decision.
4. **Manager scope on the team list.** A manager currently sees the whole organization's
   team and can only write within their own shops. Whole-org read is the simpler answer
   and the leakier one.
5. **`brandOverride` has no level for grid, template or fonts.** They are bound to `full`
   under a `layout` facet. If a shop should keep the organization's colours and pick its
   own template, that is a fifth level.
6. **Rate limiting on `POST /invites`.** An authenticated outbound-mail primitive. There
   is a local escalating cooldown (1/3/10/60 minutes per address), but repo-wide rate
   limiting is still an open gap.
7. **Email logo.** `apps/web/public/brand/email/logo-dark.png` is still not on R2. E2-03
   sends the first email a *stranger* receives; a broken image at the top of an invitation
   from a company they have never heard of is a conversion problem.
