import type { ImportRowStatus } from '@souqstudio/types'

/**
 * The pure half of the E5-06 spreadsheet import: what a column means, what a
 * price string means, and when a match is good enough to stand without asking.
 *
 * No `server-only` — the mapping screen re-runs `inferColumnMap` in the browser
 * so the owner sees the guess change as they correct a header, and the server
 * re-derives nothing from what the client sends except the map itself.
 */

// ─── Columns ──────────────────────────────────────────────────────────────────

/**
 * The fields a column can be mapped to.
 *
 * `price` is here and is not a catalog field: it belongs to the offer this row
 * will become, not to the product. It travels through the import because the
 * sheet is where it comes from, and `catalog_import_rows.price` is where it
 * waits until there is an offer book to put it in.
 */
export const CANONICAL_FIELDS = [
  'nameEn',
  'nameAr',
  'brandEn',
  'specEn',
  'category',
  'barcode',
  'packSize',
  'packUnit',
  'packCount',
  'price',
] as const

export type CanonicalField = (typeof CANONICAL_FIELDS)[number]

export type ColumnMap = Record<string, CanonicalField | null>

/** What each field is called on the mapping screen. Sentence case, per the system. */
export const FIELD_LABEL: Record<CanonicalField, string> = {
  nameEn: 'Product name',
  nameAr: 'Product name (Arabic)',
  brandEn: 'Brand',
  specEn: 'Variant',
  category: 'Category',
  barcode: 'Barcode',
  packSize: 'Pack size',
  packUnit: 'Pack unit',
  packCount: 'Items per pack',
  price: 'Price',
}

/**
 * Header spellings seen in real sheets, lower-cased and stripped of anything
 * that is not a letter or a digit before comparison.
 *
 * Arabic headers are included rather than assumed away: a shop in Sharjah
 * exports its stock list from a system that labels the columns in Arabic, and a
 * mapping screen that guesses nothing for every column is a mapping screen the
 * owner abandons.
 *
 * **Order matters within a field, and between them.** `nameAr` is tested before
 * `nameEn` because "product name arabic" contains "product name"; putting the
 * general case first would claim the Arabic column for English.
 */
const HEADER_HINTS: Array<[CanonicalField, string[]]> = [
  ['nameAr', ['namear', 'arabicname', 'productnamearabic', 'namearabic', 'الاسم', 'اسمالمنتج']],
  ['packCount', ['packcount', 'itemsperpack', 'piecesperpack', 'qtyperpack', 'multipack']],
  ['packUnit', ['packunit', 'unit', 'uom', 'measure', 'الوحدة']],
  ['packSize', ['packsize', 'size', 'weight', 'volume', 'netweight', 'الحجم', 'الوزن']],
  ['nameEn', ['name', 'productname', 'item', 'itemname', 'description', 'product', 'المنتج']],
  ['brandEn', ['brand', 'make', 'manufacturer', 'العلامة', 'الماركة']],
  ['specEn', ['variant', 'spec', 'flavour', 'flavor', 'type', 'variety']],
  ['category', ['category', 'department', 'section', 'group', 'الفئة']],
  ['barcode', ['barcode', 'ean', 'upc', 'gtin', 'sku', 'code', 'الباركود']],
  ['price', ['price', 'rate', 'offerprice', 'sellingprice', 'amount', 'cost', 'السعر']],
]

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Guess what each column is, for the owner to confirm.
 *
 * **A guess, never a decision.** E5-06 puts a mapping screen between this and
 * the import for exactly that reason: a column called "Code" could be a barcode
 * or an internal SKU, and getting it wrong means matching every row against the
 * wrong number.
 *
 * Each field is claimed at most once. A sheet with both "Name" and "Item
 * Name" would otherwise map both to `nameEn`, and the later one would silently
 * win when the map is applied — so the first match keeps it and the second is
 * left unmapped for the owner to resolve.
 */
export function inferColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const claimed = new Set<CanonicalField>()

  for (const header of headers) {
    const normalized = normalizeHeader(header)
    map[header] = null
    if (!normalized) continue

    for (const [field, hints] of HEADER_HINTS) {
      if (claimed.has(field)) continue
      // Exact first, then contains: "Item" should reach `nameEn` and so should
      // "Item Name", but "Item" must not be beaten to it by a longer hint.
      if (hints.includes(normalized) || hints.some((hint) => normalized.includes(hint))) {
        map[header] = field
        claimed.add(field)
        break
      }
    }
  }

  return map
}

/** Which canonical fields a map actually covers. The screen blocks on `nameEn`. */
export function mappedFields(map: ColumnMap): Set<CanonicalField> {
  return new Set(Object.values(map).filter((field): field is CanonicalField => field !== null))
}

// ─── Values ───────────────────────────────────────────────────────────────────

/**
 * A price cell, as a decimal string.
 *
 * **A string in and a string out, never a float.** `catalog_import_rows.price`
 * is `Decimal(10,2)` and the value ends up printed on a flyer; routing it
 * through a binary float to parse it is how 9.95 becomes 9.949999999999999.
 *
 * Handles what actually turns up in a cell: a currency code or symbol, thin
 * spaces, thousands separators, and the comma-as-decimal convention that Excel
 * writes in half the locales in the region. The comma is read as a decimal
 * separator only when it cannot be a thousands separator — that is, when
 * exactly one comma is present and it is not followed by exactly three digits.
 * `1,234` is one thousand two hundred and thirty-four; `9,50` is nine fifty.
 *
 * Returns null rather than zero for anything it cannot read. A missing price is
 * a row the owner has to look at; a zero price is a product given away free.
 */
