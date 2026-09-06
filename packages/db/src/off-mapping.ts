import { hasValidCheckDigit, normalizeBarcode } from '@souqstudio/types'
import { CATEGORY, type CategoryName } from './catalog-categories'

/**
 * Turning an Open Food Facts row into a universal catalog product. E5-06's
 * sibling: the seed that fills `catalog_products` where `organizationId` is null.
 *
 * Pure — no Prisma, no I/O, no network. The script in `scripts/import-off.ts`
 * does the streaming and the writing; everything that decides *what* a row
 * becomes is here, because that is the part worth testing and the part that will
 * be wrong in a way nobody notices. Nine million public rows through a mapping
 * nobody checked is a catalog that looks full and reads as noise.
 *
 * **Licence: ODbL, and images are excluded on purpose.** Open Food Facts data is
 * free for commercial use, and E5's own "Catalog Sources" table lists it on that
 * basis. Product names, barcodes, brands, categories and quantities are factual
 * data. **Images are never taken** — E5 §"Catalog Sources" says so in as many
 * words, and the image columns are absent from `OFF_FIELDS` below rather than
 * being read and discarded, so nothing downstream can start using them by
 * accident. Attribution belongs in the product's own credits, not in a row.
 */

/**
 * The columns the importer reads, and the only ones it reads.
 *
 * The full export has 211 columns, most of them nutritional. Naming the handful
 * that are used keeps the parse cheap over nine million rows and, more
 * importantly, makes the image exclusion structural.
 *
 * **There is no Arabic name column, and that is a property of this export rather
 * than an omission here.** The CSV carries `product_name`, `generic_name` and
 * `abbreviated_product_name` and no language variants at all; the per-language
 * fields live in the JSONL and MongoDB dumps, which are 12.8GB and larger. So
 * every row seeded from here has a null `nameAr`, and E5 §2 makes that a
 * publish-time blocker for Arabic editions. Filling it is the `enrich` worker's
 * job — translations are named in E5's Backend Notes — and that worker is still
 * a stub that throws. Until it lands, the universal catalog is English-only.
 */
export const OFF_FIELDS = [
  'code',
  'product_name',
  'brands',
  'categories_en',
  'quantity',
  'countries_en',
  'origins_en',
  'labels_en',
] as const

export type OffRow = Partial<Record<(typeof OFF_FIELDS)[number], string>>

/**
 * The GCC, plus the two origins that dominate the region's shelves.
 *
 * Matched against `countries_en`, which is a comma-separated list of English
 * country names. A product sold in the UAE is very often also listed for France
 * or the UK, so this is a "does it include" test rather than an equality one.
 *
 * India and Pakistan are here because "GCC relevance" is about what is on the
 * shelf, not about where the shop is: the rice, pulses, spices and household
 * brands a Gulf grocery actually stocks are largely listed under those two, and
 * an import that excluded them would miss most of a real store's centre aisles.
 */
const RELEVANT_COUNTRIES = [
  'united arab emirates',
  'saudi arabia',
  'kuwait',
  'qatar',
  'bahrain',
  'oman',
  'india',
  'pakistan',
  'lebanon',
  'egypt',
  'jordan',
  'turkey',
]

/**
 * **Matched against the list's entries, never against the joined string.**
 *
 * The first version lowercased the whole of `countries_en` and asked whether it
 * contained a relevant country. That reads as the same test and is not:
 * `"romania".includes("oman")` is **true**, so every Romanian product in the
 * export entered a GCC catalog. It was found part-way through the first real
 * run, by which point Romania was the largest single origin in the table at
 * 12.8% — a bigger share than Saudi Arabia — carrying names like
 * "Paine Campagne Cu Maia". `Roman Empire` passed too.
 *
 * Splitting on the comma keeps the intent the original comment describes — a
 * product listed for the UAE *and* France is relevant — while making the
 * comparison exact per entry, so a country name can no longer be admitted by
 * appearing inside a different one.
 *
 * Entries are normalised on both sides: a `xx:` language prefix is stripped and
 * hyphens are read as spaces, because the export writes both
 * `United Arab Emirates` and `en:united-arab-emirates`.
 */
