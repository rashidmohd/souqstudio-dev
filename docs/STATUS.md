# Where the project stands

Read this before starting an epic. It says what is built, what is blocking, and what each
of the remaining epics needs before it can begin.

Last updated 7 September 2026, after E7 gave a shop owner a block designer: a seeded block
can be duplicated, its elements moved, resized and re-bound, its overflow declared, and the
result saved with undo and version history. Earlier the same day, E6 went from nothing to a
working editor: a book can be created, drawn, priced, reordered and edited. Before that,
6 September, pointing the render harness at real catalog rows — which found an Arabic pack label printing backwards
and a category-coverage figure four times too high — the demo catalog seed and the Open
Food Facts importer fix. Before that, 5 September, the composition-model build: the layout
engine, the blocks schema, the reworked brand kit, the first renderer.

Per-epic detail lives in the working notes: `docs/E2-pending.md`, `docs/E3-pending.md`,
`docs/E4-pending.md`, `docs/E5-pending.md`, `docs/E6-pending.md`, `docs/E7-pending.md`.
The epic specs themselves (`docs/E1-*.md` … `docs/E13-*.md`) stay the record of what was
asked for — corrections to them are recorded in the pending notes, not edited in.

**`docs/composition-model.md` is the architecture now, and it is built.** Read it before
touching E6 or E7. It supersedes E6 §2 and §5, changed the E4 brand-kit shape, and absorbed
most of what E7 was scoped to do — E7 is the block designer that was left, and it is built. In one sentence: *a brand kit is identity, a block is a
designed building block, a page is a spreadsheet of regions filled with blocks, and
products flow through it.*

**One line to remember before picking anything up: the loop closes now.** A shop owner can
create an offer book from the catalog or from a spreadsheet, see it drawn, price it, reorder
it and edit it — `/editor/new` to `/editor/[id]`. The dev database holds real books, offers
and items written through that path rather than through a script.

**What that leaves on the critical path is E9, not E6.** A book can be made and cannot yet
leave the product: the `pdf` worker still throws, so there is no export, and E10's share
paths do not exist. Nothing an owner builds can reach a customer.

---

## 1. Built

| Epic | State |
| --- | --- |
| **E1** Authentication & onboarding | Built. Signup, login, email verification, password reset, TOTP two-factor with backup codes, org-wide 2FA policy, the four-step brand setup wizard, and the getting-started checklist. |
| **E2** Organization management | Built. Org settings, shops (add, deactivate, archive), team and invites, per-shop access, brand inheritance. See `E2-pending.md`. |
| **E3** Billing & subscription | Built. Plans, Checkout, upgrade/downgrade, cancel and resume, shop add-on billing, AI credits with rollover and top-ups, invoices, Stripe portal, webhook. See `E3-pending.md`. |
| **E5** Product catalog | **Mostly built.** E5-01 search, E5-02 category browsing, E5-03 barcode lookup, E5-04 add-a-product and E5-06 CSV import ship at `/catalog`. Not written: XLSX, the camera scanner, E5-05's contribution queue, E5-07 phone capture, and the `bg` worker's catalog branch. The import commits into the catalog and stops short of creating offers, which needs E6. See `E5-pending.md`. |
| **E6** Offer book editor | **Mostly built.** Create a book from the catalog or from a committed CSV import, draw it, price it, set tiers, reorder, add and remove offers, join two products with an `or`/`and`. Not written: drag-to-reorder, `SlotOverride` nudging, undo, autosave, and the rest of the properties panel — unit price, chips, footnotes. No Fabric yet; the artboard is inline SVG and has not needed one. See `E6-pending.md`. |
| **E7** Block designer | **Mostly built.** `/brand/blocks` is the library — the shop's own blocks and the four seeded ones — and `/card-designer/[blockId]` is the designer: drag and resize, bind to a product field, declare an overflow policy, undo, autosave, version history, a persistent worst-case preview. Not written: dragging a *new* element from the palette, seasonal scheduling, the overlay asset library. See `E7-pending.md`. |
| **E4** Brand setup | Built, and **reshaped by the composition model**. `/brand` is four cards — logo, colours, typography, blocks. The kit holds *identity only*: an open-ended named palette, definable text styles with a Google Fonts picker, and no layout at all. The setup wizard dropped from five steps to three. See §1.1. |

