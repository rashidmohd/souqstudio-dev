/**
 * The price mark — formatting and geometry. E6 §3, as amended.
 *
 * **The single element that decides whether output reads as a real offer book.**
 * It is a component, never assembled from text layers: a price built from free
 * boxes loses cap alignment, loses the three-decimal branch, loses LTR-in-Arabic
 * and cannot shrink as one thing when the string is long.
 *
 * **What that argument never defended was the arrangement.** Until recipes
 * existed this module could draw exactly one price design — currency hard before
 * the digits, was-price hard to the end of a top band, tab welded to the top-left
 * corner, cluster always centred — and the ten ratios below were the whole
 * expressive range of the product. Forty of the hundred shipped arrangements
 * worked around it; `currencyPlacement` sat on `PriceMark` unread since E6; a
 * shop that wanted a shelf-ticket price had nowhere to go.
 *
 * So the interior opened, into a **fixed vocabulary**: seven named parts, a
 * compass of nine positions, a bounded scale. The invariants that make output
 * read as a real offer book are enforced *here*, by this function, rather than
 * by the absence of a control:
 *
 *   - a `raised` minor's cap top always meets the major's — computed, never set
 *   - three-decimal KWD/OMR/BHD, and tabular figures
 *   - the cluster is laid out LTR in reading order *of the mark*, which does not
 *     mirror in an Arabic edition
 *   - the tab overlaps the mark wherever it is placed
 *   - every part is bounded below the major, so the hierarchy cannot invert
 *   - the mark fits on both axes; the price never truncates
 *
 * This module decides *where every piece goes*; something else draws them, which
 * is the same split as the rest of the engine.
 */

import type {
  Currency,
  LogicalAlign,
  MarkCurrencyPlace,
  MarkMinorTreatment,
  MarkPlace,
  MarkSatellite,
  PriceMark,
  PriceMarkPreset,
  PriceMarkStyle,
} from '@souqstudio/types'
import {
  MARK_MINOR_SCALE,
  MARK_SATELLITE_SCALE,
  THREE_DECIMAL_CURRENCIES,
} from '@souqstudio/types'
import type { Rect } from './geometry'
import { MARK_FIT, type PathShape } from './shapes'

/**
 * Cap height as a fraction of font size.
 *
 * An approximation, and deliberately one number rather than per-family metrics:
 * a renderer with real font metrics should pass its own, but the layout must
 * still be correct before any font has loaded. Around 0.72 holds for the
 * grotesques and Arabic families in the brand kit catalog.
 */
export const CAP_RATIO = 0.72

/** Advance width as a fraction of font size, for a digit in a bold face. */
const DIGIT_WIDTH = 0.6

/**
 * Advance for an uppercase letter, used for the currency code.
 *
 * Wider than a digit and deliberately so: measuring "KWD" at digit width put the
 * major straight on top of the D. Digits are tabular and uniform; letters are
 * not, and W is the widest glyph in every currency code this ships with.
 */
const LETTER_WIDTH = 0.74

// ─── Anatomy ──────────────────────────────────────────────────────────────────
//
// These are craft constants, not design choices, which is why they are module
// scope and not recipe fields. A recipe says *which bands exist and what goes in
// them*; these say how a mark is proportioned once that is settled, and they are
// the same for every preset. That split is what stops eight presets becoming
// eight unrelated price treatments.

/** A reserved band, as a fraction of the digit box's height. */
const BAND = 0.2
/** A side band, as a fraction of the digit box's width. */
const SIDE_BAND = 0.26
/** What the amount may take of the rect left to it, on each axis. */
const AMOUNT_FILL_HEIGHT = 0.725
const AMOUNT_FILL_WIDTH = 0.86
/** Where the major's baseline sits in that rect, centred. */
const AMOUNT_BASELINE = 0.675
/** Baseline for a satellite in the top band, and the round-ground exception. */
const TOP_LINE_AT = 0.26
const TOP_LINE_AT_SQUARE = 0.18
/** Baseline for a satellite in the bottom band. */
const BOTTOM_LINE_AT = 0.96
/** How far a start- or end-aligned satellite sits off the digit box's edge. */
const SATELLITE_INSET = 0.02
/** The strip the currency takes when it is given its own line. */
const CURRENCY_LINE = 0.26

const CURRENCY_RATIO = 0.3
const DEFAULT_MINOR_RATIO = 0.44
/** Air between the currency code and the first digit, as a fraction of the
 *  major size. Without it they touch at every size, not just small ones. */
