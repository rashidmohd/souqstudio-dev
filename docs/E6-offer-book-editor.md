# E6 — Offer Book Editor

## Overview

The editor is the core of SouqStudio. It is where shop owners build their offer books.

**Priority:** MVP

This is v2, and the headline change is architectural: **a layout engine composes pages;
Fabric is the adjustment layer.** The v1 spec made the Fabric canvas the source of truth
and gave the owner a grid to place products into. That is marked **REPLACES** below, along
with the price mark, which is now a component rather than an arrangement of text boxes.

Depends on E5 v2. The offer model — `offers`, `offer_items`, `promo_tiers` — is written and
migrated; this epic composes and renders it.

---

## 1. Engine-first composition **REPLACES**

If the canvas is the primary composition surface, the five-minute promise fails and
week-to-week consistency collapses across a chain. **Nobody hand-positions cards weekly.**

```
select offers → engine assigns to template slots → Fabric renders → owner nudges
```

Fabric owns: nudging position within a slot, swapping images, editing text, reordering by
drag.

Fabric does **not** own: creating slots, deciding the grid, or free-positioning cards on the
page.

Every adjustment is a bounded delta against the engine's output — `SlotOverride` in
`@souqstudio/types`, stored as an array on `offer_book_pages.slotOverrides`:

```ts
type SlotOverride = {
  slotId: string
  offsetX?: number      // clamped to ±8% of slot width
  offsetY?: number
  imageScale?: number   // 0.8..1.25
  imageAssetId?: string
  textOverrides?: Record<string, string>
}
```

The clamps are the point, not a safety rail. Re-running the engine — an offer added, a shop
variant switched, a language toggled — **preserves overrides by `slotId` and discards
orphans**. That is what makes a weekly reissue cheap: same template, new offers, overrides
survive. Unbounded free positioning cannot survive a re-run, so it would turn week 33 into
a rebuild instead of week 32 with four products swapped.

Provide "reset to template" per card and per page.

**What this replaces.** `offer_books.canvasState` — the serialised Fabric dump — is gone.
A page is now the engine's output plus these deltas. The export path still goes through
Fabric's `toSVG()`; what changed is where the page comes from, not how it leaves.

---

## 2. Template grammar

A template is data, not code. Themes ship as JSON validated against a schema. The full
shape is `OfferTemplate` in `@souqstudio/types`.

```ts
type OfferTemplate = {
  id: string
  pageTypes: PageType[]
  densityProfiles: DensityProfile[]   // see §5
  tokens: string                      // design-system token set ref
}

type PageType =
  | { kind: 'OFFER_GRID'; hero?: HeroBand; grid: TemplateGrid; footer?: FooterBand }
  | { kind: 'CAMPAIGN'; hero: HeroBand; slots: Slot[]; priceless: true }
  | { kind: 'CROSS_SELL'; hero: HeroBand; cta: Slot; grid?: TemplateGrid }
  | { kind: 'COVER'; hero: HeroBand; grid?: TemplateGrid; masthead: Slot }
```

Three things a real flyer forces that a flat grid cannot express:

- **Spans.** A hero card occupying one column across two rows, beside two rows of three.
  `Slot` carries `colSpan` and `rowSpan`.
- **Groups.** A bordered, tinted container wrapping several cells with its own header —
  loyalty sections, own-brand blocks. `SlotGroup` carries a `surfaceToken`, an optional
  border token, and a bilingual label.
- **Priceless pages.** Campaign pages carry loyalty values and a "prices in store" footer
  and no price marks at all. **A page type, not a styling flag** — a page with prices
  suppressed still reserves the space for them, and looks it.

`minEmphasis` on a slot reserves it for a high-tier promo. `surfaceToken` and every other
colour reference is a design-system token name; **never a hex**, same rule as everywhere
else.

### Relationship to E7 and to the E4 presets

`GridConfig` and `TemplateConfig` in `@souqstudio/types` are the E4 brand-kit presets — the
five seeded grids and five seeded templates the setup wizard offers. They are **not** this
grammar and must not be extended into it. E7 owns migrating the seeded presets onto
`OfferTemplate`; until it does, the two coexist and `offer_books.templateId` points at a
`templates` row whose `config` is still the old shape.

