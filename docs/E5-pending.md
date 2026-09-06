# E5 — working notes

What was built, what it does not yet do, and the corrections to `docs/E5-product-catalog.md`
that were found by building it. The epic stays the record of what was asked for; this file
is the record of what happened.

Last updated 6 September 2026, after the demo catalog seed — which is also what turned up
the broken write path in the Open Food Facts importer and the fuzzy-match gap in search.

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
| File upload | `components/ui/file-dropzone.tsx` — drag-and-drop, used by E5-04 and E5-06 |
| Universal seed | `packages/db/src/off-mapping.ts` + `scripts/import-off.ts` — **written, not yet run** |
| Demo rows | `packages/db/scripts/seed-catalog-demo.ts` — 99 products, run, removable |

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

### FileDropzone, and the illustration

Both upload surfaces were shipping a bare `<input type="file">` — the one widget in the
product that looks like no other, and on a phone reads as broken rather than plain.
`components/ui/file-dropzone.tsx` replaces them: drop or button, one file, `accept`
enforced on the drop as well as in the picker. It went into
`references/component-inventory.md` before it was built, per that file's own process.

Three things about it worth not undoing:

- **The button is the accessible path, not decoration.** Dragging has no keyboard
  equivalent and none on a touchscreen. The `sr-only` input plus a `Button` that clicks
  it is deliberately identical to what `LogoField` already does.
- **Drag depth is counted, not toggled.** Moving the cursor from the zone onto the button
  inside it fires `dragleave` on the zone; a boolean flickers the highlight off every
  time the pointer crosses a child, and it is invisible until someone drags slowly.
- **`preventDefault` on `dragover`.** Without it the browser navigates to the dropped
  file and the owner loses the page.

**The illustration is on the import's first step only.** `import-upload` →
`add-file.svg`, fetched from the CDN, audited, and checked in — a first-run prompt with
nothing in progress, which is the same test that permits artwork on `EmptyState`'s
`empty` and refuses it on zero-results and error. The mapping step, the review step and
the add-a-product photo field get none: the owner is mid-task in all three.

**One thing a human should settle**, recorded in `illustration-manifest.md` rather than
decided here: the compliance checklist says "no brand blue", and all four previously
shipped illustrations use `#143CD2` as their accent. `add-file.svg` matches the shipped
set. Either the checklist line goes or all five files get remapped in one pass — but not
one at a time, or the set stops being a set.

**`LogoField` has not adopted the dropzone.** E4's logo upload still carries its own copy
of the same arrangement. It should move, and was left alone because it also owns the
cutout polling and the brand-store writes — a larger edit than the one that was asked for.

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

### The demo seed — 99 rows, so the screens can be looked at

`pnpm --filter @souqstudio/db catalog:seed-demo` writes 90 universal products across the
ten seeded categories and 9 into one organization's own collection. It is **not** a
fixture and **not** a substitute for the Open Food Facts seed: it exists because every
reader built in E5 and every piece of the composition model had only ever been exercised
against products constructed inside a test, and a screen cannot be judged that way.

`--org <id>` picks the organization (default: the newest, which on a dev database is
whoever signed up last), `--dry-run` writes nothing, and `--clear` removes exactly what it
wrote.

Four things about it worth not undoing:

- **`source = 'demo'` is the removal handle**, which is the only reason dummy rows are safe
  in a shared dev database. `--clear` deletes on that column — not on a name pattern, not
  on a date window, and never a truncate, because the OFF rows and anything an owner added
  through E5-04 live in the same table. It detaches import rows and contributions rather
  than deleting them (both foreign keys are nullable for that reason) and refuses outright
  if an offer references a demo product.
- **Check digits are computed, then re-checked with `hasValidCheckDigit`.** Ninety
  hand-typed check digits contain at least one mistake and the failure is silent: the row
  writes fine and is simply unreachable by barcode lookup forever, because `lookupBarcode`
  rejects a bad digit before the database is asked.
