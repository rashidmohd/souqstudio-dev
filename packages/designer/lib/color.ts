/**
 * Colour maths for brand setup. E4-02.
 *
 * Pure — takes pixels or hex strings and returns hex strings or numbers. The
 * decoding is in lib/logo.ts, which owns sharp; keeping them apart means the
 * quantizer and the contrast rule can be tested without an image.
 */

// Conversion and the WCAG rule moved to `@souqstudio/engine/src/contrast.ts`
// when E8-08 needed the same bar inside the worker — a proposal refused on one
// side of the queue and merely warned about on the other reads as the product
// disagreeing with itself. Re-exported here so this module's surface, and
// everything importing it, is unchanged.
import { toHex, type Rgb } from '@souqstudio/engine'

export {
  contrastHex,
  contrastRatio,
  fromHex,
  isDarkBackground,
  isValidHex,
  readableInkOn,
  relativeLuminance,
  toHex,
  whiteTextPasses,
  WCAG_AA_LARGE,
  WCAG_AA_NORMAL,
  type Rgb,
} from '@souqstudio/engine'

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

/**
 * Stand-ins for artwork a preview does not have.
 *
 * Artboard content, not chrome, so `--sq-ui-*` would be the wrong namespace and
 * `--sq-tpl-*` would be claiming these are part of the offer book's design. They
 * are neither: they are the grey of a missing photograph. Here for the same
 * reason as `ARTBOARD_NEUTRALS` — this is the file where a literal colour is
 * reference data rather than a styling decision.
 *
 * `onTint` is white at low alpha, so a logo slot reads on a primary or
 * secondary ground without needing to know which one it landed on.
 */
export const ARTBOARD_PLACEHOLDER = {
  imageOuter: '#ECEAE4',
  imageInner: '#DEDBD2',
  onTint: '#FFFFFF33',
} as const

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
