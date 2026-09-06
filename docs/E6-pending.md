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

### Not built yet, in order

1. **Creating a book.** `createBook` does not exist. Until it does `offer_books` stays
   empty and `loadBook` has never been run against a real row — every test above is
   against literals, which is exactly the gap this epic is supposed to close.
2. **Rendering it server-side**, the `BlockPreview` way: inline SVG, no Fabric.
3. **Then the editor.**

---

## 5. A promo tier's colour is not a block's colour, and nothing maps between them

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

## 6. Corrections to the epic

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
