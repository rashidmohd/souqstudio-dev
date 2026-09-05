# Where the project stands

Read this before starting an epic. It says what is built, what is blocking, and what each
of the remaining epics needs before it can begin.

Last updated 5 September 2026, after the composition-model build — the layout engine, the
blocks schema, the reworked brand kit, the first renderer — and after E5-01 and E5-02, the
catalog search and category browser.

Per-epic detail lives in the working notes: `docs/E2-pending.md`, `docs/E3-pending.md`,
`docs/E4-pending.md`, `docs/E5-pending.md`.
The epic specs themselves (`docs/E1-*.md` … `docs/E13-*.md`) stay the record of what was
asked for — corrections to them are recorded in the pending notes, not edited in.

**`docs/composition-model.md` is the architecture now, and it is built.** Read it before
starting E6 or E7. It supersedes E6 §2 and §5, changed the E4 brand-kit shape, and absorbs
most of what E7 was scoped to do. In one sentence: *a brand kit is identity, a block is a
designed building block, a page is a spreadsheet of regions filled with blocks, and
products flow through it.*

**One line to remember before picking anything up: the catalog is still empty.**
`catalog_products` and `offer_books` both hold zero rows. The *browser* over that catalog
now exists — E5-01 search and E5-02 category browsing are built — so the screen is there
and the rows are not. Filling it is what remains of the critical path: the ingest half of
E5 (import, barcode, upload) and the Open Food Facts seed.

---

## 1. Built

| Epic | State |
| --- | --- |
| **E1** Authentication & onboarding | Built. Signup, login, email verification, password reset, TOTP two-factor with backup codes, org-wide 2FA policy, the four-step brand setup wizard, and the getting-started checklist. |
| **E2** Organization management | Built. Org settings, shops (add, deactivate, archive), team and invites, per-shop access, brand inheritance. See `E2-pending.md`. |
| **E3** Billing & subscription | Built. Plans, Checkout, upgrade/downgrade, cancel and resume, shop add-on billing, AI credits with rollover and top-ups, invoices, Stripe portal, webhook. See `E3-pending.md`. |
| **E5** Product catalog | **Mostly built.** E5-01 search, E5-02 category browsing, E5-03 barcode lookup, E5-04 add-a-product and E5-06 CSV import ship at `/catalog`. Not written: XLSX, the camera scanner, E5-05's contribution queue, E5-07 phone capture, and the `bg` worker's catalog branch. The import commits into the catalog and stops short of creating offers, which needs E6. See `E5-pending.md`. |
| **E4** Brand setup | Built, and **reshaped by the composition model**. `/brand` is four cards — logo, colours, typography, blocks. The kit holds *identity only*: an open-ended named palette, definable text styles with a Google Fonts picker, and no layout at all. The setup wizard dropped from five steps to three. See §1.1. |

**Not an epic, but built:** the layout engine, the block schema and the first renderer.
See §1.2 — it is most of what E6 and E7 were scoped to do.

Everything else is unstarted: **E6, E7, E8, E9, E10, E11, E12, E13**. Their route
directories exist and are empty.

`apps/web/lib/features.ts` is the machine-readable version of this table. A control whose
destination is not built renders disabled with the reason visible, or is omitted. **Flip
the flag in the change that adds the route** — that is the whole point of the file. The
left rail now reads those flags, so an unbuilt destination is not rendered at all;
`/catalog` and `/analytics` had been shipping as live nav items pointing at 404s.

### 1.1 What changed in E4, and why

The brand kit carried a `gridId` and a `templateId`. Both are gone. **A brand kit *has*
many blocks; it does not contain a choice of one**, and which grid a book uses is a
decision about that book rather than about the shop. The `layout` facet in
`lib/brand-inheritance.ts` is now `typography`, and `isBrandSetupComplete` tests the
colours alone.

Two things stopped being fixed-size lists, for the same reason both times — a brand kit is
a **guideline that defines things, not a map of where they go**:

- **The palette is open-ended.** Named colours the shop writes itself, 3 to 8 of them, not
  three slots called primary/secondary/accent that also implied where each one belonged.
  A seeded block still names a `TokenRef` slot because it has never met this shop; the
  first three entries answer those. A fourth and fifth colour need no slot.
- **Text styles are open-ended.** Named styles — "Product name", "Headline", "Small print"
  — each carrying its own typeface, size, weight, italic and colour. 5 to 12. A fixed
  h1–h6 ladder capped a brand at eight and named them after nothing an owner recognises.

`fontHeadline` is a **separate face slot from `fontDisplay`** and that separation is
load-bearing: with three slots named after parts of a card, a hero band could be *larger*
than a product name but never a *different voice*.

