# E6 — working notes

What exists, what does not, and the corrections to `docs/E6-offer-book-editor.md` that
building the parts underneath it produced. The epic stays the record of what was asked
for; this file is the record of what happened.

Started 6 September 2026, at the point where both things blocking the editor were cleared
and nothing in the epic itself had been built. **Finished on 8 September**, when the last
of the epic's feature list landed — see §8, which is the section to read if you are picking
this up now.

**The front of the epic was rebuilt on 10–12 September and that is a separate document:
`docs/E6-create-flow.md`.** Creating a book, the page background, the layout controls and
the editor's tool rail all live there, along with the four defects the rebuild uncovered.
This file remains the record of the epic as it was originally built out.

**§2 below is stale on purpose.** It describes the state on 6 September, when the editor
did not exist, and it is kept because the order it argues for is the order that worked. §5
and §8 are the current record.

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

## 2. Not built — everything in the epic's feature list *(written 6 September; superseded)*

**All of this is now built.** Kept because the argument in "the first slice is not the
editor" is what the build actually followed, and because the reasoning about *why* the
canvas came last is still the reason there is no Fabric anywhere.

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

### Pricing — E6-03, the half that unblocks publishing

Built 7 September. `PATCH /api/v1/offer-books/[id]/offers/[offerId]` sets price, was-price
and tier; `components/editor/OfferProperties.tsx` is the panel; `stores/editor-store.ts`
holds selection and the optimistic copy of each offer; cards on the artboard are selectable.

- **Money is a string end to end.** The route validates the *text* — `^\d{1,8}(\.\d{1,2})?$`
  — rather than taking a number, so `12.345` is refused instead of silently rounded and
  nothing routes through a float on its way to a `Decimal(10,2)`.
- **The tier is the only control on the price mark**, per E6 §3. No font size, no badge
  text. Owners given those produce hundreds of inconsistent price treatments in a month.
- **A tier is checked against the organization** before it is written. `offers.promoTierId`
  has no tenant column of its own, so without that check an owner could point an offer at
  another organization's badge.
- **Optimistic, and a failure reverts one field rather than the batch.** The design system
  is explicit: an owner changing eleven prices must not wait on a round trip per field. The
  store carries a `failed` *set* rather than a single id, because two of eleven can fail and
  reporting only the most recent hides the other.
- **The flag count comes from the store**, so it drops as prices are entered rather than
  waiting for a reload.
- **The panel stubs nothing.** Unit price, chips, footnotes and legal lines are all E6-03
  and are absent rather than drawn empty — an empty "Chips" section that does nothing reads
  as broken, where its absence reads as unbuilt.

**A real bug, found by running it and not by a test.** `Decimal.toString()` drops trailing
zeros, so a `comparePrice` column holding `32.00` arrived as `32` — and `PriceMark.comparePrice`
is documented as *already formatted*, so it printed `32` struck through beside `24.50`. On a
flyer that reads as a typo. The offer price was never affected because `splitAmount` does its
own `toFixed`; only the was-price passes through. `formatMoney` now applies `minorDigits`,
which is also what gets KWD its three decimals. Two tests.

### The offer tray — E6-02, and the three panes are up

Built 7 September. `components/editor/OfferTray.tsx` in the start pane: catalog search that
adds a product to an existing book, remove, and reorder. `POST` and `PATCH` on
`/api/v1/offer-books/[id]/offers`, `DELETE` on `.../offers/[offerId]`.

**`@@unique([bookId, position])` is what makes reordering hard, and it is worth keeping** —
without it two offers can claim the same slot and which page each lands on is decided by
whatever `orderBy` does with a tie. Two consequences:

- **Reorder writes in two passes.** Writing the new positions directly collides the moment
  any offer moves into a slot another still holds, which is every reorder that is not a
  no-op. The first pass parks every row at `-position - 1` — negative numbers are safe
  because `position` is a non-negative index everywhere else, so nothing legitimate can be
  sitting there — and the second writes the real order. Both are single statements: the
  second fans out over `unnest` with paired arrays, the same shape the spreadsheet import
  uses.
- **Delete closes the gap it leaves**, in the same transaction and in one statement. Every
  later row moves *down* into a slot the row before it has already vacated, so this one
  needs no parking pass — Postgres checks a unique constraint at statement end, not per
  row. `position` therefore keeps meaning "nth in the book" rather than "some increasing
  number".

**Verified against the real constraint**, not reasoned about: moving the last offer of
eleven to the front (which collides on every single position), then deleting a middle offer
and checking the result is dense 0..n-1.

**The whole order is sent, not a move.** A `{from, to}` request has to be applied to the
order the server currently holds, and two tabs reordering the same book would interleave
into something neither owner asked for. Sending the full list makes the last write win,
which is at least an order somebody chose — and a list that does not match the book's
current offers is refused with a 409 rather than half-applied.

**Reordering is not optimistic, and prices are.** A price is independent of every other
offer, so a failure reverts one field. A move changes what every *other* offer's position
means, and a failed optimistic reorder would leave the tray and the artboard describing
different books. So a move goes to the server and the page re-renders.

**Reordering is buttons, not drag** — the epic says drag, the design system says every
hover-revealed affordance needs a persistent equivalent because the editor ships on tablet,
and that long-press drag is unreliable on iPad. Buttons are that equivalent, and keyboard-
operable for free. **Drag is still owed.**

**Selection now survives a re-hydrate** of the same book, so adding or moving a card does
not close the properties panel under an owner who was pricing it.

### Multi-item offers — *"Pesto Rosso **or** Pasta Sauce Basilico"*

Built 7 September. `POST` and `DELETE` on
`/api/v1/offer-books/[id]/offers/[offerId]/items`; the tray joins a search result onto the
selected offer with `or` or `and`, and the properties panel lists the products and removes
one. `composeOffer` has rendered this since the compose path was written — nothing could
author it until now.

**`ComposedOffer` now carries `items` as well as `name`.** The artboard draws one string
because a multi-item offer is *one card*; the panel needs them apart to remove one. Two
shapes of the same fact, and the card's is the derived one.

**Removing item 0 is allowed, and it is the case that needed care.** Item 0 supplies the
brand lockup and the packshot — that is what item 0 *means*, not a property of a particular
row — so removing it hands both to whatever was second. Three things happen in one
transaction: the row goes, the positions close up, and **the new item 0 has its connector
set to null**. Without that last statement the card prints a leading `or Frozen Shrimp
Peeled`, because a connector renders *before* its item. Verified by doing it against the
database and reading the composed name back.

