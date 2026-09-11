# E6 — the creation flow, revisited

What `/editor/new` is, what is wrong with it, and the four-step flow that replaces it.

Written 10 September 2026, and **built the same day** — §9 is the record of what shipped
and what changed on contact. This supersedes E6-02's account of starting a book and the
screen that shipped for it, `components/offer-book/NewBookForm.tsx`, which is deleted. It
does not touch the composition model or anything E6 does after a book exists, beyond
adding the rename the editor was missing.

Read `docs/composition-model.md` first. This document assumes its vocabulary — a block is
a designed building block, a page is a spreadsheet of regions filled with blocks, products
flow through it.

---

## 1. What ships today, and why it is being replaced

`/editor/new` is one form on one screen. A title input, a format select, a language
select, a source choice that only appears when the organization happens to have a
committed spreadsheet, a search box, and a list of what has been picked. Submit posts to
`POST /api/v1/offer-books` and the browser lands on `/editor/[id]`.

It works. Real books on dev were made through it. Four things are wrong with it anyway.

**It asks for a name first.** The title input is the first field on the screen and the
submit handler refuses without it — `NewBookForm.tsx`, *"Give the book a title."* An owner
who came to make this week's flyer is asked to name a thing that does not exist yet,
before being shown anything about it. The name is also the one decision on that screen
that is trivially reversible and completely inconsequential, and it is asked first.

**"Format" is not the question the owner is holding.** The select offers seven values —
`leaflet`, `catalog`, `a3`, `instagram_post`, `story`, `whatsapp`, `print` — which are
page sizes wearing product names. Three of them are the same 1240×1754 rectangle
(`PAGE_SIZE` in `lib/offer-book-compose.ts:431`) and two more are the same 1080 square. An
owner does not arrive wanting a format; they arrive wanting *a flyer*, *a post*, or *a
status*. The list makes them translate.

**The block is never chosen, and cannot be.** `bookletGrid` hardcodes two ids —

```ts
const OFFER_CARD = byId('blk_offer_card')
const FOOTER = byId('blk_footer')
```

— `packages/engine/src/library.ts:126`. Every book ever created by this product uses the
same offer card. Sixty-five blocks were seeded in E7 and twenty-five of them are offer
cards; not one is reachable from the flow that makes a book. The library is a gallery an
owner can browse at `/brand/blocks` and cannot act on.

**The CSV path is not a path, it is a precondition.** "From a spreadsheet" appears only
when `listImportsForBook` returns something (`lib/offer-book.ts:547`), which requires the
owner to have already gone to `/catalog/import`, mapped columns, reviewed matches, and
committed the import *into their catalog* — a three-step wizard on another route, with a
different purpose, finished on an earlier visit. An owner holding the price list they were
going to make a flyer from has no way to say so.

---

## 2. The flow

Four steps, on `/editor/new`, in the dashboard shell. Each step answers one question and
shows its answer once answered, so the screen accumulates rather than replaces.

```
┌─ 1 ─────────────┐  ┌─ 2 ──────────────┐  ┌─ 3 ─────────────────┐  ┌─ 4 ──────────┐
│ What are you    │  │ Which design?    │  │ Which products?     │  │ Preview      │
│ making?         │→ │                  │→ │                     │→ │              │
│                 │  │  ▢ ▢ ▢ ▢         │  │  ○ Search catalog   │  │  ▢ ▢         │
│ Booklet Post    │  │  ▢ ▢ ▢ ▢         │  │  ○ Upload a price   │  │  ▢ ▢         │
│ Status  Poster  │  │  ▢ ▢ ▢ ▢         │  │    list (CSV)       │  │              │
└─────────────────┘  └──────────────────┘  └─────────────────────┘  └──────────────┘
                                              [ Create ] ──────────────┘   │
                                                                    [Open editor]
```

No step asks for a name. §6.

### 2.1 Step 1 — what are you making?

Four selectable cards. Each is a **kind**, and a kind decides three things the owner never
sees: the stored `format`, the page rectangle, and the grid the book starts from.

| Card | Reads as | `format` | Page | Starting grid | Cell aspect |
| --- | --- | --- | --- | --- | --- |
| **Offer booklet** | A multi-page flyer, print or share | `leaflet` | 1240×1754 | 3 × 3 + footer | 0.769 |
| **Post** | One square image for Instagram or WhatsApp | `instagram_post` | 1080×1080 | 3 × 2, no footer | 0.645 |
| **Status** | A vertical image for WhatsApp status or a story | `story` | 1080×1920 | 2 × 3, no footer | 0.807 |
| **Poster** | A single large sheet to print | `a3` | 1754×2480 | 4 × 4 + footer | 0.744 |

