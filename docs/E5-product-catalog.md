# E5 — Product Catalog

## Overview

The master product catalog is what sets SouqStudio apart from every competitor. Shop
owners never upload product images for common items — they search a pre-built database and
select in seconds. The catalog is multilingual, synonym-aware, and grows through a
combination of licensed sources and community contributions.

**Priority:** MVP

This is v2. It folds in the amendment driven by analysis of a production retail flyer, and
settles the catalog-shape decision that STATUS §4 had been carrying. Three things changed
shape rather than gaining detail, and each is marked **REPLACES** where it appears:

- **An offer is N products at one price**, not one product with a price (§7).
- **One table, two collections** — `organizationId` null is universal (§2).
- **Bilingual is a pair of columns**, not a translation table (§3).

The schema is written. `packages/db/prisma/schema.prisma` and the
`20260904000000_e5_offer_model_and_catalog_search` migration carry all of it, including
the tsvector work that STATUS listed as a separate blocker.

---

## Catalog Sources (Legal & Licensed)

| Source | Products | Licence |
|---|---|---|
| Open Food Facts | 3M+ food products | ODbL — free commercial use |
| Open Products Facts | Household / cleaning | ODbL — free commercial use |
| Open Beauty Facts | Personal care | ODbL — free commercial use |
| GS1 UAE | Regional products | Membership |
| FMCG Brand Portals | Top 200 UAE brands | Direct permission |
| Stock Photos (Unsplash / Pexels) | Generic / fresh items | Free commercial licence |
| User Contributions | Long tail / missing | Community reviewed |

**Images are never scraped.** Product names, barcodes, and categories may be extracted from
public sources as factual data. Images come from licensed sources or direct brand
permission only.

---

## 1. Two collections, one table **REPLACES**

The spec described one global catalog. What a chain actually has is two: the universal
SouqStudio catalog, and its own list — private SKUs, own-brand lines, the things no public
dataset carries.

**One table with a nullable `organizationId`.** Null is universal, set is private. Two
tables was the obvious alternative and is worse in three ways: one tsvector index covers
both instead of two searched and merged in application code, precedence becomes an
`ORDER BY` rather than a merge, and `OfferItem` keeps a single foreign key instead of a
polymorphic reference that nothing can join through.

Search resolution: the organization's own rows first, universal as fallback. A private row
carrying the same barcode as a universal one shadows it — that is the mechanic that lets a
chain correct a bad public record for itself without waiting on review.

Barcode uniqueness is **per collection**, and it takes two constraints. `@@unique([organizationId, barcode])`
covers the private rows. It does not cover the universal ones, because Postgres treats
NULLs as distinct and every universal row has a null `organizationId` — so the migration
adds a partial unique index for those. Missing this is silent: duplicates accumulate and
search returns the same product twice.

---

## 2. Bilingual is a first-class field, not a translation table **REPLACES**

EN and AR are both v1 surfaces, so name and spec are paired columns on the product.

```
nameEn / nameAr · brandEn / brandAr · specEn / specAr · originEn / originAr
```

`nameAr` is nullable at ingest and **required before an offer using it publishes to an AR
edition**. Surface it as a catalog completeness warning, not a hard block at import —
otherwise import throughput dies and the owner abandons the upload.

Arabic strings round-trip through the import resolver unchanged. **Do not normalise or
strip diacritics on the stored value.** The tsvector is built from the string as stored.

`specEn` is the variant line under the name — "versch. Sorten, je 200-g-Becher" in the
reference, "assorted flavours, 200g tub" here. `originEn` renders as a prefix line above
the name, except at `DENSE` density where E6 §5 folds it into spec.

---

## 3. Image assets need a cutout variant

The reference flyer floats background-removed product cutouts on tinted panels. That
grammar is most of what separates a real offer book from a slide deck. Open Food Facts and
most brand-portal packshots arrive on white or with shadowed studio backgrounds, so removal
is an **ingest stage, not a shop owner's chore**.

```
ORIGINAL  ──→  bg.remove worker  ──→  CUTOUT + bboxTight + quality
```

`image_assets` replaces `catalog_products.imageUrl` and `.thumbnailUrl`. Cards always
request `CUTOUT` and fall back to `ORIGINAL` only with a visible quality flag in the
editor.

**`bboxTight` matters more than it looks.** The layout engine scales cards to optical
weight, not to raw file dimensions. Without it, a cutout carrying 30% transparent padding
renders visibly smaller than its neighbours on the same row, and nobody can say why.

Low-confidence mattes route to a review queue (`reviewState = PENDING`) rather than
silently shipping a haloed cutout onto a printed page. `quality` is the matting
confidence, 0..1; the threshold is a worker constant, not a column.

