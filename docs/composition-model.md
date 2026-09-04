# Composition Model — brand kit, blocks, grids, flow

## Overview

How an offer book is composed, across E4, E6 and E7. This is the architecture those
epics share, and it supersedes the parts of them that contradict it.

**Supersedes:** `E6 §2` (template grammar), `E6 §5` (density profiles),
`E6-05` (page management). **Changes:** `E4` brand kit shape, `E7` scope.

The rest of E6 survives intact and gets easier — see §9.

The one sentence: **a brand kit is identity, a block is a designed building block, a page
is a spreadsheet of regions filled with blocks, and products flow through it.**

---

## 1. Three levels, and what each owns

| Level | Owns | Never owns |
| --- | --- | --- |
| **Brand Kit** | Logo, colours, fonts | Any layout, any template choice |
| **Block** | The design of one repeatable unit | Where it sits on a page |
| **Page** | A grid of regions, and which block fills each | What a block looks like inside |

Each level is ignorant of the one below it. That is what lets a brand kit carry many
blocks, a block appear in many pages, and a page survive a change to either.

---

## 2. The brand kit holds no layout **REPLACES**

`BrandKit` in `@souqstudio/types` currently carries `gridId` and `templateId`. Both come
out. A brand kit is who the shop is; it is not a decision about how one book looks.

```ts
// Removed from BrandKit:
gridId?: string
templateId?: string

// Added:
typeScale?: TypeScale
```

The kit is **logo, colours and typography**. Nothing else.

**Done.** The fields are gone, the `layout` facet in `lib/brand-inheritance.ts` is now
`typography`, `isBrandSetupComplete` tests the colours alone, and `ChoiceGrid` and
`ChoiceStep` are deleted. Shops that finished setup under the old rule stay complete, and
stale `gridId` / `templateId` still sitting in `shops.brandKit` JSON are inert:
`resolveBrandKit` iterates `FACET_OF` rather than the stored object, and `keepOnReset`
drops any key it does not recognise. No data migration.

**Consequence for the E1 setup wizard.** Steps that pick a grid and a template stop being
brand setup. They move to book creation, where they belong — the owner is choosing how
*this book* looks, not who the shop is. The wizard gets shorter, which is the correct
direction for a step that already sits between a new user and their first result.

---

## 3. Blocks

A block is a small artboard holding typed elements in **relative** coordinates —
fractions of block width and height, never pixels. That is what lets one offer card render
at 1080×1080 for a carousel post and at one third of an A4 column in a booklet with no
redesign.

```ts
interface Block {
  id: string
  /** Null for seeded blocks. Set for owner-authored ones. */
  organizationId: string | null
  name: string
  /** Does this block repeat over the product list, or is it placed once? */
  repeats: boolean
  arrangements: Arrangement[]
  thumbnailUrl: string
}

interface Arrangement {
  /** The engine picks the arrangement whose range contains the region's aspect. */
  aspectMin: number
  aspectMax: number
  elements: BlockElement[]
}
```

### 3.1 Element kinds

```ts
type BlockElement =
  | { kind: 'image';     box: Box; source: ImageSource }
  | { kind: 'text';      box: Box; source: TextSource; style: TypeRole; align: LogicalAlign }
  | { kind: 'priceMark'; box: Box }
  | { kind: 'chip';      box: Box; anchor: ChipAnchor }
  | { kind: 'logo';      box: Box }
  | { kind: 'shape';     box: Box; surface: TokenRef; radius: number }

/** Fractions of block width and height. Logical: `start`, not `left`. */
interface Box { start: number; top: number; width: number; height: number }

type ImageSource = { from: 'product' } | { from: 'asset'; assetId: string }
type TextSource  =
  | { from: 'product'; field: 'name' | 'spec' | 'brand' | 'origin' | 'packSize' }
  | { from: 'shop';    field: 'name' | 'phone' | 'address' }
  | { from: 'static';  textEn: string; textAr: string }
```

**Owners never type a product name into a page.** Product text is bound, always. Static
text exists for headlines and legal lines, not for data that lives in the catalog. A
typed-in product name is a value that cannot reflow, cannot translate, and is wrong the
moment the catalog corrects itself.

### 3.2 Every colour and font is a role reference, never a hex

```ts
type TokenRef  = 'primary' | 'secondary' | 'accent' | 'surface' | 'ink' | 'inkMuted'
type TypeLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption'
```

