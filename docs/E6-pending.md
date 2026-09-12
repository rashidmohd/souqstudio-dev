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
2. **Detaching a page from the master**, §5's "customize this page only". Pins retire most
   of the need for it, which is why it went last and may not be needed at all.
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
- **Not a per-cell card.** Every flowing region still draws the same block; a merged one
  draws it at a different aspect, and `pickArrangement` picks the arrangement for that
  aspect. "This cell uses a different design" is a separate feature, and `readGridChoice`
  reads the card off the first flowing region, so it would need that seam widened first.
