# Collecting product data

Read this before a collection run — a spreadsheet of products, a day of photography, or
both. It says what to collect, what shape it has to arrive in, and the one thing the schema
still cannot hold.

Written 16 September 2026, against the schema at
`packages/db/prisma/schema.prisma` §`catalog_products` and the binding union at
`packages/types/src/composition.ts:303`.

**The binding union is the contract, not this document.** A block may bind text to exactly
five product fields — `name`, `spec`, `brand`, `origin`, `packSize` — plus one image.
Everything collected beyond that is search, matching, or archive: useful, but it will never
appear on a page. Everything in that list that is *missing* is an empty box on a printed
card. Of 2,131 real catalog rows today, 58% have a brand, 33% a spec, 4.2% a pack size,
4.2% an image and 4.2% an Arabic name, which is why a typical real card is a short name, a
grey placeholder and a large void. `docs/E5-pending.md` §"Real catalog rows now go through
the layout engine".

---

## 1. Tier 1 — what the page draws

| Field | Required | Notes |
| --- | --- | --- |
| `nameEn` | yes | Short. It is the headline line on the card, not a description. |
| `nameAr` | **yes** | Null is a publish-time blocker for an Arabic edition — E5 §2. Do not defer it: the Open Food Facts seed deferred it and the entire universal catalog is English-only until the `enrich` worker lands. |
| `brandEn` / `brandAr` | if branded | Free text is correct here. `brandId` is resolved afterwards through `brandSlug()`; nothing blocks saving a brand the catalog has never seen. |
| `specEn` / `specAr` | if applicable | The variant line under the name — "Full Cream", "versch. Sorten", "Pack of 6". |
| `originEn` / `originAr` | if applicable | Renders as a prefix line *above* the name, except at DENSE density where E6 §5 folds it into the spec. |
| `packSize`, `packUnit`, `packCount` | all three or none | 8 × 25 g is size `25`, unit `G`, count `8`. Blank on a `LOOSE` row, which has no pack. |
| `sellBy` | blank = `PACK` | `LOOSE` for anything weighed at the counter — §4. |
| image | yes — §3 | The one field that separates this product from a slide deck. |

**`packUnit` is a closed enum**: `G`, `KG`, `ML`, `L`, `PIECE`. A value outside those five
cannot be stored without a migration, so it has to be agreed before collection rather than
cleaned afterwards.

**Partial pack data is worse than none.** All three columns null means no unit price can be
derived and the offer falls back to `unitPriceMode = HIDDEN`, which is a correct, quiet
outcome. A size with no unit is not: `packLabel()` and `deriveUnitPrice()` in
`packages/types/src/pack.ts` are what read these, and they need the set.

---

## 2. Tier 2 — what makes a row findable

The full-text weights say where effort pays: **names at A, brand and category at B, spec
and tags at C**, `simple` dictionary, plus trigram indexes on both names for fuzzy.

| Field | Notes |
| --- | --- |
| `barcode` | GTIN-8/12/13/14. Validate at entry with `hasValidCheckDigit()` in `packages/types/src/barcode.ts` — three callers need the same answer and this is the only exact-match route into the catalog. Not globally unique: uniqueness is per collection. |
| `category` / `subcategory` | Strings, not foreign keys. **Agree a fixed list before collection starts.** Nothing validates them, so "Dairy", "dairy" and "Milk & Dairy" will all be accepted and will all browse separately. |
| `tags[]` | Weight C. |
| synonyms | `synonym`, `language` (`en` \| `ar` \| `hi` \| `ur`), `region`. What an owner actually types rather than what is printed on the pack — "laban", "zaatar", "maggi" for any instant noodle. This is the highest-value tier-2 field in this market and the `enrich` worker that was meant to generate it is not built. |

---

## 3. The image

**The quality of a cutout is decided at the camera, not in the worker.** Every rule below
maps to a failure `analyseMatte()` in `apps/worker/src/lib/matte.ts` will score against —
it catches a matte that removed everything, one that removed nothing, and one with a wide
soft halo, and `MATTE_APPROVAL_THRESHOLD` is 0.6.

**Shooting:**

- **A plain background with real contrast against the product.** Not white on white.
- **No shadow, no reflection, no gradient backdrop.** Soft edges become a halo, and a halo
  prints as a grey fringe around the product on a flyer.
- **One product, whole subject, nothing cropped.** The renderer letterboxes rather than
  crops — `preserveAspectRatio` in `components/blocks/draw.tsx` — because the entire point
  of a cutout is that the product is the whole subject.
- **Front of pack, square-on, label legible.** A slight top-down angle is fine if it is the
  same slight top-down angle on every shot.
- **No hands, no props, no lifestyle staging.**
- **Consistent distance and framing across the run.** Cards sit beside each other on one
  page, so inconsistent framing reads to an owner as inconsistent sizing.