The `bg` queue already exists and is implemented for logos. `BgRemovePayload` now carries
`catalogProductId` and `sourceAssetId` for the catalog path.

---

## 4. Pack size and the derived unit price

`(1 kg = 1.76)` is computed, editable, and suppressible. It is not legally required in the
GCC, but it costs nothing and reads as credible, so it defaults on.

- `packSize` in `packUnit`, times `packCount` for a multipack — 8 × 25 g is size 25, unit
  `G`, count 8.
- Compute `price ÷ (packSize × packCount)`, normalised to the base unit (kg, l, or piece).
- **Store the computed value on the offer at publish time** so a reprint of an old book
  reproduces exactly, rather than recomputing against pack data since corrected.
- `unitPriceMode`: `AUTO | MANUAL | HIDDEN`, defaulting to `AUTO`.
- A multi-item offer whose items have divergent pack sizes emits one unit price per item.

The old free-text `unit` column is dropped rather than parsed. "500g" cannot be split
reliably, and a null here reads as `HIDDEN` — no line — rather than as a wrong number on a
printed page.

---

## Features

### E5-01 Full-Text Search

- Powered by PostgreSQL `tsvector`, weighted: name EN and AR (A), brand and category (B),
  spec and tags (C)
- **`simple` dictionary, never `english`** — English stemming applied to Arabic, Hindi and
  Urdu transliterations produces wrong matches. Language handling lives in the synonym
  table instead.
- Multilingual: search in English, Arabic, Hindi, or Urdu — same results
- Synonym matching: "chawal" → Basmati Rice, "أرز" → all rice products
- Fuzzy matching for typos (`pg_trgm`, on both name columns)
- Returns top 10 ranked by relevance, **organization rows before universal ones at equal
  rank**
- Results show: cutout thumbnail, name in the interface language, brand, category, pack size

**Search Flow**
```
User types "rice" or "chawal" or "أرز"
      ↓
tsvector FTS hits nameEn + nameAr + brand + category + tags  (weighted)
      ↓
Synonym table checked for additional matches
      ↓
Results merged, ranked, org collection ordered first
      ↓
User selects product → becomes an OfferItem on a new or existing offer
```

### E5-02 Category Browsing

- Top-level categories shown as visual tiles on empty search state
- Categories: Grocery, Beverages, Snacks, Dairy, Bakery, Cleaning, Personal Care,
  Electronics, Fresh Produce, Frozen Foods
- Clicking category shows subcategories, then products
- Breadcrumb navigation (Grocery > Rice > Basmati)
- `catalog_categories.nameAr` carries the Arabic label; a category with no Arabic name
  falls back to English rather than rendering blank

### E5-03 Barcode / EAN Lookup

- Camera barcode scan on mobile (via browser API)
- Manual EAN entry on desktop
- Lookup checks the organization's collection first, then universal
- If found: product auto-selected
- If not found: prompt to add missing product (E5-04)

### E5-04 Missing Product Upload

Triggered when a search or barcode scan returns no result.

```
"We couldn't find [product name]. Add it?"
      ↓
Upload product photo
      ↓
ImageAsset ORIGINAL written, bg.remove enqueued for the CUTOUT
      ↓
Enter: name (EN, AR optional), brand, category, pack size and unit
      ↓
Row created in the ORGANIZATION's collection — usable immediately, no wait
      ↓
Flagged for the universal catalog review queue (E5-05)
```

The product is usable in the owner's own collection the moment it is created. **Review
decides promotion to the universal catalog, not availability.** This is the difference
between a self-served product and one where a shop owner in Dubai at 11pm waits on a
reviewer in the morning.

User-uploaded images stored under `/{org_id}/{shop_id}/custom-products/`.

### E5-05 Community Contribution Pipeline

Products created by shop owners (E5-04) enter a review queue for promotion to the universal
catalog.

**Review Queue (Admin)**
- Shows: cutout and original, name, brand, category, matte confidence
- Actions: Approve → clears `organizationId`, promoting the row | Reject (with reason) |
  Request better image
- Approved products benefit all users going forward
- Submitting shop gets notified when their product is promoted

**Quality Gates**
- Image minimum 400×400px
- Cutout produced, `quality` above the review threshold
- Name must not already exist in the universal catalog (duplicate check, tsvector + trgm)
- Admin can merge with an existing universal record rather than promoting a duplicate

### E5-06 Spreadsheet Import

The owner's own list arrives as a spreadsheet, not as a hundred search queries. This is the
path most weeks will actually take.

```
Upload CSV or XLSX
      ↓
Column mapping screen — header name → canonical field, confirmed by the owner
      ↓
Each row resolved: barcode exact match, then name match (tsvector + pg_trgm)
      ↓
Organization collection first, universal as fallback for images and details
      ↓
Review screen: MATCHED · AMBIGUOUS (pick one) · UNMATCHED (create, or skip)
      ↓
Commit → offers created in the book, prices carried from the sheet
```