- **Three organization rows carry a barcode the universal set also carries.** E5 §1's
  shadowing — a private row *replaces* the universal one rather than outranking it — cannot
  be checked without rows on both sides of it, and getting it wrong shows a duplicate
  rather than an error. Verified: searching from that organization returns its own row and
  only that one; the same search from a different organization returns the universal row.
- **Every row has a real `nameAr`.** This is the one thing the Open Food Facts export
  cannot give — its 211 columns carry no language variants — and consistency check #9 wants
  screens rendered in Arabic with real strings, which Latin placeholder text cannot stand in
  for. The washing-powder row is deliberately the long name that broke a card's name box in
  the render harness.

**No images.** `image_assets` rows need real objects in R2, which a script cannot invent;
`ProductCard` renders its `ImageOff` placeholder, so the grid is honest rather than broken.
The cutout branch of the `bg` worker still needs a real upload to be exercised.

### Brand stays free text, and the field now suggests

`AddProductForm`'s brand box had been a plain text input, so every owner typing
"Almarai" was inventing the string again. It now offers what is already in the
catalog while still accepting anything: `GET /api/v1/catalog/brands?q=` →
`suggestBrands`, fed into a native `<datalist>`.

**A native `list` rather than a listbox built from divs**, which is the call
`Select` and `ShopSwitcher` already made — on the phone a shop owner is actually
holding, the platform picker brings its own scroll physics and accessibility
tree. It also cannot become a closed vocabulary by accident: the element is an
ordinary text field that happens to complete, so a brand nobody has entered
before still goes in. That is E5's rule that nothing blocks an owner adding a
product, and it is why this is not a `Select`.

**A match at the start of a word outranks one buried inside.** A plain substring
match returns Signal and Galaxy for "al" with equal standing, and alphabetical
order then puts them first. Interior matches are kept rather than filtered —
"marai" finding Almarai is the other half of what makes a partial brand work —
they just sort last.

**There is no brand table, and the decision has a deadline.** `brandEn`/`brandAr`
are free-text columns and E5 never modelled brands as an entity. Suggestions are
derived from the products themselves, the same way `listSubcategories` derives
its list. Four things a string cannot do, and each is a reason to add a
`ProductBrand` table when it is actually wanted: a brand logo for the card's
lockup, a browsable brand filter, EN/AR paired once rather than retyped per
product, and deduplication.

The last is the one with a clock on it. `toProduct` writes `firstValue(brands)`
straight from the Open Food Facts export, whose brand strings are dirty at scale —
`Almarai`, `almarai`, `AL MARAI`, `Almarai®` all land as separate values. Resolve
brands at ingest and it is one mapping; do it afterwards and it is a retroactive
dedup over tens of thousands of rows. **Decide before the seed runs, not after** —
the same shape as the `Brand` entity decision in STATUS §2, and not the same
thing: that one is the *shop's* identity and its trade licence, this one is the
*product's* manufacturer. If the table is added, name it `ProductBrand` so the
two never get confused.

**Unindexed.** `catalog_products` carries trigram GINs on `nameEn` and `nameAr`
and nothing on `brandEn`, so the suggestion query is a sequential scan. Free at
99 rows, and after the seed it needs an index — the same outstanding decision
`listCategories` and `listSubcategories` already carry in §3.

### The Open Food Facts seed — written, and not yet run

`pnpm --filter @souqstudio/db catalog:import-off` streams the 1.28GB gzipped export,
filters for GCC relevance, and writes into the universal collection. The mapping is pure
and has 19 tests; the script has been dry-run against the live export end to end.

**It has never been run against the real export.** A full pass writes on the order of tens
of thousands of rows to the shared database and takes hours over that host — both the
user's call, not something to start unasked.

