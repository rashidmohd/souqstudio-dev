import { brandSlug } from '@souqstudio/types'
import { hasValidCheckDigit, isBarcode, normalizeBarcode } from '@souqstudio/types'
import { CATEGORY, type CategoryName } from './catalog-categories'

/**
 * Turning a Union Coop catalog row into a universal catalog product.
 *
 * The sibling of `off-mapping.ts`, and the same split for the same reason: this
 * module is pure — no Prisma, no I/O, no network — and
 * `scripts/import-unioncoop.ts` does the reading and the writing. Everything
 * that decides *what* a row becomes is here, because that is the part worth
 * testing and the part that will be wrong in a way nobody notices.
 *
 * **Where this source differs from Open Food Facts, and why each difference
 * changes the mapping:**
 *
 * - **It has Arabic.** 85% of rows carry a real Arabic name, which is the field
 *   the entire OFF seed lacks and which E5 §2 makes a publish-time blocker for
 *   an Arabic edition. It is the single reason this import is worth doing.
 * - **It is one retailer's own feed, not nine million contributor edits.** The
 *   name format is regular enough to parse, which is why this module splits
 *   pack maths out of the name where `off-mapping.ts` deliberately refuses to.
 *   See `parsePack`.
 * - **It is a hypermarket, not a grocery.** Men Wear, Toys, Mobiles and
 *   Washing Machines are all in here. See `pickCategory` — a third of the
 *   assortment has no home among the ten categories the app browses, and this
 *   module returns null rather than inventing one.
 *
 * **Provenance is recorded on every row.** `source` is `unioncoop` and the
 * originating product URL goes into `metadata.sourceUrl`. E5's "Catalog
 * Sources" table admits images from licensed sources only; these rows are
 * imported under a decision taken outside this file, and the provenance columns
 * are what make a later licensed replacement pass able to find exactly what it
 * needs to replace.
 */

/** One row of `products.json`, as the file actually spells it. */
export type UnionCoopRow = {
  sku?: string
  object_id?: string
  name?: string
  name_ar?: string
  url?: string
  brand?: string | null
  category_one?: string | null
  categories_level0?: string[]
  categories_level1?: string[]
  image_url?: string | null
}

/**
 * The shape a row becomes. Deliberately not Prisma's generated input type — the
 * same rule `OffProduct` follows, so this module stays testable without a
 * database and the script is the one place the two meet.
 */
export type UnionCoopProduct = {
  /** Null when the SKU is a Union Coop internal code rather than a GTIN. */
  barcode: string | null
  /** Always set. The retailer's own item code, GTIN or not. */
  sku: string
  nameEn: string
  nameAr: string | null
  brandEn: string | null
  specEn: string | null
  originEn: string | null
  /** One of the ten the app browses, or null. */
  category: CategoryName | null
  /** The retailer's own category, kept verbatim. */
  subcategory: string | null
  packSize: number | null
  packUnit: PackUnitName | null
  packCount: number | null
  sellBy: 'PACK' | 'LOOSE'
  tags: string[]
  /** Where the packshot can be fetched from. The image pipeline reads this. */
  sourceImageUrl: string | null
  /** The product page it came from. Provenance, never rendered. */
  sourceUrl: string | null
}

/** The five values `PackUnit` allows. A sixth cannot be stored without a migration. */
export type PackUnitName = 'G' | 'KG' | 'ML' | 'L' | 'PIECE'

/** A name that is an artefact of the feed rather than a product. */
const JUNK_NAMES = new Set(['unknown', 'n/a', 'na', 'null', 'none', '-', '--', '?'])

/** What the column holds, and what a card has room for. */
const MAX_NAME = 200

/**
 * The headline hiding inside an electronics listing title.
 *
 * 34 rows — every one of them a TV, a laptop, a phone or a white good — carry
 * the full marketing spec sheet as their name, pipe-delimited and up to 250
 * characters: "Samsung Galaxy Z Flip7 FE 5G | 8GB RAM | 256GB ROM | 6.7"
 * Foldable Display | …". Rejecting them on length drops real, high-value
 * products; storing them whole puts a paragraph where a card has one line.
 *
 * **The first segment is the product and the rest is the spec sheet**, which is
 * how the retailer writes these and why splitting on the pipe is a rule rather
 * than a guess. The remainder is dropped rather than moved to `specEn`: E5's
 * spec is the short variant line under the name — "Full Cream", "Pack of 6" —
 * and eleven pipe-separated clauses is not that.
 *
 * A name with no pipe falls through to a hard truncation at a word boundary,
 * which is worse but still better than losing the row.
 */
