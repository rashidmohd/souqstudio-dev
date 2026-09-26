/**
 * WCAG contrast maths, shared. E4-02 and E8-08.
 *
 * **This moved out of `apps/web/lib/color.ts` when E8-08 needed it in the
 * worker**, and it moved rather than being copied for the reason every other
 * shared definition in this repo gives: the palette a model proposes is refused
 * in the worker for failing a contrast bar, and the same palette is warned about
 * in the setup wizard. Two implementations of that bar is a proposal that
 * passes on one side of the queue and warns on the other, which reads to an
 * owner as the product disagreeing with itself.
 *
 * `apps/web/lib/color.ts` re-exports all of it, so nothing web-side changed and
 * its tests still describe the same functions. What stayed there is what is
 * about *brand setup* rather than about colour: the quantizer, the artboard
 * neutrals, the example hex.
 *
 * Pure, and hex in / number out. Literal colours here are reference data — the
 * WCAG white and black the ratio is measured against — not styling.
 */

export type Rgb = { r: number; g: number; b: number }

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

export function toHex({ r, g, b }: Rgb): string {
  const pair = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${pair(r)}${pair(g)}${pair(b)}`
}

export function fromHex(hex: string): Rgb | null {
  const cleaned = hex.trim().replace(/^#/, '')
  // Three-digit shorthand doubles each nibble: #f0a → #ff00aa.
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function isValidHex(hex: string): boolean {
  return fromHex(hex) !== null
}

/** WCAG relative luminance. The 0.03928 kink is the sRGB transfer curve. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. Order of arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (lighter + 0.05) / (darker + 0.05)
}

export const WCAG_AA_NORMAL = 4.5
export const WCAG_AA_LARGE = 3

/**
 * Whether white text clears AA on this background.
 *
 * E4-02 asks for this specifically because prices are set in white on the brand
 * colour, and a price nobody can read is the one failure that costs a sale. In
 * the wizard it is a warning, not a block: it is the shop's brand, and we do not
 * get to overrule it. In E8-08 it *is* a block, because nobody's brand is being
 * overruled — a proposal is ours until the owner accepts it.
 */
export function whiteTextPasses(background: Rgb, large = false): boolean {
  return contrastRatio(background, WHITE) >= (large ? WCAG_AA_LARGE : WCAG_AA_NORMAL)
}

/** Whichever of black or white reads better on this background. */
export function readableInkOn(background: Rgb): '#ffffff' | '#000000' {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? '#ffffff' : '#000000'
}

/**
 * Whether a background wants light ink on it.
 *
 * Exists so callers can branch on "is this dark" without comparing against the
 * string `readableInkOn` happens to return — a comparison that reads as a
 * styling decision, breaks if the return values ever change case, and trips the
 * no-raw-hex rule for a value that is not styling anything.
 */
export function isDarkBackground(background: Rgb): boolean {
  return readableInkOn(background) !== '#000000'
}

/** The same ratio, over the hex strings a brand kit actually stores. */
export function contrastHex(a: string, b: string): number | null {
  const left = fromHex(a)
  const right = fromHex(b)
  if (left === null || right === null) return null
  return contrastRatio(left, right)
}

/**
 * Of the inks a text can take, the one that reads best on its ground.
 *
 * **Every colour of the ground counts, and the worst one decides**, because a
 * gradient ground is read at its weakest stop: ink that clears the dark end
 * and vanishes into the light one is ink nobody can read across the label.
 *
 * `null` when no colour on either side is a hex this can read, so the caller
 * keeps the ink it would have used anyway rather than guessing.
 */
export function inkOnGround(ground: readonly string[], inks: readonly string[]): string | null {
  let best: string | null = null
  let bestRatio = -1
  for (const ink of inks) {
    const ratios: number[] = []
    for (const colour of ground) {
      const ratio = contrastHex(ink, colour)
      if (ratio !== null) ratios.push(ratio)
    }
    if (ratios.length === 0 || ratios.length < ground.length) continue
    const worst = Math.min(...ratios)
    if (worst > bestRatio) {
      best = ink
      bestRatio = worst
    }
  }
  return best
}
