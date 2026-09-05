# E5 — working notes

What was built, what it does not yet do, and the corrections to `docs/E5-product-catalog.md`
that were found by building it. The epic stays the record of what was asked for; this file
is the record of what happened.

Last updated 5 September 2026, after E5-01 and E5-02.

---

## 1. Built — E5-01 search and E5-02 category browsing

`/catalog` exists and `CATALOG_BUILT` is flipped, so the left rail carries the item again.

| Piece | Where |
| --- | --- |
| Query layer | `apps/web/lib/catalog.ts` — search, categories, subcategories, browse |
| Display helpers | `apps/web/lib/catalog-display.ts` — language pick, pack label |
| Routes | `GET /api/v1/catalog/{search,categories,products}` |
| Screen | `app/(dashboard)/catalog/page.tsx` + `components/catalog/*` |
| Categories | `pnpm db:seed` publishes the ten top-level rows E5-02 names |

**Search is raw SQL and cannot be anything else.** `search_vector` is
`Unsupported("tsvector")`, which Prisma excludes from the generated client, so the column
is reachable only through `$queryRaw`; `ts_rank`, `similarity()` and the synonym join have
no Prisma expression either. Every value is still a bind parameter — `Prisma.sql`
interpolation is not string concatenation.

Three things in that query are worth not undoing:

- **The last token is prefix-matched** (`to_tsquery('simple', 'basmati & ri:*')`). The
  panel searches as the owner types, and without `:*` a query matches nothing until the
  word is finished — the search looks broken for every prefix of every word.
- **Tokens are cut on `\p{L}\p{N}`, not blacklisted.** `&`, `|`, `!`, `(`, `)` and `:` are
  tsquery syntax and a raw apostrophe makes `to_tsquery` *raise* rather than return
  nothing. Cutting on word characters removes every operator by construction and leaves
  Arabic, Hindi and Urdu intact.
- **A private row shadows the universal row carrying the same barcode**, rather than
  merely outranking it. That is E5 §1's correction mechanic. Without it an owner sees
  their correction and the thing they corrected side by side, which reads as a duplicate
  and makes the private collection look broken.

### What the epic says that the build had to answer differently

- **`GET /catalog/search?lang=` does not exist.** Every row carries both languages and the
  client picks: one fetch feeds an English panel and an Arabic one, the E5-06 review screen
  needs the pair regardless, and ranking does not vary by language because the vector spans
  `nameEn` and `nameAr` at the same weight. `api-conventions.md` has been corrected.
- **Browsing is its own route.** `search` is a ranked top ten with no paging; `products` is
  an ordered cursor page. One route serving both would return a union the client branches
  on — the same mistake as one empty-state component for empty and zero-results.
- **Subcategories are derived from the products, not seeded.** Nothing in E5 names them and
  a seeded list would immediately disagree with whatever the Open Food Facts import
  produces. `catalog_categories.parentId` stays unused, for E5-08 to populate. The
  breadcrumb therefore only ever offers a step with something behind it.
- **A category tile with no products is still shown.** "Electronics, nothing here yet" is
  information; hiding empty tiles would make the ten-category taxonomy look different for
  every account.

---

## 2. Not built, and what it needs

### E5-03 barcode lookup

`GET /api/v1/catalog/barcode/:ean` is unwritten. The server half is small — the same
visibility and shadowing predicate, an exact match on `barcode`, organization row first —
and the client half is the camera, `@zxing/browser`, which is not yet a dependency.

### E5-04 missing product upload

Needs the presigned upload path (`lib/r2.ts` has it) and the `bg` worker's catalog branch,
which is still unwritten — `BgRemovePayload` carries `catalogProductId` and
`sourceAssetId`, and nothing writes the `image_assets` CUTOUT row.

### E5-05 contribution queue · E5-08 catalog admin

Both are `apps/admin`, which is scaffolded and empty. E5-08 overlaps E13.

### E5-06 spreadsheet import · E5-07 phone capture

Unstarted. The tables exist. Import is the path most weeks will actually take, and it needs
the same match resolution search uses, so `lib/catalog.ts` is where its resolver belongs
rather than in a second implementation.

---

## 3. Known gaps in what *was* built

### The ranking is unverified against real rows

Every query was run against the dev database and executes cleanly — syntax, the enum casts,
the row-constructor cursor comparison, the lateral joins. **All five returned zero rows,
because `catalog_products` is empty.** So what is proven is that the SQL is valid; what is
*not* proven is that the ordering is any good. The two constants that decide it —
`SYNONYM_BONUS = 0.25` and `FUZZY_WEIGHT = 0.3` — are heuristic, chosen so a strong text
match always outranks a weak fuzzy one, and they have never been looked at against a real
result list. Tune them the first time there is a catalog to tune against, not before.

### Two queries will need an index before the catalog is large

Neither is a problem today and both are a problem at three million rows:

- `listSubcategories` is `GROUP BY subcategory WHERE category = $1`, and
- `listCategories` counts products per category through a lateral.

`catalog_products` has indexes on `organizationId`, `(organizationId, archivedAt)`, the FTS
GIN and the two trigram GINs — **nothing on `category`**. Both queries are a sequential scan
until `@@index([category, subcategory])` exists. That is one migration, and it was left out
of this change deliberately rather than forgotten: the E5 migration is already applied to
the dev database and adding a column-less index migration alongside it is cheaper to do
with the Open Food Facts import, when there is data to measure it against.

### Product images bypass the Next optimizer

`unoptimized` on the card image, for a sharper reason than the logo preview's: `R2_PUBLIC_URL`
is per-environment while `remotePatterns` in `next.config.mjs` is a hardcoded pair of hosts,
so the optimizer refuses any bucket that is not one of those two — and the failure mode is
every product image in the grid, in exactly the environment nobody checked. Revisit by
making `remotePatterns` read the env, not by dropping the flag.

### The interface language is still hardcoded

`app/layout.tsx` sets `lang = 'en'` with a TODO, and `/catalog` follows it rather than
inventing a second answer. `CatalogBrowser` and every display helper already take a
`CatalogLanguage`, so when the locale moves onto the session this is one prop.

**Which means the Arabic pass of consistency check #9 has not happened for this screen.**
The pieces that need it are known: the breadcrumb chevron (`rtl:rotate-180`, rotated rather
than swapped, because it separates steps rather than pointing at anything), the pack label
inside `Figure` for bidi isolation, and `lang` on the product name element so an Arabic name
in an English interface still shapes and wraps as Arabic. None of that is verified in a
rendered RTL screen.

### `server-only` caught what typecheck and lint could not

`lib/catalog.ts` is the query layer and is `server-only`; the product card is a client
component and needs `displayName()`. Importing it from there pulls Prisma, the raw SQL and
the R2 client into the browser bundle. **`pnpm typecheck` and `pnpm lint` both passed on
it** — `next build` is what failed, which is the third time the STATUS §5 rule about
building before Railway has paid for itself. The fix is the `lib/catalog-display.ts` split:
pure, language-facing, no I/O, safe on both sides of the boundary. Any future catalog
helper a card needs goes there, not into `lib/catalog.ts`.
