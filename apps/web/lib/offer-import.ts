import { fromMinorUnits, toMinorUnits, type Currency } from '@souqstudio/types'
import { OFFER_TYPES, type OfferTypeKey } from '@/lib/offer-types'

/**
 * Turning a price-list row into an offer. `docs/E6-create-flow.md` §18.
 *
 * **A sheet has the shop's promotion in it and the flow was only reading one
 * column of it.** A POS exports the shelf price, the promotion price, often a
 * percentage, and often what *kind* of promotion it is — and until now the
 * import took a single "price", so every was-price and every buy-one-get-one had
 * to be typed back in, card by card, in the editor. That is the work the import
 * exists to remove.
 *
 * Pure: no database, no session, runs in the browser. The mapping screen uses it
 * to show the owner what their sheet resolves to before anything is created, and
 * the same functions decide what is written.
 */

/**
 * The promotions a sheet can name now live in `lib/offer-types.ts`, because the
 * editor needed the same words. Re-exported so every existing importer call
 * site is unchanged — the vocabulary moved, the parser did not.
 */
export { OFFER_TYPES, type OfferTypeKey } from '@/lib/offer-types'

/**
 * Spellings seen in the wild, normalised the same way `HEADER_HINTS` normalises
 * a header: lower-cased, with everything that is not a letter or a digit
 * removed. `Buy 1 Get 1`, `BOGOF` and `b1g1` are one answer.
 */
const TYPE_HINTS: Array<[OfferTypeKey, string[]]> = [
  ['bogo', ['bogo', 'bogof', 'b1g1', 'buy1get1', 'buy1get1free', 'buyonegetonefree', 'buyonegetone', '1plus1', 'onefree']],
  ['buy2get1', ['buy2get1', 'b2g1', 'buy2get1free', 'buytwogetonefree', '2plus1']],
  ['buy3get1', ['buy3get1', 'b3g1', 'buy3get1free', '3plus1']],
  ['discount', ['discount', 'discounted', 'offer', 'promo', 'promotion', 'sale', 'pricecut', 'off', 'خصم', 'عرض']],
]

function normalize(raw: string): string {
  // **`+` becomes a word before anything is stripped.** `1+1` is how half the
  // region writes buy-one-get-one, and removing punctuation first turns it into
  // `11`, which is not a spelling of anything and would have quietly fallen
  // through to a custom chip reading "1+1". Found by the test, not by reading.
  return raw
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * What one "offer type" cell means.
 *
 * Three answers, and the third is the one that keeps the feature honest:
 *
 * - **Empty** — no promotion named. The prices alone say what happened.
 * - **A known kind** — the bilingual phrase from `OFFER_TYPES`.
 * - **Anything else** — the owner's own words, kept. A shop writing
 *   `Free delivery` or `Ramadan special` means it, and dropping the cell
 *   because it is not in our list would be deciding that we know their
 *   promotions better than they do. It reaches the card as an English-only
 *   chip; the Arabic gap is real and is recorded in §18.4.
 */
export type OfferType =
  | { kind: 'none' }
  | { kind: 'known'; key: OfferTypeKey; labelEn: string; labelAr: string }
  | { kind: 'custom'; labelEn: string }

export function readOfferType(raw: string): OfferType {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'none' }

  const value = normalize(trimmed)
  if (value === '') return { kind: 'none' }

  for (const [key, hints] of TYPE_HINTS) {
    if (!hints.includes(value)) continue
    const phrase = OFFER_TYPES[key]
    // `discount` is a known key with no phrase: it names the ordinary case,
    // where the two prices are the whole message and a chip would repeat them.
    return phrase === null
      ? { kind: 'none' }
      : { kind: 'known', key, labelEn: phrase.labelEn, labelAr: phrase.labelAr }
  }

  // Bounded, because it lands on a card. `OfferChip.labelEn` has no length
  // limit in the schema and a forty-word cell would be laid out by the fit
  // ladder until it was illegible.
  return { kind: 'custom', labelEn: trimmed.slice(0, 40) }
}

/**
 * Decimal money as an integer number of minor units.
 *
 * **Never `Number(price)` for arithmetic.** Taking a percentage off a float is
 * how 9.95 becomes 9.949999999999999 in a number a customer reads off a flyer,
 * so everything below computes in whole minor units and formats once at the end.
 *
 * **The multiplier is the currency's, not a hundred.** This hard-coded `×100`
 * and a two-decimal regex, which was right for a dirham, threw away the third
 * digit of a dinar and invented two on a yen. `toMinorUnits` reads the register.
 */