**Removing the last item is refused**, with a sentence. `composeOffer` throws on an offer
with no items and rightly: an offer with no product is a price attached to nothing.
Removing the last product is *deleting the offer*, a different action with its own control
in the tray, and quietly turning one into the other is worse than saying so.

**Four products per offer.** `plans.maxProductsPerBook` bounds a book; this bounds the
*card*. Past a handful of names joined by "or" the card stops being a card and the fit
ladder is shrinking type to fit a paragraph.

**Two words, not a dropdown.** The connector choice is binary, and naming both costs less
than a control that has to be opened to find out what is inside it.

### Still not built *(as of 7 September — every numbered item was built on 8 September)*

1. **Drag to reorder**, and drag-from-catalog-to-cell with its tap-then-tap equivalent.
2. **Changing a connector** after the fact, and reordering items within an offer. Adding
   and removing exist; the `OR`/`AND` on an existing item is fixed at the moment it is
   added.
3. **The rest of E6-03** — unit price, chips, footnotes, legal lines, per-item name and
   spec overrides. The override columns exist on `offer_items` and `composeOffer` reads
   them; nothing writes them.
3. **Slot adjustment, undo, autosave** — E6-04 and E6-06 through E6-08. Selection exists;
   nudging within a slot, an undo stack and debounced autosave do not. Saving today is
   per-field on blur, which is not the same thing.
4. **Fabric**, for whatever of that needs direct manipulation. Nothing so far has.
5. **Duplicating a book** — the control the design skill expects to be the most-used in the
   product. It needs a copy path that clones offers and items, and neither exists.

**Read §8 for what happened to each of them.** Item 4 is the one that did not: nothing has
needed Fabric yet, including the block designer, which was the surface that was supposed to
settle it.

### Editing or creating a *block* is not E6 at all — and E7 built it

Worth stating because it is the first thing an owner looks for after seeing an offer card
they want to change. `blocks.organizationId` is nullable and null is what makes a block
seeded, so the schema always anticipated owner-authored blocks.

**Built on 7 September as E7**: `/brand/blocks` is the library and
`/card-designer/[blockId]` is the designer. The epic was rewritten against
`docs/composition-model.md` §3 first — the templates and grids it was scoped around no
longer exist — and the rewrite is `docs/E7-pending.md` §1. Two things from it land back
here: an owner can now design the block their offer cards use, and `TextOverflow` means a
block can declare what an overlong name may suffer rather than leaving it to `fitPolicy`'s
default.

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

---

## 8. Closing the list — 8 September

Everything §5's "still not built" enumerated, except Fabric, which still has no reason to
exist. What follows is what each one turned into, and the three decisions inside them worth
not reversing.

### E6-03 is complete

The panel was price, was-price and tier. It is now also:

- **Unit price**, `AUTO` / `MANUAL` / `HIDDEN`. `deriveUnitPrice` in `@souqstudio/types`
  does the pack maths — `price ÷ (packSize × packCount)`, normalised to kilograms, litres
  or pieces — and `MANUAL` reads the value frozen on the offer, which is what E5 §4
  requires so a reprint reproduces the number that was printed rather than recomputing
  against pack data since corrected. **It says so when it cannot answer**: 4.2% of the
  catalog carries a pack size, so "no line" is the ordinary outcome and an owner deserves
  to know it is the product that is missing one rather than the control that is broken.
- **Chips** — `Limit 2`, `Product of UAE` — with kind, both languages and an anchor.
- **Footnotes**, with `PAGE` / `BOOK` scope and **no marker number stored**, per E6 §8.
- **Legal lines** — deposits and service fees, under the card rather than as footnotes,
  because they are part of the price rather than a caveat about it.
- **Per-item name and spec overrides**, both languages, writing to `offer_items` and never
  back to the catalog. An empty box clears the override and restores the catalog's own
  name — not an override to the empty string, which is a card with no name on it.
- **Changing a connector** after the fact, and reordering the products on a card.

**The connector belongs to the slot, not to the product**, and that is the rule that made
reordering answerable. "Pesto Rosso **or** Pasta Sauce" reordered is "Pasta Sauce **or**
Pesto Rosso": the joining word describes the relationship between neighbours, so it stays
where it is while the names move through it. Carrying it with the item leaves the new lead
holding an "or" and the new second holding nothing, and the only way out is to invent a
word the owner never chose.

### Two of those controls produce data nothing can draw yet, and one does

This is the finding worth carrying, because it is an E7 question rather than an E6 one.

A card is drawn from a **block**, and a block's elements are the fixed vocabulary in
`docs/composition-model.md` §3.1: image, text, priceMark, chip, logo, shape. So:

- **Chips draw**, because a block already carries a `chip` element and it is an anchor. The
  tier draws in the box the block gave it and authored chips stack below, one box height
  apart, aligned to the slot's start or end by their own anchor. **That stacking is a
  rendering decision taken here**, not something the model states; the alternative is a
  `chipStack` element kind, which is the block designer's question.
- **The unit price line and footnote markers do not draw**, because there is no element to
  put them in. Both are stored, both are shown in the panel, and neither reaches the
  artboard. Inventing a place for them on the card would be inventing block geometry from
  inside the editor, which is exactly the layering the composition model exists to prevent.

**The recommendation, for whoever picks this up:** two new element kinds in `BlockElement` —
`unitPrice` and `footnotes` — placed in the block designer like any other. That is a change
to `packages/types`, the painter, the zod mirror in `lib/block-document.ts` and the E7
palette, and it is an architecture decision rather than a fix, so it is raised rather than
taken.

### E6-04 — bounded overrides, and the key that survives next week

`packages/engine/src/override.ts`, 16 tests. `SlotOverride` is **rekeyed to `regionId` +
`offerId`**, as `docs/composition-model.md` §10 said it should be, and the panel has four
arrows, an image scale and "put it back where the layout puts it".

The bound is the feature. E6 §1: unbounded free positioning is what turns week 33 into a
rebuild, because a hand-placed card cannot survive the list changing under it. A *delta*
can — it is re-applied to whatever the engine produces next week, and it matches on both
halves of the key or not at all. **A nudge is never inherited by whatever moves into that
region**, which is the single test that says why the key carries the offer.

Three smaller decisions inside it:

- **The offset moves the whole card, not its elements.** An owner nudging means "this one
  sits low in its cell", not "the price has moved relative to the name" — and a per-element
  offset *is* the unbounded positioning the epic refuses.
- **The image scales about its own centre.** Scaling from the origin drags the packshot
  into the corner, which is what the owner reaching for the control was trying to fix.
- **Applied last, after compaction**, on the rectangles something is about to draw.
  Compaction changes the boxes; an override applied before it would be measured against
  boxes that no longer exist.