function shortenName(raw: string): string {
  if (raw.length <= MAX_NAME) return raw

  const firstSegment = raw.split('|')[0]?.trim() ?? ''
  if (firstSegment && firstSegment.length <= MAX_NAME) return firstSegment

  const candidate = firstSegment || raw
  const cut = candidate.slice(0, MAX_NAME)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > MAX_NAME / 2 ? cut.slice(0, lastSpace) : cut).trim()
}

/**
 * The handful of HTML entities this feed leaves un-decoded.
 *
 * `En &amp; Ar Keyboard` is in there as written. An entity printed literally on
 * a card is a visible defect, and it also splits search: nobody types `&amp;`.
 */
function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

/**
 * The placeholder Magento serves for a product with no photograph.
 *
 * 1,277 rows — 6.9% of the file — point at this one object. Treating it as an
 * image would put the same grey square on 1,277 cards and, worse, would mark
 * those products as *having* an image, so nothing would ever come back to fill
 * them. Matched on the path rather than the whole URL because the query string
 * varies between the full-size and thumbnail spellings.
 */
const PLACEHOLDER_IMAGE = /\/placeholder\/default\//i

// ─── Pack maths ───────────────────────────────────────────────────────────────

/**
 * The unit spellings this feed uses, mapped onto the five `PackUnit` allows.
 *
 * Longest-first when they are assembled into the pattern below, so `ltr` is
 * tried before `l` — otherwise `1.5 Ltr` matches `l` and leaves `tr` behind,
 * failing the anchor and dropping the row's pack data silently.
 */
const UNIT_WORDS: Record<string, PackUnitName> = {
  g: 'G',
  gm: 'G',
  gms: 'G',
  gr: 'G',
  gram: 'G',
  grams: 'G',
  kg: 'KG',
  kgs: 'KG',
  ml: 'ML',
  l: 'L',
  ltr: 'L',
  ltrs: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  pc: 'PIECE',
  pcs: 'PIECE',
  piece: 'PIECE',
  pieces: 'PIECE',
  roll: 'PIECE',
  rolls: 'PIECE',
  sheets: 'PIECE',
  tablets: 'PIECE',
  capsules: 'PIECE',
}