**Those four grids are measured, not chosen**, and §7's `SQUARISH` risk is what decided
them. Every cell lands inside `TALL` (0.35–0.85), which is a band the seeded cards
actually design for. `lib/offer-book-grid.test.ts` recomputes the column from the engine's
own output and fails if any kind leaves the band.

`catalog`, `whatsapp` and `print` stay in the enum — books already carry them — and stop
being offered. They are duplicates of rectangles the four cards already cover, and a fifth
and sixth card that produce a byte-identical result is a menu that punishes reading it.

The kind is a client-side concept. **Nothing new is stored**: the wire still carries
`format`, and `lib/features.ts` gains no flag, because all four rectangles already render.

### 2.2 Step 2 — which design?

A grid of block thumbnails, drawn by `BlockPreview`, filtered to what this kind can use.
The shop's own blocks first, then the seeded library — the ordering `listBlocks` already
returns (`lib/blocks.ts:184`, `orderBy: [{ organizationId: 'desc' }, { name: 'asc' }]`).

**What is being chosen is the repeating offer card**, for all four kinds. That is the
block that draws once per offer, and it is the one an owner would recognise as "what my
offers look like". Headers, footers and panels are placed once and are the editor's job —
adding them to this step would be asking four questions inside one.

So the filter is `category === 'offer-card'` in every kind. Twenty-five seeded blocks plus
whatever the shop has designed.

**A locked block is shown and not selectable**, with the plan named — the same treatment
`BlockImportDialog` already gives (`source.locked` in `app/api/v1/blocks/route.ts`). A
grid that silently omits the designs a shop is one upgrade away from is a grid that
undersells the product.

**One block is preselected** — `blk_offer_card`, what every book uses today — so an owner
who does not care can press Continue. A step that cannot be skipped by not caring is a
step that will be resented by the majority who do not.

> **This was the one real risk in the plan, and it is closed for the shipped defaults.**
> The seeded offer cards carry two arrangements each, `TALL` (0.35–0.85) and `WIDE`
> (1.35–2.6), and **no card defines a `SQUARISH` one**. §7 has the resolution: the track
> counts were chosen so every kind's cells land in `TALL`. It stays open for any grid an
> owner builds by hand in the editor's layout panel.

> **Not the same thing as the `social-post` blocks.** The eight square blocks in
> `library-panels.ts:378` are static — `repeats: false`, no product field, and
> `validateBlock` refuses one. They are the announcement, the opening hours, the
> thank-you: a post with no offers on it. A flow whose next step asks for products is not
> the flow that reaches them. Making one is a separate action and is out of scope here.

### 2.3 Step 3 — which products?

Two ways, offered as two cards, always both — not conditionally, as today.

**Search the catalog.** The existing control, unchanged: a debounced query against
`/api/v1/catalog/search`, results added one at a time, a running list of what is in.
Prices are not asked for and are set in the editor, for the reason `NewBookForm` already
states: setting eleven prices before seeing a single card is the wrong order.

**Upload a price list.** A CSV of product names and prices. We match each name against the
catalog and show what we found:

```
CSV                        Result
─────────────────────────  ──────────────────────────
Basmati Rice 5kg   19.50   ✓ Basmati Rice 5kg
Sunflower Oil 1.8L 12.00   ? 2 matches — pick one
Al Ain Water 1.5L   2.00   ✓ Al Ain Water 1.5L
House blend tea     8.00   ✗ not in the catalog
```

**This reuses the E5-06 matcher and creates no import.** `matchImportRows`
(`lib/catalog.ts:747`) resolves a whole sheet in two queries that fan out over `unnest` —
tsvector for recall, trigram `similarity()` for a true 0..1 score — and `resolveRow`
(`lib/catalog-import.ts:268`) turns that into `MATCHED` / `AMBIGUOUS` / `UNMATCHED`
against thresholds already tuned for this exact asymmetry: *an extra ambiguous row costs
one click, a wrong matched row puts the wrong product on a printed flyer at the right
price.* Both are pure functions over data the caller supplies. Neither needs a
`catalog_imports` row to run.

