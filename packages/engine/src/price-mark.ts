/**
 * The price mark — formatting and geometry. E6 §3.
 *
 * **The single element that decides whether output reads as a real offer book.**
 * It is a component, never assembled from text layers: owners given text boxes
 * produce hundreds of inconsistent price treatments inside a month, and a price
 * is the one thing on a flyer a customer actually reads.
 *
 * Exactly one authoring control is exposed — the tier. Everything below derives
 * from the offer and the block. This module decides *where every piece goes*;
 * something else draws them, which is the same split as the rest of the engine.
 */

import type { Currency, PriceMark, PriceMarkStyle } from '@souqstudio/types'
import { THREE_DECIMAL_CURRENCIES } from '@souqstudio/types'
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

export interface PriceMarkOptions {
  /** Override the cap-height ratio when real font metrics are available. */
  capRatio?: number | undefined
  /** Tier label for the attached tab. Omitted renders no tab. */
  tierLabel?: string | undefined
  /** The shape behind the digits. Defaults to the rounded box. */
  ground?: MarkGround | undefined
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
  /** The attached tier tab. Null when no tier label was given. */
  tab: { rect: Rect; fontSize: number; text: string } | null
  /** The mark body — the shape the digits sit in. Draw it as `groundShape`. */
  mark: Rect
  /**
   * What that body is drawn as. `box` is the rounded rectangle every mark drew
   * before the kit was opened up; `none` draws nothing and leaves the digits.
   */
  groundShape: MarkGround
  /**
   * The interior the digits were fitted into — `mark` inset by `MARK_FIT`.
   *
   * Reported rather than kept private because it is the number that explains a
   * layout: a burst's usable area is a fraction of its box, and a price that
   * looks small inside one is fitting correctly rather than misbehaving.
   */
  digits: Rect
  currency: MarkPiece
  major: MarkPiece
  /** Null on a whole-currency price. */
  minor: MarkPiece | null
  /** The struck-through was-price, above the digits. Null when there is none. */
  compare: MarkPiece | null
  /** FROM / EACH / PER_KG, above the digits. Null when there is none. */
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
 * The box the digits get inside that ground.
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

/**
 * Lay the mark out inside the rectangle its block element gave it.
 *
 * Three rules are load-bearing and every one of them is asserted in the tests:
 *
 * **Minor digits raise to the major's cap height, never baseline-aligned.** A
 * baseline-aligned minor reads as a second number rather than as cents.
 *
 * **The tab and the mark never separate.** The tier label is attached, so the
 * tab's bottom edge overlaps the mark's top edge — never a gap, at any size.
 *
 * **The whole mark is LTR with Western numerals, including in AR editions.**
 * Pieces are laid out inline-start to inline-end in reading order *of the mark*,
 * which does not mirror. This matches every GCC retailer's actual print.
 *
 * Type is sized to fit **both axes**. Height alone was the first version and it
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
  const minorText = price.minor ?? ''

  // The tab occupies the top band; the mark takes the rest and slides up under
  // it so the two overlap rather than meet.
  const tabHeight = label ? container.height * 0.26 : 0
  const overlap = tabHeight * 0.14
  const markTop = container.y + tabHeight - overlap
  const outer: Rect = {
    x: container.x,
    y: markTop,
    width: container.width,
    height: container.height - (tabHeight - overlap),
  }

  /**
   * The ground, and then the box the digits actually get.
   *
   * **Computed here rather than placed by hand, which is the whole change.** The
   * shipped library drew its own disc behind the price and switched this off,
   * so the shape and the digits were two boxes tuned by eye — and a longer
   * price, a three-decimal currency or a compare line moved one and not the
   * other. Deriving both from the same rect is what makes a burst track what is
   * inside it.
   */
  const groundShape = options.ground ?? 'box'
  // `mark` keeps its meaning — the body a renderer draws — so nothing reading
  // it has to change. What is new is the shape it is drawn as, and the smaller
  // box the digits were fitted into.
  const mark = groundRect(outer, groundShape)
  const digits = digitRect(mark, groundShape)

  const currencyText = price.currency
  const CURRENCY_RATIO = 0.3
  const MINOR_RATIO = 0.44
  /** Air between the currency code and the first digit, as a fraction of the
   *  major size. Without it they touch at every size, not just small ones. */
  const GAP_RATIO = 0.18