---

## 3. The price mark is a component **REPLACES**

This is the single element that decides whether output reads as a real offer book. The v1
spec had font-size dropdowns and a badge-text override per product. If owners assemble a
price from text layers, you get hundreds of inconsistent variants inside a month.

```ts
type PriceMark = {
  tierId: string             // PromoTier — label, token, emphasis
  major: string              // integer part, oversized
  minor?: string             // raised cents
  currency: 'AED' | 'SAR' | 'QAR' | 'KWD' | 'OMR' | 'BHD'
  currencyPlacement: 'PREFIX' | 'SUFFIX' | 'SUPERSCRIPT'
  prefixLabel?: 'FROM' | 'EACH' | 'PER_KG'
  comparePrice?: string      // strikethrough
  rotation?: number          // template-set, ±6°
  shape: 'TAG' | 'BURST' | 'RECT'
}
```

Rules baked in, not left to the user:

- Minor digits raise to the major's cap height. **Never baseline-aligned.**
- The tier label renders as an attached tab. Tab and mark never separate.
- KWD, OMR and BHD are three-decimal and take a distinct minor treatment. Build it now —
  it is a one-line branch today and a forgotten bug the week Kuwait signs up.
  `THREE_DECIMAL_CURRENCIES` is exported from `@souqstudio/types`.
- The mark is always LTR with Western numerals, **including in AR editions** (§6).

**Expose exactly one authoring control: tier.** Everything else derives from the offer and
the template. This replaces E6-03's discount-magnitude badge table and E6-04's font-size and
badge-text controls — magnitude does not choose a badge any more, the promo tier does, and
the tier is a row the organization configures once.

---

## 4. Fit, overflow and reflow

Cards degrade predictably rather than break. Fit ladder, applied per card in order until it
fits:

1. Tighten spec-line leading to the template's minimum.
2. Drop to the next type step — bounded by the design system's scale, never an arbitrary
   size.
3. Truncate spec. **Never name, never price.**
4. Escalate: flag the card in the editor with a fix affordance.

Name and price never shrink below the template floor. A too-small price mark defeats the
artefact, which is the whole reason the shop is here.

This is the same rule the design system already states as "overflow is declared, not
discovered" for the card designer. Same principle, engine-side.

**Reflow triggers:** offer added or removed, a shop override suppressing an offer, a
language switch. The engine repacks the grid, preserves `SlotOverride`s by id, and
**reports moved cards** so the owner is not surprised by a page they did not touch.

Offers whose tier meets a slot's `minEmphasis` bid for spanning slots first. Ties break on
offer position.

---

## 5. Density profiles

The reference flyer runs about eight offers a page — a premium European density. GCC books
commonly run 20–30 SKUs per page. **The same template must survive both.**

```ts
type DensityProfile = {
  id: 'SHOWCASE' | 'STANDARD' | 'DENSE'
  cardsPerPage: [number, number]
  typeScaleStep: number      // index into the design-system scale
  imageRatio: number         // image share of card height
  showUnitPrice: boolean
  showOrigin: boolean
  maxSpecLines: number
}
```

**Design the card at `DENSE` and bilingual — the worst case — then let it breathe.** Doing
it the other way round produces a card that only works at showcase density and collapses
the moment a real chain loads a full week.

At `DENSE`, spec drops to one line and origin folds into spec.

Density is a book-level default on `offer_books.densityProfile`, overridable per page on
`offer_book_pages.densityProfile`.

---

## 6. RTL

**Layout mirrors; the price mark does not.**

- Grid, slot order, card internals and footnote numbering all mirror. Logical properties
  throughout, per the existing design-system rule.
- Price marks, currency codes, unit prices and pack sizes stay LTR with Western numerals.
  This matches every GCC retailer's actual print, and it is what `[data-figure]` already
  enforces in chrome.
- **Cutout images do not flip.** Packaging with legible text mirrored is an instant tell.
- Bilingual cards stack AR above EN in AR editions and EN above AR in EN editions. Both use
  the same slot, so a card sized for one language and not the other fails the fit ladder —
  which is why §5 says design at DENSE *and bilingual*.