Typography is a Google Fonts picker over a **curated ten**, every one covering Arabic and
Latin. Never the full library — most of it has no Arabic, and an owner who picks a
Latin-only face then toggles a book to Arabic gets tofu. Chrome loads those faces from
Google's CDN for previews; **the render path must not** — see the known gap in `CLAUDE.md`.

### 1.2 The composition model, built

Not an epic. It is the architecture E6 and E7 sit on, and most of it now exists.

**`packages/engine`** — pure functions, no Prisma, no Fabric, no React, no I/O. It decides
geometry and assignment; something else draws. In `packages/` because web and worker must
share one implementation, and drift there means the PDF does not match the screen.

| Piece | What it decides |
| --- | --- |
| `tracks` | fr track sizes to pixel offsets |
| `geometry` | cell spans to rectangles, **and the only place RTL mirrors** |
| `arrangement` | which block layout an aspect selects |
| `validate` | overlaps, bounds, inverted spans, no-flow-region |
| `flow` | master grid + offers + pins → pages |
| `render` | a block's elements to absolute rectangles |
| `price-mark` | every piece of a price mark, and the money formatting |
| `fit` | the four-rung fit ladder and what each text may suffer |
| `library` | the four seeded blocks |

**102 tests.** `pnpm --filter @souqstudio/engine harness` renders sample pages to SVG from
the same rows the database holds — that is how the model is checked, and it is not a
renderer anything ships.

**Schema**, migration `20260905000000`: `blocks`, `block_versions`, `page_grids`,
`book_pins`, `plans.maxProductsPerBook`. `grids`, `templates` and `template_versions` are
dropped, along with `offer_books.templateId`/`densityProfile` and
`offer_book_pages.pageType`/`densityProfile`. Safe to drop with rows in them because
nothing referenced either — the database held zero offer books.

**`pnpm db:seed`** publishes four blocks: offer card (repeating, four arrangements), hero
band, footer, message. `page_grids` has no relation to `blocks` on purpose — a region
names its block by id *inside* the `regions` JSON, and Prisma cannot enforce a key through
JSON, so a relation would only add a join table nothing writes to.

**`components/blocks/BlockPreview.tsx`** is the first renderer: inline SVG, drawing the
seeded blocks in the shop's palette and typefaces on the `/brand` Blocks card. It computes
no geometry — every rectangle and line break comes from the engine. Fabric is still the
*editor's* renderer, where dragging needs an object model.

Three rules are asserted rather than described, because they decide whether output reads
as a real offer book: the price mark's minor digits raise to the major's cap height, the
tier tab overlaps the mark at every size, and the mark lays out start-to-end and **never
mirrors** — LTR with Western numerals in an Arabic edition too.

**What the harness caught, that typecheck and lint could not:** a footer band whose type
collapsed because the scale anchored to the block's shorter edge instead of its geometric
mean; a price mark that spilled out of merged regions because it fitted on height alone;
`KWD` landing on top of the digits because letters were measured at digit width; and a
seeded offer card whose name box was sized for "Basmati rice" rather than for
`مسحوق غسيل أوتوماتيك بالليمون للغسالات`. Every one of them was found by looking at a
render.

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

### The catalog is empty — blocks everything downstream

`catalog_products` and `offer_books` both hold **zero rows**. The layout engine, the block
library, the price mark, the fit ladder and the first renderer are all built and tested
against dummy products; none of it can be seen in the app with real data because there is
none. This is the only thing on the critical path, and it is E5.

**The reader over it now exists, and so does the first way in.** `/catalog` searches and
browses both collections, looks a barcode up, and lets an owner add a product the catalog
does not have — into their own collection, usable immediately, with the review queue as a
separate question. Every query was run against the dev database and executes cleanly; they
all returned zero rows, which is the point.

**The bulk path is built too.** `/catalog/import` takes a CSV, guesses what each column
means, resolves every row against both collections in two queries rather than two per row,
and puts the ones it could not place with confidence in front of the owner. It commits into
the catalog; carrying the sheet's prices into an offer book is E6's half, because there are
no offer books.

**The Open Food Facts seed is written and has not been run.** `pnpm --filter
@souqstudio/db catalog:import-off` streams the 1.28GB export, filters for GCC relevance
and upserts into the universal collection; the mapping has 19 tests and the script has
been dry-run against the live export. Running it for real writes tens of thousands of rows
and takes hours — a decision, not a step.

What is still missing: XLSX (a dependency decision, not effort), E5-07 phone capture, and
the camera half of E5-03. Ranking and the import's match thresholds
are both unverified against real data; the constants are named in `E5-pending.md` §3.

### A preview route with no auth check was committed — remove before deploying