  // Solve for the largest major size that fits the width, then take the smaller
  // of that and what the height allows.
  const demand =
    currencyText.length * CURRENCY_RATIO * LETTER_WIDTH +
    GAP_RATIO +
    price.major.length * DIGIT_WIDTH +
    minorText.length * MINOR_RATIO * DIGIT_WIDTH
  const majorSize = Math.min(digits.height * 0.58, (digits.width * 0.86) / demand)
  const minorSize = majorSize * MINOR_RATIO
  const currencySize = majorSize * CURRENCY_RATIO

  const baseline = digits.y + digits.height * 0.74
  const capTop = baseline - majorSize * capRatio

  const currencyWidth = currencyText.length * currencySize * LETTER_WIDTH + majorSize * GAP_RATIO
  const majorWidth = price.major.length * majorSize * DIGIT_WIDTH
  const minorWidth = minorText.length * minorSize * DIGIT_WIDTH

  // Centred as a group, laid out start-to-end. This ordering is fixed: the mark
  // does not mirror.
  const groupStart = digits.x + (digits.width - (currencyWidth + majorWidth + minorWidth)) / 2

  const currency: MarkPiece = {
    text: currencyText,
    x: groupStart,
    baseline,
    fontSize: currencySize,
    width: currencyWidth,
  }

  const major: MarkPiece = {
    text: price.major,
    x: groupStart + currencyWidth,
    baseline,
    fontSize: majorSize,
    width: majorWidth,
  }

  // Raised so its cap top meets the major's. Not the baseline — that is the
  // difference between cents and a second price.
  const minor: MarkPiece | null =
    minorText === ''
      ? null
      : {
          text: minorText,
          x: groupStart + currencyWidth + majorWidth,
          baseline: capTop + minorSize * capRatio,
          fontSize: minorSize,
          width: minorWidth,
        }

  /**
   * The was-price and the FROM/EACH line, above the digits.
   *
   * **Measured against the digit box, not the ground.** On a rounded box the two
   * are the same rect and this changes nothing; on a burst the ground's edge is
   * spikes, and a compare price placed there prints across them. The gallery
   * showed exactly that the first time a burst drew its own ground.
   */
  const topLineSize = Math.min(currencySize * 0.95, digits.height * 0.2)
  const topLineBaseline = digits.y + digits.height * (MARK_FIT[groundShape].square ? 0.18 : 0.26)

  const compare: MarkPiece | null =
    price.comparePrice === undefined
      ? null
      : {
          text: price.comparePrice,
          /**
           * Hard to the end on a rectangle, centred inside a round ground.
           *
           * **A right-aligned was-price is a rectangle idiom.** A burst's usable
           * area is a circle, so the top-right corner of any box inscribed in it
           * points straight at a spike — the gallery showed "32.00" printing
           * across one. Centring is also what a burst wants typographically:
           * everything in it reads off a single vertical axis.
           */
          x: MARK_FIT[groundShape].square
            ? digits.x +
              (digits.width - price.comparePrice.length * topLineSize * DIGIT_WIDTH) / 2
            : digits.x +
              digits.width * 0.98 -
              price.comparePrice.length * topLineSize * DIGIT_WIDTH,
          baseline: topLineBaseline,
          fontSize: topLineSize,
          width: price.comparePrice.length * topLineSize * DIGIT_WIDTH,
        }

  const prefixText = price.prefixLabel === undefined ? '' : PREFIX_TEXT[price.prefixLabel]
  const prefix: MarkPiece | null =
    prefixText === ''
      ? null
      : {
          text: prefixText,
          x: digits.x + digits.width * 0.02,
          baseline: topLineBaseline,
          fontSize: topLineSize,
          width: prefixText.length * topLineSize * DIGIT_WIDTH,
        }

  return {
    groundShape,
    tab:
      label === undefined
        ? null
        : {
            rect: { x: container.x, y: container.y, width: container.width * 0.56, height: tabHeight },
            fontSize: Math.min(tabHeight * 0.5, (container.width * 0.48) / (label.length * 0.62)),
            text: label,
          },
    mark,
    digits,
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