**The type scale is ordered, and that buys more than a naming convention.** E6 §4's fit
ladder says an overlong string should "drop to the next type step — bounded by the design
system's scale, never an arbitrary size". With four semantic roles there is no next step to
drop to. With h1…h6 there is, and rung two of the ladder becomes a defined move.

A level carries a **multiplier**, never a pixel size:

```ts
interface TypeScale {
  families: Record<'display' | 'body' | 'price', string>
  /** Fraction of the block's sqrt(w × h). Every level multiplies it. */
  base: number
  levels: Record<TypeLevel, TypeStep>
}
```

The anchor is the block's **geometric mean**, not its shorter edge. The shorter edge was
the obvious choice and the harness disproved it inside one render: a footer band is wide
and short, so its shorter edge is tiny and every string in it collapsed to a few pixels
while the cards above read correctly. Area is what type should scale with.

There is **no price level**. A price is not text — see §3.5.

This is already the law in E6 §2, and it is the single rule that earns everything else. It
is why one brand kit carries many blocks, why blocks from different sources can sit on the
same page without collapsing into noise, and why a seeded block looks like the shop that
loaded it. Break this rule and the library becomes a set of unrelated pictures.

The block designer therefore offers **roles, not a colour wheel.**

### 3.3 Arrangements — how a block fits a region it was not designed for

Regions merge, so a region can be 1:2, 1:1, 2:1 or a wide band. A block must fit **that**,
and "fit" cannot mean stretch. A stretched card is a distorted card.

It means **reflow**. The engine selects the arrangement whose aspect range contains the
region's aspect:

| Region aspect | Typical arrangement |
| --- | --- |
| ~1:2 tall | image top, text below, price bottom |
| ~1:1 | image top, text below |
| ~2:1 wide | image start, text end, price end |
| very wide band | image start, name and price inline |

**Repeating blocks need arrangements. Static blocks mostly do not** — a brand ad is
designed at one aspect and letterboxes or crops into anything close. That asymmetry halves
the work on the half of the library owners will author most, so encode it: a static block
may ship a single arrangement with an open aspect range.

### 3.4 The repeating item region — and why it is the same mechanism

A multi-item offer ("Pesto Rosso **or** Pasta Sauce Basilico" — E6-02 calls it a
first-class action, not an edge case) is one card carrying two products with a connector.

A block handles this with a region inside it that repeats per `offer_items` row. Which
means the system has exactly one composition primitive, applied at two scales:

```
repeat(source, perRow, unit)

page level:   source = offers        → unit = block instance
block level:  source = offer.items   → unit = item sub-layout
```

One implementation, used twice. E6 needed a placement engine *plus* a `CardVariant` system;
this needs a repeater.

### 3.4a Authoring a block: drop, then bind

The designer is a small canvas over the block's fractional coordinate space. Dropping an
element creates a `BlockElement` with a `Box`; a properties panel then sets what fills it.

| Drop | Creates | Then bind to |
| --- | --- | --- |
| Image | `{ kind: 'image' }` | the product image, or a fixed asset |
| Text | `{ kind: 'text', level }` | a product field, a shop field, or static copy |
| Price | `{ kind: 'priceMark' }` | nothing — it reads the offer |
| Shape | `{ kind: 'shape', surface, radius }` | nothing |
| Logo | `{ kind: 'logo' }` | the brand kit |

**`repeats` decides the binding vocabulary.** A repeating block offers product fields
because it renders once per offer and knows which one. A static block offers shop fields
and static copy and nothing else — there is no product in scope, so the dropdown is not
merely empty, the option does not exist. That is the whole content of "this only works on a
product template".

Owners never type a product name onto a page. A typed-in name cannot reflow, cannot
translate, and is wrong the moment the catalog corrects itself.

### 3.5 The price mark is not lego

E6 §3 stands unchanged and is worth restating here because a block designer is exactly the
surface that would erode it: **the price mark is an element you place and size, never one
you open.** Raised minor digits, the tier tab, the three-decimal KWD/OMR/BHD branch, and
LTR-in-Arabic are all internal.

The owner's only control is the tier. Everything else derives from the offer. Owners given
text boxes produce hundreds of inconsistent price treatments inside a month, and the price
mark is the one element that decides whether output reads as a real offer book.

### 3.6 The block library

Two collections, one schema:

