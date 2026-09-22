/**
 * The fit ladder. E6 §4.
 *
 * **Cards degrade predictably rather than break.** Arabic strings routinely run
 * longer than their English equivalents, so a card sized for one language
 * overflows in the other — which is why a block is designed at the dense,
 * bilingual worst case and then allowed to breathe, and why this exists.
 *
 * Four rungs, applied in order until the text fits:
 *
 *   1. Tighten leading to the style's minimum.
 *   2. Drop to the next type step — **bounded by the scale, never an arbitrary
 *      size.** This is what an ordered h1..h6 scale buys: with four unordered
 *      semantic roles there is no next step to drop to.
 *   3. Truncate. **Never a name, never a price.**
 *   4. Escalate — flag the card so the owner can fix it before it prints.
 *
 * A name that has run out of steps is escalated rather than shrunk past its
 * floor: a product name nobody can read is not a smaller card, it is a wasted
 * one. The price never enters this ladder at all — `layoutPriceMark` fits it on
 * both axes by construction.
 */

import type {
  TextOverflow,
  TextSource,
  TextStyle,
  TypeLevel,
  TypeScale,
} from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'

/**
 * The render-time properties that change how wide a string draws.
 *
 * **They exist because leaving them out was a bug rather than a
 * simplification.** A measurer that is told only the size and the family
 * measures every string at the canvas default weight — and a product name
 * renders at 700, which is wider. The wrap decision for the boldest text on
 * the card was being made against light metrics, so a name that measured
 * inside its box drew outside it.
 */
export interface TextStyleMetrics {
  /** CSS weight, as the renderer will draw it. Absent means normal. */
  weight?: number | undefined
  /**
   * Extra advance per character, as a multiple of the font size.
   *
   * **Added by `advance` below, never by the measurer.** Canvas has a
   * `letterSpacing` property and SVG has the attribute, and if both this and a
   * measurer applied it the width would be counted twice. One place, and it is
   * the engine's, so every measurer gets it right by not implementing it.
   */
  letterSpacing?: number | undefined
}

/**
 * Advance width of `text` at `fontSize` in `family`, at `style`.
 *
 * Injected rather than computed: the engine cannot measure a glyph without a
 * font, and it must not try. The browser renderer passes a canvas measurement,
 * the worker passes the same from its own context, and tests pass an estimator.
 *
 * `style` is optional so a measurer that ignores it stays assignable — an
 * estimator has no use for a weight. A real one must honour `weight` and must
 * ignore `letterSpacing`.
 */
export type TextMeasurer = (
  text: string,
  fontSize: number,
  family: string,
  style?: TextStyleMetrics | undefined
) => number

/**
 * What a string actually occupies: the measurer's answer plus the tracking.
 *
 * **Every width in this module goes through here.** `letterSpacing` is applied
 * at render — `letter-spacing` on the `<text>` — and was in no measurement at
 * all, so an uppercase brand line tracked at 0.08em was measured about 8% per
 * character narrower than it draws.
 *
 * Counted over every character rather than the gaps between them, which
 * over-states by one. That is the safe direction: it wraps a shade early
 * instead of drawing through the edge of the box.
 */
function advance(
  text: string,
  fontSize: number,
  family: string,
  measure: TextMeasurer,
  style: TextStyleMetrics | undefined
): number {
  const width = measure(text, fontSize, family, style)
  const tracking = style?.letterSpacing
  return tracking === undefined ? width : width + tracking * fontSize * text.length
}

/** Leading will not tighten below this multiple, at any rung. */
export const MIN_LINE_HEIGHT = 1.0