**The write path was broken until 6 September, and this is why "not yet run" mattered.**
`writeBatch` called `upsert` with
`where: { organizationId_barcode: { organizationId: null, barcode } }`, which the client
rejects at runtime — *"Argument `organizationId` must not be null"*. It would have failed
on the first batch of any real run, after however long the stream took to produce 500
mapped rows. It is not a Prisma quirk: SQL treats NULLs as distinct, so `(NULL, '628…')`
cannot identify a row, which is the same fact that made the E5 migration carry a
**partial** unique index (`catalog_products_universal_barcode_key`) beside the compound
one. No Prisma `where` expression reaches a partial index, so `writeBatch` now resolves
existing barcodes in one read, `createMany`s the new rows and updates the rest by id. The
note on the function carries the reasoning.

**The write path is now proven, on a fixture rather than on the export.** Six hand-written
rows through `--file`: five mapped and created, one rejected for having no name; a second
run with a name corrected upstream updated in place, left the row count at five and
produced no duplicate universal barcode. What that does *not* prove is throughput or
anything about the real file's content — see the four measured notes below, which still
stand. The fixture rows were removed afterwards.

Still proven only by dry run: the fetch, the gunzip, the header check, the delimiter, the
filter, the mapping and the counts.

**The categories it writes do not match the ten the app browses by**, and this is the next
thing to settle before a real run. `toProduct` writes `firstValue(categories_en)` — a raw
OFF taxonomy string like `Spreads`, `Beverages` or `Meals` — while `listCategories` counts
with `p.category = c.name` against the ten rows `pnpm db:seed` publishes. Nothing errors:
E5-02's tiles simply all read "nothing here yet" over a catalog of tens of thousands of
products, which reads as a broken screen rather than as a missing mapping. Confirmed on
the fixture rows above. A run without a mapping from the OFF taxonomy onto the ten
categories fills the table and leaves the category browser empty.

Four things measured rather than assumed, over the first 111,410 rows of the real export:

- **About half of GCC-relevant rows are kept.** 1,351 relevant, 677 mapped. The rest are
  genuinely unusable: 469 carried a code that fails its check digit, 354 had no English
  name.
- **`--limit` misrepresents the yield.** The export is sorted by barcode, so a short run
  reads only the placeholder entries at the head of the file — `00000069`, `00000182` —
  and reports rejecting almost everything. Do not tune the filters against one.
- **Line-based splitting is safe**, checked rather than assumed: not one row in 111,410
  had a field count other than the header's, so nothing contains an embedded newline or
  tab. Had any done so, every column after it would have shifted silently.
- **Streaming from the static host is slow** — a few MB a minute, so a full run is hours.
  Download once and use `--file`.

**The export has no Arabic column at all.** This was caught by the script's own header
check on the first run, which is what that check is for. The CSV carries `product_name`,
`generic_name` and `abbreviated_product_name` across its 211 columns and no language
variants; those live only in the 12.8GB JSONL and the MongoDB dump. So **every seeded
universal product has a null `nameAr`**, and E5 §2 makes that a publish-time blocker for
Arabic editions.

That is the seed's most important limitation and it has a name: the `enrich` worker, which
E5's Backend Notes put translations on, and which is still a stub that throws. Until it
lands, **the universal catalog is English-only and cannot back an Arabic offer book.** A
shop's own products are unaffected — E5-04 and E5-06 both take `nameAr` from the owner.

**No images, by licence.** ODbL permits commercial use of the data, and E5's Catalog
Sources table is explicit that images come from licensed sources or brand permission and
never from scraping. The image columns are absent from `OFF_FIELDS` rather than read and
discarded, so nothing downstream can start using them by accident, and there is a test
asserting no mapped product mentions one.

**Two structural moves came with it**, both recorded in `project-structure`:

- `packages/db/scripts/` for bulk data, kept separate from `prisma/seed.ts`, which stays
  small and idempotent so `pnpm db:seed` is something you run without thinking.
- The barcode helpers moved to `packages/types/src/barcode.ts`. Three callers need the
  same check-digit answer — the search box, the contribution route and this importer — and
  `types` is the only package with no dependencies, so it is the only one a browser bundle
  and a CLI can both import. `packages/db` owns the column but would pull Prisma and
  BullMQ into the client. `apps/web/lib/catalog-display.ts` re-exports, so no call site
  changed.