- **Seeded** — `organizationId: null`, authored by the SouqStudio team, plan-gated.
- **Saved** — authored by the owner from a region on the canvas: design a brand ad in a
  merged region, "save as block", and it carries its aspect and elements into the library.

Saved blocks are the compounding asset — they are what makes month six cheaper than month
one. They are org-scoped, so a chain designs a seasonal header once and every shop uses it.

**Always seed.** A blank artboard produces something worse than your default, and the owner
blames the product. Owner authoring is an escape hatch from a good starting point, not a
substitute for having one.

---

## 4. The page is a spreadsheet **REPLACES**

A page is a grid of cells with draggable tracks. Cells merge into regions. Each region is
filled with a block. That is the entire page model.

```ts
interface PageGrid {
  /** Track sizes as fr units. Draggable, exactly like column widths in a spreadsheet. */
  cols: number[]
  rows: number[]
  gap: number
  /** Inset on all four sides, same units. Omitted means full bleed. */
  margin?: number
  regions: Region[]
}

interface Region {
  id: string
  /** Logical, inclusive. `colStart` is the reading-order start, not the left edge. */
  colStart: number; colEnd: number
  rowStart: number; rowEnd: number
  blockId: string
  fill: 'flow' | 'static'
}
```

Merges are **rectangular only**, same as a spreadsheet. Non-rectangular selections are
refused rather than solved.

`margin` was added after the render harness showed every card running to the trim edge
of an A4 sheet. Full bleed is right for a social post and wrong for anything a guillotine
touches, so it is optional and defaults to zero.

### 4.1 What this deletes

| Deleted | Because |
| --- | --- |
| `PageType`, `PageTypeKind` — `OFFER_GRID`/`CAMPAIGN`/`CROSS_SELL`/`COVER` | A cover is a page with one big region. A campaign page is a page whose regions hold priceless blocks. |
| `HeroBand`, `FooterBand`, `masthead` | A hero is a merged 2×2 region. A footer is a merged last row. |
| `TemplateGrid`, `Slot` with `col`/`row`/`colSpan`/`rowSpan` | Slots are generated from the grid, never authored. |
| `SlotGroup` | A group is a region holding a surface block behind a nested grid. |
| `CardVariant` | Replaced by arrangements, chosen by aspect rather than named per slot. |
| `DensityProfile` as a choice | Density is the consequence of track count, not a second control. See §4.3. |
| `Grid` model, `GridConfig` | A grid is now the page's track definition, not a preset list of cells. |
| `OfferTemplate` | Replaced by `Block` + `PageGrid`. |

Everything E6 §2 enumerates as a page type becomes data an owner can produce without a
deployment. That is also most of what E7 was going to be for.

### 4.2 RTL is free

Region coordinates are logical — `colStart` is the reading-order start. An Arabic edition
mirrors the whole grid, merges included, with no second layout to author.

Per E6 §6, the price mark, currency codes, unit prices and pack sizes stay LTR with Western
numerals, and cutout images do not flip.

### 4.3 Density is derived, not chosen

Given a fixed page size, the track counts determine card size, which determines the type
step. A 2×2 page *is* showcase; a 5×6 page *is* dense. Deriving it removes a control and
removes the possibility of the two disagreeing.

The fit ladder (E6 §4) is unchanged, and it gets **easier**: the region box is known at
design time, so the block designer can show the exact box at every plausible track count
while the owner is still designing.

### 4.4 The gestures

The grid is already paid for, so take all of them:

| Gesture | Effect |
| --- | --- |
| **Fill** | Select cells, click a block, all fill — each bound to the next product. |
| **Merge / unmerge** | Cells become one region. Unmerge restores them and re-flows the binding. |
| **Drag-fill** | Design row 1, drag the handle down. A 12-cell page in two gestures. |
| **Resize tracks** | Drag a row edge. It is an `fr` value, nothing more. |
| **Copy page layout** | Page 2 is page 1's grid with the next products. The booklet workflow. |
| **Format painter** | Apply one region's block to another selection. |

---

## 5. Master and instances

Body pages are not authored individually. There is **one master grid**, and every body page
is an instance of it rendered with different products.

- Merge two cells on any body page and **all body pages change** — the edit went to the
  master.
- With no products loaded, the editor shows the master with dummy data. That is not a
  special case; it is the same page.
