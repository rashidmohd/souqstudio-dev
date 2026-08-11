# E5 — Product Catalog

## Overview

The master product catalog is what sets SouqStudio apart from every competitor. Shop owners never upload product images for common items — they search a pre-built database and select in seconds. The catalog is multilingual, synonym-aware, and grows through a combination of licensed sources and community contributions.

**Priority:** MVP

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

**Images are never scraped.** Product names, barcodes, and categories may be extracted from public sources as factual data. Images come from licensed sources or direct brand permission only.

---

## Features

### E5-01 Full-Text Search

- Powered by PostgreSQL `tsvector`
- Weighted search: name (A), category (B), tags (C)
- Multilingual: search in English, Arabic, Hindi, or Urdu — same results
- Synonym matching: "chawal" → Basmati Rice, "أرز" → all rice products
- Fuzzy matching for typos (pg_trgm)
- Returns top 10 results ranked by relevance
- Results show: product image thumbnail, canonical name, brand, category, unit size

**Search Flow**
```
User types "rice" or "chawal" or "أرز"
      ↓
tsvector FTS hits canonical name + category + tags  (weighted)
      ↓
Synonym table checked for additional matches
      ↓
Results merged, ranked, returned
      ↓
User selects product → added to offer book
```

### E5-02 Category Browsing

- Top-level categories shown as visual tiles on empty search state
- Categories: Grocery, Beverages, Snacks, Dairy, Bakery, Cleaning, Personal Care, Electronics, Fresh Produce, Frozen Foods
- Clicking category shows subcategories, then products
- Breadcrumb navigation (Grocery > Rice > Basmati)

### E5-03 Barcode / EAN Lookup

- Camera barcode scan on mobile (via browser API)
- Manual EAN entry on desktop
- Lookup matches against `barcode` field in catalog
- If found: product auto-selected
- If not found: prompt to add missing product (E5-04)

### E5-04 Missing Product Upload

Triggered when a search or barcode scan returns no result.

```
"We couldn't find [product name]. Add it?"
      ↓
Upload product photo
      ↓
Background removal runs automatically
      ↓
Enter: product name, brand, category, unit size
      ↓
Product saved to their offer book immediately (no wait)
      ↓
Flagged for catalog review queue (E5-05)
```

User-uploaded images stored under `/{org_id}/{shop_id}/custom-products/`.

### E5-05 Community Contribution Pipeline

Products uploaded by shop owners (E5-04) enter a review queue.

**Review Queue (Admin)**
- Shows: submitted image, product name, brand, category
- Actions: Approve → adds to master catalog | Reject (with reason) | Request better image
- Approved products benefit all users going forward
- Submitting shop gets notified when their product is added to catalog

**Quality Gates**
- Image must be minimum 400×400px
- Background must be removed or removable
- Product name must not already exist in catalog (duplicate check)
- Admin can merge with an existing record if duplicate

### E5-06 Catalog Admin Panel

Internal tool for SouqStudio team to manage the master catalog.

- Search and browse all products
- Add / edit / remove products
- Bulk import via CSV
- Manage synonyms per product
- Manage categories and subcategories
- View contribution queue (E5-05)
- Run AI enrichment on selected products (generate synonyms, tags, translations)
- Image management (replace, remove background, set thumbnail crop)

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Search input is the primary UI element — auto-focused when catalog panel opens
- Results rendered as a scrollable grid of product cards (image + name + brand)
- Category browser uses visual tile layout with category icons
- Barcode scanner uses `@zxing/browser` library
- Search is debounced (300ms) — no search on every keystroke

---

## Backend Notes

- PostgreSQL `tsvector` with `GIN` index on `search_vector` column
- Trigger auto-updates `search_vector` on insert/update
- Synonym table joined at query time — no denormalization needed
- `pg_trgm` extension for fuzzy matching (handles typos)
- Product images stored in Cloudflare R2
- AI enrichment (synonym generation) runs via Claude API as a nightly batch job on new/unenriched products
- Catalog seeded from Open Food Facts full data dump filtered for UAE-relevant products

---

## Database Tables

```
catalog_products
  id, canonical_name, category, subcategory, brand,
  image_url, thumbnail_url, unit, barcode,
  tags TEXT[], metadata JSONB, search_vector TSVECTOR

product_synonyms
  id, catalog_id, synonym, language, region

catalog_categories
  id, name, parent_id, icon_url, display_order

product_contributions
  id, shop_id, image_url, name, brand, category,
  status (pending / approved / rejected), reviewed_at
```

---

## Out of Scope

- Nutritional data display (available from Open Food Facts but not needed for offer books)
- Price history tracking
- Competitor price comparison
- Product availability / stock status
