# E5 — working notes

What was built, what it does not yet do, and the corrections to `docs/E5-product-catalog.md`
that were found by building it. The epic stays the record of what was asked for; this file
is the record of what happened.

Last updated 5 September 2026, after E5-01, E5-02, E5-03, E5-04 and E5-06.

---

## 1. Built — E5-01, E5-02, E5-03, E5-04 and E5-06

`/catalog` exists and `CATALOG_BUILT` is flipped, so the left rail carries the item again.

| Piece | Where |
| --- | --- |
| Query layer | `apps/web/lib/catalog.ts` — search, categories, subcategories, browse |
| Display helpers | `apps/web/lib/catalog-display.ts` — language pick, pack label, barcodes |
| Read routes | `GET /api/v1/catalog/{search,categories,products}` |
| Screen | `app/(dashboard)/catalog/page.tsx` + `components/catalog/*` |
| Categories | `pnpm db:seed` publishes the ten top-level rows E5-02 names |
| Barcode | `GET /api/v1/catalog/barcode/:ean`, routed to from the search box |
| Add a product | `POST /api/v1/catalog/{upload-url,contributions}` + `AddProductForm` |
| Import | `lib/csv.ts`, `lib/catalog-import.ts`, four `/catalog/imports` routes, `/catalog/import` |

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

### E5-03 and E5-04, and the two things they turned up

**`barcode` is not in `search_vector`.** The migration's trigger builds the vector from
name, brand, category, spec and tags — nothing else — so a barcode typed into full-text
search matches precisely nothing. The search box had been advertising "product name, brand
or barcode" and could not deliver the third. It now routes on the shape of the query:
`isBarcode()` sends it to the barcode route, everything else to search. This is why the
lookup is a separate endpoint rather than a `searchCatalog` branch.

**The check digit is validated before the database is asked**, and a failed one is
`invalid_barcode` rather than "not found". They are different answers: one is "check what
you typed", the other is "add this product", and telling an owner to add a product that
already exists under the number they mistyped is how a catalog fills with duplicates no
reviewer can spot. The GTIN weights alternate 3 and 1 **from the right**, so they depend on
the length — anchoring from the left accepts half of all typos and rejects half of all
valid codes. There is a transposition test for exactly that.

**The cutout job must not write to the photo's key.** `handleBgRemove` writes its result to
`targetPath` without looking at what is already there, so passing the original's key would
replace the packshot with the cutout — and the `image_assets` ORIGINAL row would then be
pointing at a cutout, with nothing left to re-run a bad matte against. E5 §3 keeps the
original for precisely that reason. `cutoutKey()` in `lib/r2.ts` derives a distinct
`-cutout.png` key, and that is what is queued.

**The image key is validated against this shop's prefix.** The contribution route takes an
R2 key rather than a URL, and refuses any key outside `{org}/{shop}/custom-products/`.
Without that check the field is an arbitrary read of the bucket: any key a caller named
would be fetched and published as their product's image, including another tenant's.

### E5-06, and where it stops

**The commit lands rows in the catalog and goes no further.** The epic's last step is
"offers created in the book, prices carried from the sheet", and there are no offer
books — `offer_books` holds zero rows and E6 owns the editor that makes them. So prices
stay on `catalog_import_rows.price`, which is where the schema already puts them, and
the offer-creating half is a read of the committed rows that E6 adds. The screen says so
in as many words rather than leaving it to be discovered.

**CSV only; XLSX is not built.** Reading XLSX needs a dependency, and the libraries that
do it carry a great deal more than a delimited-text parser. That is a decision worth
making deliberately — the upload screen says "save as CSV first" up front rather than
rejecting the file after the upload. `lib/csv.ts` returns a `Sheet`, so an XLSX reader
is a second function returning the same shape, not a rewrite of anything downstream.

**The parser is hand-written and heavily tested**, because every failure in it is silent.
A mishandled quoted comma does not throw: it produces one extra field, shifts every value
after it by one, and the import looks fine until someone reads the printed flyer. Quoted
delimiters, `""` escapes, newlines inside quotes, CRLF, the UTF-8 BOM that Excel writes,
and semicolon files from comma-decimal locales are all covered.

**Two queries per sheet, not two per row.** A five-hundred-row import doing a round trip
per row is a thousand round trips against a hosted database — minutes, not seconds, and
long enough that the owner leaves. Both fan out over `unnest`, so the row count changes
the size of an array rather than the number of calls. The paired-array round trip is
verified against the dev database; positional alignment between the two arrays is the
thing that would corrupt every row if it were wrong.

