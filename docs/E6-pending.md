# E6 — working notes

What exists, what does not, and the corrections to `docs/E6-offer-book-editor.md` that
building the parts underneath it produced. The epic stays the record of what was asked
for; this file is the record of what happened.

Started 6 September 2026, at the point where both things blocking the editor were cleared
and nothing in the epic itself had been built.

**Read `docs/composition-model.md` before this file, and before E6 §2 or §5.** Those two
sections describe a page-type grammar that no longer exists. The doc's own banner says
which parts of the epic still stand.

---

## 1. What is already built, and it is more than half

None of it is in this epic's feature list, and all of it is E6's foundation. Full detail in
`docs/STATUS.md` §1.2 — the short version, because it decides what is left:

| Piece | Where | State |
| --- | --- | --- |
| Layout engine | `packages/engine` | 144 tests. Tracks, geometry, arrangement, validation, flow, render, price mark, fit ladder |
| Seeded blocks | `packages/engine/src/library.ts` | Four, published by `pnpm db:seed` into `blocks` |
| Price mark | `src/price-mark.ts` | Raised minor, tier tab, three-decimal currencies, never mirrors |
| Fit ladder | `src/fit.ts` | Four rungs, per-source policy, escalation flag |
| Text direction | `src/direction.ts` | `placeText` — x, anchor and direction as one decision |
| Sparse compaction | `src/compact.ts` | Reclaims the height a card's content did not use |
| First renderer | `apps/web/components/blocks/BlockPreview.tsx` | Inline SVG on `/brand`, computes no geometry |
| Render harness | `packages/engine/harness` | Draws pages from dummy products **and real catalog rows** |
| Schema | migration `20260905000000` | `blocks`, `block_versions`, `page_grids`, `book_pins` |

**The engine has been asked E6 §10's question and answered it.** *"If the engine's output
looks like a real flyer with no manual adjustment, the product works."* The harness
composes booklet pages, a cover with a hero band, merged regions and an Instagram carousel
with a pinned message, with no hand-placed element — and since 6 September it does it over
**real catalog rows** rather than only the twelve invented products in `harness/dummy.ts`.
It still reads as a flyer. That was the whole gamble and it is off the table.

**What the real rows changed, and both are now settled**, because STATUS said the editor
was not worth building until they were:

- **Bidi.** Every Latin pack label on an Arabic artboard printed backwards — `2 kg` as
  `kg 2`. `placeText` is the rule and both existing renderers use it. **Fabric and the PDF
  export must call it too**, and that is E6 and E9 work: a canvas text object takes its own
  direction and does not inherit the artboard's. See §3.
- **Sparse cards.** A block's boxes are designed at the worst case and most real rows are
  not the worst case, so about a fifth of a card was void. `compactBlock` reclaims it and
  takes *where the space goes* as a parameter, because that is a design decision the engine
  does not own. **`balance` is the recommendation** — it moves elements and resizes none,
  so every packshot and every price mark is the same size in every cell of a grid. See §2.

---

## 2. Not built — everything in the epic's feature list

`app/(dashboard)/editor/[id]/` contains a single `.gitkeep`. `EDITOR_BUILT` is `false`, so
the left rail does not offer the destination. `offer_books` holds **zero rows** and nothing
in the product can create one. `stores/editor-store.ts` does not exist; `brand-store.ts` is
the pattern to follow.

The only place a page renders today is the harness, from the command line.

### The first slice is not the editor

The editor screen is E6-01 through E6-08 and it is a large surface — artboard, offer tray,
properties panel, undo stack, autosave. Before any of it, something has to be able to
**make an offer book**, and that is a much smaller piece: a book row, its master grid, and
offers pointing at catalog products. Until that exists there is nothing for the editor to
open, and the engine has never been run against a row that came out of the database rather
than out of a literal.

Order, cheapest first:

