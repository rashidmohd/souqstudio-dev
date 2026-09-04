/**
 * Colour maths for brand setup. E4-02.
 *
 * Pure — takes pixels or hex strings and returns hex strings or numbers. The
 * decoding is in lib/logo.ts, which owns sharp; keeping them apart means the
 * quantizer and the contrast rule can be tested without an image.
 */

export type Rgb = { r: number; g: number; b: number }

// ─── Conversion ───────────────────────────────────────────────────────────────

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

/**
 * The hex shown to a shop owner as an example of the format.
 *
 * It lives here rather than inline in the copy so the component keeps the
 * no-raw-hex rule switched on. A hex inside a sentence is not a styling
 * decision, but the linter cannot tell the two apart, and exempting a whole
 * component to hold one example string would switch the rule off where it
 * actually earns its keep.
 */
export const EXAMPLE_HEX = '#1F4FD8'

/**
 * The artboard's page mechanics.
 *
 * `surface`, `ink` and `inkMuted` are not brand colours — a shop does not choose
 * them, and they are not part of its palette. Something has to be the ground a
 * page is printed on and something has to be readable on it, whatever the shop's
 * colours are. They live here for the same reason the WCAG reference white and
 * black do: this is the one file where a literal colour is reference data rather
 * than a styling decision, and there is no chrome token to point at because this
 * is artboard content, not chrome.
 */
export const ARTBOARD_NEUTRALS = {
  surface: '#FFFFFF',
  ink: '#1A1A1A',
  inkMuted: '#6E7480',
} as const

/** What a colour an owner has just added starts as, before they pick one. */
export const NEW_COLOR_HEX = '#808080'

// ─── Contrast — E4-02 requires a WCAG AA check ────────────────────────────────

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
 * colour, and a price nobody can read is the one failure that costs a sale. It
 * is a warning, not a block: it is the shop's brand, and we do not get to
 * overrule it.
 */
export function whiteTextPasses(background: Rgb, large = false): boolean {
  return (
    contrastRatio(background, { r: 255, g: 255, b: 255 }) >=
    (large ? WCAG_AA_LARGE : WCAG_AA_NORMAL)
  )
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

/** Whichever of black or white reads better on this background. */
export function readableInkOn(background: Rgb): '#ffffff' | '#000000' {
  return contrastRatio(background, { r: 255, g: 255, b: 255 }) >=
    contrastRatio(background, { r: 0, g: 0, b: 0 })
    ? '#ffffff'
    : '#000000'
}

// ─── Quantization ─────────────────────────────────────────────────────────────

/**
 * Dominant colours from raw RGBA pixels, by median cut.
 *
 * Median cut rather than a simple frequency count: a logo is mostly flat fills,
 * so counting exact values returns five shades of the same red and calls them a
 * palette. Repeatedly splitting the box along its widest channel gives colours
 * that are actually distinct from each other.
 *
 * Transparent and near-transparent pixels are dropped — the whole point of
 * background removal is that they are not part of the brand. So are pixels that
 * are nearly white or nearly black, which are the page and the outline rather
 * than a colour anyone chose.
 */
export function extractPalette(
  pixels: Uint8Array | Uint8ClampedArray | Buffer,
  channels: number,
  count = 5
): string[] {
  const samples: Rgb[] = []

  for (let index = 0; index + channels <= pixels.length; index += channels) {
    const r = pixels[index] as number
    const g = pixels[index + 1] as number
    const b = pixels[index + 2] as number
    const alpha = channels === 4 ? (pixels[index + 3] as number) : 255

    if (alpha < 200) continue
    // Near-white and near-black carry no hue worth suggesting.
    if (r > 244 && g > 244 && b > 244) continue
    if (r < 12 && g < 12 && b < 12) continue

    samples.push({ r, g, b })
  }

  if (samples.length === 0) return []

  let boxes: Rgb[][] = [samples]
  while (boxes.length < count) {
    // Always split the box with the widest spread — splitting an already-tight
    // box just produces two shades of one colour.
    let widest = -1
    let widestSpread = 0
    boxes.forEach((box, index) => {
      if (box.length < 2) return
      const spread = channelSpread(box).spread
      if (spread > widestSpread) {
        widestSpread = spread
        widest = index
      }
    })
    if (widest === -1) break

    const box = boxes[widest] as Rgb[]
    const { channel } = channelSpread(box)
    const sorted = [...box].sort((a, b) => a[channel] - b[channel])
    const middle = Math.floor(sorted.length / 2)
    boxes = [
      ...boxes.slice(0, widest),
      sorted.slice(0, middle),
      sorted.slice(middle),
      ...boxes.slice(widest + 1),
    ]
  }

  return boxes
    .filter((box) => box.length > 0)
    // Biggest bucket first: the colour covering most of the logo is the one an
    // owner will expect to see offered as primary.
    .sort((a, b) => b.length - a.length)
    .map((box) => toHex(averageOf(box)))
    .filter((hex, index, all) => all.indexOf(hex) === index)
    .slice(0, count)
}

function channelSpread(box: Rgb[]): { channel: keyof Rgb; spread: number } {
  const bounds = { r: [255, 0], g: [255, 0], b: [255, 0] } as Record<keyof Rgb, number[]>
  for (const pixel of box) {
    for (const channel of ['r', 'g', 'b'] as const) {
      const pair = bounds[channel] as number[]
      if (pixel[channel] < (pair[0] as number)) pair[0] = pixel[channel]
      if (pixel[channel] > (pair[1] as number)) pair[1] = pixel[channel]
    }
  }

  let channel: keyof Rgb = 'r'
  let spread = 0
  for (const candidate of ['r', 'g', 'b'] as const) {
    const pair = bounds[candidate] as number[]
    const width = (pair[1] as number) - (pair[0] as number)
    if (width > spread) {
      spread = width
      channel = candidate
    }
  }
  return { channel, spread }
}

function averageOf(box: Rgb[]): Rgb {
  const total = box.reduce(
    (sum, pixel) => ({ r: sum.r + pixel.r, g: sum.g + pixel.g, b: sum.b + pixel.b }),
    { r: 0, g: 0, b: 0 }
  )
  return { r: total.r / box.length, g: total.g / box.length, b: total.b / box.length }
}

/**
 * Fill primary, secondary and accent from whatever the logo gave us.
 *
 * A one-colour logo is common and must not produce an empty kit, so the palette
 * is cycled rather than left short. The owner reassigns them by tapping a
 * swatch; these are a starting point, not a verdict.
 */
export function assignBrandColors(palette: string[]): {
  primaryColor: string
  secondaryColor: string
  accentColor: string
} {
  const fallback = ['#1F1F1D', '#4A4A46', '#0B63CE']
  const source = palette.length > 0 ? palette : fallback
  const pick = (index: number) => source[index % source.length] as string
  return { primaryColor: pick(0), secondaryColor: pick(1), accentColor: pick(2) }
}