- Chip anchors are logical (`TOP_START`), so an overhanging badge lands on the correct
  corner automatically.

---

## 7. Chips, overhang and z-order

Card groups render **unclipped**. Layer order, bottom to top:

```
group surface → card surface → image cutout → text block → price mark → chips
```

Chips anchored `TOP_START` / `TOP_END` may overhang by up to 50% of their own width. The
engine reserves that bleed in slot gap calculation, so an overhang never collides with a
neighbouring card.

---

## 8. Footnote rendering

Markers are assigned **at render time in reading order**, so an AR edition numbers
right-to-left and an EN edition left-to-right from the same offer rows. Nothing stores a
marker number.

`PAGE`-scoped notes collect into the page footer band. `BOOK`-scoped notes collect into a
terms block on the last page. Identical text within a scope dedupes to one marker.

---

## Features

### E6-01 Editor Canvas & State Management

- Editor loads with the brand kit and the book's template pre-applied
- Zustand holds logical state: selected offers, page list, selected slot, override map,
  undo stack. Fabric holds visual state. They do not overlap — see `apps/web/CLAUDE.md`.
- `document.fonts.load()` runs before any Fabric text object is created, or every bounding
  box is wrong
- Auto-save every 2 seconds, debounced. No manual save button.
- "Saved" / "Saving…" indicator in the header

**Editor Layout (Desktop)**
```
┌─────────────────────────────────────────────────────┐
│  Header: title | density | language | share | export│
├──────────────┬──────────────────────┬───────────────┤
│  Offer tray  │    Artboard          │  Properties   │
│  catalog     │    (engine output)   │  (selected    │
│  search +    │                      │   offer or    │
│  offer list  │                      │   slot)       │
└──────────────┴──────────────────────┴───────────────┘
```

Below 1024px the side panels **overlay** the artboard rather than compressing it. Mobile:
the offer tray slides up from the bottom, properties is a bottom sheet.

### E6-02 Offer Tray **REPLACES**

Replaces free placement and cell-by-cell product assignment.

- Search the catalog (E5) and add products; each becomes an offer, or an item on the
  selected offer
- **Multi-item offers**: add a second product to an existing offer and pick the connector
  (`OR` / `AND`). This is the "Pesto Rosso *or* Pasta Sauce Basilico" case, and it is a
  first-class action, not an edge case
- Drag to reorder within the page. The engine places; the owner orders.
- An offer's card shows the price mark, tier badge, and any quality flags

### E6-03 Offer Properties

Per offer, in the properties panel:

- Price, and price mode (`FIXED` / `FROM` / `PER_UNIT`)
- Compare price — the strikethrough was-price
- **Promo tier** — the one authoring control on the price mark
- Unit price: `AUTO` / `MANUAL` / `HIDDEN`, computed from pack maths and shown live
- Chips: add, choose kind, label and anchor
- Footnotes: text and scope
- Legal lines — deposits, service fees
- Per-item name and spec overrides, EN and AR. **These write to `offer_items`, never back
  to the catalog.**

### E6-04 Slot Adjustment

When a card is selected on the artboard:

- Nudge within the slot, clamped
- Scale the image, 0.8..1.25
- Swap to another `ImageAsset` on the same product
- Edit text in place
- **Reset to template**, per card and per page

There are no font-size dropdowns and no badge-text override. Those were v1 controls, and
§3 explains what replaced them.

### E6-05 Page Management

- Add a page, choosing its page type from the template
- Duplicate, reorder by drag, delete with confirmation
- Page thumbnail strip below the artboard
- Per-page density override

### E6-06 Undo / Redo

- Full undo / redo stack, max 50 steps
- Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and buttons in the header
- The stack holds logical operations — an override changed, an offer reordered — not Fabric
  object diffs. Stack cleared on page navigation.

### E6-07 Editor Surface Controls

- **Density switch** in the page toolbar, live
- **Language toggle** renders the sibling edition inline. Do not make owners publish to
  discover that the AR layout broke.
- **Shop variant switch** shows which cards are suppressed or repriced for the selected
  shop