- **Detach** — "customize this page only" — breaks one page off the master. Rare, explicit,
  and mostly unnecessary once pins exist (§6).
- Cover and back pages are always detached and never repeat.

One merge gesture styles nine pages, which is what anyone actually wants. Nobody hand-merges
cells nine times.

---

## 6. Flow and pins

### 6.1 Flow

A `flow` region is bound to **a position in the product list**, not to a product. Swapping
week 32's offers for week 33's re-fills the same layout with no work: merges, footers and
heroes all survive.

This is the mechanism behind the whole weekly-reissue promise, and it is what E6 §1 was
protecting when it said unbounded free positioning turns week 33 into a rebuild.

### 6.2 Pins

A **pin** is a static block parked at a position in the flow. Products route around it.

```
booklet:   pin a brand-ad block at page 2, cells 5–6  → 2 products displaced downstream
carousel:  pin a message block at post 5              → 1 product displaced downstream
```

In a 1×1 carousel grid a whole-post pin **is** a cell pin. Same mechanic, same gesture, no
special case for social.

**Why a pin and not a replacement.** A replacement targets a card, and next week that card
holds a different product — so the edit is meaningless or lost. A pin targets a *position*,
so with 15 more products next week the brand ad is still on page 2 in the same two cells.
That is the difference between a five-minute reissue and a rebuild.

Pins also retire most of the need for detaching a page: they cover nearly every reason a
page would differ, and unlike a detached page they survive reflow.

### 6.3 Displace, never consume

Pinning a message block at post 5 of a 10-product carousel produces **11 posts**, not 10
with a product dropped. Silently dropping a product from an offer book is the class of bug
that reaches print.

Show the arithmetic live: *"10 products + 1 message = 11 posts."*

### 6.4 Later, not now

Pins anchor to an absolute position — page 2, cells 5–6. An owner who thinks *"the ad goes
after the dairy section"* will find it drifts when the product mix changes. Anchoring a pin
to a category boundary is a natural v2. Do not let the schema make it impossible.

---

## 7. The product limit

**100 products per book at launch, as a plan limit — not an architectural assumption.**

The real cost of 100 versus 400 is export job duration and how many pages stay live in
Fabric. Neither is a design problem. So `maxProductsPerBook` is an attribute of `Plan`
alongside the existing gating, and raising it is a row change rather than a rebuild.

Still render pages lazily — current page plus neighbours, thumbnails for the rest. It is
cheap now and it is what makes raising the number a non-event.

**Enforce at product selection, not at generation.** The catalog panel shows `100 / 100
selected` and stops. The owner never builds something that fails; they see a ceiling with
an upgrade beside it.

### Why not split into several books

Splitting a large flyer across books and merging the PDFs externally breaks things the
schema already treats as book-level:

- `shortCode` and `shareableLink` are unique per book — ten books is ten links, and the
  shop wants one QR on the door.
- `pageViews` and `productClicks` fragment into ten analytics streams.
- E6 §8: `BOOK`-scoped footnotes collect into a terms block on the last page. Split, and
  you get ten terms blocks, or nine books with none.
- Page numbering restarts at 1 ten times.
- The master and its pins are per-book, so every pin is rebuilt in every part.

---

## 8. The authoring flow

```
pick a block  →  pick a grid            →  load products      →  pages generated
                 (live previews,           (or dummy)             (100 → 9 pages)
                  page count shown)

              →  customize the master: merge cells, swap a block, add a footer
                 — all pages follow
              →  pin the exceptions: a brand ad on page 2, a message at post 5
```

Four rules that carry most of the usability:

**Never show an empty grid.** Fill with dummy products from the first frame. An empty box
teaches nothing; a realistic card shows exactly what is being built.

**Dummy products are worst case, and fixed.** The owner cannot change them, which puts the
burden on us: use the longest Arabic name in the catalog, a three-decimal KWD price, a
two-line spec. A design that survives friendly dummies and breaks on real data is worse
than no preview at all.

**Do not ask for columns and rows as numbers.** Show a live strip — 2×2, 3×3, 3×4, 4×5,
4×6 — each rendered with *their* block and *their* products. One decision by eye instead of
two abstract fields.

**Page count is feedback, not a setting.** Under each grid option: *"100 products → 9
pages."* Switching to 4×5 says *"5 pages."* That is the number the owner cares about,
because it is the print bill. Never make them compute it.