export function isRelevant(row: OffRow): boolean {
  const listed = (row.countries_en ?? '')
    .split(',')
    .map((entry) =>
      entry
        .trim()
        .replace(/^[a-z]{2}:/, '')
        .replace(/-/g, ' ')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)

  if (listed.length === 0) return false
  return listed.some((country) => RELEVANT_COUNTRIES.includes(country))
}

/**
 * The shape a row becomes. Deliberately not Prisma's generated input type: this
 * module stays free of the client so it can be tested without a database, and
 * the script is the one place the two meet.
 */
export type OffProduct = {
  barcode: string
  nameEn: string
  nameAr: string | null
  brandEn: string | null
  specEn: string | null
  originEn: string | null
  category: string | null
  tags: string[]
}

/** A name that is really an artefact of the dataset rather than a product. */
const JUNK_NAMES = new Set(['unknown', 'n/a', 'na', 'null', 'none', '-', '--', '?'])

/**
 * OFF free-text fields carry a language prefix on some rows (`en:Biscuits`) and
 * not on others, and multi-value fields are comma-separated with inconsistent
 * spacing. This takes the first value and strips the prefix.
 */
export function firstValue(raw: string | undefined): string | null {
  if (!raw) return null
  const first = raw.split(',')[0]?.trim()
  if (!first) return null

  // `en:Breakfast cereals` → `Breakfast cereals`. Only a two-letter language
  // tag is stripped, so a real colon in a product name survives.
  const withoutPrefix = first.replace(/^[a-z]{2}:/, '').trim()
  return withoutPrefix || null
}

/** Every value in a multi-value field, cleaned the same way, deduplicated. */
export function allValues(raw: string | undefined, limit: number): string[] {
  if (!raw) return []

  const seen = new Set<string>()
  for (const entry of raw.split(',')) {
    const value = entry.trim().replace(/^[a-z]{2}:/, '').trim().toLowerCase()
    if (value && value.length <= 40) seen.add(value)
    if (seen.size >= limit) break
  }
  return [...seen]
}

/**
 * The Open Food Facts taxonomy, resolved onto the ten categories the app browses.
 *
 * **Without this the seed fills the table and leaves the category browser
 * empty.** `categories_en` carries OFF's own taxonomy — `Spreads`, `Dairies`,
 * `Plant-based foods and beverages` — while `listCategories` counts with
 * `p.category = c.name` against the ten rows `pnpm db:seed` publishes. Nothing
 * errors on a mismatch: E5-02's tiles simply all read "nothing here yet" over a
 * catalog of tens of thousands of products, which reads as a broken screen
 * rather than as a missing mapping.
 *
 * **Keyword rules, not an exact-string table.** OFF has thousands of category
 * strings and contributors add more; a lookup keyed on the whole string would
 * match the handful someone thought to write down and drop the rest silently.
 * Matching on words inside the string degrades instead: an unrecognised
 * category returns null rather than a wrong answer.
 *
 * **First match wins, so the order is the specification.** The collisions it
 * exists to resolve, each of which a naive alphabetical or per-category pass
 * gets wrong:
 *
 * - **Frozen beats the food it is made of.** A frozen pizza belongs in Frozen
 *   Foods, not Bakery — that is the aisle a shop actually stocks it in, and the
 *   same is true of ice cream against Dairy.
 * - **Non-food runs before food.** `Cleaning` and `Personal Care` carry
 *   distinctive words and almost no rows in a food export, but putting them
 *   after the food rules lets a broad pantry keyword swallow them.
 * - **Snacks beats Dairy, because of `milk`.** "Milk chocolate" is a chocolate
 *   bar. Ordering Dairy first files every chocolate bar in the export under
 *   Dairy, which is the single biggest miscategorisation available here.
 * - **Beverages beats Fresh Produce, because of `fruit`.** "Fruit juices" is a
 *   drink; the produce rule would otherwise claim it.
 * - **Grocery is last and deliberately broad.** It is the pantry catch-all, so
 *   it must not be allowed to answer before the specific aisles have.
 */