const UNIT_PATTERN = Object.keys(UNIT_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|')

/** `- 600g`, `- 6 x 1.5 L`, `12 x 330ml`. Anchored to the end of the name. */
const PACK_WITH_UNIT = new RegExp(
  `(?:^|[\\s\\-–,(])(?:(\\d+)\\s*[x×]\\s*)?(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})\\b\\.?\\s*\\)?\\s*$`,
  'i'
)

/** `30's`, `4's` — a count with no unit, which this feed writes for eggs and bread. */
const PACK_COUNT_ONLY = /(?:^|[\s\-–,(])(\d+)\s*(?:'s|’s)\s*\)?\s*$/i

/**
 * A mobile network generation, which is not five grams.
 *
 * `Samsung Galaxy Z Flip7 FE 5G` ends in exactly the shape a pack size has, and
 * it reaches this parser because `shortenName` cuts the spec sheet off at the
 * first pipe and leaves the generation as the last token. Storing it would put
 * "5 g" under a phone on a printed card, and feed `deriveUnitPrice()` a price
 * per gram of telephone — the confident wrong number `off-mapping.ts` refuses
 * to split names at all to avoid.
 *
 * **Case is the whole test, and it is a real distinction in this feed rather
 * than a convenient one.** A network generation is always written `5G`, and 31
 * rows are genuine small sachets written lowercase — `Saffron - 2g`,
 * `Ahmad Tea English Breakfast Tea Bag - 100 x 2g`. Requiring the capital and a
 * size of 2 to 5 leaves every one of those parsing.
 */
const NETWORK_GENERATION = /(?:^|\s)[2-5]G$/

/**
 * The size printed at the end of the product name.
 *
 * **`off-mapping.ts` refuses to do this and is right to, for its source.** Its
 * comment says "500 g" cannot be split reliably, and against nine million
 * contributor-typed `quantity` strings that is true — a wrong pack size feeds
 * `deriveUnitPrice()` and prints a confident wrong number on a card.
 *
 * This feed is one retailer's own product titles, written to one template, and
 * the pattern above is anchored to the *end* of the name so it cannot pick a
 * number out of the middle of one. Measured over the whole file: 13,051 of
 * 18,428 rows parse, and effectively every row that does not is loose produce
 * with no pack to describe. The unit distribution is G 6,927 / ML 2,826 /
 * PIECE 1,635 / KG 776 / L 703, which is what a supermarket shelf looks like.
 *
 * **All three columns or none.** `docs/product-data-collection.md` §1: a size
 * with no unit is worse than nothing, because `packLabel()` and
 * `deriveUnitPrice()` both need the set. A non-match returns nulls for all
 * three and the offer falls back to `unitPriceMode = HIDDEN`, which is a
 * correct, quiet outcome.
 */
export function parsePack(name: string): {
  packSize: number | null
  packUnit: PackUnitName | null
  packCount: number | null
  /** The matched text, so the caller can strip it out of the name. */
  matched: string | null
} {
  const none = { packSize: null, packUnit: null, packCount: null, matched: null }

  if (NETWORK_GENERATION.test(name)) return none

  const withUnit = name.match(PACK_WITH_UNIT)
  if (withUnit) {
    const unit = UNIT_WORDS[(withUnit[3] ?? '').toLowerCase()]
    const size = Number(withUnit[2])
    const count = withUnit[1] === undefined ? null : Number(withUnit[1])
    if (unit && Number.isFinite(size) && size > 0) {
      return {
        packSize: size,
        packUnit: unit,
        packCount: count !== null && Number.isFinite(count) && count > 1 ? count : null,
        matched: withUnit[0] ?? null,
      }
    }
  }

  const countOnly = name.match(PACK_COUNT_ONLY)
  if (countOnly) {
    const size = Number(countOnly[1])
    if (Number.isFinite(size) && size > 0) {
      return { packSize: size, packUnit: 'PIECE', packCount: null, matched: countOnly[0] ?? null }
    }
  }

  return none
}

// ─── Origin ───────────────────────────────────────────────────────────────────

/**
 * The countries this feed names, and it names them only on fresh produce.
 *
 * `originEn` renders as a prefix line *above* the product name — E6 §5 — so
 * "UAE" over "Cucumber" is exactly the card a grocery wants. The list is
 * closed rather than "any capitalised word after a dash", because the trailing
 * segment of a product name is far more often a variant than a country:
 * "Apple Pink Lady - France" and "Chicken Strips - Spicy" are the same shape.
 *
 * `AB` is in the list because this feed uses it for Ecuador on bananas. It is
 * the retailer's own abbreviation, not a country code, and it is mapped rather
 * than passed through so it does not print as two letters nobody can read.
 */
const ORIGIN_NAMES = [
  'UAE',
  'Saudi Arabia',
  'Oman',
  'Kuwait',
  'Qatar',
  'Bahrain',
  'Yemen',
  'India',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'China',
  'Japan',
  'Korea',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Indonesia',
  'Malaysia',
  'Singapore',
  'Taiwan',
  'Syria',
  'Jordan',
  'Lebanon',
  'Iraq',
  'Iran',
  'Turkey',
  'Egypt',
  'Morocco',
  'Tunisia',
  'Sudan',
  'Somalia',
  'Kenya',
  'Ethiopia',
  'Uganda',
  'Tanzania',
  'Zimbabwe',
  'South Africa',
  'Australia',
  'New Zealand',
  'USA',
  'Canada',
  'Mexico',
  'Brazil',
  'Argentina',
  'Chile',
  'Peru',
  'Ecuador',
  'Colombia',
  'Spain',
  'France',
  'Italy',
  'Portugal',
  'Greece',
  'Cyprus',
  'Netherlands',
  'Belgium',
  'Germany',
  'Austria',
  'Switzerland',
  'Poland',
  'Czech',
  'Hungary',
  'Romania',
  'Bulgaria',
  'Serbia',
  'Croatia',
  'Ukraine',
  'Russia',
  'Georgia',
  'Armenia',
  'Azerbaijan',
  'Uzbekistan',
  'Denmark',
  'Sweden',
  'Norway',
  'Finland',
  'Ireland',
  'UK',
] as const

/** The retailer's own abbreviations, resolved to something a card can print. */
const ORIGIN_ALIASES: Record<string, string> = { AB: 'Ecuador' }

const ORIGIN_ALTERNATION = [...ORIGIN_NAMES, ...Object.keys(ORIGIN_ALIASES)].join('|')

/**
 * A trailing country, with or without the dash, and with `Oman/UAE` as one
 * value — this feed writes a slash for produce that comes from either.
 */
const ORIGIN_SUFFIX = new RegExp(
  `(?:\\s*[-–]\\s*|\\s+)((?:${ORIGIN_ALTERNATION})(?:\\s*/\\s*(?:${ORIGIN_ALTERNATION}))*)\\s*$`,
  'i'
)

export function parseOrigin(name: string): { originEn: string | null; matched: string | null } {
  const found = name.match(ORIGIN_SUFFIX)
  const raw = found?.[1]
  if (!found || !raw) return { originEn: null, matched: null }

  const resolved = raw
    .split('/')
    .map((part) => {
      const trimmed = part.trim()
      const canonical =
        ORIGIN_NAMES.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ??
        ORIGIN_ALIASES[trimmed.toUpperCase()]
      return canonical ?? trimmed
    })
    .join(' / ')

  return { originEn: resolved, matched: found[0] ?? null }
}

// ─── Category ─────────────────────────────────────────────────────────────────

/**
 * Union Coop's 311 categories, resolved onto the ten the app browses.
 *
 * **Keyword rules in a fixed order, first match wins** — the same mechanism
 * `off-mapping.ts` uses, and for the same reason: a lookup keyed on the whole
 * string matches the values someone thought to write down and drops the rest
 * silently, while matching on words inside it degrades to null.
 *
 * **A third of this assortment has no home among the ten, and that is a real
 * gap rather than a mapping failure.** Union Coop is a hypermarket: Men Wear
 * (416 rows), Toys (131), Stationery Supplies (289), Mobiles (111), Washing
 * Machines, Car Accessories, Cat Food (316). The ten categories were specified
 * for a grocery. Those rows return null here, which leaves them fully
 * searchable — `category` is weight B in the search vector and `subcategory`
 * keeps the retailer's own word — but absent from the category browser. Adding
 * `Household`, `Baby`, `Pet`, `Apparel`, `Stationery` and `Toys` to
 * `catalog-categories.ts` is the fix, and it is a decision about what the app
 * browses rather than something this file may take on its own.
 *
 * The orderings that are load-bearing, each one a collision a naive pass gets
 * wrong:
 *
 * - **Frozen beats the food it is made of.** Frozen Chicken and Ice Cream are
 *   the frozen aisle, not Grocery and Dairy. Same rule `off-mapping.ts` states.
 * - **Cleaning and Personal Care run before food.** Both carry distinctive
 *   words, and a broad pantry keyword otherwise swallows `Hand Sanitizer`.
 * - **Snacks beats Dairy, because of `milk`.** `Milk Chocolate` (91 rows) is a
 *   chocolate bar. Ordering Dairy first files every one of them under Dairy.
 * - **Beverages beats Fresh Produce, because of `juice`.** `Fresh Juice` (206
 *   rows) is a drink.
 * - **Grocery is last and deliberately broad**, so the specific aisles answer
 *   first.
 */
/**
 * Whole-string answers for the categories the keyword rules get wrong.
 *
 * **Measured by reading the products, not the category names** — the same
 * method `off-mapping.ts` reached for, and here it overturned six guesses that
 * every one of the names supports:
 *
 * - **`Camping & Hiking` is charcoal tablets.** So is `BBQ Accessories`, so is
 *   `Picnic Accessories`, and `Outdoor Equipment` is gas lighters and matches.
 *   All four read as an outdoor aisle and all four are the household one. This
 *   is why there is no Outdoor category.
 * - **`Party & Birthday` is fancy dress** — Spiderman and Wolverine costumes,
 *   National Day dresses. Apparel, not Toys.
 * - **`Kitchen` is cleaning products**, JIF and Dettol and Clorox, while
 *   `Kitchen Ware` is pans and `Kitchen Appliances` is air fryers. Three
 *   aisles, one word, and a keyword rule cannot separate them by ordering
 *   without putting one of the other two in the wrong place.
 * - **`Tablets` is iPads.** In a catalog that also sells `Pain Relief`, that is
 *   the reading worth pinning down.
 * - **`Hardware Tools` is glue and packing tape**, and `library` is notebooks.
 *   Both are the stationery aisle.
 * - **`Gardening & Lawn Care` is potting soil and insect killer**, and
 *   `Car Accessories` is air fresheners.
 *
 * **`Milk Formula` is the one that moves an existing answer.** It was reaching
 * Dairy through the word `milk`, and infant formula is the baby aisle in every
 * shop that sells it — 161 rows. `Milk Powder` deliberately does *not* move
 * with it: those 38 rows are Nido and Almarai full cream, which is dairy.
 *
 * Keyed on the trimmed, lowercased `category_one` exactly, so a value that is
 * merely similar still falls through to the keyword rules below.
 */
const CATEGORY_OVERRIDES = new Map<string, CategoryName>([
  // Household, against the names' own suggestion. See above.
  ['outdoor equipment', CATEGORY.HOUSEHOLD],
  ['camping & hiking', CATEGORY.HOUSEHOLD],
  ['bbq accessories', CATEGORY.HOUSEHOLD],
  ['picnic accessories', CATEGORY.HOUSEHOLD],
  ['gardening & lawn care', CATEGORY.HOUSEHOLD],
  ['car accessories', CATEGORY.HOUSEHOLD],
  ['facial paper', CATEGORY.HOUSEHOLD],
  ['kitchen paper', CATEGORY.HOUSEHOLD],
  ['religious items', CATEGORY.HOUSEHOLD],
  ['bedding', CATEGORY.HOUSEHOLD],
  ['bath towel', CATEGORY.HOUSEHOLD],
  ['gift boxes', CATEGORY.HOUSEHOLD],
  // Aluminium foil, cling film and plastic cutlery. The word `disposable`
  // otherwise hands them to Cleaning, where the disposable gloves live.
  ['disposables', CATEGORY.HOUSEHOLD],
  // `Beverages` matches `water` and `coffee` and runs first, so these two
  // reach Household only by being named.
  ['lunch boxes & water bottles', CATEGORY.HOUSEHOLD],
  ['flasks & coffee pots', CATEGORY.HOUSEHOLD],
  /**
   * `Lights` is gas lighters and LED lamps in one group of 12. Household rather
   * than Electronics because the lighters are the majority and a hypermarket
   * shelves lamps in the home aisle, not beside the televisions.
   *
   * **It is named here because `lights` cannot be a keyword.** As one it also
   * matched `Crunchy De-lights`, and put 72 rows of Sunbites bread bites into
   * Electronics — found by auditing all 311 source categories rather than by
   * reading the totals, which looked entirely reasonable.
   */
  ['lights', CATEGORY.HOUSEHOLD],

  // Cleaning, which the word alone would hand to Household or Electronics.
  ['kitchen', CATEGORY.CLEANING],
  ['gloves', CATEGORY.CLEANING],

  ['tablets', CATEGORY.ELECTRONICS],

  ['party & birthday', CATEGORY.APPAREL],

  ['hardware tools', CATEGORY.STATIONERY],
  ['library', CATEGORY.STATIONERY],
  ['glue', CATEGORY.STATIONERY],

  ['outdoor play', CATEGORY.TOYS],
  ['sports equipment', CATEGORY.TOYS],

  ['milk formula', CATEGORY.BABY],
])

const CATEGORY_RULES: ReadonlyArray<readonly [CategoryName, readonly string[]]> = [
  /**
   * **Baby runs first, ahead of every aisle it borrows a word from.** Baby
   * wipes would be Cleaning, baby bath would be Personal Care, baby food would
   * be Grocery, and a shop owner building a baby promotion would find the
   * aisle two-thirds empty with no way to tell why.
   */
  [
    CATEGORY.BABY,
    ['baby', 'nursery', 'infant', 'toddler'],
  ],
  /**
   * Pet before Grocery, for the same reason in reverse: `Cat Food` and
   * `Dog Food` are 400 rows that a pantry keyword would eventually claim.
   */
  [
    CATEGORY.PET,
    ['cat food', 'dog food', 'pet '],
  ],
  [
    CATEGORY.FROZEN_FOODS,
    ['frozen', 'ice cream', 'breaded & crispy', 'kebab, kofta', 'burgers', 'ready to cook'],
  ],
  [
    CATEGORY.CLEANING,
    [
      'detergent',
      'cleaning',
      'floor & surface',
      'dishwashing',
      'fabric softener',
      'fabric care',
      'garbage',
      'sponges',
      'home care',
      'ironing',
      'toilet',
      'disposable',
      'wipes',
      'footwear care',
    ],
  ],
  [
    CATEGORY.PERSONAL_CARE,
    [
      'shampoo',
      'conditioner',
      'hair',
      'skin care',
      'face care',
      'body care',
      'body mist',
      'body powder',
      'soap',
      'handwash',
      'hand sanitizer',
      'shower & bathing',
      'deodorant',
      'roll-on',
      'perfume',
      'cologne',
      'toothpaste',
      'toothbrush',
      'mouthwash',
      'oral care',
      'oral kit',
      'shaving',
      'shavers',
      'feminine care',
      'nail care',
      'lip care',
      'sun care',
      'makeup',
      'loofah',
      'bath accessories',
      'personal scales',
      'kids fragrance',
      // The pharmacy end of a hypermarket. Small — 19 rows — but E5's target
      // customers include pharmacy chains, and Personal Care is the aisle a
      // shop owner would look in for all four.
      'pain relief',
      'cold & cough',
      'first aid',
      'adult diaper',
    ],
  ],
  [
    CATEGORY.ELECTRONICS,
    [
      'mobile',
      'smartwatch',
      'headsets',
      'tvs &',
      'computer',
      'laptop',
      'printer',
      'camera',
      'tablet accessories',
      'networking',
      'battery',
      'vacuum cleaner',
      'washing machine',
      'refrigerator',
      'dishwasher',
      'microwave',
      'air fryer',
      'toasters',
      'kettles',
      'blenders',
      'cooking range',
      'stoves',
      'rice & multi cooker',
      'kitchen appliances',
      'air cooling',
      // Humidifiers, air purifiers and scent diffusers — Xiaomi, Levoit,
      // Dreame. It read as a Cleaning word and was one until the audit looked
      // at the products.
      'air quality',
      'water dispenser',
      'massage appliance',
      'smart gadget',
      'audio & video',
      'electrical',
    ],
  ],
  [
    CATEGORY.BEVERAGES,
    [
      'juice',
      'soft drink',
      'water',
      'tea',
      'coffee',
      'energy drink',
      'malt beverage',
      'instant drink',
      'syrups & squash',
      'health drink',
      'topping syrup',
      'dates syrup',
    ],
  ],
  [
    CATEGORY.SNACKS,
    [
      'chips',
      'puffs',
      'popcorn',
      'candy',
      'chocolate',
      'chewing gum',
      'biscuit',
      'cookies',
      'nuts',
      'seeds',
      'dried fruits',
      'dates',
      'breakfast bars',
      'healthy bars',
      'crunchy delights',
      'packs & minis',
      'snacks & appetizers',
    ],
  ],
  [
    CATEGORY.DAIRY,
    [
      'milk',
      'yoghurt',
      'cheese',
      'laban',
      'labneh',
      'butter & margarine',
      'ghee',
      'cream',
      'eggs',
      'kefir',
    ],
  ],
  [
    CATEGORY.BAKERY,
    [
      'bread',
      'buns & rolls',
      'pastries',
      'packed cakes',
      'cakes & waffles',
      'slices & toast',
      'flatbread',
      'sufra roll',
      'bakery treats',
      'artisan',
    ],
  ],
  [
    CATEGORY.FRESH_PRODUCE,
    [
      'fresh vegetables',
      'fresh fruits',
      'green leaves',
      'sliced fruits',
      'chopped vegetables',
      'vine leaves',
    ],
  ],
  /**
   * `ware` covers `Kitchen Ware`, `Plastic Ware`, `Glass Ware`, `Melamine
   * Ware`, `House Ware Supply`, `Ceramic & Porcelain Ware` and `Baking Ware
   * Item` in one word. It is safe only because `Hardware Tools` — which also
   * contains it — is settled by the override table above.
   */
  [
    CATEGORY.HOUSEHOLD,
    [
      'ware',
      'utensil',
      'frypan',
      'food storage',
      'furnishing',
      'furniture',
      'stainless steel',
      'melamine',
      'bedding',
      'towel',
    ],
  ],
  [
    CATEGORY.STATIONERY,
    [
      'stationery',
      'art & craft',
      'papers & notebooks',
      'writing supplies',
      'school bags',
      'pencil cases',
      'filing & organization',
      'printer supplies',
      'coloring materials',
    ],
  ],
  [
    CATEGORY.APPAREL,
    [
      'wear',
      'foot wear',
      'footwear',
      'fashion',
      'apparel',
      'jewellery',
      'jewelry',
      'luggage',
      'uniform',
    ],
  ],
  [
    CATEGORY.TOYS,
    ['toys', 'toy ', 'games', 'fishing', 'protective gear'],
  ],
  [
    CATEGORY.GROCERY,
    [
      'spice',
      'masala',
      'salt',
      'sugar',
      'flour',
      'rice',
      'pasta',
      'noodles',
      'oil',
      'oats',
      'grain',
      'pulses',
      'honey',
      'jam',
      'sauce',
      'ketchup',
      'mayonnaise',
      'salad dressing',
      'pickles',
      'canned',
      'soup',
      'food spread',
      'breakfast cereals',
      'seasoning',
      'paprika',
      'turmeric',
      'black pepper',
      'cumin',
      'cardamom',
      'saffron',
      'garlic & onion powder',
      'tomato paste',
      'baking',
      'cooking powder',
      'pudding',
      'sweeteners',
      'supplements',
      'meals',
      'sandwiches',
      'chicken',
      'beef',
      'mutton',
      'fish & seafood',
      'cold cuts',
      'franks & sausage',
      'pizza & pie',
      'salads & appetizers',
      'grilled',
    ],
  ],
]

export function pickCategory(categoryOne: string | null | undefined): CategoryName | null {
  if (!categoryOne) return null
  const haystack = categoryOne.trim().toLowerCase()
  if (!haystack) return null

  // Whole-string answers first. Every one of them is a value a keyword rule
  // places in the wrong aisle, and no ordering of the rules fixes them all —
  // `Kitchen`, `Kitchen Ware` and `Kitchen Appliances` are three categories
  // sharing one word.
  const override = CATEGORY_OVERRIDES.get(haystack)
  if (override) return override

  for (const [name, keywords] of CATEGORY_RULES) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return name
  }
  return null
}

// ─── The mapping ──────────────────────────────────────────────────────────────

/**
 * Whether the Arabic name is actually Arabic.
 *
 * 2,714 rows — 14.7% — repeat the English name in the `name_ar` field. Storing
 * those would be worse than storing null: E5 §2 blocks an Arabic edition on a
 * null `nameAr`, which is a warning the owner can act on, whereas an English
 * string in that column publishes silently and prints English on an Arabic
 * page. The block is the feature.
 */
function arabicOrNull(raw: string | undefined): string | null {
  const value = decodeEntities((raw ?? '').trim())
  if (!value) return null
  return /[؀-ۿ]/.test(value) ? value : null
}

/**
 * Strip the brand off the front of the name.
 *
 * 14,454 rows — 78.4% — begin with their own brand: brand `MASAFI`, name
 * `Masafi Natural Mineral Water - 6 x 1.5 L`. A block binds `brand` and `name`
 * as two separate fields — `packages/types/src/composition.ts` — so a card
 * built from the raw row prints "Masafi / Masafi Natural Mineral Water".
 *
 * Compared through `brandSlug()` rather than by string prefix, because the feed
 * spells the brand field in caps and the name in title case, and because that
 * is the function the rest of the system already agrees on. Only stripped when
 * something substantial is left — `Oasis` as a brand on a product named `Oasis`
 * keeps its name rather than being reduced to an empty string.
 */
export function stripBrandPrefix(name: string, brand: string | null): string {
  if (!brand) return name

  const wanted = brandSlug(brand)
  if (!wanted) return name

  const words = name.split(/\s+/)
  for (let take = Math.min(words.length - 1, 5); take > 0; take -= 1) {
    if (brandSlug(words.slice(0, take).join(' ')) !== wanted) continue
    const rest = words.slice(take).join(' ').replace(/^[\s\-–,]+/, '').trim()
    if (rest.length >= 3) return rest
  }
  return name
}

/**
 * One Union Coop row as a catalog product, or null if it is not worth having.
 *
 * A row is rejected rather than repaired when there is no usable English name —
 * the name is weight A in the search vector and the only thing a card can
 * print, so a row without one is unfindable and unprintable. Unlike the OFF
 * mapping, a **missing or invalid barcode is not a rejection**: 536 rows are
 * loose produce carrying a Union Coop item code, and those are exactly the rows
 * a grocery's offer book is built from. They keep the code in `sku` and carry a
 * null `barcode`, which is what the column is nullable for.
 */
export function toProduct(row: UnionCoopRow): UnionCoopProduct | null {
  const sku = (row.sku ?? '').trim()
  if (!sku) return null

  const rawName = shortenName(decodeEntities((row.name ?? '').trim()))
  if (!rawName) return null
  if (JUNK_NAMES.has(rawName.toLowerCase())) return null
  // A name has to contain a letter — the same guard `off-mapping.ts` grew after
  // its first real run wrote 636 bare barcodes into the table.
  if (!/\p{L}/u.test(rawName)) return null

  const normalized = normalizeBarcode(sku)
  const barcode = isBarcode(normalized) && hasValidCheckDigit(normalized) ? normalized : null

  const brandEn = decodeEntities((row.brand ?? '')?.trim() ?? '') || null

  // Order matters: the pack suffix sits outside the origin suffix in this feed
  // ("Potato Syria - 4kg"), so taking the pack off first exposes the origin.
  //
  // Each strip re-trims the separator it leaves behind. `Potato Syria - 4kg`
  // loses ` 4kg` and is left as `Potato Syria -`, and the dangling dash is
  // enough to stop the origin pattern matching `Syria` at the end of it.
  const trimTail = (value: string): string => value.replace(/[\s\-–,(]+$/, '').trim()

  let working = trimTail(rawName)
  const pack = parsePack(working)
  if (pack.matched) working = trimTail(working.slice(0, working.length - pack.matched.length))

  const origin = parseOrigin(working)
  if (origin.matched) working = trimTail(working.slice(0, working.length - origin.matched.length))

  working = trimTail(stripBrandPrefix(working, brandEn))

  // If the strips left nothing usable, the original name is the honest answer —
  // a card with an empty headline is worse than a card repeating its brand.
  const nameEn = working.length >= 2 ? working : rawName

  /**
   * **A loose row has no GTIN, sits in a produce aisle, and carries no pack
   * size.** `SellBy.LOOSE` means the price already *is* the unit price, and
   * getting it wrong makes `deriveUnitPrice()` divide a rate by a quantity that
   * was never there.
   *
   * All three tests are needed. A missing barcode alone is not enough — an
   * own-brand packaged line can lack one too. And the pack test is what keeps
   * `Potato Syria - 4kg` a pack: it is a sack with a weight printed on it,
   * sitting in the same aisle as the cucumbers that really are weighed at the
   * counter, and the printed weight is the thing that tells them apart.
   */
  const category = pickCategory(row.category_one)
  const sellBy: 'PACK' | 'LOOSE' =
    barcode === null && category === CATEGORY.FRESH_PRODUCE && pack.packSize === null
      ? 'LOOSE'
      : 'PACK'

  const sourceImageUrl = (row.image_url ?? '').trim() || null

  return {
    barcode,
    sku,
    nameEn,
    nameAr: arabicOrNull(row.name_ar),
    brandEn,
    // No spec column in this feed, and nothing left over from the name worth
    // promoting to one. Left null rather than filled with a guess.
    specEn: null,
    originEn: origin.originEn,
    category,
    // The retailer's own category, kept verbatim. It is weight B in the search
    // vector and it is the only place the 311 values survive — resolving onto
    // the ten is lossy, and dropping the original would take the words with it.
    subcategory: (row.category_one ?? '')?.trim() || null,
    // All three or none — `docs/product-data-collection.md` §1. A loose row
    // reaches here with all three already null, by the test above.
    packSize: pack.packSize,
    packUnit: pack.packUnit,
    packCount: pack.packCount,
    sellBy,
    tags: buildTags(row),
    sourceImageUrl:
      sourceImageUrl && !PLACEHOLDER_IMAGE.test(sourceImageUrl) ? sourceImageUrl : null,
    sourceUrl: (row.url ?? '').trim() || null,
  }
}

/**
 * Weight C in the search vector — the widest, cheapest recall.
 *
 * The retailer's merchandising groups are what an owner actually types:
 * "Ramadan Essentials", "Organic & Healthy", "Lunch Box Snacking". They are
 * useless as categories and valuable as tags. Capped at seven because the
 * vector is rebuilt by a trigger on every write, and the `///` separator the
 * feed uses for its level-1 paths is split so both halves are searchable.
 */
export function buildTags(row: UnionCoopRow): string[] {
  const seen = new Set<string>()

  const add = (raw: string): void => {
    const value = raw.trim().toLowerCase()
    if (value && value.length <= 40) seen.add(value)
  }

  for (const entry of row.categories_level1 ?? []) {
    for (const part of entry.split('///')) add(part)
    if (seen.size >= 7) break
  }
  for (const entry of row.categories_level0 ?? []) {
    if (seen.size >= 7) break
    add(entry)
  }

  return [...seen].slice(0, 7)
}