export function parsePrice(raw: string): string | null {
  // The numeric run is *extracted*, not filtered out of the string. Stripping
  // every disallowed character globally looks equivalent and is not: the Arabic
  // dirham symbol `د.إ` carries a full stop, so `د.إ 9.50` filters down to
  // `.9.50` and parses as nothing at all. Matching the number itself leaves the
  // symbol where it is, on either side of the value.
  const match = raw.match(/-?\d[\d.,]*\d|-?\d/)
  const cleaned = match?.[0] ?? ''
  if (!cleaned) return null

  const commas = (cleaned.match(/,/g) ?? []).length
  const dots = (cleaned.match(/\./g) ?? []).length

  let normalized: string
  if (commas > 0 && dots > 0) {
    // Both present: whichever comes last is the decimal separator, and the
    // other is grouping. "1.234,56" and "1,234.56" are both a thousand-odd.
    const decimal = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.'
    const grouping = decimal === ',' ? '.' : ','
    normalized = cleaned.split(grouping).join('').replace(decimal, '.')
  } else if (commas === 1 && !/,\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(',', '.')
  } else {
    normalized = cleaned.split(',').join('')
  }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null

  // Two decimal places, because the column is Decimal(10,2) and a third would
  // be rounded by Postgres rather than by us — silently, and out of sight.
  return value.toFixed(2)
}

/**
 * A pack-size cell, but only when it is unambiguously a number.
 *
 * E5 §4 dropped the free-text `unit` column rather than parsing it, because
 * "500g" cannot be split reliably — and that reasoning does not stop applying
 * at the import boundary. A cell reading `500` is a pack size; a cell reading
 * `500g` or `versch. Sorten` is left alone, the pack fields stay null, and the
 * value survives untouched in `raw` where the owner can see it.
 *
 * A wrong pack size is worse than no pack size: it feeds the derived unit price
 * that E5 §4 puts on the card, so a mis-split cell prints a confident, wrong
 * number next to a real one.
 */
export function parsePackSize(raw: string): string | null {
  const trimmed = raw.trim()
  return /^\d{1,7}(\.\d{1,3})?$/.test(trimmed) ? trimmed : null
}

const PACK_UNITS = new Map<string, 'G' | 'KG' | 'ML' | 'L' | 'PIECE'>([
  ['g', 'G'],
  ['gm', 'G'],
  ['gr', 'G'],
  ['gram', 'G'],
  ['grams', 'G'],
  ['kg', 'KG'],
  ['kgs', 'KG'],
  ['kilo', 'KG'],
  ['kilogram', 'KG'],
  // The millilitre abbreviation, not the `ml-` margin utility. The rule matches
  // on the string's value, so there is no spelling of this that satisfies it —
  // same exemption as UNIT_LABEL in lib/catalog-display.ts.
  // eslint-disable-next-line no-restricted-syntax
  ['ml', 'ML'],
  ['l', 'L'],
  ['ltr', 'L'],
  ['litre', 'L'],
  ['liter', 'L'],
  ['pc', 'PIECE'],
  ['pcs', 'PIECE'],
  ['piece', 'PIECE'],
  ['pieces', 'PIECE'],
  ['ea', 'PIECE'],
  ['each', 'PIECE'],
])

export function parsePackUnit(raw: string): 'G' | 'KG' | 'ML' | 'L' | 'PIECE' | null {
  return PACK_UNITS.get(raw.trim().toLowerCase()) ?? null
}

// ─── Deciding a match ─────────────────────────────────────────────────────────

export type MatchCandidate = { catalogProductId: string; score: number }

/**
 * How good a name match has to be to stand on its own.
 *
 * Both numbers are heuristic and both are deliberately conservative, because
 * the two failure directions are not symmetric. An extra AMBIGUOUS row costs
 * the owner one click. A wrong MATCHED row puts the wrong product on a printed
 * flyer at the right price, and nobody catches it until it is on a shelf —
 * "a wrong product at the right price is worse than a gap", as E5-06 puts it.
 */
const STRONG_ENOUGH = 0.45
/** How far clear of the runner-up the top match has to be to stand unasked. */
const DECISIVE_MARGIN = 0.15

export type RowResolution = {
  status: ImportRowStatus
  catalogProductId: string | null
  candidates: MatchCandidate[]
}

/**
 * Turn a barcode hit or a ranked candidate list into a row status.
 *
 * **A barcode match is always MATCHED**, whatever the name says. It is an
 * identity, and a sheet whose barcode and name disagree is a sheet with a bad
 * name column, not a bad barcode.
 *
 * Otherwise the top candidate has to be both strong on its own and clear of the
 * one behind it. Either test alone is not enough: a lone weak match is a guess,
 * and two near-identical strong matches — "Basmati Rice 1kg" and "Basmati Rice
 * 5kg" — are exactly the case where picking the higher score silently is most
 * likely to be wrong and least likely to be noticed.
 *
 * Candidates are carried on an AMBIGUOUS row for the owner to choose from, and
 * on an UNMATCHED row there are none. **Nothing here auto-resolves.**
 */
export function resolveRow(input: {
  barcodeMatchId?: string | null
  candidates?: MatchCandidate[]
}): RowResolution {
  if (input.barcodeMatchId) {
    return {
      status: 'MATCHED',
      catalogProductId: input.barcodeMatchId,
      candidates: [],
    }
  }

  const candidates = [...(input.candidates ?? [])].sort((a, b) => b.score - a.score)
  const top = candidates[0]
  if (!top) return { status: 'UNMATCHED', catalogProductId: null, candidates: [] }

  const runnerUp = candidates[1]
  const decisive = !runnerUp || top.score - runnerUp.score >= DECISIVE_MARGIN

  if (top.score >= STRONG_ENOUGH && decisive) {
    return { status: 'MATCHED', catalogProductId: top.catalogProductId, candidates }
  }

  return { status: 'AMBIGUOUS', catalogProductId: null, candidates }
}