1. **Create a book.** A row in `offer_books`, a `page_grids` master, no UI beyond whatever
   is needed to trigger it.
2. **Put offers on it** from the catalog, through `Offer` / `OfferItem`.
3. **Render it server-side** with the `BlockPreview` approach — inline SVG, no Fabric. This
   is the first time the engine composes a page from database rows, and it is where the
   composition model gets checked end to end.
4. **Then the editor**, with Fabric, over something that already renders.

Steps 1–3 need no canvas, no Zustand store and no Fabric, and they answer whether the
schema the composition model landed actually carries a book.

### `compactBlock` is not wired to anything

Nothing in the app calls it, so there is no default to regret. The editor passes a policy;
the recommendation from the renders is `balance`, and the comparison pages are
`compaction-{sparse,typical}-{none,image,price,balance}` in `harness/out`. Whether it
belongs on the block, on the book or in the code is the first thing to decide when the
renderer lands.

### The `pdf` worker still throws

`apps/worker/src/workers/pdf` is `throw new Error('Not yet implemented')`. It blocks E9
export and the editor's export path — **but not the editor**, which can be built and
autosaved before anything exports.

---

## 3. Known hazards, carried forward

These are written down elsewhere and are the ones most likely to bite inside this epic.

**Fabric must load fonts before it creates a single text object.** `document.fonts.load()`
for every family *and weight*, or every bounding box is measured against the fallback and
the whole artboard is subtly wrong. The brand kit lets an owner pick from ten families, so
this is not theoretical. `apps/web/CLAUDE.md` has the canvas rules.

**Fabric holds visual state, Zustand holds logical state, and they do not overlap.** Same
file.

**Fabric draws what the engine decides.** `BlockPreview` computes no geometry and neither
should the canvas — two implementations of the same rectangle is how the PDF stops matching
the screen, which is the entire reason `packages/engine` is a package.

**`placeText` per text object.** See §1. The failure is invisible in an English edition.

**Blocked on a decision that is cheapest to take before the editor reads the brand kit:**
the `Brand` entity. `organizations.brandKit` assumes one brand per organization and a GCC
retail group holds several trade licences. `E4-pending.md` §1 has the migration shape.
`lib/brand-inheritance.ts` survives the change; only the level names move.

**The catalog is English-only for Arabic editions.** The `enrich` worker throws, the Open
Food Facts export has no Arabic column, so every seeded universal product has a null
`nameAr`. E5 §2 makes that a publish-time blocker for AR editions — so E6's quality flags
have real work to do on day one, and a shop's own products (E5-04, E5-06) are the only
rows that carry Arabic.

---

## 4. Built so far — the compose path

The first two files of this epic, 6 September. Neither draws anything and neither is
wired to a screen yet.

**`apps/web/lib/offer-book-compose.ts`** — pure, 20 tests. Database rows to what the
engine and a renderer need: the edition's strings with their fallbacks, per-book name and
spec overrides, multi-item offers joined by a localised connector, the price mark through
`toPriceMark`, and the quality flags E6-01 asks for.

**`apps/web/lib/offer-book.ts`** — `server-only`. `loadBook(bookId, organizationId)` reads
a book with its master grid, pins, offers, items, products and images, and returns flowed
pages from `flowBook`. The split between the two is the one `lib/catalog.ts` and
`lib/catalog-display.ts` already make, and it exists because an artboard is a client
component: importing the query layer to reach a display helper pulls Prisma into the
browser bundle, `typecheck` and `lint` both pass on that, and `next build` is what fails.

Four decisions in there worth not undoing:

- **`organizationId` is a filter, not a check afterwards.** The shop is joined through to
  its organization inside the query, so another tenant's book returns null rather than
  returning rows that are then compared.
- **Blocks are read by id and not filtered by `status`.** A book naming a block that has
  since been archived must still render — it is already in print, and a reprint that
  silently drops a region is worse than one drawn from a block nobody would pick today.