Everything is clamped twice — once by the route and once on the way out of storage. Storage
is not a trust boundary: a row written before a limit changed must not be able to move a
card out of its region.

### E6-06 and E6-08 — undo, redo, autosave

Fifty steps, Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, two buttons, and "Saved 14:32" in the header.

**The stack holds logical operations, not object diffs.** The epic said so when the editor
was expected to be a Fabric canvas, and the reason outlived Fabric: what an owner wants
back is *the price I just changed*, not a rectangle. A step carries the patch that puts it
back, and undoing re-issues it through the route the edit went out on — so the server ends
up in the state the artboard is already showing rather than in one only the client believes
in. Undoing selects the card it changed, which is most of what makes it legible.

Two details that are easy to get wrong and are tested:

- **The stack survives a re-hydration of the same book.** The editor re-hydrates whenever
  the server component re-renders — after adding an offer, after a reorder — and clearing
  history there would take away the undo for the price typed thirty seconds ago. It clears
  on a different book, and drops steps whose offer is gone.
- **The keyboard shortcut is ignored inside a text field**, where the browser's own undo is
  what the keystroke means.

Autosave is debounced two seconds and only ever commits a *valid* value, so `12.` on the
way to `12.50` never lands as an error nobody asked for. Blur still commits immediately.

### The rest

- **Drag to reorder in the tray**, with the up/down buttons kept — they are not a fallback,
  they are the tablet path the design system asks for, and long-press drag is unreliable on
  an iPad. HTML5 DnD gives the drag image, autoscroll and escape-to-cancel for nothing.
  The whole order is sent, never a `{from, to}`: two tabs reordering against different
  starting states interleave into an order neither owner chose.
- **Duplicating a book.** The copy takes the grids, pins, page rows with their nudges, and
  every offer with its items, chips, notes, legal lines and prices. It takes **nothing that
  makes a book public** — a fresh short code, no link, no password, no expiry, no views,
  and the status back to `draft`. Two books at one public address is a defect that ends with
  the wrong flyer behind the QR code on a shop door.
- **`fit-escalated`.** The other three flags are decidable from the rows; this one is a
  property of a *rendered* card at a particular size, so `BookPage` reports it and the store
  merges it in. It runs **the same `fitTextElement` the painter runs, on the same boxes**,
  which is why the flag and the drawn card cannot disagree — a second ladder beside the
  first would be two answers about one card.
- **The master grid is editable**, which is E6-07's density switch in its current form:
  cards across and rows down, with the page count under it as feedback rather than as a
  setting. Density is not a control — a 2×2 page *is* showcase — so there is one input and
  the density follows.
- **Pins.** `book_pins` finally has a writer. The form asks for a page and a *shape* — a
  band, half a row, the whole page — rather than four coordinates, because the composition
  model is explicit that owners should not be asked for columns and rows as numbers. Only a
  block that does not repeat may be pinned: a repeating block reads the offer it was given,
  and a pin has none.

### What is left, and it is smaller than what went

1. **Dragging track edges**, which is the half of composition model step 4 still owed.
   Merging is built (§10); track sizes are not. Every `fr` is 1 and only the *count* is
   editable, so a page is rows of equal cards. `resolveTracks` has taken arbitrary `fr`
   values since it existed — what is missing is the drag and a writer for `cols`/`rows`.
2. **Detaching a page from the master**, §5's "customize this page only" — **mostly
   overtaken.** A page now keeps its own merged cells and its own paper without detaching
   anything, which is what "customize this page" turned out to mean in practice. What is
   still shared is the track count and the running bands: there is no way to give page one
   two cards across while the rest have three. Nobody has asked for that, and it should
   stay unbuilt until somebody does.
3. **Drag from the catalog onto a cell.** Adding is a button; the cell is not a drop target.
4. **The two element kinds above**, without which the unit price and footnotes are stored
   and not printed.
5. **`ImageAsset` swapping** — E6-04 lists "swap to another image on the same product", and
   `SlotOverride.imageAssetId` carries it. The panel has no picker, because a product with
   several approved variants is not something the catalog produces yet.
6. **Fabric**, still. Nothing has needed it: the block designer does direct manipulation
   over the same painter, and a second painter is how the PDF stops matching the screen.

---

## 10. Merging cells — 12 September

Composition model step 4 said a page is a spreadsheet: cells merge into regions,
rectangular only, and a hero is a merged 2×2. The engine had handled merges since it
existed — `spanRect` draws one, `validateGrid` refuses an overlapping one — and nothing
in the product could author one. Now the artboard can.

**The gesture is a spreadsheet's, because the model already was one.** One hit target per
cell, click to anchor, shift-click or drag to extend, and the span that comes out is
always a rectangle. A selection that half-covers an existing merge grows to swallow it
whole, exactly as Excel does, because there is no L-shaped merge to make from an L-shaped
selection. `expandSpan` in `packages/engine/src/merge.ts` is that rule, and it is a
fixpoint rather than a single pass: absorbing one merge can bring the selection into
contact with a second.

**The hard part was not the geometry, it was surviving a rebuild.** `PATCH .../grid`
rebuilds the master from scratch on every edit — deliberately, since hand-patching tracks
and regions in place is how a grid ends up internally inconsistent — so anything that is
not an *input* to `composeGrid` is discarded on the next change. A merge stored only as
the shape of a region would have survived until the owner next touched the page margin
and then quietly stopped being a hero, with nothing in the interface saying why.

> **Superseded the next day.** Merges moved off the master onto `offer_book_pages.merges`
> when it turned out an owner wants a hero on *one* page — see "Merging moved onto the
> page" below. The paragraph that follows describes the first design and is kept because
> its reasoning about the rebuild is still why merges cannot live in `page_grids`.

So merges are part of `GridChoice`, and `readGridChoice` derives them back off the
regions. That is the same seam, and the same reasoning, that already stops the track-count
select from resetting the offer card: **derived from the regions rather than stored
beside them**, because a `page_grids` row already says which cells are one region and the
copy nothing renders from is the one that goes stale. There is no migration and no new
column. `offer-book-grid.test.ts` holds the round trip — merge, change the margin, change
the bands, and the hero is still there.

**Body-card coordinates, not grid coordinates**, for the reason `offerRegions` already
counts body rows: adding a header band must not renumber a merge any more than it
renumbers a nudge. And a merged region takes **the id of its start cell**, so merging
`r0c0` with `r0c1` leaves a region still called `r0c0` and the nudge made on that card
before the merge still finds it. The absorbed cells' nudges orphan, which is what
`findOverride` not matching already means everywhere else.