That matters, because a book made this way should not silently edit the shop's catalog. It
is a flyer, not an inventory update.

Column mapping is inferred and not asked about. `inferColumnMap`
(`lib/catalog-import.ts:96`) already guesses name and price columns from the header
spellings that turn up in real sheets, in English and Arabic. If the guess is wrong the
owner sees it immediately in the match table, and a "change columns" control opens the
mapping. A mapping screen shown to everyone to serve the sheets it gets wrong is E5-06's
answer for the catalog import, where the stakes are permanent; here the stakes are one
flyer and the recovery is re-uploading.

**Prices carry.** This is the whole point of the path, and the same one
`createBookFromImport` makes: the search path writes zero and flags every offer, because a
catalog product has no price; a sheet has one per row.

> **Open — what happens to an unmatched row.** Two readings, both defensible, deferred by
> decision on 10 September. See §8.1. Nothing else in this document depends on the answer.

### 2.4 Step 4 — create, then preview

Create writes the book, and the browser lands on a preview of it — the composed pages, at
whatever size fits, drawn by the same renderer the editor uses. Two actions on it: **Open
editor**, and **Discard**.

The book is a real `draft` row before the preview is drawn. `loadBook` runs the layout
engine over database rows and there is no second path that composes from a request body;
building one so the preview could precede the write would mean two composition paths that
must agree forever, and the one nobody looks at is the one that drifts.

**Discard deletes it.** A draft an owner rejected at the preview should not be waiting for
them on the home screen — that is a list that fills with abandoned attempts and teaches
the owner to ignore it. This is the one delete in the flow and it needs `DELETE
/api/v1/offer-books/[id]`, which does not exist. §5.

---

## 3. What the flow does not ask

**Language.** Today's third select. It stays a real property of the book — the artboard
follows the book's language and never the interface's, which `loadBook` is careful about
— and it defaults to the interface language instead of being asked. An owner working in an
Arabic UI is overwhelmingly making an Arabic flyer, and the one who is not can change it
in the editor.

**Density.** `perRow` and `bodyRows` are accepted by the API today and never sent by the
form. The kind supplies them (§2.1) and the editor's layout panel already changes them.

**A name.** §6.

---

## 4. Auto-naming

The book is named when it is created, from the kind and the date:

| Kind | Name |
| --- | --- |
| Offer booklet | `Week 37 offers` |
| Post | `Post · 10 September` |
| Status | `Status · 10 September` |
| Poster | `Poster · 10 September` |

Week number is ISO-8601, which is what a shop that runs weekly promotions counts in.

**A second book of the same kind in the same week gets a suffix** — `Week 37 offers 2` —
by the rule `copyName` already implements for blocks (`lib/blocks.ts`). Two rows with the
same name in a list is a list you cannot use, and this is the one flow that will reliably
produce them.

Names are English-only at first, because `offer_books.title` is one column and the
schema has nowhere to put a second. An Arabic-interface owner gets an English default they
can immediately rename, which is worse than a localised default and better than blocking
the flow on a migration.

**Dropping the name prompt requires adding a rename**, and there is nowhere to rename a
book today: `EditorShell.tsx:135` draws the title as a static `<h1>`, and
`/api/v1/offer-books/[id]/route.ts` exports `GET` and nothing else. This is not optional
scope — without it, every book a shop owns is called `Week 37 offers` forever. §5.

---

## 5. What has to be built

Ordered so that each piece is useful before the next exists.

### 5.1 Engine — `packages/engine/src/library.ts`

**`bookletGrid` takes the block ids.** Today it closes over two module constants; it needs
`cardBlockId` and `footerBlockId`, defaulting to what it hardcodes now so every existing
caller and the render harness are unaffected.

```ts
export function bookletGrid(options: {
  perRow?: number
  bodyRows?: number
  cardBlockId?: string
  footerBlockId?: string
} = {}): PageGrid
```

**`postGrid` is new** — a grid with no footer band, for the kinds that are one page rather
than a book of them. The harness has had a local `carousel()` for this since the engine
existed (`harness/main.ts:98`); it moves here, for the reason `SEED_BLOCKS` and
`bookletGrid` are already here: two consumers need the same bytes, and a second copy is
one that drifts from the layout that was checked.

Both are covered by `library.test.ts`.

### 5.2 Server — `apps/web/lib/offer-book.ts`

