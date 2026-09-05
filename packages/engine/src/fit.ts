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

import type { TextSource, TextStyle, TypeLevel, TypeScale } from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'

/**
 * Advance width of `text` at `fontSize` in `family`.
 *
 * Injected rather than computed: the engine cannot measure a glyph without a
 * font, and it must not try. The browser renderer passes a canvas measurement,
 * the worker passes the same from its own context, and tests pass an estimator.
 */
export type TextMeasurer = (text: string, fontSize: number, family: string) => number

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

/** Greedy word wrap. Words that do not fit alone are left long — rung 3's job. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  family: string,
  measure: TextMeasurer
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return []

  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (measure(candidate, fontSize, family) <= maxWidth) {
      line = candidate
    } else {
      if (line !== '') lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)

  return lines
}

export function fitText(request: FitRequest): FitResult {
  const { text, box, scale, blockSize, measure } = request
  const style = scale.levels[request.level]
  const family = scale.families[style.family]

  const steps = stepsDescending(scale)
  const floorIndex =
    request.floor === undefined ? steps.length - 1 : steps.indexOf(request.floor)
  const startIndex = steps.indexOf(request.level)

  const attempt = (level: TypeLevel, lineHeight: number) => {
    const fontSize = sizeOf(scale, level, blockSize)
    const lines = wrapText(text, box.width, fontSize, family, measure)
    const height = lines.length * fontSize * lineHeight
    return { level, fontSize, lineHeight, lines, fits: height <= box.height }
  }

  // Rung 0 — as designed.
  const asDesigned = attempt(request.level, style.lineHeight)
  if (asDesigned.fits) return { ...asDesigned, truncated: false, escalated: false }

  // Rung 1 — tighten the leading, and only the leading.
  const tightened = attempt(request.level, Math.max(MIN_LINE_HEIGHT, style.lineHeight * 0.88))
  if (tightened.fits) return { ...tightened, truncated: false, escalated: false }

  // Rung 2 — walk down the scale. Never an arbitrary size, and never past the
  // floor: a name below its floor is a wasted card, not a smaller one.
  for (let i = startIndex + 1; i <= floorIndex && i < steps.length; i += 1) {
    const level = steps[i]
    if (level === undefined) continue
    const stepped = attempt(level, Math.max(MIN_LINE_HEIGHT, scale.levels[level].lineHeight))
    if (stepped.fits) return { ...stepped, truncated: false, escalated: false }
  }

  // Rung 3 — cut, if this text may be cut at all.
  const floorLevel = steps[Math.min(floorIndex, steps.length - 1)] ?? request.level
  const floorSize = sizeOf(scale, floorLevel, blockSize)
  const floorLeading = Math.max(MIN_LINE_HEIGHT, scale.levels[floorLevel].lineHeight)
  const maxLines = Math.max(1, Math.floor(box.height / (floorSize * floorLeading)))
  const full = wrapText(text, box.width, floorSize, family, measure)

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
 */
export function fitPolicy(source: TextSource): {
  floor?: TypeLevel | undefined
  truncatable: boolean
} {
  if (source.from === 'product') {
    return source.field === 'name'
      ? { floor: 'h4', truncatable: false }
      : { truncatable: true }
  }

  // A shop's own name is not cuttable; its address and phone are.
  if (source.from === 'shop') {
    return source.field === 'name' ? { truncatable: false } : { truncatable: true }
  }

  return { truncatable: false }
}