- **Quality flags** on cards: fallback (non-cutout) image, low matte confidence, missing
  `nameAr`, escalated fit failure. **Block publish on missing `nameAr` for AR editions
  only.**
- **Disclosure chip** toggle for AI-generated hero imagery, per market. The reference flyer
  carries exactly this on its hero photography, in national print — the practice is already
  normal at scale. In this product it is not optional: `MachineOutput` marking is an
  absolute rule.

### E6-08 Auto-Save

- Debounced 2 seconds after the last change
- Saves offers, offer items and per-page `slotOverrides` — not a canvas dump
- "Saved [time]" in the header
- On reconnect after offline: last-write-wins, with a "Restored from [time]" notice

---

## Frontend Notes

- Component library: shadcn/ui. Styling: Tailwind. Tokens and layout: `souqstudio-design`.
- Canvas: Fabric.js. Do not hold canvas internals in React state — use the Fabric object
  model directly.
- Editor state: Zustand with Immer. `stores/editor-store.ts` does not exist yet;
  `brand-store.ts` is the pattern to follow.
- Drag and drop: dnd-kit, for tray reordering — not for Fabric-internal drag.
- The artboard sits on `--sq-ui-canvas-surround`, the only dark surface in the product.
- Every price, pack size and count is `[data-figure]`.
- Mobile: engine output is read and reorder only. No slot adjustment on touch for MVP.

---

## Backend Notes

- Auto-save: `PATCH /offer-books/:id` accepts a partial update of offers and page overrides
- The engine runs on the server for export and in the browser for the editor, from **one
  implementation**. Two would drift, and drift here means the PDF does not match the screen.
- Offer book status: `draft` | `published` | `archived`
- Export still goes canvas → `toSVG()` → HTML shell → Playwright. Unchanged by this delta.

---

## Database Tables

Written and migrated with E5. See `packages/db/prisma/schema.prisma`.

```
offer_books        shopId, title, format, status, templateId, densityProfile, language,
                   shortCode, shareableLink, expiresAt, passwordHash, linkActive
offer_book_pages   bookId, index, pageType, densityProfile, slotOverrides JSONB
offers             bookId, position, price, priceMode, comparePrice, currency,
                   promoTierId, unitPriceMode, unitPriceValue, unitPriceUnit, legalLines
offer_items        offerId, catalogProductId, position, connector,
                   name/spec overrides EN + AR, imageAssetId
promo_tiers        organizationId, labelEn, labelAr, tokenRef, emphasis, isDefault
offer_chips        offerId, kind, labelEn, labelAr, value, anchor
offer_footnotes    offerId, textEn, textAr, scope
offer_shop_overrides  offerId, shopId, price, isAvailable
```

`offer_book_products` is dropped. `offer_books.canvasState` is dropped.

---

## Build order

1. **Price mark component + promo tiers** (§3). Everything else renders around it.
2. **Template schema + engine placement**, single density, EN only (§2).
3. **Card variants + fit ladder** (§4).
4. **Fabric override layer with clamping** (§1).
5. **Density profiles** (§5), then **RTL** (§6).
6. **Chips, footnotes, shop variants** (§7, §8).

**Steps 1–3 are the risk.** If the engine's output looks like a real flyer with no manual
adjustment, the product works. If it needs hand-finishing to look right, the value
proposition does not hold — and it is much better to know that at step 3 than at E13.

---

## What is not written

- **The layout engine itself.** No package exists for it yet. It is shared between web and
  worker, so it belongs in `packages/`, not in `apps/web/lib`.
- **`stores/editor-store.ts`.**
- **The `pdf` worker still throws.** The editor can be built and autosaved before anything
  exports; export is E9.
- **Brand kit fonts are typed and unimplemented**, so the editor has no shop-chosen typeface
  to load. See CLAUDE.md.
- **`Brand` entity decision.** `organizations.brandKit` assumes one brand per organization;
  a GCC retail group holds several trade licences. Cheapest to settle before the editor
  reads the kit. `E4-pending.md` §1.

---

## Out of Scope (MVP)

- Free-form canvas — and now permanently, not just for MVP. §1 is a decision, not a phase.
- Collaboration (simultaneous editing) — V3
- Version history / named snapshots — V3
- Comments / annotations — V3