**`CreateBookInput` gains `cardBlockId`**, passed to `bookletGrid`. The id must be checked
against `loadBlock` for tenancy and plan before it reaches a grid — a client naming
another organization's block, or a locked one, is exactly the check `POST
/api/v1/blocks` already makes on `fromId`.

**`createBookFromRows`** — a third creator, beside `createBook` and
`createBookFromImport`, taking `Array<{ catalogProductId: string; price: string | null }>`.
It is `createBookFromImport` with the rows supplied rather than read from
`catalog_import_rows`, and the two should share their transaction body rather than being
copied: the `createManyAndReturn` + keyed-by-position fan-out in both is the thing that
was learned by blowing the 5,000ms transaction limit, and it must not be learned a fourth
time.

**A rename**, and **a delete** for Discard. Both scoped by `shop: { organizationId }` in
the query rather than compared after the fact.

### 5.3 API — `apps/web/app/api/v1/`

| Route | Method | Why |
| --- | --- | --- |
| `offer-books` | `POST` | Third branch on the union: `rows`. `cardBlockId` on `baseSchema`. |
| `offer-books/[id]` | `PATCH` | Rename. `{ title }`, trimmed, 1–160, matching the existing bound. |
| `offer-books/[id]` | `DELETE` | Discard from the preview. Draft-only. |
| `offer-books/match` | `POST` | New. A sheet's rows in, matches and candidates out. Nothing written. |

`offer-books/match` is a read that takes a body, which is why it is a `POST` — the sheet
does not fit in a query string. It is rate-limited and bounded at the same 200 rows
`createSchema` already caps `productIds` at.

### 5.4 UI — `apps/web/components/offer-book/`

`NewBookForm.tsx` is replaced by a step container and four step components. The pieces
that already work move rather than being rewritten: the debounced catalog search and the
picked list are step 3's first card almost verbatim, and `SourceChoice` is the selectable
card pattern steps 1 and 3 both need — it goes to `components/ui/` under the name the
design skill's component inventory settles on, because a third copy of a radio-in-a-card
is how two APIs for one component happen.

The block grid in step 2 is `BlockImportDialog`'s body without the dialog and without
multi-select. Both want the same thing — a filtered, previewed grid of blocks — and the
selection cardinality is the only difference.

Read `.claude/skills/souqstudio-design/references/component-inventory.md` before writing
any of it, and `references/layout-map.md` before the route changes shape.

### 5.5 Editor

The rename control, on `EditorShell`. A book arriving with a name nobody chose is the
whole premise of §4, so the place it is changed has to exist in the same release.

---

## 6. Why the name goes, stated once

A name is the least consequential and most reversible decision on the current screen, and
it is asked first, before anything exists to name. Every other field on that form changes
what gets made; this one changes what it is called in a list.

The counter-argument is that an auto-named book is one an owner cannot find later. That is
true of `Week 37 offers` only if there is no rename — which is why §5.5 is in the required
scope and not in a follow-up. With a rename in the editor, the owner names the book when
they have seen it, which is when they know what to call it.

---

## 7. Risks

**The `SQUARISH` gap was the real one, and it is closed for the four shipped grids.** The
twenty-five seeded offer cards define `TALL` and `WIDE` and nothing between them, and
`pickArrangement` falls back to the nearest rather than failing — so a grid whose cells
land near 1.0 renders a tall design stretched into a square, with no error anywhere.

The resolution was the cheap one of the three: **choose track counts whose cells fall in
`TALL`.** What made that possible was measuring instead of estimating. The first pass at
this document guessed the aspects by eye and got two of four wrong — it proposed 3 × 4 for
the poster (1.017, `SQUARISH`) and 2 × 2 for the post (1.000, `SQUARISH`). Computing them
against the real page rectangle, gap and margin gave 4 × 4 and 3 × 2 instead.

`lib/offer-book-grid.test.ts` now recomputes every kind's aspect from `flowBook`'s own
output and fails if one leaves a band a card designs for. It asserts the band rather than
the number, so the counts stay changeable and the property does not.

**It stays open for hand-built grids.** The editor's layout panel takes arbitrary track
counts and can still reach `SQUARISH`. That predates this flow and this flow cannot fix
it; the fix is arrangements on the cards. Whoever adds them should check the result with
`pnpm --filter @souqstudio/engine gallery`, which is the only thing in the toolchain that
finds a design defect rather than a correctness one.

**An off-system class name generates no CSS and no error.** Four defects shipped that way,
three of them the same one. Run `pnpm build && pnpm --filter @souqstudio/web
check:classes` before calling any of this done — it is not part of `pnpm check` because it
needs a build to compare against.

**Four steps is more clicks than one form**, for the owner who wanted the default
everything. Mitigated by preselecting in every step that has a defensible default — kind
does not, block does, source does — so Continue, Continue, search, Create is the floor.
If that floor still reads as long once it is built, the answer is collapsing steps 1 and
2 onto one screen, not removing the block choice.

---

## 8. Open

### 8.1 What happens to a CSV row whose product is not in the catalog

**Deferred 10 September, deliberately.** Two readings:

- **Match only.** Unmatched rows are listed and skipped; the catalog is never written. The
  flow stays a flyer-making flow. An owner whose sheet is mostly own-brand products gets a
  short book and an explanation.
- **Offer to add them.** Each unmatched row gets a "create this product" control, reusing
  `createImportedProducts` (`lib/catalog.ts:844`) and the E5-06 commit path. More powerful,
  and it drags catalog editing into a flow whose purpose is a flyer — plus a permission
  question, since adding a catalog product is a different bar from making a book.

Everything in §2.3 holds either way: the matcher, the thresholds, the inferred column map
and the two-query fan-out are the same. This decides what the table's fourth row can do,
and nothing else.

### 8.2 Smaller ones

- **Does Discard hard-delete or archive?** `offer_books` has no archive column and E9's
  export jobs and E10's share links are book-scoped. A draft that has never been exported
  or shared has nothing hanging off it, which is an argument for a hard delete bounded to
  `status: 'draft'`.
- **Does the preview paginate?** A twelve-offer booklet at 3×3 is two pages. Showing both
  is right; showing forty is not. A cap with a count is probably the answer.
- **Arabic auto-names** need a second title column or a stored kind + date the UI
  formats. Neither is worth a migration until someone asks.


---

## 9. What shipped, 10 September

Built the same day this was written. `pnpm typecheck`, `pnpm lint`, `pnpm test`
(**929 tests**, up from 883), `pnpm build` and `check:classes` all pass.

### 9.1 The files

| Layer | File | What |
| --- | --- | --- |
| Engine | `packages/engine/src/library.ts` | `bookletGrid` takes `cardBlockId` and `footerBlockId`; `postGrid` is new; `offerRegions` shared |
| Vocabulary | `apps/web/lib/book-kind.ts` | The four kinds, their formats and their measured track counts |
| Grid | `apps/web/lib/offer-book-grid.ts` | `gridForKind`, `gridForFormat` |
| Naming | `apps/web/lib/book-title.ts` | `isoWeek`, `baseTitle`, `autoTitle` |
| Server | `apps/web/lib/offer-book.ts` | `prepareBook` / `insertBook` / `visibleProductIds` shared by three creators; `createBookFromRows`; `renameBook`; `deleteDraftBook` |
| API | `offer-books/route.ts` | `kind` replaces `format`, `title` optional, `cardBlockId` added and gated, `rows` branch |
| API | `offer-books/[id]/route.ts` | `PATCH` rename, `DELETE` discard |
| API | `offer-books/match/route.ts` | New. Matches a price list, writes nothing |
| UI | `components/offer-book/` | `NewBookWizard`, `WizardStep`, `ChoiceCard`, `DesignPicker`, `ProductSearch`, `PriceListMatcher`, `BookPreview` |
| UI | `components/editor/BookTitle.tsx` | Rename in place, in the editor header |
| Route | `editor/[id]/preview/page.tsx` | New |
| Deleted | `components/offer-book/NewBookForm.tsx` | Replaced |

### 9.2 What changed from the plan

**The grids.** §7 above. Two of the four track counts in the first draft were wrong and
were found by computing rather than by reading.

**`ChoiceCard` stayed local.** The plan said to promote the selectable card to
`components/ui/`. The component inventory's rule is that a composition one screen needs
stays with that screen and comes through the inventory only if a second screen wants it —
the `BrandCard` precedent. Both users are this wizard, so it is one screen. If the picker
is wanted elsewhere, it goes through `component-inventory.md` first.

**Three creators became one transaction.** `createBook` and `createBookFromImport` each
carried their own copy of resolve-shop, find-tier, build-grid, write-book, fan-out-offers,
and the two had already drifted. `createBookFromImport` is now a thin read that delegates
to `createBookFromRows`, and all three share `prepareBook` and `insertBook`. The lesson the
comments in there record — two statements for the offers, never two per offer, because a
round trip per offer blew the 5,000ms transaction limit at eleven products — is now
recorded in one place instead of two.

**Language is not asked and not offered.** The plan said it defaults to the interface
language. It ships hardcoded to `en` at the page, because the interface language is not
plumbed to this route yet. The field is real on the wire and in the column, and the editor
is where an owner changes it.

### 9.3 Two defects found on the way

**`size-chip` generated no CSS**, and `IconChip` — the component whose entire job is to be
a 28px square — has been shipping unsized on `/catalog` and `/brand`. `height` and `width`
have carried `chip` since the token existed; `theme.extend.size` did not. Fixed in
`packages/config/tailwind.config.ts`. This is the fifth instance of `STATUS.md` §1.0.

**`check:classes` could not have caught it.** Its regex is
`\b(size|gap|p|w|h|…)-[0-9]+\b` — numeric suffixes only. `size-7` is caught; `size-chip`,
`w-pane-start` and every other *named* token utility are invisible to it, which is the
larger half of this design system. Extending it to named tokens is not done and is worth
doing: the check exists precisely because nothing else in the toolchain can see this.

### 9.4 Still owed

- **§8.1 is still open**, as agreed: an unmatched CSV row is listed and skipped, and the
  catalog is never written. That is the interim behaviour, not a decision.
- **`listImportsForBook` has no caller.** The old screen was its only one. Kept because
  E5-06's commit screen offering "make a book from this" is the natural caller, and
  `createBookFromImport` is still reachable through the API's `importId` branch. Noted in
  its own docstring so it does not read as dead code.
- **Nothing has been opened in a browser.** Everything above is typecheck, lint, 929 tests
  and a production build, which is exactly the evidence `STATUS.md` §1.0 says was not
  enough four times running. The wizard, the design tiles, the match table and the preview
  need a real page before this is called done. Arabic at real string lengths is part of
  that, and so is the `check:classes` blind spot in §9.3.
- **`docs/STATUS.md` and `docs/E6-pending.md` do not link here yet.**


---

## 10. Layout editing, 10 September

The creation flow decides a layout once. This is the other half: changing it
afterwards, in the editor's layout panel. Margin, header band, footer band.

### 10.1 The bug this uncovered

`PATCH /api/v1/offer-books/[id]/grid` called `bookletGrid({ perRow, bodyRows })` and
nothing else. It rebuilt the master grid from scratch on every edit — which is right, and
hand-patching tracks and regions in place is how a grid ends up internally inconsistent —
but it rebuilt from **two fields**. Everything else was silently reset.

So changing "3 across" to "4 across" would:

- reset the offer card to `blk_offer_card`, discarding the design chosen in step 2, and
- give a square post a footer band it had never had, because `bookletGrid` always writes
  one.

The second was latent before this work and became reachable the moment a post could exist.
The first became reachable the moment the card was choosable at all — which is to say,
both were shipped by §9 that morning and neither had a test.

**`readGridChoice` is the fix**: it reads a stored grid back into the choice that made it,
the route applies a delta, `gridForKind` rebuilds. `offer-book-grid.test.ts` asserts the
round trip for every kind, and asserts that a change of track count preserves card, bands
and margin.

### 10.2 Absent is not null

A band has three states on the wire and only two of them are obvious.

| Sent | Means |
| --- | --- |
| absent | leave it as it is |
| `null` | remove it |
| an id | use this block |

Collapsing the first two — which `??` does, and which is what the first draft of
`gridForKind` did — makes a removed footer indistinguishable from an unmentioned one, so a
booklet's default footer comes back the next time anything else changes. The distinction
runs the whole depth: Zod's `.nullable().optional()`, the spread in the route testing
`=== undefined` rather than merging, `GridChoice`, and `composeGrid` itself.

### 10.3 What the engine gained

`composeGrid` is now the one builder, and `bookletGrid` and `postGrid` are presets over it
that differ only in what they default. The band arithmetic — how tall a band is, where the
card rows start once one exists — was written twice and had to agree; it is written once.

**Region ids still count body rows, not grid rows.** `offerRegions` takes a row offset for
exactly this: a nudge is keyed by region id, so if `r0c0` meant "first row of the grid",
adding a header would renumber every region and orphan every override in the book. Adding
or removing a band now changes no id. Changing the track count still does, and still should
— that is the failure mode the key was chosen for.

### 10.4 A band can put the cards in the dead zone

Measured, for every combination of bands on every kind:

| Kind | no bands | footer only | header only | both |
| --- | --- | --- | --- | --- |
| booklet | 0.679 | **0.769** | 0.769 | 0.862 ✗ |
| post | 0.645 | 0.780 | 0.780 | 0.924 ✗ |
| status | **0.807** | 0.914 ✗ | 0.914 ✗ | 1.025 ✗ |
| poster | 0.674 | **0.744** | 0.744 | 0.816 |

Bold is the shipped default. ✗ is outside every band the seeded offer cards design for,
so `pickArrangement` falls back and the card renders stretched.

**A story reaches it by adding one header.** That is an ordinary editor action, not an
exotic one, and §7's fix — arrangements on the cards — is still the only real answer.

What ships instead is honesty. `arrangementCovers` is new in the engine: it reports whether
any arrangement actually claims an aspect, which `pickArrangement` cannot say because it
never fails. `loadBook` measures page one's first flowing cell and returns `layout.cardFits`,
and the layout panel shows a caution line naming the fix — one row fewer, or remove a band.
Nothing refuses to draw and no rendering changed.

This is worth stating plainly: **the product now tells an owner when its own library has no
design for what they asked for.** That is a stopgap for a gap in the library, not a
feature, and it should be deleted the day the cards carry a `SQUARISH` arrangement.

### 10.5 The files

| File | What |
| --- | --- |
| `packages/engine/src/library.ts` | `composeGrid` with optional header and footer bands; `bookletGrid` and `postGrid` become presets |
| `packages/engine/src/arrangement.ts` | `arrangementCovers` |
| `apps/web/lib/offer-book-grid.ts` | `readGridChoice`; header, footer and margin on `GridChoice` |
| `apps/web/lib/offer-book-layout.ts` | New. The five named margin steps and the route's bound |
| `apps/web/lib/offer-book.ts` | `layout` carries margin, both bands, and `cardFits` |
| `offer-books/[id]/grid/route.ts` | Delta patch over `readGridChoice`; band ids gated by tenancy, plan and `repeats` |
| `components/editor/LayoutPanel.tsx` | Margin select, `Band` control, stretch warning |

### 10.6 Still owed

- **A band block is validated for `repeats`**, so an offer card cannot become a header.
  There is no equivalent check that a *header* block is not being used as a footer: the
  category filters the list the owner sees, and the route does not enforce it. That is
  deliberate for now — a shop's own block has no category and must work in both — but it
  means a crafted request can put a masthead along the bottom. It is their own book.
- **Still not opened in a browser.** Same as §9.4, and now with more surface: the margin
  select, two band selects and a warning line none of which has been rendered.


---

## 11. The page background, 11 September

The paper behind every card: a colour, a gradient, or an uploaded image.

### 11.1 What was there before

Nothing, and it was not an oversight so much as an assumption nobody had
questioned. Every renderer painted the page ground as a literal:

```tsx
<rect width={size.width} height={size.height} fill="var(--sq-tpl-paper)" />
```

`--sq-tpl-paper` is `#fff`. `PageGrid` carried `cols`, `rows`, `gap`, `margin`
and `regions`, with no field that could say otherwise. So a shop whose brand is a
deep navy could put navy on every *card* and still print them on white paper with
white gutters between them, which is a different design from the one they thought
they were making.