export interface FitRequest {
  text: string
  box: { width: number; height: number }
  /** Where the ladder starts. */
  level: TypeLevel
  scale: TypeScale
  /** `sqrt(w × h)` of the block the text sits in — what `scale.base` resolves against. */
  blockSize: number
  /**
   * The smallest step this text may fall to. Below it the ladder escalates
   * instead of shrinking further. A name's floor is high; a spec's is low.
   */
  floor?: TypeLevel | undefined
  /** May this text be cut? A spec may. A name may not. */
  truncatable?: boolean | undefined
  /**
   * A size the owner set by hand, as a fraction of `blockSize` — the same unit
   * `scale.base` uses. Overrides what `level` would have chosen.
   *
   * **The ladder still runs, it just has no rungs to name.** With a level there
   * is a next step on the scale to drop to; with a free size there is only a
   * ratio, so this branch shrinks by a fixed factor down to a floor of 60% of
   * what was asked for. An owner who sized a headline by eye still gets a card
   * that degrades rather than one that overflows.
   */
  size?: number | undefined
  /**
   * A ceiling on line count, independent of the height the box allows.
   *
   * The box already caps lines by arithmetic; this caps them by *decision*. A
   * three-line name in a box that could hold four is a card whose proportions
   * the owner chose, and the designer's clamp control is how they say so.
   */
  maxLines?: number | undefined
  /**
   * The weight and tracking the renderer will use, when they are not the
   * level's own.
   *
   * **Passed in rather than read off the level, because the element wins.** A
   * block may set either per element — `fitTextElement` merges them over the
   * level before it draws — and measuring the level's values while drawing the
   * element's is the same class of mismatch as not measuring them at all.
   *
   * It does not follow the ladder down. Rung 2 changes the *size* by borrowing
   * another level's, and the renderer keeps drawing at the original level's
   * weight, so the measurement has to as well.
   */
  style?: TextStyleMetrics | undefined
  measure: TextMeasurer
}

export interface FitResult {
  lines: string[]
  fontSize: number
  lineHeight: number
  /** Which step it came to rest on. */
  level: TypeLevel
  truncated: boolean
  /**
   * Out of rungs. The card carries `fit-escalated` and the editor shows a fix
   * affordance — this is a state the owner sees before publishing, never one
   * that quietly ships.
   */
  escalated: boolean
}

/** Levels ordered largest first, by the sizes this kit actually assigns. */
function stepsDescending(scale: TypeScale): TypeLevel[] {
  return [...TYPE_LEVELS].sort((a, b) => scale.levels[b].size - scale.levels[a].size)
}

function sizeOf(scale: TypeScale, level: TypeLevel, blockSize: number): number {
  return scale.base * blockSize * scale.levels[level].size
}