/**
 * Whole-string answers for the categories the keyword rules get wrong.
 *
 * **Measured, not imagined.** Tallied over 2.39 million rows of the real export
 * — the counts below are from that pass — because the keyword rules were
 * written against a guess at OFF's vocabulary and the guess was wrong in two
 * places that matter more than everything else combined:
 *
 * - **`Plant-based foods and beverages` is the single largest category in the
 *   export** (261,377 rows, more than the next two together) and the keyword
 *   rules filed it under Beverages, because it contains the word. It is OFF's
 *   umbrella for plant foods generally — grains, pulses, fruit, nuts — and
 *   almost none of it is a drink. Left alone it would have made Beverages the
 *   largest tile in the catalog and filled it with rice and lentils.
 * - **`Non food products` (399) was caught by Grocery's `food`.** A negation
 *   read as its opposite, which is the one failure a substring match cannot see.
 *
 * An exact match is checked before the keywords and **is allowed to answer
 * null**, which is how a row is kept out of a category rather than falling
 * through to a rule that would claim it.
 */
const CATEGORY_OVERRIDES = new Map<string, CategoryName | null>([
  ['plant-based foods and beverages', CATEGORY.GROCERY],
  ['non food products', null],
  ['non-food-products', null],
  // Present in volume and genuinely outside the ten. Null rather than a wrong
  // shelf: supplements and medicine are not a grocery aisle.
  ['dietary supplements', null],
  ['supplements', null],
  ['medicine', null],
  // OFF's own placeholders. They are categories in the column and nothing in
  // the world.
  ['undefined', null],
  ['null', null],
])

const CATEGORY_RULES: Array<{ category: CategoryName; keywords: string[] }> = [
  // Frozen first — it beats whatever the food itself is.
  { category: CATEGORY.FROZEN_FOODS, keywords: ['frozen', 'ice cream', 'sorbet', 'deep-frozen'] },

  // Non-food next. Rare in a food export, and cheap to catch before a pantry
  // keyword reaches them. `beauty` is here because OFF carries 2,953 rows under
  // exactly that word.
  { category: CATEGORY.CLEANING, keywords: ['cleaning', 'detergent', 'laundry', 'bleach', 'dishwash'] },
  { category: CATEGORY.PERSONAL_CARE, keywords: ['beauty', 'hygiene', 'cosmetic', 'shampoo', 'toothpaste', 'deodorant', 'soap', 'skin care', 'hair care'] },
  { category: CATEGORY.ELECTRONICS, keywords: ['electronic', 'batteries'] },

  // Before Fresh Produce, so "fruit juices" is a drink.
  { category: CATEGORY.BEVERAGES, keywords: ['beverage', 'drink', 'water', 'juice', 'soda', 'nectar', 'smoothie', 'tea', 'coffee', 'infusion', 'syrup'] },

  // Before Snacks, so cakes and pastries are not confectionery. `pies` rather
  // than `pie`, which would claim "chocolate pieces".
  { category: CATEGORY.BAKERY, keywords: ['bread', 'baker', 'baked', 'pastr', 'cake', 'pies', 'viennoiserie', 'croissant', 'baguette', 'brioche', 'crepe', 'crêpe'] },

  // Before Dairy, so "milk chocolate" is a chocolate bar.
  { category: CATEGORY.SNACKS, keywords: ['snack', 'chocolate', 'biscuit', 'cookie', 'confectioner', 'candy', 'candies', 'crisps', 'chips', 'nuts', 'dried fruit', 'cereal bar', 'dessert', 'popcorn', 'wafer'] },

  { category: CATEGORY.DAIRY, keywords: ['dairy', 'dairies', 'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg'] },

  { category: CATEGORY.FRESH_PRODUCE, keywords: ['vegetable', 'fruit', 'salad', 'herb', 'mushroom', 'potatoes'] },

  // The pantry catch-all. Last, so every aisle above has already answered. The
  // second half of this list is what the 2.39M-row tally turned up sitting in
  // the top forty with no rule to catch it: breakfasts, sweeteners, sandwiches,
  // cooking helpers, fats, toppings.
  { category: CATEGORY.GROCERY, keywords: ['grocer', 'cereal', 'pasta', 'rice', 'noodle', 'sauce', 'spread', 'condiment', 'canned', 'tinned', 'meal', 'oil', 'vinegar', 'spice', 'seasoning', 'sugar', 'flour', 'honey', 'jam', 'soup', 'meat', 'fish', 'seafood', 'poultry', 'legume', 'pulse', 'bean', 'lentil', 'grain', 'flake', 'baby food', 'breakfast', 'sweeten', 'sandwich', 'cooking helper', 'fats', 'topping', 'entree', 'cocoa', 'baking', 'food'] },
]