- Matching by name and not only by barcode is why the tsvector migration blocks **import**
  as well as search.
- The uploaded file is kept at `catalog_imports.sourceKey`, so a disputed import is re-read
  rather than re-uploaded.
- `catalog_import_rows.raw` holds the row exactly as read. The "we could not match this"
  screen shows the owner their own row, in their own words — not a parsed approximation.
- An `AMBIGUOUS` row carries ranked `candidates`; the owner picks. Never auto-resolve an
  ambiguous match, and never silently pick the top score. A wrong product at the right
  price is worse than a gap.

### E5-07 Phone Capture Handoff

Unmatched rows usually mean the product exists on a shelf and nowhere else. The desktop
shows a QR; the phone opens `/capture/{code}` and photographs the shelf.

- `capture_sessions` is token-scoped and short-lived. The phone **never** gets a shop-owner
  session — it gets a capture token, hashed in the table, same rule as sessions.
- Each photo creates an `ImageAsset` ORIGINAL and enqueues the cutout.
- Captured products land in the organization's collection and attach back to the import
  that opened the session.
- The session expires; a revoked or expired code renders a plain "this link has expired"
  page, not an error.

### E5-08 Catalog Admin Panel

Internal tool for the SouqStudio team to manage the universal catalog. Overlaps E13 —
build the shop-facing half first.

- Search and browse all products, both collections
- Add / edit / archive products (**never delete** — published books reference them)
- Bulk import via CSV
- Manage synonyms per product
- Manage categories and subcategories
- Contribution queue (E5-05) and matte review queue (§3)
- Run AI enrichment on selected products (synonyms, tags, translations)
- Image management: replace, re-run cutout, approve or reject a matte

---

## Frontend Notes

- Component library: shadcn/ui. Styling: Tailwind. Tokens and layout: `souqstudio-design`.
- Search input is the primary element — auto-focused when the catalog panel opens
- Results are a scrollable grid of product cards (cutout + name + brand + pack size)
- Category browser uses visual tile layout with category icons
- Barcode scanner uses `@zxing/browser`
- Search is debounced 300ms — no search on every keystroke
- A row from the organization's collection is marked as such in the result list. An owner
  needs to know whether they are looking at their own record or the shared one before they
  edit it.
- Pack sizes and prices are figures: `[data-figure]`, mono, tabular, bidi-isolated.
- The empty search state is a category browser. **Zero results is a different screen** and
  carries no illustration — see `illustration-manifest.md`, where `empty-catalog-search`
  was struck as unfillable for exactly this reason.

---

## Backend Notes

- `tsvector` with a GIN index on `search_vector`, trigger-maintained. Raw SQL, in the
  migration — Prisma does not manage tsvector columns.
- `pg_trgm` for fuzzy matching, indexed on `nameEn` and `nameAr`
- Synonym table joined at query time — no denormalisation
- Product images in Cloudflare R2, addressed by `image_assets.r2Key`
- AI enrichment runs on the `enrich` queue as a nightly batch over new and unenriched
  products. **That worker is still a stub that throws** — see STATUS.
- Cutouts ride the existing `bg` queue with the catalog fields on `BgRemovePayload`
- Universal catalog seeded from the Open Food Facts dump filtered for GCC relevance

---

## Database Tables

Written and migrated. See `packages/db/prisma/schema.prisma`.

```
catalog_products      organizationId (null = universal), nameEn/nameAr, brandEn/brandAr,
                      specEn/specAr, originEn/originAr, category, subcategory,
                      packSize/packUnit/packCount, barcode, tags, metadata,
                      source, enrichedAt, archivedAt, search_vector TSVECTOR
image_assets          productId, kind (ORIGINAL|CUTOUT|THUMB), derivedFrom, r2Key,
                      width, height, bboxTight, quality, reviewState
product_synonyms      catalogId, synonym, language, region
catalog_categories    name, nameAr, parentId, iconUrl, displayOrder
product_contributions shopId, catalogId, imageUrl, name, brand, category, status
catalog_imports       organizationId, shopId, sourceKey, filename, status, columnMap,
                      rowCount, matchedCount, unmatchedCount, committedAt
catalog_import_rows   importId, rowIndex, raw, status, catalogProductId, candidates, price
capture_sessions      organizationId, shopId, importId, code, tokenHash, expiresAt,
                      revokedAt, capturedCount, createdBy
```

The offer model these feed — `offers`, `offer_items`, `promo_tiers`, `offer_chips`,
`offer_footnotes`, `offer_shop_overrides` — is specified in §7 below and consumed by E6.