/**
 * Greedy word wrap. Words that do not fit alone are left long — rung 3's job.
 *
 * **A newline in the text is a break the owner asked for, and it is kept.** The
 * split used to be `/\s+/`, which treats a line feed as a space — so a headline
 * typed on three lines came back as one paragraph reflowed to the box, and the
 * only way to get a second line was to make the box narrow enough to force one.
 * Hard breaks are honoured first and each paragraph is wrapped inside them, so
 * the two mechanisms compose rather than compete.
 *
 * An empty paragraph is a blank line and survives, because that is what it was
 * typed for. Blank lines at the end do not: they are the trailing Return nobody
 * meant, and they would eat the height the rest of the text is fitted against.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  family: string,
  measure: TextMeasurer,
  style?: TextStyleMetrics | undefined
): string[] {
  const lines: string[] = []

  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    const words = paragraph.split(/\s+/).filter((word) => word !== '')
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (advance(candidate, fontSize, family, measure, style) <= maxWidth) {
        line = candidate
      } else {
        if (line !== '') lines.push(line)
        line = word
      }
    }
    if (line !== '') lines.push(line)
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  while (lines.length > 0 && lines[0] === '') lines.shift()

  return lines
}

export function fitText(request: FitRequest): FitResult {
  const { text, box, scale, blockSize, measure } = request
  const level = scale.levels[request.level]
  const family = scale.families[level.family]

  /*
   * What the renderer will draw with, which is the level's weight and tracking
   * unless the element overrode them. Every `wrapText` below is handed this
   * rather than nothing, and that is the fix: the ladder used to measure the
   * default weight and then draw at 700.
   */
  const metrics: TextStyleMetrics = {
    weight: request.style?.weight ?? level.weight,
    ...(request.style?.letterSpacing === undefined
      ? level.letterSpacing === undefined
        ? {}
        : { letterSpacing: level.letterSpacing }
      : { letterSpacing: request.style.letterSpacing }),
  }

  if (request.size !== undefined) {
    return fitFreeSize(request, level.lineHeight, family, metrics)
  }

  const steps = stepsDescending(scale)
  const floorIndex =
    request.floor === undefined ? steps.length - 1 : steps.indexOf(request.floor)
  const startIndex = steps.indexOf(request.level)

  const lineCap = request.maxLines === undefined ? Infinity : Math.max(1, request.maxLines)

  const attempt = (at: TypeLevel, lineHeight: number) => {
    const fontSize = sizeOf(scale, at, blockSize)
    const lines = wrapText(text, box.width, fontSize, family, measure, metrics)
    const height = lines.length * fontSize * lineHeight
    // Two ceilings, and both have to hold: the height the box has, and the line
    // count the owner declared. A clamp that only stopped the box from
    // overflowing would not be a clamp.
    return {
      level: at,
      fontSize,
      lineHeight,
      lines,
      fits: height <= box.height && lines.length <= lineCap,
    }
  }

  // Rung 0 — as designed.
  const asDesigned = attempt(request.level, level.lineHeight)
  if (asDesigned.fits) return { ...asDesigned, truncated: false, escalated: false }

  // Rung 1 — tighten the leading, and only the leading.
  const tightened = attempt(request.level, Math.max(MIN_LINE_HEIGHT, level.lineHeight * 0.88))
  if (tightened.fits) return { ...tightened, truncated: false, escalated: false }

  // Rung 2 — walk down the scale. Never an arbitrary size, and never past the
  // floor: a name below its floor is a wasted card, not a smaller one.
  for (let i = startIndex + 1; i <= floorIndex && i < steps.length; i += 1) {
    const at = steps[i]
    if (at === undefined) continue
    const stepped = attempt(at, Math.max(MIN_LINE_HEIGHT, scale.levels[at].lineHeight))
    if (stepped.fits) return { ...stepped, truncated: false, escalated: false }
  }

  // Rung 3 — cut, if this text may be cut at all.
  const floorLevel = steps[Math.min(floorIndex, steps.length - 1)] ?? request.level
  const floorSize = sizeOf(scale, floorLevel, blockSize)
  const floorLeading = Math.max(MIN_LINE_HEIGHT, scale.levels[floorLevel].lineHeight)
  const maxLines = Math.max(
    1,
    Math.min(Math.floor(box.height / (floorSize * floorLeading)), lineCap)
  )
  const full = wrapText(text, box.width, floorSize, family, measure, metrics)

  if (request.truncatable === true && full.length > maxLines) {
    const kept = full.slice(0, maxLines)
    const last = kept[maxLines - 1]
    if (last !== undefined) kept[maxLines - 1] = `${last.replace(/[\s.,;:]+$/, '')}…`
    return {
      lines: kept,
      fontSize: floorSize,
      lineHeight: floorLeading,
      level: floorLevel,
      truncated: true,
      escalated: false,
    }
  }

  // Rung 4 — out of rungs. The owner sees this before it prints.
  return {
    lines: full,
    fontSize: floorSize,
    lineHeight: floorLeading,
    level: floorLevel,
    truncated: false,
    escalated: true,
  }
}

/**
 * The ladder for text the owner sized by hand.
 *
 * Same four rungs, and the same two things that never happen: a name is never
 * cut and never shrunk past its floor. What differs is rung 2 — there is no
 * next step on the scale to fall to, so it falls by a ratio. The floor is a
 * proportion of what was asked for rather than a named level, because the owner
 * asked for a size and "no smaller than 60% of that" is the honest reading of
 * a floor when there is no scale in play.
 */
