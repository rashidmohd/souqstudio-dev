# Where the project stands

Read this before starting an epic. It says what is built, what is blocking, and what each
of the remaining epics needs before it can begin.

Last updated 4 September 2026, after the E5/E6 delta pass — the offer model, the
bilingual catalog and the layout-engine architecture.

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
destination is not built renders disabled with the reason visible, or is omitted. **Flip
the flag in the change that adds the route** — that is the whole point of the file. The
left rail now reads those flags, so an unbuilt destination is not rendered at all;
`/catalog` and `/analytics` had been shipping as live nav items pointing at 404s.

### The design system, reconciled against the brand palette

Not an epic, but it moved in September and the notes are worth carrying.

The printed brand palette was checked colour by colour against
`souqstudio-tokens.css`: **blue, navy, charcoal, sand, sky, gold and the `#F8F7F3` page
ground all match exactly.** The token file is not a paraphrase of the brand; it is the
brand. Three things came out of that pass:

- **There is no lime.** `--sq-lime` and `--sq-lime-tint` were in the tokens, the Tailwind
  config, the lint rule and four documents, and lime is not one of the seven brand
  colours. All of it is gone. The working set is blue, charcoal and sand, with sky as the
  second tint.
- **Three accessibility defects, none of which had bitten yet.** Charcoal on sky is
  4.25:1, so sky now carries no text at any size. `--sq-machine-rule` — the border that
  marks AI-generated content, which the system calls a functional requirement — was sky
  at 2.76:1 against its own fill, under the 3:1 non-text floor; it is navy at 11.60:1.
  And `--sq-ui-text-muted` is rated against the page ground, so it fails on any tint
  (4.19:1 on sand); tinted surfaces stop at `text-secondary`.
- **The brand blue is settled.** The palette gives `#143CD2`, which is what the tokens
  and the committed marks carry. Exports from the design tool keep emitting `#153CD0`.
  **Correct the export, never the token.**

Two components were built to their inventory signatures — `IconChip` and `TintedCard` —
and have no call sites yet, deliberately: existing screens were left alone. Seven remain
`spec`, of which `StatusPill` and `Toast` are blocked on decisions rather than effort.

**Illustrations moved from nothing to four.** The artwork on `assets.souqstudio.com` is
already recoloured — that CDN is `rebrand-svgs.py`'s output, not its input — and
`assets/illustration-catalog.json` already carries `souqUse` assignments on 35 of its 385
entries, so most of the selection work was done. `EmptyState` now renders the prop it had
been discarding, and `app/not-found.tsx` and `app/error.tsx` exist for the first time. See
`illustration-manifest.md` for what is `ready`, what is blocked, and the one slot that was
struck as unfillable.

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

### The tsvector migration is applied — full-text search is unblocked

`catalog_products.search_vector`, its GIN index, the update trigger and `pg_trgm` are raw
SQL in `20260904000000_e5_offer_model_and_catalog_search`. It landed there rather than in
its own migration because the bilingual columns changed what the vector is built from, and
writing it twice would have meant writing it wrong once. The vector now spans `nameEn` and
`nameAr` at weight A, brand and category at B, spec and tags at C — `simple` dictionary,
never `english`, because the catalog is multilingual.

**Applied to the dev database on 4 September 2026.** `prisma migrate status` reports four
migrations and no pending work. Verified end to end against the live database: the trigger
populates the vector on insert, an English query and an Arabic query return the same row,
a tag hit ranks below a name hit, `pg_trgm` matches "Basmatti" to "Basmati" at 0.8, the
partial unique index rejects a duplicate universal barcode, and the organization's own row
outranks the universal one at equal rank — which is the two-collection precedence.

Two things that came out of applying it:

- **The tsvector column is now declared in the model too**, as
  `searchVector Unsupported("tsvector")?` with its three GIN indexes. Raw SQL alone was not
  enough: a model that does not mention the column makes `db push` and `migrate dev`
  generate a `DROP` for it, and losing the search index reads as slow search rather than as
  a missing index. Both places, not either.