/**
 * One OFF category string as one of the ten, or null.
 *
 * **Null rather than a default of Grocery.** A wrong category is worse than an
 * absent one: it prints a confident answer nobody can tell is wrong, and it
 * makes the tile counts lie. An uncategorised product is still searchable —
 * name, brand and tags are all in the search vector — it simply does not appear
 * under a tile. That is the same trade the pack-size fields make, and for the
 * same reason.
 *
 * Matched on the whole string rather than word by word, because OFF categories
 * are phrases and the signal is often in the tail: "Plant-based foods and
 * beverages" is caught by `beverage`, "Sweet snacks" by `snack`.
 */
/**
 * How many levels of `categories_en` to consider. OFF orders the column
 * broadest-first and the tail gets noisy fast; twelve reaches the useful depth
 * on every row measured and stops before the per-contributor inventions.
 */
const CATEGORY_DEPTH = 12

/**
 * The category for a whole `categories_en` column, not for one value in it.
 *
 * **Reading only the broadest level was leaving three quarters of the catalog
 * uncategorised**, and the figure that hid it was measured against the wrong
 * population — see `docs/E5-pending.md` §1. `firstValue` takes OFF's broadest
 * level, which for a great many GCC-relevant rows is a phrase no rule claims;
 * the answer is usually sitting one or two levels down in the same cell.
 *
 * **Broadest first, and that is a decision.** Scanning in the column's own
 * order means a row whose broad level already maps keeps exactly the answer it
 * had, so this can only ever *add* a category and never change one. Scanning
 * from the specific end would sharpen some rows — the plant-based umbrella
 * splits into cereals, pulses and produce down there — and would also let a
 * single contributor-invented leaf overrule a correct broad answer. That
 * trade is worth measuring on its own before it is taken.
 */
export function pickCategory(raw: string | undefined): CategoryName | null {
  // Not folded into the loop: `allValues` drops anything over 40 characters,
  // and a long broad value that the rules do claim must still answer.
  const broadest = categoryDecision(firstValue(raw))
  if (broadest !== undefined) return broadest

  for (const value of allValues(raw, CATEGORY_DEPTH)) {
    const deeper = categoryDecision(value)
    if (deeper !== undefined) return deeper
  }
  return null
}

/**
 * Three states, and the third is why this exists.
 *
 * `toCatalogCategory` answers `null` for two different things: *no rule claimed
 * this*, and *a rule deliberately refused it*. That conflation is harmless while
 * one value is consulted and wrong the moment several are. `Dietary supplements`
 * is an override that answers null on purpose — 11,850 rows the ten tiles have
 * no shelf for — and a row whose deeper levels read `Vitamins and minerals` would
 * otherwise fall through the refusal and land in Grocery. The refusal has to
 * stop the scan, which means it has to be distinguishable from silence.
 *
 * `undefined` is "no rule". `null` is "kept out on purpose".
 */