Commit `b293829` captured a temporary harness: `apps/web/app/preview-brand/page.tsx` and a
`/preview-brand` entry in `PUBLIC_PATHS`. That route mounts the brand kit screen with **no
session check**. It was a scratch page for looking at the four cards without writing to the
live database, and it should never have been committed. The deletion is in the working
tree; do not deploy that commit as it stands.

### Promo-tier seeding is fixed — was breaking every new account

**Resolved 5 September.** `offers.promoTierId` is NOT NULL and the E5 migration seeded
tiers only for the organizations that existed then, so every account created afterwards
would have failed on its first offer with nothing the owner could do. `seedPromoTiers` now
runs inside the signup transaction, and `pnpm db:seed` backfills — it caught one live
organization. The data lives in `packages/db/src/promo-tiers.ts`, not in `apps/web/lib`,
because `tokenRef` is a `--sq-tpl-*` name and that is offer book content, not chrome.

### `pnpm typecheck` was lying — fixed, and worth knowing why

**Resolved 5 September.** `turbo.json` had `"typecheck": {}` with no `dependsOn`, so the
task was not topological: editing `packages/types` left every dependent's typecheck as a
**cache hit**. `pnpm typecheck` reported all green while the apps replayed stale logs, and
the error surfaced in the worker's build on Railway instead. That is exactly how a
`BrandKit` change shipped a broken worker. Now `dependsOn: ["^typecheck"]`.

Note that `pnpm check` is `typecheck + lint + stylelint` and still does not include
`build`. Railway runs `build`.

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
- `enrich` blocks E5's multilingual synonym pipeline **and, now specifically, every
  Arabic name in the universal catalog.** The Open Food Facts CSV export has no language
  variants in any of its 211 columns, so every seeded universal product has a null
  `nameAr`, and E5 §2 makes that a publish-time blocker for Arabic editions. Until this
  worker lands the shared catalog is English-only and cannot back an Arabic offer book.
  A shop's own products are unaffected: E5-04 and E5-06 both take `nameAr` from the owner.

`bg` is implemented for logos only. E5 §3 makes background removal an ingest stage for
catalog images too — the payload fields are on `BgRemovePayload`, the handler branch that
writes `image_assets` CUTOUT rows is not. **E5-04 now enqueues those jobs**, so the branch
has real work waiting for it: the job runs, produces a cutout at its own `-cutout.png` key
and writes no row, and the card falls back to the ORIGINAL with `imageIsFallback` set. What
the branch owes is the row, not the image. Note that `handleBgRemove` overwrites
`targetPath` blind — never hand it the original's key.

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

### E5 — Product catalog (MVP) — search and browsing are built

**E5-01, E5-02, E5-03, E5-04 and E5-06 ship.** `/catalog` is a search box over both
collections with the category tiles as its empty state, a barcode goes to its own lookup
rather than to full-text search, a search or scan that finds nothing offers to add the
product, and `/catalog/import` takes a CSV through mapping, matching and review.
`CATALOG_BUILT` is flipped and the rail carries the item again.

**Next is running the seed** — it is written, tested and dry-run, and every path into the
catalog is built, so the catalog being empty is now one command and a few hours rather
than a code problem. After that, E5-07 phone capture and the camera half of E5-03; XLSX is
a dependency decision waiting on a human.

Read `E5-pending.md` first: it carries the corrections building this produced, including
that `barcode` is not in `search_vector`, that `?lang=` does not exist, why the cutout job
must never be given the photo's own key, and where the import deliberately stops.

**The shape is settled and the schema is written.** `docs/E5-product-catalog.md` is v2:
one table with a nullable `organizationId` (null = universal, set = the organization's own
collection), bilingual name/brand/spec/origin columns, `image_assets` with a CUTOUT
variant, pack maths for the derived unit price, spreadsheet import with a review screen,
and a QR phone-capture handoff. All of it is in the schema and in the E5 migration.

**Needs first:** nothing structural. The work is routes and screens.

**This is the only thing on the critical path**, and it is now specifically the *ingest*
half of it. Everything downstream — the engine, the blocks, the price mark, the fit ladder,
the renderer, and now the catalog browser too — is built and idle because there are no
products to place. E6 is not thin without E5; it is impossible.

Of the three things E5 §9 says the migration does not carry, **promo-tier seeding is now
done** (§2). The `enrich` worker for synonyms and the cutout branch of the `bg` worker are
still open.

E5-08 catalog admin overlaps E13; build the shop-facing half first.

### E6 — Offer book editor (MVP)

**Read `docs/composition-model.md`, not E6 §2 or §5.** Those sections describe a page-type
grammar that no longer exists; the doc's banner says which parts still stand.