- **The only schema drift left is the E2 leftover** — `user_shop_access.updatedAt` still
  carries a `DEFAULT` the model does not declare. The E3 migration header documented it and
  it is still there. It is harmless and it will keep appearing in every diff until someone
  clears it.

`prisma/migrations/migration_lock.toml` was missing and is now written. Without it
`prisma migrate diff --from-migrations` refuses to run at all, which is the tool anyone
would reach for to check a migration against the history.

### Three worker handlers throw — blocks E6, E8, E9

`apps/worker/src/workers/` has five workers. `email` and `bg` are implemented. **`pdf`,
`ai` and `enrich` are `throw new Error('Not yet implemented')`.**

- `pdf` blocks E9 export and the E6 editor's export path.
- `ai` blocks E8 entirely, and is where credits are actually spent — `consumeCredits()`
  in `packages/db/src/credits.ts` is written and called by nothing.
- `enrich` blocks E5's multilingual synonym pipeline.

`bg` is implemented for logos only. E5 §3 makes background removal an ingest stage for
catalog images too — the payload fields are on `BgRemovePayload`, the handler branch that
writes `image_assets` CUTOUT rows is not.

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

**The shape is settled and the schema is written.** `docs/E5-product-catalog.md` is v2:
one table with a nullable `organizationId` (null = universal, set = the organization's own
collection), bilingual name/brand/spec/origin columns, `image_assets` with a CUTOUT
variant, pack maths for the derived unit price, spreadsheet import with a review screen,
and a QR phone-capture handoff. All of it is in the schema and in the E5 migration.

**Needs first:** nothing structural. The work is routes and screens.

Three things the migration does not carry, listed at E5 §9: promo-tier seeding on
organization creation (the signup path — `offers.promoTierId` is NOT NULL, so the first
offer a new org creates would violate it), the `enrich` worker for synonyms, and the
cutout branch of the `bg` worker.

The catalog is what the editor searches, so E6 is thin without it. E5-08 catalog admin
overlaps E13; build the shop-facing half first.

### E6 — Offer book editor (MVP)

**The architecture changed.** `docs/E6-offer-book-editor.md` is v2: a layout engine
composes pages from offers plus a template, and Fabric is the adjustment layer holding
bounded per-slot deltas. `offer_books.canvasState` is gone; `offer_book_pages.slotOverrides`
replaces it. Free canvas composition is now out of scope permanently, not until V3.

**Needs first:** E5, for the catalog the offer tray searches. **Needs the `pdf` worker**
for export, but not to start.

The build order in E6 §10 is not advisory. Price mark first, then engine placement, then
the fit ladder — steps 1–3 are the whole risk. If the engine's output looks like a real
flyer with no manual adjustment the product works, and it is much better to learn that at
step 3 than at E13.

The engine is shared between web and worker — one implementation, in `packages/`, not in
`apps/web/lib`. Two would drift, and drift here means the PDF does not match the screen.

Read the canvas rules in `apps/web/CLAUDE.md` before the first line — Fabric holds visual
state, Zustand holds logical state, and `document.fonts.load()` runs before any Fabric
text object is created or every bounding box is wrong.

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

## 4. Open decisions

These are waiting on a human, not on effort. Each one changes what gets built.

| Decision | Blocks | Where |
| --- | --- | --- |
| **`Brand` entity** — one org, several licences | E6 | `E4-pending.md` §1 |
| **Typefaces and Arabic coverage** | the design calibration pass | the type scale splits Host Grotesk from Plex Sans Arabic purely on coverage |
| **`font-display text-heading`** used for section headings in 21 places across 10 files | nothing | contradicts the type scale and consistency check #6; every settings screen already does it, so it is a sweep and a decision, not a bug fix |
| **Forcing an incomplete owner into the wizard** from anywhere in the dashboard | nothing | `E4-pending.md` §2 |
| **`StatusPill` enum** — no value for active/paused/pending/expired | the pill, and three screens using plain text instead | `E2-pending.md` §6 Q1 |

---

## 5. Before writing any code

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
