import { hasValidCheckDigit, normalizeBarcode } from '@souqstudio/types'

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

export function isRelevant(row: OffRow): boolean {
  const countries = (row.countries_en ?? '').toLowerCase()
  if (!countries) return false
  return RELEVANT_COUNTRIES.some((country) => countries.includes(country))
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
    category: firstValue(row.categories_en),
    // Tags are weight C in the search vector — the widest, cheapest recall.
    // Capped because a handful of OFF rows carry fifty of them and the vector
    // is rebuilt by a trigger on every write.
    tags: allValues(row.labels_en, 8),
  }
}