**A merge that no longer fits is dropped, never clipped.** Going from four across to two
leaves a merge describing cells that do not exist; clipping it would hand the owner a 2×1
band where they had drawn a 2×2 hero, and they would find it on a printed flyer. This is
the same answer the route already gives for orphaned nudges.

### Three things worth knowing

- **`masterCells` is new, and it is not `flowBook`'s placements.** A placement exists only
  where an offer landed, so an editor driven by them could not address the empty cells at
  the end of the last page — which is exactly where a hero goes. It returns every flowing
  cell of the master with its rectangle, and both it and `flowBook` now take their tracks
  from one `resolveGridTracks`, so a selection ring cannot land a few pixels off the card
  it is meant to be around.
- **`cardFit` had to start checking every shape.** It read the *first* flowing placement
  on page one, which was correct for exactly as long as every flowing region was the same
  rectangle. A hero and the cards beside it are one block at two shapes, and the seeded
  cards carry `TALL` and `WIDE` with nothing between — so reading only the first would
  report on whichever came first in reading order and stay silent about nine stretched
  cards below it.
- **The selection ring is drawn on every page, and that is the teaching.** One master is
  instanced on every body page, so merging two cells on page one merges them on all nine.
  An owner who sees the ring appear on every page has been told that before they press the
  button rather than after. The panel says it in words as well.

### What it is not

- **Not undoable with Cmd+Z.** `EditorStep` is keyed by `offerId` and the stack is
  filtered by it on every hydrate; a merge belongs to no offer. Every other grid control —
  track count, margin, bands, background — is outside the stack for the same reason, so
  this is consistent rather than a gap, and Unmerge is the inverse gesture one click away.
  A layout history is its own piece of work and should be raised as one.
- **Not optimistic.** Every rectangle on the artboard comes from the engine running over
  the stored master, so painting a merge before the write landed would mean a second
  layout engine in the client — the thing this editor has avoided since it was built. The
  buttons disable while the write is in flight.
- **Not a per-cell card.** ~~Every flowing region still draws the same block.~~ **Built on
  13 September** — see "A block per cell" below. It went exactly the way this predicted:
  `readGridChoice` reads the card off the first flowing region, so the seam had to be
  widened, and the choices live on the page rather than in the rebuilt grid. What a merged
  region does *without* a choice of its own is unchanged — the same block at a different
  aspect, with `pickArrangement` picking the arrangement for it.

### The defect that use found, and reasoning did not

Merging shipped green: the span algebra had twenty tests, the round trip through
`readGridChoice` had six, and the whole chain was simulated end to end. It was still
broken the first time anyone pressed the button, and the failure looked exactly like the
feature not working at all.

**The editor offered every master cell on every page, including the ones that page had
already given to a pin.** The dev book carries a `blk_season_back_to_school` band pinned
across the top row of page one. Selecting the two top-left cells there and pressing Merge
wrote the merge, rebuilt the grid, stored `r0c0` spanning two columns — and page one
looked identical, because page one draws the pin on that row. The merge was real and
landed on the one page that could not show it. The owner's evidence said the button did
nothing.

`flowBook` already knew: it filters `openRegions` by pin intersection and always has. It
simply never told anyone, because until cells were selectable nothing downstream needed
to know *which* regions a pin had displaced — only how many were left, which is
`capacity`. So `FlowPage` now carries `pinnedRegionIds`, and the cell layer draws neither
a hit target nor a hairline for them. They stay mergeable from any other page, because a
merge is a master edit and the cells exist on all of them; what they are not is selectable
*there*.

Two things are worth keeping from this:

- **A master cell and a drawn cell are not the same thing**, and the gap between them is
  exactly one pin. `masterCells` was built to include cells with no *offer* — the empty
  tail of the last page — which is right. Cells with no *room* are a different absence and
  needed a different answer.
- **Every test asserted on the grid, and the bug was in the page.** The engine was correct
  at every step; what was wrong was which of its outputs the interface put in front of the
  owner. No amount of further testing of `mergeSpan` would have found it.

### Two more the browser found, and the tests could not

The pinned-row defect above was the first of three, and all three needed a real browser
driven against a real book. The engine was correct throughout; every failure was in what
the interface put in front of the owner, or in when it put it there.

**The nine seconds.** `useGridPatch` clears `busy` when the *fetch* resolves, but
`router.refresh()` is not awaited — so pressing Merge re-enabled every control
immediately and then the page sat unchanged for **nine seconds** while the server rebuilt
the grid and re-flowed the book. There is no interpretation of that available to an owner
except that the button is broken. The fix is a `pendingCells` flag that survives the fetch
and is cleared by the *arrival of the new grid* (`layout.merges` is a fresh array on every
server render), driving the Button's own `loading` state. Measured after: spinner for the
full 6.8s, cleared the frame the new cells land.

This is worth generalising. **Every control in this panel has the same seam** — track
count, margin, bands and background all patch and refresh, and all of them report `busy`
against the fetch rather than against the repaint. They are less visibly wrong only
because a select keeps showing the value you chose while a page does not.

**`variant="ghost"` is not a button on a tinted block.** "Add to selection" rendered as
bold text with no border and no ground, sitting beside two outlined pills — it read as a
heading, and nothing about it invited a press. It was reported twice as "not working" when
it worked correctly every time. Off it is now `secondary`, an outlined pill like its
neighbours; on it is the one primary in the panel, because blue carries active state.

The lesson is not "ghost is wrong". It is that a variant is only legible relative to what
sits next to it, and `component-inventory.md` cannot encode that. It is a screenshot
check, and it took a screenshot to see it.

### Merging moved onto the page — 12 September

The composition model said one master grid is instanced on every body page, and that
merging two cells therefore merges them on all nine: *"One merge gesture styles nine
pages, which is what anyone actually wants. Nobody hand-merges cells nine times."*

**That is not what anyone actually wanted.** The first thing tried in the built editor was
merging two cells on page one, and the report was that page two had changed too — twice,
before it was clear this was the design rather than a defect. A hero belongs to the page an
owner put it on.

So merges came off the master and onto `offer_book_pages.merges`:

- **The master still owns everything else** — cards across and down, the margin, the
  running bands, the paper. Those are the book's, and changing one still changes every
  page at once. Merging is the single exception, and it is the one an owner makes while
  looking at a particular page.
- **`composeGrid` went back to one region per cell.** It writes the grid every page starts
  from and nothing more. `mergeRegions` in the engine applies a page's merges to that,
  and `flowBook` calls it per page.
- **The flow does not restart at a merge.** One cursor runs over the whole book and asks
  each page only for its own cells, so a page holding a merged hero holds one card fewer
  and the products carry on onto the next page. That was the owner's own phrasing —
  "grid flow the continuity" — and it is the property that keeps a merge a layout decision
  rather than a pagination one.