- **Arrangements come from `blocks.arrangements`, not `block_versions`.** That table is
  history: `blockId`, `arrangements`, `createdAt` — no version number and no published
  flag. A book pinning a specific historical version is not something the schema can
  express, and inventing it in a reader would be a second answer to a question nothing has
  asked.
- **A grid problem is returned, never thrown.** An overlapping region is an authoring
  mistake the owner can see and fix; refusing to open the book leaves them no way to.

**`createBook(input, organizationId)`** — creates the book, its master grid from
`bookletGrid`, and one offer per catalog product, in one transaction.

- **Every product becomes its own single-item offer.** Grouping two under one price is a
  deliberate authoring action — E6-02's connector — and guessing it at creation produces
  cards nobody asked for.
- **Prices start at zero and are flagged.** `offers.price` is NOT NULL and a catalog
  product carries no price, because a price belongs to an offer. Zero is the only honest
  placeholder; `no-price` is what has to block publishing. A seeded "sensible" price would
  print a number nobody chose.
- **Products are filtered to what this organization can see** — its own rows plus the
  universal catalog — before anything is written. Without it a caller could name another
  tenant's private product and have it rendered into their book.
- **`bookletGrid` lives in the engine**, beside `SEED_BLOCKS`, because the harness draws it
  and `createBook` writes it. A local copy in either would drift, and the drift would be
  invisible: both still render, just not the same page.

### Run against the real database, and what that found

`createBook` + `loadBook` were exercised against the dev database with 11 bilingual catalog
products: 11 offers, **2 pages** (9 cells and a footer on page 0, 2 offers on page 1), no
grid problems, both blocks resolved. Cross-tenant `loadBook` returned null. The AR edition
of the same rows returned the Arabic name. The book was deleted afterwards; `offer_books`
is back to zero.

**The first version could not have survived a real book.** It created one offer at a time
with its item nested, and eleven products took 5,174ms against a 5,000ms interactive
transaction timeout — it failed on the *first* run, at eleven rows. A real book is
hundreds. `createManyAndReturn` plus one `createMany` makes it two statements rather than
one-plus-N. **This is the third time this codebase has learned the same lesson**: the
spreadsheet import fans out over `unnest`, and the Open Food Facts importer resolves brands
three queries per batch. It is worth treating "a loop containing an await on the database"
as a defect on sight.

The returned offers are keyed back to their products **by position, not by the order the
database returned them**. Postgres does return `createManyAndReturn` rows in insertion
order today; relying on it would mean a silently mispaired offer printing the wrong price
against the wrong product if that ever changed — the same failure the CSV parser's paired
arrays guard against.

**A CLI script that imports `@souqstudio/db` never exits.** The package index re-exports
`queue-client`, which constructs BullMQ queues at module load, and ioredis retries a
missing Redis forever. With stdout piped this looks exactly like a hang: the work finishes,
the output sits in the pipe buffer, and nothing is ever flushed. It cost most of an hour.
The existing scripts avoid it by importing `PrismaClient` from `@prisma/client` directly —
which is *why* they work and also quietly contradicts the root `CLAUDE.md` rule against
that import. Worth either splitting the queue exports out of the index or writing the
exception down.

## 5. The artboard, and a way in

Built 7 September. A book can now be created over HTTP and looked at in a browser.

**Routes.** `POST /api/v1/offer-books` creates from catalog product ids;
`GET /api/v1/offer-books` lists the active shop's; `GET /api/v1/offer-books/[id]` returns
the book **composed into pages** rather than as rows — a client re-implementing the
composition is the one thing `packages/engine` exists to prevent. The editor screen does
not call that route: it is a server component and reads `loadBook` directly, the way
`/catalog` reads `lib/catalog.ts`.