---

## 2. Not built, and what it needs

### The camera half of E5-03

Manual entry works — type or paste a code into the search box and it is looked up. **The
camera scan is not built**, because it needs `@zxing/browser`, which is not a dependency
yet and adding one is a decision worth making deliberately rather than in passing. On a
phone this is the difference between scanning a shelf and typing thirteen digits per
product, so it is not a cosmetic gap.

### The cutout half of E5-04 — built

The `bg` worker's catalog branch exists: cutout produced, measured, stored at its own key,
and an `image_assets` CUTOUT row written with `bboxTight` and a `quality` score.

**`quality` is derived, because Rembg reports none.** `apps/worker/src/lib/matte.ts` walks
the alpha channel once and catches the three failures that actually reach a printed page —
a matte that removed everything, one that removed nothing, and one with a wide soft halo.
It cannot catch a clean-edged cutout of the wrong thing; that is what E5-05's queue is for,
and the module says so.

The score decays asymptotically rather than clamping to zero. A test caught why that
matters: a linear score gave every badly haloed matte the same 0, and a review queue of
identical zeroes cannot be worked worst-first.

**Not verified against a real image.** The analysis is tested on hand-built alpha canvases
where the expected answer is stated exactly; no photograph has been through Rembg, so the
threshold is calibrated against geometry rather than against packshots. Expect to move it
once real mattes exist.

### E5-05 contribution queue · E5-08 catalog admin

Both are `apps/admin`, which is scaffolded and empty. E5-08 overlaps E13.

### E5-07 phone capture

Unstarted. `capture_sessions` exists, token-scoped and short-lived, and `catalog_imports`
already carries the `importId` a session attaches back to — so the natural entry point is
the import review screen, offering a QR for the rows that matched nothing and have no
photo. The phone gets a capture token, never a shop-owner session.

### XLSX

Still a dependency decision. `lib/csv.ts` returns a `Sheet`, so an XLSX reader is a second
function returning the same shape.

**The review screen's paging gap is fixed.** It follows `nextCursor` to the end, so nothing
is silently left out of a commit. Two things came with that: the list defaults to the rows
that actually need a decision, and it draws at most 200 of them — a first import against an
empty catalog matches nothing, so "needs a decision" is every row, and ten thousand list
items is a page that stops responding. Undrawn rows are counted, stated, and included in
the commit; bulk "add all as new" and "leave all out" act on what is listed.

---

## 3. Known gaps in what *was* built

### The ranking now has rows to be judged against, and the fuzzy half under-matches

Every query was run against the dev database and executes cleanly — syntax, the enum casts,
the row-constructor cursor comparison, the lateral joins. They returned zero rows for as
long as `catalog_products` was empty, so what was proven was that the SQL is valid and not
that the ordering is any good.

**There are rows now.** `pnpm --filter @souqstudio/db catalog:seed-demo` writes 99 demo
products — see §1's note on it — which is enough to look at a result list. What that turned
up immediately:

**The fuzzy branch compares whole strings, so a misspelling inside a longer name does not
match at all.** `similarity('Sella Basmati Rice XXL', 'Basmatti')` is **0.28** against
`pg_trgm.similarity_threshold` of 0.3 — the row is not returned. Word against word it is
0.7, which is the figure STATUS quotes and where the impression that fuzzy matching works
came from; every other token in a real product name dilutes it. So `p."nameEn" % q.raw`
gets steadily weaker as names get longer and more specific, which is the direction real
catalog names go. The fix is a decision, not a tweak: lower the threshold for this query
with `set_limit()`/`%>`, match per word, or match against a name-plus-brand expression.
Whichever it is, pick it against real rows.

`SYNONYM_BONUS = 0.25` and `FUZZY_WEIGHT = 0.3` are still heuristic and still unlooked at —
they only affect ordering among rows that matched, and the finding above is about rows that
never match. Note also that `product_synonyms` is empty until the `enrich` worker lands, so
the synonym branch of the ranking has never contributed to a score at all.

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