Nor could it be faked. A page-sized pin does not sit behind the cards: `flowBook`
makes a pin **consume** the flow regions it intersects, so it would delete every
card on the page instead.

### 11.2 The shape of it

`PageBackground` reuses `ColorValue` rather than inventing a second colour type,
so a page ground is flat or a gradient through the same three sources, the same
palette binding that follows the shop when they re-pick a colour, the same
`resolvePaint` and the same `<linearGradient>`. Only `from: 'asset'` is new, and
only because a page is the one surface large enough for a photograph to be a
background rather than a picture of something.

**It belongs to the grid, not to the book.** A `page_grids` row is already
per-role — `master`, `cover`, `back` — so a cover that wants a photograph and body
pages that want a tint is expressible the day covers are authored, with no second
field and no per-page table. One master means one background on every body page,
which is what "the background of my offer book" means.

**Absent means paper, and that is not the same as white.** A renderer with no
background falls back to the token, which is what the product always drew. The
column is nullable with no backfill for exactly that reason: an explicit white
would replace a token every shop's theme can move with a literal that cannot.

### 11.3 Two extractions, both because a second caller appeared

**`paintFill`** came out of `fillPaint`. A page ground needs `resolvePaint` and
the same `<linearGradient>` emission, but it is painted before any block exists —
no offer, no block size, no measurer, so no `DrawContext` to build. Assembling a
fake one to reach a colour would have been worse than the split. There is one
gradient emitter in this codebase and both callers go through it.