**Not an epic, but built:** the layout engine, the block schema and the first renderer.
See §1.2 — it is most of what E6 and E7 were scoped to do.

Everything else is unstarted: **E8, E9, E10, E11, E12, E13**. Their route directories
exist and are empty.

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
| `direction` | which way a *string* reorders, and where its line is anchored |
| `compact` | reclaiming the height a card's content did not use |

**144 tests.** `pnpm --filter @souqstudio/engine harness` renders sample pages to SVG —
that is how the model is checked, and it is not a renderer anything ships. Output lands in
`packages/engine/harness/out`; open `index.html`.

**Be exact about what it draws.** The *blocks* are the seeded ones — `library.ts` is the
single source both `pnpm db:seed` and the harness read, so a block drawn here is the block
in the table. The *products* are the dozen literals in `harness/dummy.ts` **and, since
6 September, real catalog rows.** `pnpm --filter @souqstudio/db catalog:harness-export`
writes them to `harness/real-products.json`; the harness draws them if the file is there
and says at the top of the index when it is not. The engine still has no database import
and must not gain one — `packages/db` already depends on it, so a read the other way would
close a cycle and pull Prisma into the PDF worker. JSON on disk is the seam. The file is
gitignored: it is a snapshot of somebody's dev database, and a checked-in copy would go
stale and read as a fixture.

**Prices on those pages are invented, and nothing else is.** A catalog row has no price —
that is what E6 is for — so the exporter derives a stable fake from the row id. Names,
brands, specs, pack lines and, above all, the *absences* are real. The `WORST_CASE` dummies
still cover the price mark better, because they carry a three-decimal currency on purpose.

**What real rows found that the dummies could not**, all four of them in the first render:

- **A pack label printed backwards on every Arabic card.** `2 kg` rendered as `kg 2`: the
  digit is bidi-weak, `kg` is a strong LTR run and the space between them is neutral, so an
  RTL paragraph reorders them. The chrome is safe — `ProductCard` puts the pack line
  through `Figure`, and `[data-figure]` carries exactly this isolation — but **the artboard
  had no `Figure` and no equivalent**. This is the one that would have shipped: a printed
  Arabic flyer with every pack size reversed, in a language nobody reviewing the English
  edition reads. **Fixed** — see below.
- **The card is mostly empty, because the catalog is.** 58% of rows have a brand, 33% a
  spec, 4.2% a pack size, 4.2% an image, 4.2% an Arabic name. The offer card reserves a box
  per field, so a typical real card is a short name, a grey placeholder and a large void.
  The block is not wrong; it was designed against twelve products that all have every
  field. It needs an arrangement for sparse rows — answered by `compactBlock`, which the
  editor now passes `balance` to.