- **`FlowPage` now carries `cells` and `merges`.** Neither is derivable from the master any
  more, because the master does not know what a page joined. `merges` is carried rather
  than read back off `cells` because a merge sitting under a pin has no cell on that page,
  and an editor reconstructing the set from what it can see would silently drop it.
- **A selection belongs to a page.** The store holds `cellPage` beside the two corners, a
  shift-click on another page starts a new selection rather than spanning a page break, and
  only the owning page draws a ring. The panel names the page in words — "This changes page
  1 only" — because an owner three pages down cannot see which page is about to change.

`cardFit` widened again with it: it now checks every flowing placement in the *book*
rather than on page one, because page one's shapes no longer say anything about page two's.

### What this leaves open

- **Per-page background.** The owner asked for this in the same breath — "if they want to
  change the bg they can change even a particular page". The mechanism is now in place:
  `offer_book_pages` is the row, and `PATCH .../pages/:index/merges` is the shape the route
  would copy. `page_grids.background` stays the book's default; a page column would
  override it. Not built.
- **Nothing migrates.** Every master grid in the database held one region per cell already,
  so the column was added empty and no grid needed unpicking.

### Per-page background — 12 September

The same request as per-page merging, in the same breath: *"if they want to change the bg
they can change even a particular page"*. `page_grids.background` stays the book's default;
`offer_book_pages.background` is what one page says instead.

**Three answers, not two, and that is the whole design.** Absent is "this page draws the
book's ground". A stored `null` is "this page is plain paper *although* the book has one".
An object is the page's own. Without the middle answer an owner could put navy on a book
and never take it off a single page, which is exactly the thing they would want on a page
carrying a photograph.

**The value is wrapped — `{ background: … }` — because Prisma's two JSON nulls read back
identically.** `Prisma.DbNull` makes the column NULL and `Prisma.JsonNull` stores the JSON
value `null` in it, and both come back to the client as `null`. The grid route already
carries a comment about this trap for the book's own background; here it would have
collapsed "inherit" and "none" into one state. One level of nesting makes the distinction
survive the round trip, and `readPageBackground` is the only reader.

**`backgroundSchema` moved to `lib/offer-book-background.ts`.** Two routes now validate the
same union — the book's and the page's — and a second copy is how they start disagreeing
about what a gradient may contain. The disagreement would surface as a background an owner
set and cannot see.

### Three places this had to reach, and two of them are easy to miss

- **The preview.** `BookPreview` drew one background on every page. An owner who gives page
  three a dark ground and opens the preview to check it has asked precisely the question
  that screen exists to answer, and it would have answered wrongly. It takes
  `pageBackgrounds` now. **The lookup is `index in map`, never `?? book`** — nullish
  coalescing would hand a page set to *none* the book's ground straight back, collapsing
  the three states to two at the last step.
- **Duplicating a book.** `duplicateBook` copied `slotOverrides` and would have dropped
  both `merges` and `background`, so "duplicate last week" would have meant "duplicate the
  products" and left the owner re-laying out nine pages — the work the button exists to
  avoid. Both copy now.
- **E9's export, when it lands.** It renders the same `BookPage` component, so it inherits
  this for free *provided it is given the per-page values rather than `layout.background`*.
  That is one prop, and it is the kind of prop a worker quietly does not pass.

### What is still the book's

Cards across and down, the margin, the running header and footer, and the default paper.
Those change every page at once, which is right: they are the shape of the book. Merging
and the paper are the two things a page may now disagree about, and both were asked for by
the person using it rather than designed in.

### A Page tab, and the tool rail regrouped by scope — 13 September

The rail was Offers, Layout, Background, Pins, and its own doc comment described those as
*"what is in the book, how the page is shaped, what the page looks like, and what is
parked on one page"* — one content tab and three design tabs, presented as equals. The
design skill says something different and says it plainly: **"The start pane is an offer
tray, not a placement palette."** The rail, added later to match the block designer's, is
where the editor drifted from that.

**The parity argument that justified it does not hold on inspection.** The card designer's
rail is homogeneous: every entry in `card-designer/ToolRail.tsx` inserts an element. One
verb, fifteen nouns. The editor's was four unrelated kinds of thing wearing the same
clothes. They looked alike and were not, and canvas parity is about how a surface *behaves*
rather than how many icons are stacked on its edge.

**The sharper problem was self-inflicted.** Merging and the page background are both
page-scoped, and they had grown two different ways of asking which page: merging took it
from the cell you clicked, the background from an "Applies to" dropdown added inside the
Background tab the day before. Two mechanisms, one question, in two tabs, one of which also
held book-wide settings.

So the rail is now grouped by **scope**, which is the question an owner is actually
answering:

| Tab | Scope |
| --- | --- |
| Offers | What is in the book |
| Layout | The book's shape: across, down, margin, running bands |
| Background | The book's default paper |
| **Page** | **This page: its own paper, its merged cells** |
| Pins | What is parked on one page |

`PagePanel` names the active page once at the top and everything below it is about that
page. **Clicking any cell on the artboard sets it**, because the page an owner is working
on is the page they just touched; the select is the tablet-reachable equivalent and the
same control `PinsPanel` already uses. The "Applies to" dropdown is gone, and Background is
the book's default again — which is what it was before per-page paper existed.

The cell grid and the merge gesture moved from the Layout tool to the Page tool with the
controls, so the hairlines now appear with the tab that names them.

### Still open on this

- **Pins is page-scoped too** and keeps its own "On page" select, so there are still two
  notions of which page in the editor. Folding it into `PagePanel` is the obvious next
  move; it was left alone because it also *lists* every pin in the book, which is a
  different job from editing one page, and no one has complained about it.
- **The principled end state is different again.** Three panes — tray, artboard, properties
  — with page and book settings living in the properties pane when nothing is selected,
  which is the documented model and the standard canvas pattern. It collides with the
  cell-click-also-selects-the-offer coupling, and E9 export is still the only thing on the
  critical path, so it is written down rather than built.

### A block per cell — 13 September

Every flowing cell drew the book's offer card. Merging changed a cell's *shape* and the
card re-laid itself out through `pickArrangement` — which looks like a different design and
is not one. The ask was plain: *"sometimes they want to add a brand block or something."*

**The engine needed nothing.** `Region.blockId` has been per region since the composition
model was written, and `flowBook` has always rendered whatever a region names. What was
missing was somewhere to author it that a grid rebuild would not flatten:
`PATCH .../grid` rebuilds the master from scratch and `readGridChoice` reads the card off
the *first* flowing region precisely because it assumes they all agree — a comment in that
file has warned about this since it was written. So the choices live on the page, beside
the merges, in `offer_book_pages.regionBlocks`.

