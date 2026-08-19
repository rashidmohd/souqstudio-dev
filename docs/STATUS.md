# Where the project stands

Read this before starting an epic. It says what is built, what is blocking, and what each
of the remaining epics needs before it can begin.

Last updated 13 August 2026, after E4-05 shipped.

Per-epic detail lives in the working notes: `docs/E2-pending.md`, `docs/E3-pending.md`,
`docs/E4-pending.md`.
The epic specs themselves (`docs/E1-*.md` … `docs/E13-*.md`) stay the record of what was
asked for — corrections to them are recorded in the pending notes, not edited in.

---

## 1. Built

| Epic | State |
| --- | --- |
| **E1** Authentication & onboarding | Built. Signup, login, email verification, password reset, TOTP two-factor with backup codes, org-wide 2FA policy, the four-step brand setup wizard, and the getting-started checklist. |
| **E2** Organization management | Built. Org settings, shops (add, deactivate, archive), team and invites, per-shop access, brand inheritance. See `E2-pending.md`. |
| **E3** Billing & subscription | Built. Plans, Checkout, upgrade/downgrade, cancel and resume, shop add-on billing, AI credits with rollover and top-ups, invoices, Stripe portal, webhook. See `E3-pending.md`. |
| **E4** Brand setup | Built. E4-01 to E4-04 through the E1 wizard; E4-05 is the brand kit screen at `/brand` — view and edit the kit after setup, and a destructive reset to organization defaults. The shop-level override was E2-05's and already shipped. Fonts are out of scope; see the epic. |

Everything else is unstarted: **E5, E6, E7, E8, E9, E10, E11, E12, E13**. Their route
directories exist and are empty.

`apps/web/lib/features.ts` is the machine-readable version of this table. A control whose
destination is not built renders disabled with the reason visible. **Flip the flag in the
change that adds the route** — that is the whole point of the file.

---

## 2. Blocking, and what it blocks

These are cross-cutting. Each one stops or degrades work in epics that have not started
yet, so it is cheaper to clear the relevant one first than to work around it.

### Row-level security has no policy — blocks nothing, endangers everything

The baseline migration exists and `withOrg()` ships, but **not one policy has been
written.** Tenancy today rests on `apps/web/lib/authz.ts`, which is application filtering,
not a control. Every epic from here adds tenant tables and makes the gap wider.

Pick up at `E2-pending.md` §1, which has the three steps in order. The hazard to know:
`current_setting(…, true)` returns NULL when unset, so a missed call site returns *zero
rows* rather than an error — it fails closed, and a mistake looks like an empty screen in
production rather than a stack trace.

### The tsvector migration is not written — blocks E5

`catalog_products.search_vector`, its GIN index, the update trigger and the `pg_trgm`
extension are raw SQL that Prisma does not manage, and none of it exists. E5-01 full-text
search cannot start without it. The SQL is written out in
`souqstudio-technical → references/database.md`; use the `simple` dictionary, not
`english`, because the catalog is multilingual.

### Three worker handlers throw — blocks E6, E8, E9

`apps/worker/src/workers/` has five workers. `email` and `bg` are implemented. **`pdf`,
`ai` and `enrich` are `throw new Error('Not yet implemented')`.**

- `pdf` blocks E9 export and the E6 editor's export path.
- `ai` blocks E8 entirely, and is where credits are actually spent — `consumeCredits()`
  in `packages/db/src/credits.ts` is written and called by nothing.
- `enrich` blocks E5's multilingual synonym pipeline.

Guidance is in `souqstudio-technical → references/background-jobs.md` and
`apps/worker/CLAUDE.md`. The rule that matters: **credits are deducted on completion,
never at queue time.**

### Billing has never touched a real Stripe account — blocks launch, not an epic

E3 is complete and untested against Stripe, because this environment has no key. Nothing
should be deployed assuming it works. `E3-pending.md` §1 lists the order to exercise it in.

### One organization has several brands — decide before E6

`organizations.brandKit` assumes one brand per organization. A GCC retail group holds
several trade licences, each with its own brand, so the level is wrong: a brand belongs to
a licence, not to the billing entity. Today three brands across fifteen branches means
`full` override on fourteen shops and no way to restyle one brand's branches together.