function categoryDecision(raw: string | null): CategoryName | null | undefined {
  if (!raw) return undefined

  const value = raw.trim().toLowerCase()
  if (!value) return undefined

  if (CATEGORY_OVERRIDES.has(value)) return CATEGORY_OVERRIDES.get(value) ?? null

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => value.includes(keyword))) return rule.category
  }
  return undefined
}

export function toCatalogCategory(raw: string | null): CategoryName | null {
  if (!raw) return null

  // One value's answer, with "no rule" and "refused on purpose" flattened back
  // together — which is all a single-value caller can act on anyway. The three
  // states live in `categoryDecision`, so the two cannot drift apart.
  return categoryDecision(raw) ?? null
}

/**
 * One OFF row as a catalog product, or null if it is not worth having.
 *
 * A row is rejected rather than repaired when:
 *
 * - **The barcode fails its check digit.** OFF accepts whatever a contributor
 *   typed, so the export carries plenty of malformed codes. A bad one in the
 *   universal catalog is worse than a missing row: it occupies the number the
 *   real product will be scanned under, and E5 §1's shadowing means an
 *   organization correcting it can only fix its own copy.
 * - **There is no usable English name.** The name is weight A in the search
 *   vector and the only thing a card can print. A row without one is unfindable
 *   and unprintable.
 * - **The name is a placeholder.** "Unknown" appears thousands of times in the
 *   export and would rank against every vague query.
 *
 * `quantity` becomes `specEn`, the variant line, rather than being split into
 * `packSize`/`packUnit`. E5 §4 dropped the free-text unit column precisely
 * because "500 g" cannot be split reliably — and OFF's quantity field is far
 * messier than a shop's own spreadsheet. A wrong pack size feeds the derived
 * unit price and prints a confident wrong number; the free text prints as what
 * it is.
 */
export function toProduct(row: OffRow): OffProduct | null {
  const barcode = normalizeBarcode(row.code ?? '')
  if (!hasValidCheckDigit(barcode)) return null

  const nameEn = (row.product_name ?? '').trim()
  if (!nameEn || nameEn.length > 200) return null
  if (JUNK_NAMES.has(nameEn.toLowerCase())) return null
  // **A name has to contain a letter.** `JUNK_NAMES` catches the placeholders
  // somebody typed on purpose; this catches what a scanner or a spreadsheet
  // left behind — a bare barcode (`0012000057502`), a date, a lone full stop.
  // The first real import wrote 636 of them. They are unfindable by name, and
  // on a card they print as the garbage they are.
  if (!/\p{L}/u.test(nameEn)) return null

  const offCategory = firstValue(row.categories_en)

  // Tags are weight C in the search vector — the widest, cheapest recall.
  // Capped because a handful of OFF rows carry fifty of them and the vector is
  // rebuilt by a trigger on every write.
  //
  // **The OFF category is kept here even though `category` no longer holds it.**
  // Resolving onto the ten is lossy by design — "Spreads" and "Breakfast
  // cereals" both become Grocery — and dropping the original would take the
  // words with it, so an owner searching "spreads" would stop finding Nutella.
  // As a tag it stays searchable without pretending to be a browsable category.
  const tags = allValues(row.labels_en, 7)
  if (offCategory) {
    const asTag = offCategory.toLowerCase()
    if (asTag.length <= 40 && !tags.includes(asTag)) tags.push(asTag)
  }

  return {
    barcode,
    nameEn,
    // Always null from this source — the CSV export has no Arabic column. See
    // OFF_FIELDS above; the `enrich` worker is what fills this.
    nameAr: null,
    brandEn: firstValue(row.brands),
    // The variant line, kept as written. See above.
    specEn: (row.quantity ?? '').trim() || null,
    originEn: firstValue(row.origins_en),
    // One of the ten the app browses, or null. See `pickCategory` — every level
    // of the column is considered, not just the broadest, and the raw OFF
    // string is preserved in `tags` above rather than stored here.
    category: pickCategory(row.categories_en),
    tags,
  }
}