**The load-bearing half is what happens to the product that was there.** A cell holding a
block that does not repeat becomes `static` at flow time, and the products route around it:
the offer that was in it moves to the next cell, the page fills up, and the book grows by a
page rather than losing a product. That is not new machinery — it is the rule pins have
followed since they were built, reached by a different gesture. *"Dropping one silently is
the class of bug that reaches print."*

Verified in a browser against the dev book: putting an Anniversary band in the top-left
cell of page one pushed Pure Ceylon Tea onto page two. Nothing vanished.

### Four things that only showed up once it ran

- **`repeats` decides the fill, and it is read at load time rather than stored.** A copy
  kept on the page would be a second answer that goes stale the day somebody edits the
  block. It also forced `loadBlocks` to move *above* `flowBook` in `loadBook`, which it had
  never needed to be: nothing the flow produced used to feed back into it.
- **A static cell must stay selectable.** `cells` was flow regions only, so the first
  version dropped a cell the moment an owner put a brand block in it — and with it any way
  to change it back. `cellsFor` now filters nothing and the caller decides what counts as a
  cell, because only the caller can tell a footer band from a cell that used to take a
  product.
- **"Empty cell" was a lie.** The artboard labelled a cell holding a brand block as empty,
  because the label keyed on the absence of an *offer*. A screen reader was being told the
  opposite of what is on the page. It names the block now.
- **A repeating block is allowed here, unlike a band or a pin.** Both of those refuse one,
  because they carry no offer to give it. A cell is exactly where a repeating card belongs —
  so this is also how an owner gives one cell a different *card*, not only a panel.

### The picker is a dialog, not a select

The first version put sixty-five blocks in a dropdown, which asks an owner to know what
"Corner flag card" looks like — precisely the knowledge the seeded library exists to save
them needing. `CellBlockDialog` draws each one instead, in the shop's own colours, filtered
by what a block is *for*: the same screen they already met when they added blocks to their
library, and deliberately the same shape as `BlockImportDialog`.

Three things fell out of building it:

- **`BlockTile` was extracted** rather than copied. The import dialog had the tile inline,
  and a second one would have drifted — the component inventory's rule applied a level down,
  to a thing the inventory does not list because it had only ever had one caller. What
  differs between the two callers is *badges*, so badges are a slot: the library marks
  what is in season and what a plan locks, the cell picker marks what will stop showing a
  product.
- **The way back is a tile, not a reset button beside the grid.** "What does this cell
  draw" has one answer at a time and the book's own card is one of the answers, so it sits
  in the list with the rest — the same reasoning `Band` uses for putting "None" first in
  its select.
- **The consequence is stated before it is committed**, twice: a `NO PRODUCT` chip on every
  tile that will do it, and a caution line above the button once one is picked. A cell that
  stops taking a product pushes every offer after it along by one, which an owner otherwise
  reads as their book quietly rearranging itself.

The block documents travel to the client for this, which is the same payload
`/brand/blocks` already sends for its own picker. It is the only way to answer "what does
this look like" without asking the owner to remember.

### Still owed on this

- **There is no book-wide "change the offer card" control.** `cardBlockId` is still only set
  at creation, in `POST /api/v1/offer-books`. The per-cell picker makes its absence
  stranger: an owner can change one cell's card and not all of them.
- **`cardFit` does not judge a cell an owner changed.** It checks every flowing placement,
  so a per-cell card is included — but a *panel* in a body cell is static and skipped, which
  is right, and a per-cell card at an odd aspect will report against the book's warning
  rather than naming which cell. Good enough until somebody hits it.

### Removing a card is undoable, and the panel is where it lives — 13 September

The ask was a right-click menu on the artboard to take a product out of the book. What
that ask is actually about is that **the artboard has been a selection surface and nothing
else**: clicking a cell has selected its offer since E6-02, and then every action lived
across the screen in the tray, matched to the card by its ordinal number — which is
precisely the translation an artboard exists to remove.

A context menu is a reasonable *accelerator* for that and it is not the fix. The design
skill is explicit that every hover-revealed affordance needs a persistent equivalent
because the editor ships on tablet, so an action reachable only by right-click is an action
half the owners cannot reach. The panel is the persistent home; the menu can sit on top of
it later, and §"Still open" below says what it would cost.

**Three things had to be true before a Remove button was safe to add, and only one of them
was.**

#### The toast finally exists

`Toast` had a signature in the component inventory and no mounting mechanism, and had done
since E2 — no provider, no portal, no store. `E2-pending.md` §3 recorded it as a deliberate
compromise and recorded what it cost in the same breath: *"the design system prefers undo
over confirm, and undo lives in the toast that does not exist."* So three screens shipped
inline `role="alert"` banners, and pausing a shop — a reversible act — asks for
confirmation.

`components/ui/toast.tsx` is the inventory's props, unchanged, plus the mechanism: a
zustand store, an imperative `toast()` callable from any handler, and one `<Toaster />` in
the dashboard layout. Imperative rather than a hook because a toast is raised from code
that has already decided what happened; a hook would put a subscription in every component
that ever reports anything. The live region renders before any message does, which is what
makes a screen reader announce one.

**A toast carrying an action holds twice as long as one without, and hover or focus stops
the clock.** The action's window *is* the toast's lifetime — once it goes there is no way
back — and someone reading it is someone still deciding.

#### Removal was not reversible, and the undo stack could not have made it so

`EditorStep` was one shape: a field, its old value, its new value, replayed through
`PATCH .../offers/:offerId`. That cannot express a removal. There is no row to patch, and
the id in the step points at nothing.

So the step has a kind now, and the removal kind carries a **snapshot** —
`lib/offer-snapshot.ts`, validated by the same zod schema on the way out of `DELETE` and
back into `POST .../offers/:offerId/restore`. Two things about it are load-bearing:

- **The id travels with it.** A slot override lives on the *page* and carries an `offerId`,
  so it does not cascade when the row goes; restoring under a fresh id would leave the
  nudge pointing at nothing and the card would come back in the wrong place. Undo returns
  the book to the state it was in, not to one that resembles it.
- **The row is still hard-deleted.** The reasoning at that call site stands — an offer *is*
  a reference, and archiving it puts a row in the table that every read then has to learn
  to ignore. What changed is that its contents are handed to the client on the way out
  rather than dropped, which is the same shape as the rest of E6-06: logical operations
  re-issued through the API, not a client's private copy of the truth.