const GAP_RATIO = 0.18
/** The satellite scale that reproduces the pre-recipe top line exactly:
 *  the old `currencySize * 0.95`, which is `majorSize * 0.3 * 0.95`. */
const DEFAULT_SATELLITE_SCALE = 0.285

/** The tab's band, as a fraction of the container. */
const TAB_BAND = 0.26
const TAB_WIDTH = 0.56
/** What the label may take of the container's width, in a horizontal tab. */
const TAB_TEXT_WIDTH = 0.48
const TAB_SIDE_HEIGHT = 0.46
/** How far the tab sinks into the mark. Never a gap, at any size — E6 §3. */
const TAB_OVERLAP = 0.14

export interface PriceMarkOptions {
  /** Override the cap-height ratio when real font metrics are available. */
  capRatio?: number | undefined
  /** Tier label for the attached tab. Omitted renders no tab. */
  tierLabel?: string | undefined
  /** The shape behind the digits. Defaults to the rounded box. */
  ground?: MarkGround | undefined
  /**
   * The interior arrangement, already resolved — call `markRecipe(style)` for
   * it, the same way `ground` comes from `markGround(style)`. Omitted is
   * `classic-tag`, which is what every mark drew before recipes existed.
   *
   * Resolved rather than partial on purpose: merging a preset with its overrides
   * is one decision, and a solver that did it inline would be a second place for
   * the defaults to live.
   */
  recipe?: ResolvedRecipe | undefined
}

export type MarkGround = 'none' | 'box' | PathShape

/**
 * Which ground a style asks for, old spelling included.
 *
 * One reader for both fields so no renderer has to remember the history:
 * `frame: 'plain'` was `ground: 'none'` and `frame: 'tag'` was the rounded box,
 * which is `ground: 'box'` and *not* `ground: 'tag'` — that is the tag-shaped
 * path. `ground` wins where a document carries both.
 */
export function markGround(style: PriceMarkStyle | undefined): MarkGround {
  if (style?.ground !== undefined) return style.ground
  if (style?.frame === 'plain') return 'none'
  return 'box'
}

export interface MarkPiece {
  text: string
  /** Inline start of the piece, absolute. Always LTR — see `layoutPriceMark`. */
  x: number
  /** Text baseline, absolute. */
  baseline: number
  fontSize: number
  width: number
}

export interface PriceMarkLayout {
  /** The attached tier tab. Null when no tier label was given, or it is hidden. */
  tab: { rect: Rect; fontSize: number; text: string } | null
  /** The mark body — the shape the digits sit in. Draw it as `groundShape`. */
  mark: Rect
  /**
   * What that body is drawn as. `box` is the rounded rectangle every mark drew
   * before the kit was opened up; `none` draws nothing and leaves the digits.
   */
  groundShape: MarkGround
  /**
   * The interior the mark's contents were fitted into — `mark` inset by
   * `MARK_FIT`.
   *
   * Reported rather than kept private because it is the number that explains a
   * layout: a burst's usable area is a fraction of its box, and a price that
   * looks small inside one is fitting correctly rather than misbehaving.
   */
  digits: Rect
  /**
   * The rect the amount cluster itself was fitted into — `digits` less every
   * band the recipe reserved.
   *
   * **Reported because it is what makes a recipe debuggable.** A price that
   * looks small in a mark with four satellites is not misbehaving; it has less
   * room, and this is the number that says so.
   */
  amount: Rect
  currency: MarkPiece
  major: MarkPiece
  /** Null on a whole-currency price, or when the recipe hides the fils. */
  minor: MarkPiece | null
  /** The struck-through was-price. Null when there is none, or it is hidden. */
  compare: MarkPiece | null
  /** FROM / EACH / PER_KG. Null when there is none, or it is hidden. */
  prefix: MarkPiece | null
  /** Degrees, template-set. Applied about the centre of `mark`. */
  rotation: number
}

/** How many minor digits a currency carries. */
export function minorDigits(currency: Currency): number {
  return THREE_DECIMAL_CURRENCIES.includes(currency) ? 3 : 2
}

/**
 * Split an amount into the major and minor parts a mark renders.
 *
 * Three-decimal currencies get three minor digits, not two rounded to two:
 * 12.750 KWD is twelve dinars and seven hundred fifty fils, and showing "12.75"
 * is a different number. Building the branch now is one line; discovering it the
 * week Kuwait signs up is a reprint.
 */