**Technical:**

- Longest edge **≥ 1500px**, target 2000–2400. A4 at 300dpi is 2480px across and a packshot
  occupies a fraction of it.
- JPEG, PNG or WebP. **No SVG** — refused on this path deliberately: a packshot is never a
  vector, and an SVG served from our own domain is script-bearing content.
- ≤ 10MB (`MAX_PRODUCT_IMAGE_BYTES` in `apps/web/lib/r2.ts`).
- A phone is fine. `capture_sessions` exists for exactly this and E5-07 is where it becomes
  a product feature.

**One hero shot per product.** `image_assets` has no `isPrimary` and no angle column, so a
second photograph only competes on `createdAt` in the `IMAGE_PICK` lateral join. A
back-of-pack shot is a schema change first, not a collection decision.

**Record the licence with the photograph.** E5's Catalog Sources table is explicit that
images come from licensed sources or direct brand permission and never from scraping, and a
brand logo is a trademark as well as an image. Who granted permission, and when, is worth a
column on the collection sheet — it cannot be reconstructed afterwards.

---

## 4. What the schema holds, and the one thing it still does not

**Three of the four gaps this section used to list were closed on 16 September**,
migration `20260916150000_catalog_sku_supplier_sellby`, while nothing had yet been collected
against them — which was the whole argument for doing it in that order.

| Field | Shape | Collect it as |
| --- | --- | --- |
| `sku` | `String?`, unique per collection | The shop's own item code, exactly as their till spells it. |
| `supplier` | `String?` | Free text. Deliberately not a table — see the note on the column. |
| `sellBy` | `PACK` \| `LOOSE`, default `PACK` | `LOOSE` for anything weighed at the counter. |

**`sku` is the one that changes how a collection run is keyed.** An owner's price sheet is
written against their item code, and until this the import matched on barcode and name
only — so a sheet keyed by item code fell through to a fuzzy name match every time. Worse,
`catalog-import.ts` listed `sku` as a *barcode* header spelling, so the column was read as a
barcode, failed its check digit and matched nothing. Both are fixed: `sku` is its own
canonical field, and **it outranks the barcode** in `resolveRow`. Within one shop it is the
better key — it is what their sheet is written against, it can only match one of their own
rows, and an own-brand line or a loose vegetable has one when it has no barcode at all.

**`sellBy` is what lets a loose product be described honestly.** `packUnit` says what the
number means; this says what the number *is*. On a `LOOSE` row `packSize` and `packCount`
are meaningless, `packLabel()` prints no pack line, and `deriveUnitPrice()` takes the price
as the rate and normalises it to the base unit rather than dividing by a quantity that was
never there — so tomatoes at 4.50 a kilo print `1 kg = 4.500` instead of nothing.

**Still not held: certification.** Halal, organic and origin marks exist only as a `ChipKind`
on the *offer*, so the same fact is re-entered in every book the product appears in. It is
the one item on the original list that did not land, because it is a product judgement about
which marks matter in this market rather than a column shape.

---

## 5. The collection sheet

```
sku, barcode, nameEn, nameAr, brandEn, brandAr, specEn, specAr,
originEn, originAr, sellBy, packSize, packUnit, packCount,
category, subcategory, supplier, tags, synonymsAr, imageFile, imageSource
```

Leave `sellBy` blank for a packed product; the column defaults to `PACK` and the import
reads absence the same way. On a `LOOSE` row leave `packSize` and `packCount` blank and put
the unit the price is quoted in — usually `KG` — in `packUnit`.

`imageFile` is a filename keyed by `sku`, matching the photograph on disk. One script then
walks the sheet, uploads each image to `{organizationId}/{shopId}/custom-products/`, writes
the `ORIGINAL` row and queues `bg.remove`; the worker derives the cutout at
`{key}-cutout.png`, measures it and writes the `CUTOUT` row.

That script belongs in `packages/db/scripts/`, with bulk data, and not in `prisma/seed.ts`,
which stays small and idempotent so `pnpm db:seed` is something you run without thinking.

**A sheet re-imported next week now updates rather than duplicating**, provided the item
code column is filled: `createImportedProducts` points a row with a known code at the
product that already carries it instead of writing a second one, and the add-a-product route
refuses a duplicate code with a sentence rather than a 500.

---

## 6. Two things to do before the run, not after

**Put one real photograph through Rembg and look at the result.** The matte analysis is
tested against hand-built alpha canvases where the expected answer is stated exactly. **No
photograph has ever been through it**, so the 0.6 threshold is calibrated against geometry
rather than against packshots. You want to know your lighting setup clears it before you
shoot five hundred products, not after.

**Decide the category list.** Nothing validates `category` or `subcategory`, and a
collection run is the cheapest moment this decision will ever be available.