`POST .../restore` re-validates every id in the body against the session's organization —
book, tier, every product, every shop — exactly as `POST /offers` and `PATCH /offers/:id`
do. The snapshot came from this server but it arrived by way of a browser, and the route is
deliberately no more powerful than the two it undoes. It also **refuses an id that is
already in the book** rather than overwriting it: that is a second undo of the same
removal, and writing over the row would discard whatever the owner has done to it since.

#### Two orderings that are not arbitrary

- **The step is claimed off the stack before the restore request goes.** Cmd+Z reaches the
  same step the toast's Undo does; claiming it first is what stops a keystroke and a button
  both issuing a restore, the second of which comes back `409` and reports a failure to an
  owner whose offer is sitting right there. And it is claimed *by name* rather than by
  taking the most recent step — by the time someone reaches for the toast they may have
  priced two other cards.
- **A failed restore puts the step back with `requeue`, not `push`.** `push` clears the
  redo branch, because a new edit invalidates it; a request that did not land invalidates
  nothing. Without it a failed Undo is a step that has left `past` — the toast is gone,
  Cmd+Z reaches past it, and the only route back to the offer is adding it again.

#### The defect that only showed up in the hydrate

`hydrate` filtered the undo stack by *is this offer still in the book*, which is right for a
patch step and catastrophic for a removal one. A removal re-renders the server component,
which re-hydrates the store without the offer — so the filter discarded the undo in the
same breath as the removal that created it. The filter keeps `kind === 'remove'` now, and
there is a test named after the sequence rather than the function.

#### What the panel got

`OfferActions`, at the foot of `OfferProperties`: **Earlier, Later, Remove from book.** The
tray keeps its own controls — it is a list, and a list is where you act on things you have
not got in front of you. Both routes go through the same `removeOffer` in
`lib/editor-actions.ts`, so removing a card from the list and removing the one selected on
the artboard cannot become two behaviours with two answers about undo.

No confirmation dialog, and that is the system's rule rather than a shortcut: the design
skill → Destructive actions gives *removing a product* as its example of what a toast with
Undo beats a dialog at. The consequence is stated in the panel before it happens — every
offer after this one moves along by one — for the same reason `CellBlockDialog` states its
own: an owner otherwise reads it as the book quietly rearranging itself.
### The accelerators, and the Radix decision — 13 September

The three things the section above left open are built, in the order that made each one
safe rather than the order they were asked for.

#### Reordering is on the undo stack

It never was, in the tray or in the panel, so Cmd+Z reached past a move to the price before
it. A reorder is a third kind of step: **the whole order both ways, not a `{from, to}`
pair.** Undoing a move by swapping the indices back is only correct if nothing else moved
in between, and the route refuses a partial list for exactly that reason — two arrays are
cheap at a five-hundred-offer ceiling and they are the only shape that cannot be wrong.

`hydrate` needed a third answer too, and it is its own predicate now (`replayable`) because
each kind gives a different one: a removal survives its offer being gone, a patch does not,
and **a reorder goes the moment the book it describes is not the book on screen.** The route
would refuse a stale list anyway; refusing it in front of an owner who just pressed undo is
worse than not offering it. Adding or removing an offer therefore drops pending reorder
steps, and there is a test for each direction.

The tray's arrows, the tray's *drag* and the panel's arrows now share one `reorderOffer`.
That was three copies of "send the whole order" before today, two of them added by me.

#### Delete and Backspace remove the selected card

`components/editor/use-remove-key.ts`. **The only reason this was not built alongside the
panel's Remove button is that removal was not reversible**; a keystroke that destroys work
an owner cannot get back is a different proposition from one they can undo.

**It acts on the selection, not on what has focus.** Clicking a cell moves focus to that
cell's hit target, but clicking a row in the tray selects the same offer and leaves focus in
the tray — and an owner who just pointed at a card means that card either way. The
properties panel is showing it, which is the visible answer to *what will this delete*.

Three things it stands off, and the third is the one that would have bitten: text fields,
where Backspace corrects a price; a held modifier, so the platform keeps Cmd+Backspace; and
**an open dialog** — `Dialog` is the native `<dialog>`, which contains focus but does not
stop a window-level listener, so a Backspace typed into the block picker would quietly
delete the card behind it.

#### The context menu, and the first Radix package in the tree

`components/ui/context-menu.tsx` over `@radix-ui/react-context-menu`, with
`components/editor/ArtboardMenu.tsx` wiring it to the artboard.

**The dependency was the decision, not the component.** `Dialog` is the native `<dialog>`
and `Select` a native `<select>`, and both refused their Radix versions with the reasoning
written at the call site: the platform already does modal containment and the platform
picker better than a reimplementation will. There is no platform primitive for a context
menu — `contextmenu` is an event, not a widget — so that reasoning does not transfer, and
the alternative was hand-rolling roving focus, typeahead, collision-aware positioning and
RTL side-flipping.

**shadcn's block for this does not resolve here**, which is the tokens pass the last section
predicted: it ships `shadow-md`, `rounded-sm`, `text-sm` and `animate-in zoom-in-95`, and
the scales in this repo are *replaced* rather than extended, so most of those are valid
strings that generate no CSS and nothing but `check:classes` can see it. Every class in the
file is a token, items are full control height rather than the dense rows a menu usually
gets, and separation is a hairline and surface tone because `boxShadow` in the Tailwind
config is `{ none }`.

**Every item in the menu is also a button in a panel, and that is the rule.** The design
skill requires a persistent equivalent for anything the editor offers, because it ships on
tablet. Radix does open this on long-press, so it is not pointer-only — but long-press is
undiscoverable and competes with the iOS selection callout, so the menu is where an owner
who knows the product goes faster and never where a feature lives. If an item is ever added
to `ArtboardMenu` that exists nowhere else, that component has become the wrong thing.

**It acts on the selection, and the click that opened it set the selection.** The cell hit
targets already listened on `pointerdown`, which the right button fires; the card hit
targets needed an `onContextMenu` for the same job. A menu carrying its own notion of what
was clicked would be a second answer to *which card*, and the two would disagree the first
time a click was swallowed. **One root per page, not one per cell** — twelve cells over
nine pages is a hundred state machines for a surface that can only ever show one menu.

### Still open on this

- **Still not opened in a browser.** Typecheck, lint, build, `check:classes` and 533 tests
  pass; every one of the last several defects in `STATUS.md` §1.0 was found by a person
  opening a screen rather than by any of those. The specific risks this change adds, none
  of which any test here can see: whether the menu flips to the correct side in an Arabic
  interface, whether `asChild` on the artboard wrapper behaves over an `<svg>` on a real
  pointer, and whether long-press opens it on an iPad without the selection callout
  fighting it.