function fitFreeSize(
  request: FitRequest,
  lineHeight: number,
  family: string,
  metrics: TextStyleMetrics
): FitResult {
  const { text, box, blockSize, measure } = request
  const asked = (request.size ?? 0) * blockSize
  const floor = asked * 0.6
  const lineCap = request.maxLines === undefined ? Infinity : Math.max(1, request.maxLines)

  const attempt = (fontSize: number, leading: number) => {
    const lines = wrapText(text, box.width, fontSize, family, measure, metrics)
    return {
      fontSize,
      lineHeight: leading,
      lines,
      level: request.level,
      fits: lines.length * fontSize * leading <= box.height && lines.length <= lineCap,
    }
  }

  const asDesigned = attempt(asked, lineHeight)
  if (asDesigned.fits) return { ...asDesigned, truncated: false, escalated: false }

  const tightened = attempt(asked, Math.max(MIN_LINE_HEIGHT, lineHeight * 0.88))
  if (tightened.fits) return { ...tightened, truncated: false, escalated: false }

  const leading = Math.max(MIN_LINE_HEIGHT, lineHeight * 0.88)
  for (let size = asked * 0.92; size >= floor; size *= 0.92) {
    const stepped = attempt(size, leading)
    if (stepped.fits) return { ...stepped, truncated: false, escalated: false }
  }

  const lines = wrapText(text, box.width, floor, family, measure, metrics)
  const maxLines = Math.max(1, Math.min(Math.floor(box.height / (floor * leading)), lineCap))

  if (request.truncatable === true && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    const last = kept[maxLines - 1]
    if (last !== undefined) kept[maxLines - 1] = `${last.replace(/[\s.,;:]+$/, '')}…`
    return {
      lines: kept,
      fontSize: floor,
      lineHeight: leading,
      level: request.level,
      truncated: true,
      escalated: false,
    }
  }

  return {
    lines,
    fontSize: floor,
    lineHeight: leading,
    level: request.level,
    truncated: false,
    escalated: true,
  }
}

/** Convenience for a text style that already names its own level. */
export function fitStyle(
  style: TextStyle,
  request: Omit<FitRequest, 'level'> & { level?: TypeLevel | undefined }
): FitResult {
  return fitText({ ...request, level: request.level ?? style.slot ?? 'body' })
}

/**
 * What the ladder is allowed to do to a given piece of text.
 *
 * Derived from what the text *is*, not from how it was styled — "never a name,
 * never a price" is a product rule, and a rule that lives in one renderer is a
 * rule the other one breaks. E6 §4.
 *
 * A product name gets a high floor and no scissors: a name cut mid-word is a
 * product the customer cannot ask for, and a name shrunk past legibility is a
 * card that wasted its space. Both escalate instead, and the owner sees the flag
 * before the book prints.
 *
 * Static copy is the owner's own words, so it is not cut either — an ellipsis
 * through someone's headline is worse than telling them it does not fit.
 *
 * **A block may override it**, and the designer is where that happens: the
 * design system makes overflow a first-class control precisely because it is
 * what decides whether a block survives the catalog. The override is per
 * element and travels in the block, so both renderers read the same answer.
 */
export function fitPolicy(
  source: TextSource,
  overflow?: TextOverflow | undefined
): {
  floor?: TypeLevel | undefined
  truncatable: boolean
  maxLines?: number | undefined
} {
  // A declared policy wins over the derived one, and only over the derived one:
  // it says where the ladder may stop, never that a name may be cut when the
  // owner did not ask for it. `truncate` and `clamp` *are* that request, made
  // explicitly in the designer, which is the difference between a rule and a
  // default.
  if (overflow !== undefined) {
    if (overflow.mode === 'shrink') return { floor: overflow.floor, truncatable: false }
    if (overflow.mode === 'clamp') {
      return { truncatable: true, maxLines: Math.max(1, Math.round(overflow.lines)) }
    }
    return { truncatable: true, maxLines: 1 }
  }

  if (source.from === 'product') {
    return source.field === 'name'
      ? { floor: 'h4', truncatable: false }
      : { truncatable: true }
  }

  // **A tier is never cut.** "Save 2…" is not a smaller way of saying "Save
  // 20%", it is a different and wrong claim — the one case in this function
  // where truncation would misprice an offer rather than merely look bad.
  if (source.from === 'offer') return { truncatable: false }

  // A shop's own name is not cuttable; its address and phone are.
  if (source.from === 'shop') {
    return source.field === 'name' ? { truncatable: false } : { truncatable: true }
  }

  return { truncatable: false }
}