const toMinor = toMinorUnits
const fromMinor = fromMinorUnits

/**
 * What a row's price columns resolve to: the mark, and the strikethrough.
 *
 * **The naming inverts between a POS and an offer, and getting it backwards
 * prints the wrong number in the biggest type on the page.** A till calls the
 * shelf price "price" and the promotion "offer price"; an offer calls the
 * promotion `price` and the shelf price `comparePrice`. The arguments here are
 * named for the sheet — `before` and `now` — so the inversion happens once, in
 * one place, with the reason written next to it.
 *
 * **Any two of the three, and the third is derived.** Systems differ in which
 * two they export: some give both prices, some give the shelf price and a
 * percentage. Where all three are present the percentage is *not* used — the
 * prices are what the shop charges — but the disagreement is reported, because a
 * percentage that does not match the prices is a stale export and that is worth
 * catching before it is printed.
 */
export type ResolvedPrices = {
  /** The mark. Null when the sheet gave nothing to go on. */
  price: string | null
  /** The strikethrough. Null when there is no genuine was-price. */
  comparePrice: string | null
  /** Set when a percentage column disagrees with the two prices. */
  mismatch: boolean
}

export function resolvePrices(input: {
  before: string | null
  now: string | null
  /** A percentage as text, already extracted from the cell. */
  percent: string | null
  /**
   * What the book is priced in.
   *
   * **Required, because the arithmetic below is in minor units and how many of
   * those there are is the currency's business.** Every figure this returns is
   * formatted to that currency's own precision, so a sheet of dinars keeps its
   * third digit and a sheet of yen grows no decimals it never had.
   */
  currency: Currency
}): ResolvedPrices {
  const before = input.before === null ? null : toMinor(input.before, input.currency)
  const now = input.now === null ? null : toMinor(input.now, input.currency)
  const percent = input.percent === null ? null : Number(input.percent)
  const hasPercent = percent !== null && Number.isFinite(percent) && percent > 0 && percent < 100

  // Both prices given: they are what the shop charges, and the percentage is
  // only ever a check on them.
  if (before !== null && now !== null) {
    /*
     * **The tolerance scales with the price, because the percentage is what is
     * coarse.** A sheet writing `33` for a third off is not disagreeing — it is
     * quoting a percentage with two fewer digits, and half a percentage point of
     * 30.00 is fifteen fils. A flat one-fil tolerance called that a mismatch and
     * would have put a warning on perfectly good sheets.
     */
    const tolerance = Math.round(before * 0.005) + 1
    const mismatch =
      hasPercent &&
      before > 0 &&
      Math.abs(before - Math.round(before * (1 - percent / 100)) - (before - now)) > tolerance

    return {
      price: fromMinor(now, input.currency),
      // **Only when it is genuinely higher.** A strikethrough equal to the
      // price is a lie on a flyer, and a strikethrough *below* it is worse.
      comparePrice: before > now ? fromMinor(before, input.currency) : null,
      mismatch,
    }
  }

  // A shelf price and a percentage: the promotion is derived.
  if (before !== null && hasPercent) {
    const derived = Math.round(before * (1 - percent / 100))
    return {
      price: fromMinor(derived, input.currency),
      comparePrice: derived < before ? fromMinor(before, input.currency) : null,
      mismatch: false,
    }
  }

  // One price and nothing else. It is the price; there is no promotion to show,
  // and inventing a was-price would be inventing a discount.
  const only = now ?? before
  return { price: only === null ? null : fromMinor(only, input.currency), comparePrice: null, mismatch: false }
}

/**
 * A percentage cell to a number as text.
 *
 * Separate from `parsePrice` because the cells look alike and mean different
 * things: `20`, `20%` and `0.20` are all a fifth off in somebody's export, and
 * only the first two are here. **A value below 1 is read as a fraction** —
 * nobody runs a 0.2% promotion on a flyer, and reading it as one would turn a
 * fifth off into nothing.
 */
export function parsePercent(raw: string): string | null {
  const match = raw.match(/\d+(?:[.,]\d+)?/)
  if (!match) return null

  const value = Number(match[0].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 1) return (value * 100).toFixed(2)
  if (value >= 100) return null
  return value.toFixed(2)
}