- **The fit ladder escalates on real names and never did on the dummies.** Four escalations
  across the longest-names page, zero across every dummy page including `WORST_CASE`. Real
  names are *shorter* at the median (17 characters against the dummies' 30) and longer at
  the tail (78), and the tail is what the ladder has to absorb.
- **Mixed scripts inside one English page compose fine.** Turkish, French and a lone
  Arabic-only name render correctly in an LTR booklet. That was an open question and the
  answer is yes.

The pages are `real-typical`, `real-longest`, `real-arabic` and `real-sparse` in
`harness/out`.

**`placeText` is in the engine now, and both renderers use it.** It returns the x, the
anchor and the direction *together*, because deciding them separately is what broke next:
the first fix set `direction` from the string while `text-anchor` still came from the page,
and in SVG — as in CSS — `start` and `end` resolve against the element's *own* direction.
A real Arabic product name in an English booklet (`خردل`) was anchored at its box's left
edge and then drawn right-to-left *from* it, straight out of the card. **Found by looking at
the rendered page, which is the only way it could have been** — every test passed, and it is
the second time in this change that rule #7 caught what the others could not.

**`textDirection` underneath it.** `src/direction.ts`,
exported, 15 tests, beside `price-mark` — which already decides that a price mark lays out
start-to-end and never mirrors, so direction resolution is the same kind of decision the
module already owns. It answers first-strong, the Unicode `plaintext` heuristic, and it is
resolved in code rather than left to `unicode-bidi: plaintext` because three of the four
renderers that need it are not a browser.

**`BlockPreview` had the same bug and it is shipping code.** `/brand` draws the seeded
blocks in the shop's own palette and was passing the page direction straight to every
`<text>`. It does not *show* today only because `PREVIEW_PRODUCT` carries a fully
translated Arabic spec — and 96% of the universal catalog does not, which is exactly the
gap real rows exposed. Fixed in the same change; the note is on `lib/preview-product.ts`.
**E9's SVG export still has to call it**, and E6's Fabric layer will when it exists —
neither does yet. The editor's artboard does call it, through the shared painter.

Worth keeping from writing it: **the first version of the rule was wrong twice, and its
tests caught both.** Matching code-point ranges let `×` (U+00D7, which sits among the
accented Latin letters) decide that `12 × 1.5 L` was a strong LTR string, and let an
Arabic-Indic digit (U+0660–U+0669, inside the Arabic block) decide `١٢ × ١٫٥ لتر` — which
gave the right answer for the wrong reason, the worst way for a rule to be wrong. Matching
`\p{L}` first removes both by construction: a digit is `Nd`, a symbol is `Sm`, and neither
is strong in the Unicode bidi algorithm either.

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

### The catalog is filled — this no longer blocks everything downstream

`offer_books` holds real books now — created, priced and edited through the product rather
than by a script — and `catalog_products` holds **2,140** — 2,041
real products sampled from the Open Food Facts run plus the 99 demo rows — against 970
brands. **The full 61,230-product catalog lives in `packages/db/data/catalog-off.csv`**,
deliberately not in the database: ninety thousand rows cost real money to host in dev and
prove nothing that two thousand do not. The file is what a production environment loads.

**The first run was wrong in a way no test caught**, and both defects are worth knowing
before trusting any earlier figure in this file. `isRelevant` substring-matched the joined
country list, so `"romania".includes("oman")` admitted every Romanian product — ~29,000
rows, a third of the catalog. And a product name was accepted with no letter in it, giving
636 products called things like `0012000057502`. Both are fixed with regression tests, and
the numbers above are from the corrected run. `E5-pending.md` §1 has the detail.

Historic note, kept because it shaped everything above: `pnpm --filter @souqstudio/db catalog:seed-demo` writes them and
`--clear` takes them out again; they exist so the screens and the engine can be *looked
at*, not as a catalog. The layout engine, the block library, the price mark, the fit
ladder and the first renderer are all built and were tested only against products
constructed inside a test. **Both halves of that have since been answered**: the harness
composes real catalog rows, and the editor composes real books. Neither the catalog nor the
editor is on the critical path any more — E9 export is.

**The reader over it now exists, and so does the first way in.** `/catalog` searches and
browses both collections, looks a barcode up, and lets an owner add a product the catalog
does not have — into their own collection, usable immediately, with the review queue as a
separate question. Every query was run against the dev database and executes cleanly; they
all returned zero rows, which is the point.

**The bulk path is built too.** `/catalog/import` takes a CSV, guesses what each column
means, resolves every row against both collections in two queries rather than two per row,
and puts the ones it could not place with confidence in front of the owner. It commits into
the catalog. **Carrying the sheet's prices into an offer book is done** — `/editor/new`
reads a committed import and creates a book already priced, which is the half E5-06 left
open because there were no offer books to carry them into.

**The Open Food Facts seed has been run** — 4,535,569 rows read, 61,230 mapped to
`data/catalog-off.csv`, 2,041 sampled into dev. Kept here because it nearly could not have
been: until 6 September `writeBatch` upserted on a compound unique key containing a null
`organizationId`, which the client rejects at runtime, so any real run would have died on
its first batch. Loading the full 61,230 into a production database is still a decision
rather than a step, and **no reader for that CSV exists yet** — the exporter was written,
the importer for our own format was not.

**The category mapping is done, and it lands 23.4% — not the 93.8% recorded here until
6 September.** `toCatalogCategory` resolves the OFF taxonomy onto the ten names
`pnpm db:seed` publishes, and it was built against a tally of 2.39M real rows rather than a
guess, which is what caught the largest category in the export — `Plant-based foods and
beverages`, 261,377 rows — being filed as a *drink*. But 93.8% was measured over the **top
120 category strings**, which is the well-formed head of a 14,618-value taxonomy and the
head the rules were written against. Counting the 61,230 rows the GCC filter actually kept
gives 14,315 with a category: **23.4%**. Worse, four tiles carry 99.3% of them and **two of
the ten get nothing at all** — Cleaning and Electronics are empty over the whole universal
catalog.

**Third time this epic that a proxy measured against its own head gave an answer four times
too good** — after the `594` barcode prefix (off by 3.7x) and `[[:alpha:]]` on Arabic names.
Counting the real file takes under a second; the expense was assumed, never measured.
Nothing is broken and no code changed — an unmatched row returns null rather than a wrong
category, and stays searchable by name, brand and tag. What changes is that category
browsing cannot be the way into the universal catalog at this coverage. `E5-pending.md` §1
has the per-tile numbers and the fix: read the deeper `categories_en` levels, not just
`firstValue`'s broadest one.

What is still missing: XLSX (a dependency decision, not effort), E5-07 phone capture, and
the camera half of E5-03. The import's match thresholds are unverified against real data.
**Search ranking now has rows to be judged against, and the fuzzy branch already fails
one**: a misspelling inside a longer product name scores under the trigram threshold and
returns nothing at all. Both are written up in `E5-pending.md` §3.

### `R2_ENDPOINT` carried the bucket name — every uploaded object landed unreachable

**Found and fixed locally on 6 September**, while attaching a placeholder image to the demo
catalog. `apps/web/.env.local` had
`R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com/souqstudio-dev` — the bucket as a
path segment — while the code also passes `Bucket: env.R2_BUCKET_NAME`. The SDK treats the
endpoint path as a prefix, so every write went to `souqstudio-dev/souqstudio-dev/…` and the
public URL the app builds (`R2_PUBLIC_URL` + the key it *thinks* it wrote) could never
resolve. `.env.example` documents the correct shape, without the bucket; the local file had
drifted.

Nothing about this is visible from the app: the upload succeeds, the PUT returns 200, and
only the rendered image is missing. It is why "nothing about the write path has been run
against a real upload" stayed true for so long without anyone hitting an error.

**Six objects are still stranded under the doubled prefix** — the logo uploads from two
organizations in August, `logo.png`, `logo-original.png` and `logo-upload` for each. They
were left in place rather than moved: no `brandKit` in the database references them, so
they are orphans either way, and deleting another account's data on a hunch is not this
change's business. Worth a decision.

`.env.local` is gitignored, so this fix is local only. **Check the Railway environment
before deploying** — if it carries the same shape, every logo and product image uploaded in
production is written where nothing can read it.

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

### Brands are an entity, and the admin half of it does not exist

**Built 6 September.** `product_brands` (migration `20260906113346_e5_product_brands`,
additive) with a normalised `slug` as the dedup key, 92 curated UAE brands seeded canonical
and bilingual, resolution wired into both the Open Food Facts importer and the
add-a-product route. `catalog_products.brandId` is nullable and `brandEn`/`brandAr` stay as
the fallback, so an unknown brand never blocks an owner. Detail in `E5-pending.md` §1.

**No logos, by licence.** E5's rule — images from licensed sources or direct brand
permission only — covers logos, which are also trademarks. `logoKey` and `logoSource` are
on the row and stay null until permissioned assets exist; cards fall back to the brand
name, which is what they render today.

**The curation side is unbuilt and this is where it bites.** `apps/admin` has seven route
directories and **zero `.tsx` files** — no screen to merge two spellings, write an Arabic
name, attach a logo, or promote a brand to canonical. Everything the importer creates
arrives `unreviewed`, and the Open Food Facts run will create thousands of them. They are
usable immediately, so nothing breaks; they simply accumulate uncurated until E13 / E5-08
builds the admin auth path against `admin_users` and the screens on top of it.

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

### Three worker handlers throw — blocks E8 and E9

`apps/worker/src/workers/` has five workers. `email` and `bg` are implemented — `bg` now
for logos *and* catalog cutouts. **`pdf`, `ai` and `enrich` are
`throw new Error('Not yet implemented')`.**

- `pdf` blocks E9 export, and with it the editor's export button. **This is now the thing
  on the critical path**: a book can be created, priced and edited, and cannot leave the
  product.
- `ai` blocks E8 entirely, and is where credits are actually spent — `consumeCredits()`
  in `packages/db/src/credits.ts` is written and called by nothing.
- `enrich` blocks E5's multilingual synonym pipeline **and, now specifically, every
  Arabic name in the universal catalog.** The Open Food Facts CSV export has no language
  variants in any of its 211 columns, so every seeded universal product has a null
  `nameAr`, and E5 §2 makes that a publish-time blocker for Arabic editions. Until this
  worker lands the shared catalog is English-only and cannot back an Arabic offer book.
  A shop's own products are unaffected: E5-04 and E5-06 both take `nameAr` from the owner.

**`bg` is now implemented for both.** The catalog branch of E5 §3 is written: a job
carrying `catalogProductId` and `sourceAssetId` produces a cutout, measures it, and writes
an `image_assets` CUTOUT row with `bboxTight` and a `quality` score, `APPROVED` above the
threshold and `PENDING` below it. `quality` is *derived* from the alpha channel — Rembg
reports no confidence — and `apps/worker/src/lib/matte.ts` carries the reasoning and 11
tests. Unverified against a real image: the analysis is tested on hand-built alpha
canvases, and no photo has been through Rembg.

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

**The seed has been run.** 4,535,569 rows read, 61,230 products mapped, 2,041 sampled into
dev. What follows was written before that run and is kept for the reasoning: The write path
that would have killed any real run is fixed and proven on a fixture, the categories resolve
onto the ten at 93.8%, brands resolve into `product_brands` three queries per batch, and the
stream turns out to be far quicker than recorded — 2.39M rows in eight minutes, so the full
export is tens of minutes rather than hours. What remains is only the decision to write tens
of thousands of rows to the shared database. After that, E5-07 phone capture and the camera half of E5-03;
XLSX is a dependency decision waiting on a human.

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
products to place. E6 is not thin without E5; it is impossible. **Both are built now**, and
what a book cannot do is leave the product — that is E9 and E10.

Of the three things E5 §9 says the migration does not carry, **promo-tier seeding is now
done** (§2). The `enrich` worker for synonyms and the cutout branch of the `bg` worker are
still open.

E5-08 catalog admin overlaps E13; build the shop-facing half first.

### E6 — Offer book editor (MVP) — the loop closes

**Read `docs/composition-model.md`, not E6 §2 or §5.** Those sections describe a page-type
grammar that no longer exists; the doc's banner says which parts still stand. Detail and
reasoning live in `docs/E6-pending.md`; this is the summary.

**Built, 7 September.** A shop owner can now:

- **Create a book** at `/editor/new` — title, format, language, and either products picked
  from the catalog or **a committed CSV import, whose prices come with it**. That second
  path is the half E5-06 deliberately left open: it committed rows into the catalog and
  stopped, because there were no offer books to carry the prices into.
- **See it drawn** at `/editor/[id]`. The artboard is inline SVG through the engine —
  `flowBook` pages it, `resolveBlock` places the elements, `compactBlock` reclaims what the
  content did not use at `balance`, and `components/blocks/draw` paints. `/brand` uses the
  same painter, so a card cannot look one way there and another here.
- **Price it** — price, was-price and promo tier in the properties panel, optimistic, saved
  per field on blur. The tier is the only control on the price mark, per E6 §3.
- **Change what is in it** — search and add, remove, reorder, and join a second product to
  an offer with `or`/`and`.

`EDITOR_BUILT` and `BOOK_CREATION_BUILT` are both true. `stores/editor-store.ts` exists.

**What E6 still owns:**

- **Drag** — to reorder in the tray, and from catalog to cell. Reordering is up/down
  buttons today: the design system requires a persistent equivalent for tablet and says
  long-press drag is unreliable on iPad, so the equivalent was built first. Drag is owed.
- **`SlotOverride` handling**, keyed by `regionId` + `offerId` rather than grid position,
  which is what lets a nudge survive next week's product swap. Nothing nudges yet.
- **Master and instances**, and **pins**. The engine models both; nothing authors them.
- **Undo, and autosave.** Saving today is per-field on blur, which is not the same thing.
- **The rest of the properties panel** — unit price, chips, footnotes, legal lines,
  per-item name and spec overrides. Those columns exist and `composeOffer` reads them;
  nothing writes them.
- **`fit-escalated`** as a quality flag. The other three — missing price, missing `nameAr`,
  missing or fallback image — are surfaced per offer and counted in the header.

**No Fabric, and that is a finding rather than an omission.** The epic assumes a canvas
object model; nothing built so far has needed one, because the engine decides every
rectangle and the artboard only paints them. Fabric earns its place when direct
manipulation does — dragging and nudging — and not before. When it lands, two rules from
`apps/web/CLAUDE.md` bite immediately: `document.fonts.load()` for every family *and*
weight before a single text object, and `placeText` per text object, because a canvas text
object takes its own direction and does not inherit the artboard's.

**The risk E6 §10 names has been answered twice.** *"If the engine's output looks like a
real flyer with no manual adjustment, the product works."* Yes on invented data, and yes
again on real catalog rows — see §1.2. It is off the table.

**Needs first:** nothing. The `pdf` worker blocks *export*, which is E9.

### E9 — Output formats & export (MVP)

**Needs first:** the `pdf` worker. E6 is built, so this is the next thing on the critical
path — a book can be created, priced and edited, and cannot leave the product.

**The written pipeline starts one step later than it needs to.**
`souqstudio-technical → references/export-pipeline.md` says canvas → `toSVG()` → HTML shell
→ Playwright, and that first arrow assumes a Fabric canvas to call `toSVG()` on. **There is
no canvas.** The artboard is inline SVG produced on the server by `components/editor/
BookPage.tsx` from engine geometry, so the worker can render the same component and skip
Fabric entirely — which also removes the font-loading hazard, because nothing measures text
in a browser to decide the layout. Confirm that before building to the document.

A warm browser pool is still mandatory; launching per request costs 400–600ms every time.

Two things the export must not lose, both learned the hard way in E6:

- **`placeText` per text object.** A Latin pack label on an Arabic artboard prints backwards
  without it, and the failure is invisible to anyone checking the English edition.
- **`--sq-tpl-*` has no stylesheet in the PDF.** The tier colour on the chip and the price
  mark resolves through a CSS custom property in the browser. Playwright renders an HTML
  shell, so the tokens have to be inlined into it — see `E6-pending.md` §6.

### E10 — Sharing & publishing (MVP for link/QR/WhatsApp)

**Needs first:** the encryption key decision, for the Instagram half only — E6 is built. The
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

### E7 — Block designer — built, 7 September

**The epic was rewritten before it was built**, against `docs/composition-model.md` §3, and
the rewrite is `docs/E7-pending.md` §1. Templates and grids are not objects any more, so
E7-01, E7-02 and E7-04 had nothing left to administer; what survived is the block designer
and the card designer addendum, and **E7-05 — owner-authored blocks, scoped V3 — shipped in
the MVP** because the composition model made it the same code path as a seeded block.

A shop owner can now duplicate a seeded block, move and resize its elements, change what
each one binds to, declare what an overlong string may suffer, undo, and restore a previous
version. The library is `/brand/blocks`; the designer is `/card-designer/[blockId]`.

**Still no Fabric, and this was the surface that was supposed to need it.** Direct
manipulation needs a hit target, a delta and somewhere to put the result; the engine already
owns the arithmetic in fractions and the painter already draws every element. Fabric would
mean a second painter, and the first thing to drift would be whether the card the owner
designed is the card the PDF prints. `E7-pending.md` §3 carries the reasoning and the list
of things that would justify revisiting it.

The rule that did not move: **the price mark is one element the owner places and sizes,
never one they open.** Selecting it shows a box, a size and one sentence saying why there is
nothing else.

**Not built:** dragging a *new* element from the palette (tapping adds it, which is the
tablet-safe equivalent the design system asks for anyway), E7-03 seasonal scheduling — the
columns exist and nothing reads them, and there is no block picker for a seasonal block to
appear at the top of — and the overlay asset library.

### E8, E11 — later

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