- **Merge and unmerge are not in the menu.** They need a multi-cell selection, so on a
  single right-clicked cell they would be disabled more often than not. The gesture stays
  on the Page panel.
- **`Delete` does nothing to a cell holding a brand block.** Selecting such a cell selects
  no offer, so the key is a no-op where "clear this cell" is the obvious meaning. The
  design skill's own list of undo-over-confirm examples includes *clearing a cell*, so the
  shape is known; it wants `use-region-blocks` to grow a reversible write first.
- **`ContextMenuCheckboxItem`, `RadioItem` and `Sub` are not wrapped.** Radix ships them
  and nothing needs them; wrapping a primitive with no caller is how an API gets a second
  answer before anyone has asked the question.
- **Reordering by drag still sends on drop only.** The undo step records the drop, so a
  drag that crossed six rows is one step, which is right — but the tray's arrows generate
  one step per press, and an owner tapping "earlier" five times has five steps to walk
  back. Coalescing consecutive moves of the same card inside a short window is the fix if
  anyone complains.
- **`OfferShopOverride` is snapshotted and nothing in the editor writes it yet.** Carried
  because something will, and a snapshot that silently drops a column is an undo that
  quietly loses a shop's branch pricing.
- **`ProductClick` rows are not snapshotted and do not come back.** Analytics on a draft
  book is close to hypothetical, and reinstating click history from a browser payload is a
  worse idea than losing it.

---

## 11. The price mark's arrangement opens — 17 September

E6 §3 said the price mark is a component and not an arrangement of text boxes, and gave one
reason: *"If owners assemble a price from text layers, you get hundreds of inconsistent
variants inside a month."* That reason is right and nothing here weakens it. What went wrong
is that the sentence was read as covering two different things, and only justified one of
them.

**The justified half — anatomy.** A price cut into free elements loses cap alignment, loses
the three-decimal KWD/OMR/BHD branch, loses LTR-in-Arabic, and stops shrinking as one thing
when the string is long, which leaves the fit ladder with nothing to shrink. It also stops
being one participant in `compact.ts`'s vertical flow. The mark stays one element, one box,
one drag handle. Permanently.

**The unjustified half — arrangement.** Where the currency sits, where the was-price sits,
where the tab attaches, how the cluster aligns in its box. That is design, and it was locked
by the same sentence, and the consequence was a product that could make exactly one price
design. Ten magic ratios in `layoutPriceMark` *were* the expressive range of the product.

**What said the lock was too tight, all of it already in the repository:**

- forty of the hundred shipped arrangements switched the mark's ground off and hand-placed a
  disc behind the digits, which is a library working around its own component;
- `currencyPlacement: 'PREFIX' | 'SUFFIX' | 'SUPERSCRIPT'` has sat on `PriceMark` since this
  epic wrote it, written by every producer and read by nothing — someone knew placement was
  a design variable and the layout function outvoted the type;
- six of the eight grounds the engine drew had no control in the designer at all;
- `TextSource` gave the tier badge an escape hatch — `{ from: 'offer', field: 'tier' }`,
  added precisely so a badge could be anything — and gave the price none, so an owner who
  wanted a different treatment had nowhere to go.

**The rule that replaces it:** *consistency comes from bounded ratios and enforced relations,
never from a single frozen arrangement.* `PriceMarkStyle.preset` names one of eight marks we
drew and `.recipe` refines it — seven named parts, a nine-point compass, two clamped scales.
`layoutPriceMark` then enforces the anatomy whatever the recipe asked for, and
`price-mark.test.ts` asserts it across every preset rather than only the default. The full
argument and the invariant table are `docs/composition-model.md` §3.5; the epic itself is
amended at §3a.

**`classic-tag` is byte-identical to the mark drawn before**, pinned against numbers computed
by hand from the old formulas rather than snapshotted from the new code — a snapshot only
asserts that the code has not changed since the snapshot. Nothing already designed moved.

### Three defects found on the way, none of them about recipes

- **`prefix` was laid out and never drawn in the app.** The engine has always placed
  FROM / EACH / PER KG; `harness/svg.ts` drew it and `components/blocks/draw.tsx` did not —
  so it was invisible on all four surfaces, since all four share that painter. A per-kilo
  offer that does not name its unit is a price that means nothing.
- **`duplicate-tier` would have false-fired.** It read `element.style?.tab !== 'none'`, and
  two of the presets hide the tab through the recipe instead. `library-source.ts` refuses a
  shipped block that draws *any* warning, so a false positive there is a failed deploy —
  which is what this exact warning cost on 10 September. It reads `markRecipe` now.
- **Two satellites sharing a band collided.** The old code avoided it only by hard-coding
  the was-price to the end of the top band and the FROM line to the start; any recipe that
  put both at the same end printed one on top of the other. Bands are laid out as bands now,
  and a satellite in a narrow side band shrinks to its column instead of running across the
  digits.

### Still open on this

- **The editor has no price-style control, and the shape of the one it should get is
  decided.** It is **not** a per-card recipe: sixty cards in a book with sixty price layouts
  is the failure §3 warned about, and it is the same warning that is right here and was
  wrong about the block designer. The split that resolves it: **the card designer decides
  what a price looks like; the editor decides what a price says.** So the editor keeps
  price, was-price, tier and prefix — content, correctly, and `OfferProperties` already
  offers exactly that — and what it should gain is *one book-wide* price style that swaps
  the recipe for every mark at once. That gives an owner the control they are asking for
  without the drift, and it is one decision rather than sixty.
- **That control needs a column and nobody has decided where.** `OfferBook` is the obvious
  home and the brand kit is the arguable one: a chain that prices the same way in every book
  wants it on the kit, a shop that runs a different treatment for Ramadan wants it on the
  book. It needs a migration, a route, store wiring and a control — deliberately not done
  alongside a rendering change.
- **The escape hatch is still missing.** `TextSource` should grow
  `{ from: 'offer', field: 'price' | 'comparePrice' | 'currency' | 'unit' }`, mirroring what
  the tier already has. The presets are the good path and should stay the default; this is
  for the one shop with one card that wants something we did not draw. Without it the price
  is the only element in the vocabulary that can only say no.
- **Nothing has been opened in a browser.** Typecheck, lint, build, `check:classes`, 1,199
  tests and the 65-block gallery all pass, and every one of the last several defects in
  `STATUS.md` §1.0 was found by a person opening a screen. The specific risks here: whether
  the eight preset thumbnails are legible at the width the properties pane actually has,
  whether the 4-column ground picker fits a 288px pane the way the 3×3 shape picker does,
  and whether a `super-after` currency reads correctly against a real Arabic price face
  rather than the estimated advance widths this module uses.