**`components/blocks/draw.tsx`** — painting one block element, extracted from
`BlockPreview` at the moment a second surface needed it. `packages/engine` is one
implementation of *where things go*; this is the matching rule for *how they are painted*,
and E9's export worker will be its third caller. `BlockPreview` is now a thin caller that
adapts `PREVIEW_PRODUCT` into the same `ArtboardOffer` shape a real offer arrives in — a
second product type there is how a preview and a real artboard start disagreeing about
what a card shows.

**`components/editor/BookPage.tsx`** — one page, drawn. Inline SVG rather than Fabric, and
that is not a shortcut: Fabric is the editor's renderer, where dragging needs an object
model, and it would drag in `document.fonts.load()` for every family and weight before a
single text object on a screen that has nothing to drag yet.

**`app/(dashboard)/editor/[id]/page.tsx`** — the artboard on `--sq-ui-canvas-surround`,
escaping the shell. It is **the artboard half of E6 and nothing else**: no offer tray, no
properties panel, no selection, no undo, no autosave. Those are deliberately not
scaffolded — an empty tray beside an empty panel would claim the screen was built.

### Two flags, because they became true at different times

`EDITOR_BUILT` is now true and a book row on home opens the artboard. `BOOK_CREATION_BUILT`
is new and false: there is no way to *make* a book from the interface, because choosing
products is the offer tray's job. One flag would have forced a choice between a New button
that 404s and a list whose rows do not open, and both are worse than saying so.

**A test caught the consequence immediately.** `lib/checklist.ts` read `EDITOR_BUILT` to
decide whether its "Create your first offer book" item could link to `/editor/new` — a
route that does not exist. Flipping the flag pointed the checklist at a 404, and
`checklist.test.ts` failed on exactly the rule it was written for.

### What the render found

Verified by rendering `BookPage` to static SVG against a real book — 11 offers, 2 pages,
the seeded offer card and footer, real catalog names.

- **`compactBlock` earns its place on real rows.** Cards with no spec close up; cards with
  one carry it. `balance` is wired as the default, per the comparison in STATUS §1.2.
- **Every price reads `AED 0.00` and every card is flagged.** Correct, and the point:
  `createBook` writes zero because a catalog product has no price, and `no-price` is what
  has to stop it publishing.
- **Two rendering facts that are not defects.** The rasterizer used to look at the output
  (librsvg, through sharp) neither fetches remote `<image>` hrefs nor resolves CSS custom
  properties, so packshots came out blank and every `--sq-tpl-*` fill came out black.
  Substituting the literals put the red back. **Both work in a browser and neither works in
  the PDF pipeline**, which is §6's open question arriving early — E9 will hit exactly this.

### Creating a book — `/editor/new`

Built 7 September, and `BOOK_CREATION_BUILT` is now true. A title, a format, a language and
a catalog search that adds products in the order they are picked; `POST /api/v1/offer-books`
creates the book and the owner lands on the artboard.

**It is not the offer tray, and the difference matters.** The tray lives inside the editor
beside the artboard and does more: reorder by dragging, group two products under one offer
with a connector, add to a book that already exists. This is only the step before it —
choosing what a book *starts* with — and it exists because otherwise nothing in the product
could create a book and the artboard had nothing to open.

**It keeps the dashboard shell**, unlike `editor/[id]`. The design skill's second layout
family escapes the shell because a canvas needs the width; a screen with no canvas on it
has no such claim, and leaving the rail means an owner who changes their mind is one click
from where they were.

**Prices are deliberately not asked for.** Setting eleven of them in a form before seeing a
single card is the wrong order — E6-03 puts them beside the artboard where the owner can
see what they are pricing. Every offer starts at zero and carries `no-price`.

**The same test failed twice in two days, in opposite directions.** `checklist.test.ts`
asserts that an item never links to a route that does not exist. Flipping `EDITOR_BUILT` for
the artboard pointed `first_book` at `/editor/new` before it existed; building
`/editor/new` then made the *assertion* stale, because the item now correctly links. Both
were caught immediately. The item has moved to the paired "links now that it is built" test
beside `invite_team`.