**`uploadArtwork`** came out of `DesignerShell`. The three-step handshake —
authorise, PUT straight to R2, record — was inside the only component that could
upload anything. A second copy of that would drift the day one of the three
routes changed.

### 11.4 A gap this uncovered

**The editor had no asset resolver at all.** `DrawContext.asset` turns an
`assetId` into a URL, `DesignerShell` has supplied one since E7, and `BookPage`
never did — so **a block carrying artwork the owner uploaded drew nothing in the
offer book editor while looking correct in the designer.** Not a new bug and not
one this work caused; it surfaced because a page background needed the same
resolver. `assetBaseUrl` now reaches `EditorShell` and `BookPreview`, so uploaded
artwork inside blocks renders in both.

### 11.5 Readability, and who owns it

Two of the twenty-five seeded offer cards have no ground element at all. They are
designs rather than fallbacks — `library.ts` says so, and the reason is that only
4.2% of catalog rows carry a photograph. Their product text therefore sits
straight on whatever is behind them, and a photograph at full strength under one
of those is an unreadable flyer.

The control ships an **image strength** slider, defaulting to full, floored at
0.1, with the paper still drawn underneath so there is something to fade towards.
That is the lever a designer actually reaches for, and it leaves the decision
with the owner — their brand, their flyer. What the product does *not* do is
force a scrim or refuse a dark background. The design system is explicit that it
governs our chrome and never what a shop produces.