**Do not make them drag 100 cards.** Offer **group by category** — the catalog already
carries it — with a section break on each change. One click instead of an hour. Manual
reorder stays for the few they care about.

---

## 9. What survives from E6

| Section | State |
| --- | --- |
| §1 Bounded overrides | **Survives, improved.** Rekey `SlotOverride.slotId` to `regionId + offerId`. Band-derived ids are stable by construction, where position-derived ids are not — swap four products and every surviving card keeps its nudge. |
| §3 Price mark | **Unchanged.** §3.5 above restates why the block designer must not erode it. |
| §4 Fit ladder | **Unchanged, easier.** The region box is known at design time. |
| §6 RTL | **Unchanged, cheaper.** Logical region coordinates mirror the grid for free. |
| §7 Chips and overhang | **Unchanged.** Regions render unclipped; the engine reserves bleed in gap calculation. |
| §8 Footnotes | **Unchanged.** Markers assigned at render time in reading order. |
| §2 Template grammar | **Replaced** by §3 and §4 here. |
| §5 Density profiles | **Replaced** by §4.3 — derived from track count. |
| E6-05 Page management | **Replaced** by §5 — the master, not per-page authoring. |

---

## 10. Type deltas — `@souqstudio/types`

**Remove:** `GridConfig`, `TemplateConfig`, `CardVariant`, `PageTypeKind`, `Slot`,
`SlotGroup`, `TemplateGrid`, `HeroBand`, `FooterBand`, `PageType`, `DensityProfile`,
`OfferTemplate`.

**Remove from `BrandKit`:** `gridId`, `templateId`.

**Add:** `Block`, `Arrangement`, `BlockElement`, `Box`, `ImageSource`, `TextSource`,
`TokenRef`, `TypeRole`, `LogicalAlign`, `PageGrid`, `Region`, `Pin`.

**Change:** `SlotOverride.slotId` → `regionId` + `offerId`.

**Unchanged:** `PriceMark`, `CURRENCIES`, `THREE_DECIMAL_CURRENCIES`,
`SLOT_OVERRIDE_LIMITS`, `QualityFlag`, and everything under Catalog.

---

## 11. Schema deltas — `packages/db/prisma/schema.prisma`

| Table | Change |
| --- | --- |
| `grids` | **Dropped.** |
| `templates`, `template_versions` | **Renamed and reshaped** to `blocks`, `block_versions`. Add `organizationId` (nullable — null is seeded), `repeats`, `thumbnailUrl`. `config` becomes the `Arrangement[]` document. |
| `shops.brandKit` | Drop `gridId` and `templateId` from the JSONB doc comment. |
| `offer_books.templateId` | **Dropped.** Replaced by `masterGridId`. |
| `offer_books.densityProfile` | **Dropped** — derived from track count. |
| `offer_book_pages.pageType` | **Dropped.** |
| `offer_book_pages.densityProfile` | **Dropped.** |
| `offer_book_pages.slotOverrides` | Kept, rekeyed to `regionId + offerId`. |
| **New** `page_grids` | `bookId`, `role` (master / cover / back), `cols`, `rows`, `gap`, `regions` JSONB. |
| **New** `book_pins` | `bookId`, `pageIndex`, `regionId`, `blockId`, content JSONB. |
| `plans` | Add `maxProductsPerBook`. |

`offer_book_products` and `offer_books.canvasState` stay dropped, as E6 already specified.

---

## 12. Build order

1. **Block schema and renderer**, one arrangement, EN only. Nothing renders without it.
2. **Price mark component and promo tiers** — E6 §3, unchanged priority. Everything else
   renders around it.
3. **Page grid and the flow engine** — tracks, regions, fill from the product list,
   pagination. No merging yet.
4. **Merge, and arrangements** — the two together, because merging without reflow produces
   distorted cards.
5. **Master and instances** — edit once, all pages follow.
6. **Pins**, cell and page scoped.
7. **Fit ladder** (E6 §4), then **RTL** (E6 §6).
8. **Block designer and the saved library.** Last, deliberately — seeded blocks must be
   good before owner authoring is worth having.
9. **Chips, footnotes, shop variants** (E6 §7, §8).

**Steps 3–5 are the risk.** If the master plus flow produces a book that looks like a real
flyer with no manual adjustment, the product works. If it needs hand-finishing on every
page, the five-minute promise is gone and so is the reason to build it this way.