### Still not built

1. **The offer tray inside the editor** — E6-02's other half: reorder, group with a
   connector, add to an existing book.
2. **The properties panel** — E6-03. Prices, tiers, unit price, chips, footnotes. **Until it
   exists every book is priced at zero and none can publish**, which is the most valuable
   thing left in this epic.
3. **Selection, undo, autosave** — E6-04 through E6-08.
4. **Fabric**, for whatever of that needs direct manipulation. Nothing so far has.
5. **Duplicating a book** — the control the design skill expects to be the most-used in the
   product. It needs a copy path that clones offers and items, and neither exists.

### Editing or creating a *block* is not E6 at all

Worth stating because it is the first thing an owner looks for after seeing an offer card
they want to change. `blocks.organizationId` is nullable and null is what makes a block
seeded, so the schema anticipates owner-authored blocks — but there is no designer.
`/brand` renders the four seeded blocks read-only and `app/(dashboard)/card-designer/
[templateId]/` is an empty directory. That is **E7**, which `docs/STATUS.md` §3 says should
be rewritten against `docs/composition-model.md` §3 before it is started, because the
templates and grids it was scoped around no longer exist.

### One gap in the design system, raised rather than answered

**There is no ink token for `--sq-ui-canvas-surround`.** It is the one dark surface in the
product and the system defines no text colour that sits on it. The page caption is on a
light chip rather than directly on the surround, which uses only tokens that exist. A real
answer is a token decision, not an inline one.

---

## 6. A promo tier's colour is not a block's colour, and nothing maps between them

Found while writing `composeOffer`, and it typechecks in the wrong direction, which is why
it is worth writing down.

`PromoTier.tokenRef` is a **template token** — `--sq-tpl-offer-red`,
`--sq-tpl-save-yellow`, seeded in `packages/db/src/promo-tiers.ts`. A block element's
colour is a **`TokenRef`** — `primary | secondary | accent | surface | ink | inkMuted`,
which are binding slots the shop's brand kit resolves.

The two vocabularies do not overlap. `tier.tokenRef as TokenRef` compiles and yields a
string no palette contains, so the chip renders with no fill at all or with whatever the
renderer's fallback is.

**Both are right, and that is the point.** A block names a slot because a seeded block has
to name a colour before it has met the shop. A promo tier names a fixed system colour
because a "Half price" flash that comes out sand on one account and navy on another stops
reading as a discount — and the design system already separates the two namespaces for
exactly this reason: `--sq-ui-*` is chrome, `--sq-tpl-*` is offer book content.

`ComposedOffer.tierToken` is therefore a plain `string` carrying the `--sq-tpl-*` name as
written. **What does not exist is the resolver.** The harness sidesteps it by giving its
dummy tiers a `TokenRef`, and `BlockPreview` never draws a tier at all. Whichever renderer
draws a real book first has to resolve `--sq-tpl-*` against the template token set, and
that is a decision — a CSS custom property works in the browser and not in the PDF
pipeline, which has no stylesheet.

---

## 7. Corrections to the epic

Recorded here rather than edited into `docs/E6-offer-book-editor.md`.

- **"What is not written" is out of date on three of its five items.** The layout engine
  exists and is tested; brand kit fonts are implemented and pickable; the price mark and
  fit ladder are done. `stores/editor-store.ts` and the `pdf` worker are still accurate.
- **The build order's steps 1–3 are complete.** "Price mark component + promo tiers",
  "template schema + engine placement" and "card variants + fit ladder" are all built and
  tested — with the caveat that "template schema" is now the block schema, per the
  composition model. The remaining order starts at step 4, the Fabric override layer.
- **Step 1's "everything else renders around it" held.** It is worth keeping: the price
  mark was built first and every arrangement in the seeded library is laid out around its
  box.