---

## 5. Promo tiers, chips and badges

Flyers use two or three named promo tiers with distinct badge treatments, plus chips
carrying non-price metadata.

**`promo_tiers`** are org-scoped and seeded per template theme. `tokenRef` is a
design-system colour token name and **never accepts a raw hex** — the same enforcement rule
as the rest of the system. `emphasis` is 1..3 and drives badge scale in the layout engine,
and which offers bid first for spanning slots.

`offers.promoTierId` is NOT NULL, so an organization with no tiers cannot hold an offer at
all. The migration seeds two (`Deal`, `Offer`) for existing organizations. **Organization
creation must seed the same two rows** — that is application code in the signup path and it
is not written yet. See §9.

**`offer_chips`** carry `COUNTER | ORIGIN | CERT | SCALE | LOYALTY | CUSTOM`, a bilingual
label, an optional JSON `value` (`{ "scale": 3, "of": 5 }`, `{ "amount": 0.20 }`), and a
logical anchor.

Chips may **overhang the card boundary** — the loyalty coin in the reference sits half
outside the top-left corner. Card groups therefore render unclipped with explicit z-order,
and the engine reserves the bleed in slot gap calculation. This is E6 §7's problem to
render and this epic's to store.

---

## 6. Shop-level overrides

The reference flyer carries a distribution variant code — same book, regional assortment
and pricing. **This is the mechanic that makes a chain pay per shop rather than buying one
seat**, so it is not a nice-to-have.

`offer_shop_overrides` is keyed `(offerId, shopId)` and carries an optional price and an
availability flag. Resolution order is shop override → offer default.

An offer suppressed for a shop is removed from that shop's edition and **the layout engine
reflows the page** rather than leaving a hole (E6 §4).

Each rendered edition stamps a variant code — `{bookCode}-{shopCode}-{lang}` — into the
artboard margin. It is a template slot so themes can place it, not a hardcoded corner.

---

## 7. An offer is N products at one price **REPLACES**

The single biggest schema change, and the reason to make it before the editor exists rather
than after.

Real flyers routinely put two or more SKUs behind one price mark: "Pesto Rosso *or* Pasta
Sauce Basilico — 1.99". A one-to-one product-to-price row cannot express it. `OfferBookProduct`
is gone; `offers` + `offer_items` replace it.

**Render contract.** Item 0 supplies the brand lockup and the primary image. Subsequent
items render their name and spec block prefixed by the localised connector (`OR` / `AND`).
All items may contribute images to the card's image stack.

`offer_items` carries per-book name and spec overrides. A shop renaming a product for one
flyer **is not a catalog edit** — the override writes to the item, never back to
`catalog_products`.

Footnotes (`offer_footnotes`) are `PAGE` or `BOOK` scoped and carry **no marker number**.
Numbering is assigned at render time in reading order, so an AR edition numbers
right-to-left correctly from the same rows. Storing the marker would give two answers that
can disagree.

---

## 8. Enums, and why they start here

This is the first part of the schema to use Postgres enums. Everything above it spells
closed sets as `String // a | b | c`, and that convention is not abandoned — it is
scoped-out-of on purpose.

The layout engine branches on every one of these values. A bad string reaching it renders a
card wrong on a printed page instead of throwing, and a printed page is not recoverable.
`PriceMode`, `Connector`, `ChipKind`, `ChipAnchor`, `FootnoteScope`, `PackUnit`,
`ImageKind`, `ReviewState`, `UnitPriceMode`, `ImportStatus` and `ImportRowStatus` are
enums for that reason.

**Do not convert the older columns to match.** A half-converted schema is worse than either
convention held consistently.

---

## 9. What is not written

Carried here rather than discovered later.

- **Promo tier seeding on organization creation.** The migration covers existing orgs. The
  signup path must seed `Deal` and `Offer` for every new one, or the first offer that org
  creates violates a NOT NULL.
- **The `enrich` worker still throws.** Synonyms and translations do not generate. E5-01
  works without it; E5's multilingual promise does not.
- **The cutout branch of the `bg` worker.** The payload fields exist; the handler does not
  write `image_assets` rows yet.
- **RLS policies.** `catalog_products`, `catalog_imports`, `capture_sessions` and every
  offer table are tenant tables and no policy has been written for any of them. See
  `E2-pending.md` §1.
- **Rate limiting on `/capture/{code}`.** It is an unauthenticated, guessable-shaped public
  surface that accepts image uploads.

---

## Out of Scope

- Nutritional data display (available from Open Food Facts, not needed for offer books)
- Price history tracking
- Competitor price comparison
- Product availability / stock status beyond the per-shop `isAvailable` flag