The fix is a `Brand` row between the two, and it is cheapest now — no RLS policy is
written yet, the editor does not exist, and every epic from here adds another reader of
the kit. `lib/brand-inheritance.ts` survives the change; only the level names move.
Full write-up and migration shape in `docs/E4-pending.md` §1.

### Token encryption key management is undecided — blocks E10

Where the key lives, how it rotates, what happens to stored tokens when it does. Also
decides whether `users.twoFactorSecret` gets encrypted; it ships plaintext behind a
version seam in `apps/web/lib/two-factor-secret.ts`, so that switch is one file plus a
backfill.

### Rate limiting is unspecified — blocks nothing, will hurt

No route has any, including the public tracking endpoints E11 will add, which are
unauthenticated and trivially floodable. `POST /api/v1/auth/2fa/enroll` runs bcrypt
unthrottled behind a valid session.

---

## 3. What to pick up next

The MVP epics, in the order that unblocks the most. Each entry says what has to be true
before it starts.

### E5 — Product catalog (MVP)

**Needs first:** the tsvector migration. **Then:** the `enrich` worker, for synonyms.

The catalog is what the editor searches, so E6 is thin without it. E5-06 catalog admin
overlaps E13; build the shop-facing half first. `CatalogProduct`, `ProductSynonym` and
`ProductContribution` models already exist.

### E6 — Offer book editor (MVP)

**Needs first:** E5, for the product search panel. **Needs the `pdf` worker** for export,
but not to start — the editor can be built and autosaved before anything exports.

The largest epic in the product. `OfferBook` and `OfferBookProduct` exist; nothing else
does. Read the canvas rules in `apps/web/CLAUDE.md` before the first line — Fabric holds
visual state, Zustand holds logical state, and `document.fonts.load()` runs before any
Fabric text object is created or every bounding box is wrong.

`stores/editor-store.ts` does not exist yet. `brand-store.ts` is the pattern to follow.

### E9 — Output formats & export (MVP)

**Needs first:** E6, and the `pdf` worker. The pipeline is settled and written down —
canvas → `toSVG()` → HTML shell → Playwright — in
`souqstudio-technical → references/export-pipeline.md`. A warm browser pool is mandatory;
launching per request costs 400–600ms every time.

### E10 — Sharing & publishing (MVP for link/QR/WhatsApp)

**Needs first:** E6, and the encryption key decision for the Instagram half only. The
link, QR and WhatsApp share paths need neither and could go earlier if the public viewer
at `app/o/[code]` is worth having before export is.

### E12 — Notifications (MVP for transactional email and in-app)

**Partly there already.** The email queue and worker are built, and eight of the fourteen
templates in `EmailTemplate` exist. Missing: `plan-upgraded`, `plan-downgraded`,
`subscription-cancelled`, `offer-book-expiring`, `new-template-available`, and any
security-alert mail at all — enabling, disabling or resetting two-factor notifies nobody.

The `Notification` and `NotificationPreference` models exist; there is no in-app
notification UI and no `stores/notification-store.ts`.

### E13 — Admin panel (MVP for catalog and org management)

**Needs first:** E5, for anything to administer. `apps/admin` is scaffolded and empty.
Admin auth is a separate path against `admin_users` with its own session secret — never
the shop-owner session layer.

### E7, E8, E11 — later

E7 is admin tooling for templates and grids (and carries the card designer addendum, a
fifth layout family with no epic of its own). E8 is AI features, V2, and needs the `ai`
worker. E11 is analytics, V2, and needs the public viewer from E10 to have something to
track.

---

## 4. Before writing any code

1. Read the epic in `docs/`.
2. Read the `CLAUDE.md` of the app you are working in.
3. `souqstudio-design` before any UI, `souqstudio-technical` before any server work,
   `project-structure` before creating any file.
4. Check `references/component-inventory.md` before building a component — build to the
   signature there or raise it; never invent a second API for the same thing.
5. `pnpm typecheck` after each meaningful change, `pnpm lint` and
   `references/consistency-checklist.md` before calling UI work done.

The design system is enforced mechanically: Tailwind's default palette, spacing and radius
scales are replaced rather than extended, so an off-system value does not resolve. Lint
errors on physical properties, raw hex, shadows, italics, blue fills and template tokens
in chrome.