This is a judgement rather than a fact, and it is the one most worth revisiting
once somebody has looked at a real photograph under a real page.

### 11.6 Tenancy

An `assetId` is an R2 object key, and `POST /api/v1/blocks/artwork` builds it as
`{organizationId}/blocks/{random}`. So the check is a prefix test, and it is the
only thing between a crafted request and another shop's artwork printed across
this book's pages.

A prefix test rather than a lookup because there is no table to look in: block
artwork has no row of its own, which `lib/block-assets.ts` documents as a
deliberate simplification. The day that table exists this becomes a query, and it
is already in one place.

### 11.7 The files

| File | What |
| --- | --- |
| `packages/types/src/composition.ts` | `PageBackground`; `PageGrid.background` |
| `packages/engine/src/library.ts` | `composeGrid` carries it; omitted rather than written as null |
| `packages/db/prisma/schema.prisma` | `page_grids.background Json?` |
| `migrations/20260911090000_page_background` | The column. Nullable, no backfill |
| `apps/web/lib/offer-book-compose.ts` | `readBackground` — checked, and falls back to paper rather than throwing |
| `apps/web/lib/offer-book-grid.ts` | Round-tripped by `readGridChoice` |
| `apps/web/lib/upload-artwork.ts` | New. The upload handshake, extracted |
| `apps/web/components/blocks/draw.tsx` | `paintFill`, extracted from `fillPaint` |
| `apps/web/components/editor/BookPage.tsx` | `PageGround` replaces the hardcoded rect |
| `apps/web/components/editor/PageBackgroundControl.tsx` | New. Paper / Colour / Image |
| `offer-books/[id]/grid/route.ts` | `background` on the delta patch, validated and tenancy-checked |

### 11.8 Still owed

- **The migration has not been run.** There is no database in this environment, so
  `ALTER TABLE "page_grids" ADD COLUMN "background" JSONB` is written and unapplied.
  `pnpm db:migrate` before anything is deployed, and the app will 500 on any book
  read until it is.
- **A gradient is stored but never checked for contrast.** Same class of thing as
  §11.5, and the same answer for now.
- **Still not opened in a browser**, which is now three sessions of work deep.
  §9.4 and §10.6 say the same thing and they are getting louder: the wizard, the
  preview, the margin and band controls, and now a colour picker, a file upload,
  an opacity slider and a gradient rendered at page scale — none of it has been
  rendered once.