**tsvector for recall, trigram for the score.** E5-06 asks for both and they do different
jobs. Full-text finds "Rice Basmati" from "Basmati Rice", which trigram scores poorly on
word order; `similarity()` returns a true 0..1 that a threshold can be reasoned about.
Mixing `ts_rank` — unbounded and corpus-dependent — into a number compared against a
constant would make the constant meaningless.

**Nothing auto-resolves, on either side.** A candidate has to be both strong on its own
(≥ 0.45) *and* clear of the runner-up (≥ 0.15) to stand as MATCHED; two close strong
matches — "Basmati Rice 1kg" and "Basmati Rice 5kg" — go to the owner, because that is
exactly where picking the higher score silently is most likely to be wrong and least
likely to be noticed. The server defaults nothing either: a row the commit is not told
about keeps its status and is not committed. And the commit button states the number of
products it is about to create, so nobody creates four hundred without being told.

**A pack size is not split at the import boundary.** E5 §4 dropped the free-text unit
column rather than parse it because "500g" cannot be split reliably, and that reasoning
does not stop applying here. A cell reading `500` is a pack size; `500g` leaves the pack
fields null and survives untouched in `raw`. A wrong pack size feeds the derived unit
price and prints a confident wrong number next to a real one.

**A barcode that fails its check digit is not stored.** Not on an import row and not on a
created product — a stored bad barcode shadows the real product it will never match. A
*transposed* one is the dangerous case: it can match a real, different product, which is
why the check runs before the row is matched rather than after.

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

### The camera half of E5-03

Manual entry works — type or paste a code into the search box and it is looked up. **The
camera scan is not built**, because it needs `@zxing/browser`, which is not a dependency
yet and adding one is a decision worth making deliberately rather than in passing. On a
phone this is the difference between scanning a shelf and typing thirteen digits per
product, so it is not a cosmetic gap.

### The cutout half of E5-04

The product, its ORIGINAL image asset, the contribution row and the queued job all work.
**The `bg` worker's catalog branch does not exist**, so no `image_assets` CUTOUT row is
ever written: `BgRemovePayload` carries `catalogProductId` and `sourceAssetId`, and the
handler ignores both. Today the job runs, produces a cutout at the right key and writes no
row, so the card falls back to the ORIGINAL with `imageIsFallback` set — which is a
degraded product rather than a broken one, and is the whole reason that flag exists. What
the branch has to add is the row, not the image.

### E5-05 contribution queue · E5-08 catalog admin

Both are `apps/admin`, which is scaffolded and empty. E5-08 overlaps E13.

### E5-07 phone capture

Unstarted. `capture_sessions` exists, token-scoped and short-lived, and `catalog_imports`
already carries the `importId` a session attaches back to — so the natural entry point is
the import review screen, offering a QR for the rows that matched nothing and have no
photo. The phone gets a capture token, never a shop-owner session.

### XLSX, and the review screen's paging

The import review screen reads `?limit=200` and does not follow `nextCursor`. The route
pages properly; the client does not, so an import over two hundred rows shows the first
two hundred and commits only those. The `MAX_ROWS` ceiling is ten thousand, so this gap
is real for any sheet worth calling a price list.

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

### The import has never been run against a real file

Every query in it executes against the dev database and the parser has forty tests, but
**no spreadsheet has been through it**: that needs R2, a browser and a file. Unproven end
to end: the presigned PUT, the re-read from `sourceKey`, the column map surviving the
round trip through the Json column, and the whole commit transaction. The match
thresholds are heuristic and, like the search ranking, have never been looked at against
real rows.

### Nothing about the write path has been run against a real upload

Every route builds, typechecks and lints, and the barcode lookup's SQL executes against the
dev database. **No product has actually been added**, because that needs a real R2 bucket,
a real file and a browser. The paths that are therefore unproven: the presigned PUT
round-trip, `readProductImage` against a phone photo, the three-row transaction, and
whether the queued cutout job behaves as read. Exercise it before trusting it.

### `server-only` caught what typecheck and lint could not

`lib/catalog.ts` is the query layer and is `server-only`; the product card is a client
component and needs `displayName()`. Importing it from there pulls Prisma, the raw SQL and
the R2 client into the browser bundle. **`pnpm typecheck` and `pnpm lint` both passed on
it** — `next build` is what failed, which is the third time the STATUS §5 rule about
building before Railway has paid for itself. The fix is the `lib/catalog-display.ts` split:
pure, language-facing, no I/O, safe on both sides of the boundary. Any future catalog
helper a card needs goes there, not into `lib/catalog.ts`.