**Roughly half of E6 is already built** — see §1.2. The engine composes pages, the blocks
are seeded, the price mark and the fit ladder are done and tested, and a renderer draws
blocks on `/brand`. What E6 still owns:

- **The editor screen** at `/editor/[id]` — offer tray, artboard, properties panel.
- **The Fabric layer.** `BlockPreview` is inline SVG and static; the editor needs an object
  model for dragging, nudging and selection. The geometry is not rebuilt — Fabric draws
  what the engine already decides, the same way the SVG renderer does.
- **`SlotOverride` handling**, keyed by `regionId` + `offerId` rather than grid position,
  which is what lets a nudge survive next week's product swap.
- **Master and instances**, and **pins**. The engine models both; nothing authors them yet.
- **Quality flags** surfacing `fit-escalated` from the ladder, plus missing `nameAr`
  blocking publish on AR editions.

The risk E6 §10 names — *"if the engine's output looks like a real flyer with no manual
adjustment, the product works"* — **has been answered, and the answer is yes.** The render
harness produces booklet pages, a cover with a hero band, merged regions and an Instagram
carousel with a pinned message, all without a hand-placed element. That was the whole
gamble and it is off the table.

**Needs first:** E5, for products to place. **Needs the `pdf` worker** for export, but not
to start.

Read the canvas rules in `apps/web/CLAUDE.md` before the first line — Fabric holds visual
state, Zustand holds logical state, and `document.fonts.load()` runs before any Fabric
text object is created or every bounding box is measured against the fallback. The brand
kit now lets an owner pick ten different families, so that is not theoretical.

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

**E7 lost most of its reason to exist.** It was admin tooling for templates and grids,
and both tables are dropped: a grid is now `perRow` on a region and a template that bundled
look *and* arrangement had nothing left to be. What E7 still covers is a **block designer**
— drag an element onto a block, bind it to a product field, pick a text style — plus the
card designer addendum, a fifth layout family with no epic of its own. Rewrite the epic
against `docs/composition-model.md` §3 before starting it.

The block schema already anticipates owner-authored blocks: `blocks.organizationId` is
nullable, and null is what makes a block seeded rather than authored. One rule the designer
must not break — **the price mark is one element the owner places and sizes, never one they
open.** Owners given text boxes for a price produce hundreds of inconsistent treatments
inside a month.

E8 is AI features, V2, and needs the `ai` worker. E11 is analytics, V2, and needs the
public viewer from E10 to have something to track.

---

## 4. Open decisions

These are waiting on a human, not on effort. Each one changes what gets built.

| Decision | Blocks | Where |
| --- | --- | --- |
| **`Brand` entity** — one org, several licences | E6 | `E4-pending.md` §1 |
| **Typefaces and Arabic coverage** | the design calibration pass | the type scale splits Host Grotesk from Plex Sans Arabic purely on coverage |
| **`font-display text-heading`** used for section headings across the settings screens | nothing | contradicts the type scale and consistency check #6 — Host Grotesk has no Arabic, so those headings fall back in an AR interface. `/brand` was moved to `font-ui`; the rest is a sweep and a decision, not a bug fix |
| **How many typefaces to offer** — the catalog is ten curated families | nothing | every Google Fonts family with Arabic coverage is ~30. Widening is a data change in `lib/brand-fonts.ts`; the full library is the version to refuse, because most of it has no Arabic |
| **Palette and style ceilings** — 8 colours, 12 text styles | nothing | product judgements, not architecture. `MAX_PALETTE` and `MAX_STYLES`, one constant each. Nothing breaks at twenty; twenty is not an identity |
| **Per-level control in the typography UI** | nothing | the model lets any text style bind to any face slot and carry its own size and weight, and there is a test for it. The picker exposes the four slots and the per-style dialog, not arbitrary re-binding |
| **`Select` has no `size` prop** | any row pairing a select with an `lg` input | the inventory raised it at E2 and it has now bitten twice. `ColorField` got the prop; `Select` still has not |
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
6. **`pnpm build` before anything reaches Railway.** `pnpm check` is typecheck, lint and
   stylelint — it does not build, and Railway does.
7. **Look at it.** Consistency check #9 asks for the screen rendered in Arabic with real
   strings, and it is the one check that keeps finding things the others cannot: a ratio
   that read `12 of 8` in RTL, a colour field whose shell was half the border weight of
   the input beside it, type that collapsed in a wide short block. For artboard work,
   `pnpm --filter @souqstudio/engine harness` renders sample pages in both directions.

The design system is enforced mechanically: Tailwind's default palette, spacing and radius
scales are replaced rather than extended, so an off-system value does not resolve. Lint
errors on physical properties, raw hex, shadows, italics, blue fills and template tokens
in chrome.