export function splitAmount(
  amount: string | number,
  currency: Currency
): { major: string; minor: string } {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(value)) {
    throw new Error(`splitAmount: "${amount}" is not a number`)
  }

  const fixed = Math.abs(value).toFixed(minorDigits(currency))
  const [major = '0', minor = ''] = fixed.split('.')
  return { major, minor }
}

/** Format an amount as a `PriceMark`, ready to lay out. */
export function toPriceMark(
  amount: string | number,
  currency: Currency,
  tierId: string,
  extra: Partial<Omit<PriceMark, 'major' | 'minor' | 'currency' | 'tierId'>> = {}
): PriceMark {
  const { major, minor } = splitAmount(amount, currency)

  return {
    tierId,
    major,
    minor,
    currency,
    currencyPlacement: 'PREFIX',
    shape: 'TAG',
    ...extra,
  }
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

/** Every field settled, so the solver never branches on `undefined`. */
export interface ResolvedRecipe {
  currency: MarkCurrencyPlace
  minor: MarkMinorTreatment
  minorScale: number
  compare: { place: MarkPlace; scale: number }
  prefix: { place: MarkPlace; scale: number }
  tier: { place: MarkPlace; scale: number }
  align: { inline: LogicalAlign; block: 'top' | 'middle' | 'bottom' }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/**
 * The eight marks we drew, which is what an owner actually picks between.
 *
 * **The gallery is the front door and the knobs are the back one**, the same
 * argument `docs/composition-model.md` §3.6 makes for seeding sixty-five blocks:
 * a blank artboard produces something worse than our default and the owner
 * blames the product. Each of these is a real retail idiom rather than a
 * permutation — a shelf-edge ticket, a hypermarket was/now stack, a Gulf
 * superscript riyal, a wide footer band that has to read on one line.
 *
 * **`classic-tag` is byte-identical to every mark drawn before recipes
 * existed**, and that is asserted rather than intended: `price-mark.test.ts`
 * pins the numbers this module produced beforehand.
 */
export const PRICE_MARK_RECIPES: Record<PriceMarkPreset, ResolvedRecipe> = {
  /** What the mark always drew. The default, and the compatibility anchor. */
  'classic-tag': {
    currency: 'before',
    minor: 'raised',
    minorScale: DEFAULT_MINOR_RATIO,
    compare: { place: 'above-end', scale: DEFAULT_SATELLITE_SCALE },
    prefix: { place: 'above-start', scale: DEFAULT_SATELLITE_SCALE },
    tier: { place: 'above-start', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /**
   * A shelf-edge ticket: price flush to the reading start, was-price beneath
   * it, tier out of the way at the far corner. The one design a supermarket
   * prints more of than any other, and the one the old mark could not make —
   * the cluster was always centred.
   */
  'shelf-ticket': {
    currency: 'super-before',
    minor: 'raised',
    minorScale: 0.4,
    compare: { place: 'below-start', scale: 0.26 },
    prefix: { place: 'above-start', scale: 0.24 },
    tier: { place: 'above-end', scale: TAB_BAND },
    align: { inline: 'start', block: 'middle' },
  },
  /**
   * For a burst or a star. Everything reads off one vertical axis, because a
   * round ground has no corners to align to — the rule the gallery found when a
   * was-price printed across a spike.
   */
  'price-bomb': {
    currency: 'above',
    minor: 'raised',
    minorScale: 0.46,
    compare: { place: 'below', scale: 0.28 },
    prefix: { place: 'hidden', scale: DEFAULT_SATELLITE_SCALE },
    tier: { place: 'hidden', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /**
   * The hypermarket was/now: the old price above, large enough to be read and
   * struck, the new one under it. The compare line is deliberately near the
   * ceiling of the satellite range — being *seen* is the whole mechanic.
   */
  'was-now-stack': {
    currency: 'before',
    minor: 'raised',
    minorScale: DEFAULT_MINOR_RATIO,
    compare: { place: 'above', scale: 0.38 },
    prefix: { place: 'below', scale: 0.24 },
    tier: { place: 'above-start', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /** The Gulf convention: a small code riding the digits' cap line, trailing. */
  'super-riyal': {
    currency: 'super-after',
    minor: 'raised',
    minorScale: DEFAULT_MINOR_RATIO,
    compare: { place: 'above-end', scale: DEFAULT_SATELLITE_SCALE },
    prefix: { place: 'above-start', scale: DEFAULT_SATELLITE_SCALE },
    tier: { place: 'above-start', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /**
   * A footer band or a wide merged region, where the mark is three times as
   * wide as it is tall and a stacked treatment wastes all of it. Everything on
   * one line, the fils on the baseline with a separator.
   */
  'wide-band': {
    currency: 'before',
    minor: 'baseline',
    minorScale: 0.62,
    compare: { place: 'end', scale: 0.3 },
    prefix: { place: 'start', scale: 0.26 },
    tier: { place: 'hidden', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /** The code over the digits, centred. Reads as a unit rather than a sentence. */
  'stacked-currency': {
    currency: 'above',
    minor: 'raised',
    minorScale: DEFAULT_MINOR_RATIO,
    compare: { place: 'below-end', scale: DEFAULT_SATELLITE_SCALE },
    prefix: { place: 'above-start', scale: DEFAULT_SATELLITE_SCALE },
    tier: { place: 'above-start', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
  /**
   * Whole-currency pricing. "AED 25" is a design; "AED 25.00" on a card whose
   * every price ends in a double zero is noise with a decimal point in it.
   */
  'whole-number': {
    currency: 'before',
    minor: 'hidden',
    minorScale: DEFAULT_MINOR_RATIO,
    compare: { place: 'above-end', scale: DEFAULT_SATELLITE_SCALE },
    prefix: { place: 'above-start', scale: DEFAULT_SATELLITE_SCALE },
    tier: { place: 'above-start', scale: TAB_BAND },
    align: { inline: 'center', block: 'middle' },
  },
}

const satellite = (
  base: { place: MarkPlace; scale: number },
  over: MarkSatellite | undefined
): { place: MarkPlace; scale: number } => ({
  place: over?.place ?? base.place,
  scale:
    over?.scale === undefined
      ? base.scale
      : clamp(over.scale, MARK_SATELLITE_SCALE.min, MARK_SATELLITE_SCALE.max),
})

/**
 * The recipe a style asks for, preset and overrides merged, every bound applied.
 *
 * **Overrides are a partial and the preset keeps applying**, field by field. An
 * owner who moved the was-price has not thereby chosen a currency placement, and
 * a preset that stopped applying the moment one knob was touched would make
 * every small adjustment a full re-authoring. Same rule the text element already
 * follows for `size`, `weight` and `family`.
 *
 * `tab: 'none'` is still read, and means the tier is hidden. Organization blocks
 * already carry that spelling and the document schema is strict — dropping it
 * would refuse a shop's saved work.
 */
export function markRecipe(style: PriceMarkStyle | undefined): ResolvedRecipe {
  const base = PRICE_MARK_RECIPES[style?.preset ?? 'classic-tag']
  const over = style?.recipe

  const tier = satellite(base.tier, over?.tier)

  return {
    currency: over?.currency ?? base.currency,
    minor: over?.minor ?? base.minor,
    minorScale:
      over?.minorScale === undefined
        ? base.minorScale
        : clamp(over.minorScale, MARK_MINOR_SCALE.min, MARK_MINOR_SCALE.max),
    compare: satellite(base.compare, over?.compare),
    prefix: satellite(base.prefix, over?.prefix),
    // The older spelling wins only when the recipe did not speak.
    tier: style?.tab === 'none' && over?.tier?.place === undefined
      ? { ...tier, place: 'hidden' }
      : tier,
    align: over?.align ?? base.align,
  }
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

/**
 * The rect the ground is drawn in.
 *
 * **A burst and a star take the largest square in the box and centre**, the
 * same rule `HOLDS_PROPORTION` applies to a badge and for the same reason: the
 * eye reads both as circular objects, and one stretched to 3:1 is not a wide
 * burst, it is a broken one. Everything else fills what it was given.
 */
function groundRect(outer: Rect, shape: MarkGround): Rect {
  const fit = MARK_FIT[shape]
  if (!fit.square) return outer

  const side = Math.min(outer.width, outer.height)
  return {
    x: outer.x + (outer.width - side) / 2,
    y: outer.y + (outer.height - side) / 2,
    width: side,
    height: side,
  }
}

/**
 * The box the contents get inside that ground.
 *
 * `MARK_FIT` says how much of the shape the price may use — a burst's usable
 * interior is a fraction of its bounding box, and digits run to the spikes
 * without this. Centred, because the mark lays its pieces out centred as a
 * group already.
 */
function digitRect(ground: Rect, shape: MarkGround): Rect {
  const fit = MARK_FIT[shape]
  const width = ground.width * fit.width
  const height = ground.height * fit.height

  return {
    x: ground.x + (ground.width - width) / 2,
    y: ground.y + (ground.height - height) / 2,
    width,
    height,
  }
}

type Band = 'top' | 'bottom' | 'start' | 'end' | null

function bandOf(place: MarkPlace): Band {
  switch (place) {
    case 'above-start':
    case 'above':
    case 'above-end':
      return 'top'
    case 'below-start':
    case 'below':
    case 'below-end':
      return 'bottom'
    case 'start':
      return 'start'
    case 'end':
      return 'end'
    case 'hidden':
      return null
  }
}

/** Which end of its band a satellite hugs. */
type Hug = 'start' | 'center' | 'end'

function hugOf(place: MarkPlace): Hug {
  switch (place) {
    case 'above-start':
    case 'below-start':
    case 'start':
      return 'start'
    case 'above-end':
    case 'below-end':
    case 'end':
      return 'end'
    default:
      return 'center'
  }
}

/**
 * Lay the mark out inside the rectangle its block element gave it.
 *
 * **Bands are reserved by the recipe, never by the content**, and that is the
 * rule a page depends on. A row of cards where some offers carry a was-price and
 * some do not must set every price at the same size; reserving the band only
 * when something fills it makes the price jump between neighbouring cards, which
 * is precisely the inconsistency this component exists to prevent. So the amount
 * is fitted into `digits` less every band the recipe declares, filled or not.
 *
 * Six rules are load-bearing and every one of them is asserted in the tests,
 * across every preset rather than only the default:
 *
 * **A raised minor rises to the major's cap height, never the baseline.** A
 * baseline-aligned minor reads as a second number rather than as cents — so it
 * is a *treatment the owner chooses*, `minor: 'baseline'`, which brings a
 * decimal separator with it. What no recipe can produce is a raised minor that
 * misses the cap line.
 *
 * **The tab and the mark never separate.** Wherever the tier is placed, the
 * tab's rect overlaps the mark's edge — never a gap, at any size.
 *
 * **The whole mark is LTR with Western numerals, including in AR editions.**
 * Pieces are laid out inline-start to inline-end in reading order *of the mark*,
 * which does not mirror. This matches every GCC retailer's actual print.
 *
 * **No part may approach the major.** Satellite and minor scales are clamped in
 * `markRecipe`, so the hierarchy major > minor > currency > satellite holds
 * however a recipe is assembled.
 *
 * **In a round ground everything reads off one vertical axis.** A burst's usable
 * area is a circle, so the corner of any box inscribed in it points straight at
 * a spike — the gallery showed "32.00" printing across one. Start- and
 * end-hugging collapse to a centred row there, whatever the recipe asked for.
 *
 * **Type is sized to fit both axes.** Height alone was the first version and it
 * broke the moment a merged region changed the box's aspect — digits spilled out
 * of the tag, which is the one failure the artefact cannot absorb.
 */
export function layoutPriceMark(
  price: PriceMark,
  container: Rect,
  options: PriceMarkOptions = {}
): PriceMarkLayout {
  const capRatio = options.capRatio ?? CAP_RATIO
  const label = options.tierLabel
  const recipe = options.recipe ?? PRICE_MARK_RECIPES['classic-tag']

  const groundShape = options.ground ?? 'box'
  const square = MARK_FIT[groundShape].square

  // ── The tab, and the room it takes from the mark ────────────────────────────
  //
  // The tier band is reserved before anything else, because the mark body is
  // what is left over. The tab then slides back into the mark by `TAB_OVERLAP`
  // so the two overlap rather than meet — at any size, in any position.
  const tierBand = recipe.tier.place === 'hidden' || label === undefined ? null : bandOf(recipe.tier.place)
  const tabExtent =
    tierBand === null
      ? 0
      : tierBand === 'top' || tierBand === 'bottom'
        ? container.height * recipe.tier.scale
        : container.width * recipe.tier.scale
  const overlap = tabExtent * TAB_OVERLAP
  const inset = tabExtent - overlap

  const outer: Rect = {
    x: container.x + (tierBand === 'start' ? inset : 0),
    y: container.y + (tierBand === 'top' ? inset : 0),
    width: container.width - (tierBand === 'start' || tierBand === 'end' ? inset : 0),
    height: container.height - (tierBand === 'top' || tierBand === 'bottom' ? inset : 0),
  }

  // `mark` keeps its meaning — the body a renderer draws — so nothing reading it
  // has to change. `digits` is the smaller box its contents were fitted into.
  const mark = groundRect(outer, groundShape)
  const digits = digitRect(mark, groundShape)

  // ── Bands the recipe reserves, filled or not ────────────────────────────────
  const bands = new Set<Exclude<Band, null>>()
  for (const place of [recipe.compare.place, recipe.prefix.place]) {
    const band = bandOf(place)
    if (band !== null) bands.add(band)
  }

  const topInset = bands.has('top') ? digits.height * BAND : 0
  const bottomInset = bands.has('bottom') ? digits.height * BAND : 0
  const startInset = bands.has('start') ? digits.width * SIDE_BAND : 0
  const endInset = bands.has('end') ? digits.width * SIDE_BAND : 0

  const amount: Rect = {
    x: digits.x + startInset,
    y: digits.y + topInset,
    width: Math.max(0, digits.width - startInset - endInset),
    height: Math.max(0, digits.height - topInset - bottomInset),
  }

  // The currency takes a line of its own only when the recipe stacks it.
  const stackedCurrency = recipe.currency === 'above' || recipe.currency === 'below'
  const currencyStrip = stackedCurrency ? amount.height * CURRENCY_LINE : 0
  const cluster: Rect = {
    x: amount.x,
    y: amount.y + (recipe.currency === 'above' ? currencyStrip : 0),
    width: amount.width,
    height: Math.max(0, amount.height - currencyStrip),
  }

  // ── Solve the amount ────────────────────────────────────────────────────────
  const currencyText = price.currency
  const rawMinor = price.minor ?? ''

  /**
   * **`hidden` drops the fils only when there are none to drop.**
   *
   * A whole-currency treatment is a real design — "AED 25" on a card whose every
   * price ends in a double zero, where ".00" is noise with a decimal point in
   * it. What it cannot be allowed to mean is "AED 12" for a price of 12.75:
   * that is not a quieter price, it is a **different and lower one**, printed on
   * a flyer a customer takes to a till. No style field may restate what an offer
   * costs.
   *
   * So the recipe says what to do with zero fils and the price decides whether
   * it applies. A shop that wants every price rounded is asking for a pricing
   * change, and that belongs on the offer, not in a layout.
   */
  const emptyMinor = /^0*$/.test(rawMinor)
  const effectiveMinor: MarkMinorTreatment =
    recipe.minor === 'hidden' ? (emptyMinor ? 'hidden' : 'raised') : recipe.minor

  const minorText =
    effectiveMinor === 'hidden' || rawMinor === ''
      ? ''
      : effectiveMinor === 'baseline'
        ? `.${rawMinor}`
        : rawMinor

  const inlineCurrency = !stackedCurrency
  const currencyUnits = inlineCurrency
    ? currencyText.length * CURRENCY_RATIO * LETTER_WIDTH + GAP_RATIO
    : 0
  const majorUnits = price.major.length * DIGIT_WIDTH
  const minorUnits = minorText.length * recipe.minorScale * DIGIT_WIDTH

  // Solve for the largest major size that fits the width, then take the smaller
  // of that and what the height allows.
  const demand = currencyUnits + majorUnits + minorUnits
  const majorSize = Math.min(
    cluster.height * AMOUNT_FILL_HEIGHT,
    (cluster.width * AMOUNT_FILL_WIDTH) / Math.max(demand, 0.0001)
  )
  const minorSize = majorSize * recipe.minorScale
  const currencySize = majorSize * CURRENCY_RATIO

  const baseline =
    recipe.align.block === 'top'
      ? cluster.y + majorSize * capRatio + cluster.height * 0.04
      : recipe.align.block === 'bottom'
        ? cluster.y + cluster.height * 0.94
        : cluster.y + cluster.height * AMOUNT_BASELINE
  const capTop = baseline - majorSize * capRatio

  const currencyAdvance = inlineCurrency
    ? currencyText.length * currencySize * LETTER_WIDTH + majorSize * GAP_RATIO
    : 0
  const majorWidth = price.major.length * majorSize * DIGIT_WIDTH
  const minorWidth = minorText.length * minorSize * DIGIT_WIDTH
  const total = currencyAdvance + majorWidth + minorWidth

  // Laid out start-to-end. This ordering is fixed: the mark does not mirror.
  const leading = recipe.currency === 'before' || recipe.currency === 'super-before'
  const groupStart =
    recipe.align.inline === 'start'
      ? cluster.x
      : recipe.align.inline === 'end'
        ? cluster.x + cluster.width - total
        : cluster.x + (cluster.width - total) / 2

  const digitsStart = groupStart + (leading ? currencyAdvance : 0)

  /**
   * The code's own baseline.
   *
   * A superscript code rides the major's cap line, which is the same
   * construction the raised minor uses and for the same reason: it reads as part
   * of the number rather than as a word next to one.
   */
  const currencyBaseline = stackedCurrency
    ? recipe.currency === 'above'
      ? amount.y + currencyStrip * 0.86
      : amount.y + amount.height - currencyStrip * 0.14
    : recipe.currency === 'super-before' || recipe.currency === 'super-after'
      ? capTop + currencySize * capRatio
      : baseline

  const currencyGlyphWidth = currencyText.length * currencySize * LETTER_WIDTH
  const currencyX = stackedCurrency
    ? recipe.align.inline === 'start'
      ? amount.x
      : recipe.align.inline === 'end'
        ? amount.x + amount.width - currencyGlyphWidth
        : amount.x + (amount.width - currencyGlyphWidth) / 2
    : leading
      ? groupStart
      : // Trailing: the gap goes before the code, not after it.
        digitsStart + majorWidth + minorWidth + majorSize * GAP_RATIO

  const currency: MarkPiece = {
    text: currencyText,
    x: currencyX,
    baseline: currencyBaseline,
    // The advance carries the gap for a leading code, so the pieces after it
    // start clear of the D in "KWD". A trailing code has already been offset.
    width: leading ? currencyAdvance : currencyGlyphWidth,
    fontSize: currencySize,
  }

  const major: MarkPiece = {
    text: price.major,
    x: digitsStart,
    baseline,
    fontSize: majorSize,
    width: majorWidth,
  }

  /**
   * The fils.
   *
   * `raised` puts the cap top on the major's — not the baseline, which is the
   * difference between cents and a second price, and which no recipe may
   * override. `baseline` is the owner asking for a single number, and it carries
   * its own separator so "2450" cannot happen.
   */
  const minor: MarkPiece | null =
    minorText === ''
      ? null
      : {
          text: minorText,
          x: digitsStart + majorWidth,
          baseline: effectiveMinor === 'raised' ? capTop + minorSize * capRatio : baseline,
          fontSize: minorSize,
          width: minorWidth,
        }

  // ── The satellites ──────────────────────────────────────────────────────────
  //
  // **Laid out per band rather than per satellite**, which is the difference
  // between a rule and a coincidence. Two pieces sharing a band and asking for
  // the same end of it is an ordinary thing for a recipe to say, and placing
  // each one independently prints them on top of each other. The old code never
  // hit that only because it hard-coded the was-price to the end and the FROM
  // line to the start.

  const compareText = price.comparePrice ?? ''
  const prefixText = price.prefixLabel === undefined ? '' : PREFIX_TEXT[price.prefixLabel]

  /** Reading order of the mark: the prefix leads, the compare follows. */
  const wanted = [
    { role: 'prefix' as const, text: prefixText, spec: recipe.prefix },
    { role: 'compare' as const, text: compareText, spec: recipe.compare },
  ].filter((s) => s.text !== '' && bandOf(s.spec.place) !== null)

  const placed = new Map<'prefix' | 'compare', MarkPiece>()

  for (const band of ['top', 'bottom', 'start', 'end'] as const) {
    const inBand = wanted.filter((s) => bandOf(s.spec.place) === band)
    if (inBand.length === 0) continue

    const sideways = band === 'start' || band === 'end'
    /**
     * The room the band actually has, inset at both ends.
     *
     * A side band is a narrow column, and a was-price sized only against the
     * major runs straight out of it and across the digits. Two ceilings, then:
     * one on the type size — a satellite is a satellite — and one on the width,
     * which is the band it was put in. The inset comes *out* of that room rather
     * than being added to it, or the piece clears the band by exactly the inset.
     */
    const outer = sideways ? digits.width * SIDE_BAND : digits.width
    const room = outer * (1 - 2 * SATELLITE_INSET)
    const extent = digits.height * BAND

    const sized = inBand.map((s) => {
      const capped = Math.min(
        s.spec.scale * majorSize,
        extent,
        // Shrink to the band rather than overflow it. `text.length` is exact
        // here: every satellite string is figures or an uppercase word.
        room / Math.max(s.text.length * DIGIT_WIDTH, 0.0001)
      )
      return { ...s, size: capped, width: s.text.length * capped * DIGIT_WIDTH }
    })

    const lineBaseline =
      band === 'top'
        ? digits.y + digits.height * (square ? TOP_LINE_AT_SQUARE : TOP_LINE_AT)
        : band === 'bottom'
          ? digits.y + digits.height * BOTTOM_LINE_AT
          : baseline

    const bandStart = band === 'end' ? digits.x + digits.width * (1 - SIDE_BAND) : digits.x
    const hugs = new Set(sized.map((s) => hugOf(s.spec.place)))

    /**
     * When the band's pieces go to opposite edges they are laid out
     * independently; otherwise they form one row.
     *
     * **A round ground always forms the row**, whatever the recipe asked for: a
     * burst's usable area is a circle, so the corner of any box inscribed in it
     * points at a spike — the gallery showed "32.00" printing across one — and
     * everything in a burst should read off a single vertical axis anyway.
     */
    const independent =
      !square && !sideways && hugs.size === sized.length && !hugs.has('center')

    if (independent) {
      for (const s of sized) {
        const x =
          hugOf(s.spec.place) === 'start'
            ? digits.x + digits.width * SATELLITE_INSET
            : digits.x + digits.width * (1 - SATELLITE_INSET) - s.width
        placed.set(s.role, {
          text: s.text,
          x,
          baseline: lineBaseline,
          fontSize: s.size,
          width: s.width,
        })
      }
      continue
    }

    const gap = sized.length > 1 ? (sized[0]?.size ?? 0) * 0.5 : 0
    const rowWidth = sized.reduce((sum, s) => sum + s.width, 0) + gap * (sized.length - 1)
    // A round ground centres; otherwise the row sits where its pieces asked.
    const hug: Hug = square ? 'center' : sideways ? 'start' : ([...hugs][0] ?? 'center')
    const innerStart = bandStart + outer * SATELLITE_INSET

    let cursor =
      hug === 'start'
        ? innerStart
        : hug === 'end'
          ? innerStart + room - rowWidth
          : innerStart + (room - rowWidth) / 2

    for (const s of sized) {
      placed.set(s.role, {
        text: s.text,
        x: cursor,
        baseline: lineBaseline,
        fontSize: s.size,
        width: s.width,
      })
      cursor += s.width + gap
    }
  }

  const compare = placed.get('compare') ?? null
  const prefix = placed.get('prefix') ?? null

  // ── The tab ─────────────────────────────────────────────────────────────────
  const tab =
    label === undefined || tierBand === null
      ? null
      : (() => {
          const horizontal = tierBand === 'top' || tierBand === 'bottom'
          const hug = hugOf(recipe.tier.place)
          // The tab's thickness **is** the band it reserved, on whichever axis
          // it took one. Sizing it from a separate constant let it intrude
          // arbitrarily far into the mark instead of sinking the one overlap.
          const width = horizontal ? container.width * TAB_WIDTH : tabExtent
          const height = horizontal ? tabExtent : container.height * TAB_SIDE_HEIGHT

          const x = horizontal
            ? hug === 'end'
              ? container.x + container.width - width
              : hug === 'center'
                ? container.x + (container.width - width) / 2
                : container.x
            : tierBand === 'start'
              ? container.x
              : container.x + container.width - width

          const y = horizontal
            ? tierBand === 'top'
              ? container.y
              : container.y + container.height - height
            : container.y + (container.height - height) / 2

          const room = horizontal ? container.width * TAB_TEXT_WIDTH : width * 0.86

          return {
            rect: { x, y, width, height },
            fontSize: Math.min(height * 0.5, room / (label.length * 0.62)),
            text: label,
          }
        })()

  return {
    groundShape,
    tab,
    mark,
    digits,
    amount,
    currency,
    major,
    minor,
    compare,
    prefix,
    // Clamped: ±6° is a template decision and never an owner control.
    rotation: clampRotation(price.rotation ?? 0),
  }
}

export const MAX_ROTATION = 6

function clampRotation(degrees: number): number {
  return Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, degrees))
}

const PREFIX_TEXT: Record<NonNullable<PriceMark['prefixLabel']>, string> = {
  FROM: 'FROM',
  EACH: 'EACH',
  PER_KG: 'PER KG',
}
