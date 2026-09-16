import * as z from 'zod/v4'
import { fromHex, readableInkOn } from './contrast'

/**
 * Logo marks — a closed set of structures, skinned from the shop's palette.
 * E8-09.
 *
 * **Matched, not drawn, and that is the design rather than a limitation.** A
 * model picks one of the structures below and says how to skin it; this module
 * assembles the SVG. Three things follow, and together they are why this shipped
 * while E8-01 to E8-04 did not:
 *
 * - **It cannot emit an illegal mark.** The output is an enum and five bounded
 *   fields — the same bar `magicChoiceSchema` holds a generated block to.
 * - **It needs no diffusion provider**, which is the decision `E8-pending.md` §3
 *   says is blocking four other features and which nobody has made. It also
 *   sends no photograph of anybody, so the staff-photo question E8-01 raises
 *   does not arise: the inputs are a name, a trade and some hex.
 * - **What comes out is a vector**, so the mark is sharp on an A3 print. A logo
 *   is the one asset in a brand kit that has to be reproducible,
 *   re-colourable and printable at any size, and a raster a model drew once is
 *   none of those.
 *
 * **Every structure is drawn here, by hand, in code.** They are meant to be
 * edited and added to — the model's vocabulary is `LOGO_STRUCTURES` and nothing
 * else, so a new structure is a new entry plus a new branch in `drawMark`.
 */

// ─── The vocabulary ───────────────────────────────────────────────────────────

export const LOGO_STRUCTURES = ['wordmark', 'monogram', 'badge', 'lockup'] as const
export type LogoStructure = (typeof LOGO_STRUCTURES)[number]

export const LOGO_STRUCTURE_NOTE: Readonly<Record<LogoStructure, string>> = {
  wordmark:
    'The shop name set on its own, with one word or letter picked out in a second colour. Works for any name, and it is the safe answer.',
  monogram:
    'One or two initials in a filled square, with the name beside it. Needs a name whose initials mean something — a person’s name, or two strong words.',
  badge:
    'The name inside a ring, with a line of smaller type under it. Reads as established: butchers, bakeries, anything that wants to look like it has been there a while.',
  lockup:
    'A simple drawn shape above the name — a bag, a leaf, a cross. For a shop whose trade has an obvious symbol.',
}

/** The shapes a lockup can carry. A closed set, for the same reason. */
export const LOGO_SYMBOLS = ['bag', 'leaf', 'cross', 'basket', 'cup'] as const
export type LogoSymbol = (typeof LOGO_SYMBOLS)[number]

export const LOGO_SYMBOL_NOTE: Readonly<Record<LogoSymbol, string>> = {
  bag: 'A shopping bag. General retail, groceries, anything sold over a counter.',
  leaf: 'A leaf. Produce, health food, anything fresh.',
  cross: 'A pharmacy cross. Pharmacies and clinics only.',
  basket: 'A basket. Groceries and markets.',
  cup: 'A cup. Cafés, bakeries, anything served hot.',
}

// ─── What a model may decide ──────────────────────────────────────────────────

export const logoChoiceSchema = z.object({
  structure: z.enum(LOGO_STRUCTURES),
  /**
   * The name as it should be set, which is not always the name as stored.
   *
   * A shop registered as "Al Noor Trading LLC" is "Al Noor" on its own sign, and
   * a mark that carries the legal suffix reads as a letterhead. The model may
   * shorten; it may not invent. `namesTheShop` below is what holds it to that.
   */
  setAs: z.string().trim().min(1).max(28),
  /** One or two letters, for `monogram`. Ignored by the other structures. */
  initials: z.string().trim().max(2),
  /** The line under the name in a `badge`. "Est. 1998", "Fresh daily". */
  tagline: z.string().trim().max(24),
  /** The shape a `lockup` carries. Ignored by the other structures. */
  symbol: z.enum(LOGO_SYMBOLS),
  /**
   * Which palette entry leads, and which answers it, as positions in the palette
   * the shop already has.
   *
   * Indices rather than hex, so the mark cannot be drawn in a colour that is not
   * the shop's. This is the same move `priceIndex` makes in `brand-direction.ts`
   * and for the same reason: a model that can name a colour will eventually name
   * one nobody chose.
   */
  inkIndex: z.number().int().min(0).max(7),
  accentIndex: z.number().int().min(0).max(7),
  /** Why this structure, for the owner. One short sentence. */
  why: z.string().trim().min(3).max(160),
})

export type LogoChoice = z.infer<typeof logoChoiceSchema>

/** How many marks one call produces. E3 prices `logo_gen` at four variations. */
export const MARKS_PER_RUN = 4

/**
 * The whole answer: several marks, or a reason there are none.
 *
 * **One call for four marks rather than four calls.** They are variations on one
 * reading of one shop, so asking four times would be asking the same question
 * four times and paying for it — and the four answers would not be *different*
 * in any way we controlled. Asking for a set lets the prompt require that they
 * differ, which is what makes them a choice rather than four attempts.
 */
export const logoSetSchema = z.object({
  /**
   * False when the name will not make a mark of any of these kinds — most often
   * a name too long to set on one line at a legible size. Declining is an
   * answer, as it is for magic block, and it costs the owner nothing.
   */
  isMakeable: z.boolean(),
  marks: z.array(logoChoiceSchema).max(MARKS_PER_RUN),
  /** Written for the owner. At most four short sentences. */
  notes: z.array(z.string().trim().min(1).max(200)).max(4),
})

export type LogoSet = z.infer<typeof logoSetSchema>

export function logoSetJsonSchema(): unknown {
  return z.toJSONSchema(logoSetSchema)
}

/**
 * Whether the name the model wants to set is actually the shop's name.
 *
 * **A model shortening "Al Noor Trading LLC" to "Al Noor" is doing its job; a
 * model setting "Noor Market" is inventing a shop.** The difference is checkable
 * without asking: every word it kept has to be a word the shop's own name
 * contains. Case and Arabic diacritics aside, nothing else is allowed in.
 *
 * Deliberately not a substring test — the model may drop a middle word, and
 * "Al Noor Bakery" → "Al Bakery" is a legitimate if unlikely shortening.
 */
export function namesTheShop(setAs: string, shopName: string): boolean {
  const words = (value: string) =>
    value
      .toLocaleLowerCase()
      .split(/[\s،,./-]+/u)
      .filter((word) => word.length > 0)

  const owned = new Set(words(shopName))
  const wanted = words(setAs)

  return wanted.length > 0 && wanted.every((word) => owned.has(word))
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

/** The box every mark is drawn in. Square, because a logo slot usually is. */
export const MARK_SIZE = 512

/**
 * The colours a mark is drawn from, resolved from the shop's palette.
 *
 * `ground` is always transparent — a logo composited onto a header band, a dark
 * cover and a white page has to be the same file in all three, which is the
 * whole reason E4-01 removes backgrounds at all.
 */
export interface MarkSkin {
  ink: string
  accent: string
  /** Whichever of black or white reads on `accent`. Computed, never asked. */
  onAccent: string
}

export function skinFrom(palette: readonly string[], choice: LogoChoice): MarkSkin | null {
  const ink = palette[choice.inkIndex] ?? palette[0]
  const accent = palette[choice.accentIndex] ?? palette[1] ?? ink
  if (ink === undefined || accent === undefined) return null

  const rgb = fromHex(accent)
  if (rgb === null || fromHex(ink) === null) return null

  return { ink, accent, onAccent: readableInkOn(rgb) }
}

/**
 * The mark, as SVG.
 *
 * **Fonts are named, not embedded, and the family is passed in** — it is the
 * shop's own headline face, already chosen, already loaded by whatever renders
 * this. A mark set in a face the kit does not use is a mark that looks like
 * somebody else's.
 *
 * The text is `<text>` rather than outlines. Outlining would make the file
 * self-contained, which matters for print — and it needs a font binary and a
 * path extractor this process does not have. Recorded as the seam it is:
 * rasterising through `processLogo` is what every consumer actually uses today,
 * and that happens in a browserless pipeline that resolves the family.
 */
export function drawMark(choice: LogoChoice, skin: MarkSkin, family: string): string {
  const body = (() => {
    switch (choice.structure) {
      case 'wordmark':
        return wordmark(choice, skin, family)
      case 'monogram':
        return monogram(choice, skin, family)
      case 'badge':
        return badge(choice, skin, family)
      case 'lockup':
        return lockup(choice, skin, family)
    }
  })()

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}" role="img" aria-label="${escape(choice.setAs)}">`,
    body,
    '</svg>',
  ].join('')
}

/**
 * Type size that fits the box.
 *
 * **Measured by counting characters, not by measuring glyphs**, because there is
 * no text engine here. It is deliberately conservative — the cost of being wrong
 * is a name touching the edge of the mark, and the cost of being conservative is
 * a mark with slightly more air in it than it needed.
 *
 * Arabic runs wider per character than Latin at the same size, and this does not
 * try to tell them apart: the ratio is set for the wider of the two so a
 * bilingual name is safe.
 */
function fits(text: string, width: number, ceiling: number): number {
  const perChar = 0.62
  return Math.min(ceiling, Math.floor(width / Math.max(1, text.length * perChar)))
}

function wordmark(choice: LogoChoice, skin: MarkSkin, family: string): string {
  const words = choice.setAs.split(/\s+/u).filter((word) => word.length > 0)
  const size = fits(choice.setAs, MARK_SIZE * 0.86, 108)
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const head = last === undefined ? choice.setAs : words.slice(0, -1).join(' ')

  /**
   * The last word takes the accent, and only when there is more than one.
   *
   * A one-word name picked out in a second colour is a one-word name in the
   * wrong colour — there is nothing for it to contrast with.
   */
  const tspans =
    last === undefined
      ? escape(head)
      : `${escape(head)} <tspan fill="${skin.accent}">${escape(last)}</tspan>`

  return [
    `<text x="${MARK_SIZE / 2}" y="${MARK_SIZE / 2}" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${escape(family)}" font-size="${size}" font-weight="700" fill="${skin.ink}">`,
    tspans,
    '</text>',
  ].join('')
}

function monogram(choice: LogoChoice, skin: MarkSkin, family: string): string {
  // Falling back to the first letters of the name rather than refusing: the
  // field is optional in practice and a monogram with no letters is nothing.
  const letters = (choice.initials === '' ? initialsOf(choice.setAs) : choice.initials).slice(0, 2)
  const plateSize = MARK_SIZE * 0.52
  const plateX = (MARK_SIZE - plateSize) / 2
  const nameSize = fits(choice.setAs, MARK_SIZE * 0.9, 56)

  return [
    `<rect x="${plateX}" y="${MARK_SIZE * 0.14}" width="${plateSize}" height="${plateSize}" rx="24" fill="${skin.accent}"/>`,
    `<text x="${MARK_SIZE / 2}" y="${MARK_SIZE * 0.14 + plateSize / 2}" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${escape(family)}" font-size="${Math.round(plateSize * 0.5)}" font-weight="700" fill="${skin.onAccent}">${escape(letters)}</text>`,
    `<text x="${MARK_SIZE / 2}" y="${MARK_SIZE * 0.82}" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${escape(family)}" font-size="${nameSize}" font-weight="600" fill="${skin.ink}">${escape(choice.setAs)}</text>`,
  ].join('')
}

function badge(choice: LogoChoice, skin: MarkSkin, family: string): string {
  const radius = MARK_SIZE * 0.44
  const nameSize = fits(choice.setAs, MARK_SIZE * 0.62, 72)
  const taglineSize = Math.max(18, Math.round(nameSize * 0.34))

  return [
    `<circle cx="${MARK_SIZE / 2}" cy="${MARK_SIZE / 2}" r="${radius}" fill="none" stroke="${skin.accent}" stroke-width="10"/>`,
    `<circle cx="${MARK_SIZE / 2}" cy="${MARK_SIZE / 2}" r="${radius - 18}" fill="none" stroke="${skin.accent}" stroke-width="3"/>`,
    `<text x="${MARK_SIZE / 2}" y="${choice.tagline === '' ? MARK_SIZE / 2 : MARK_SIZE * 0.46}" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${escape(family)}" font-size="${nameSize}" font-weight="700" fill="${skin.ink}">${escape(choice.setAs)}</text>`,
    choice.tagline === ''
      ? ''
      : [
          `<text x="${MARK_SIZE / 2}" y="${MARK_SIZE * 0.6}" text-anchor="middle" dominant-baseline="central"`,
          ` font-family="${escape(family)}" font-size="${taglineSize}" font-weight="400" letter-spacing="2" fill="${skin.accent}">${escape(choice.tagline)}</text>`,
        ].join(''),
  ].join('')
}

function lockup(choice: LogoChoice, skin: MarkSkin, family: string): string {
  const nameSize = fits(choice.setAs, MARK_SIZE * 0.88, 72)

  return [
    `<g transform="translate(${MARK_SIZE / 2 - 72} ${MARK_SIZE * 0.14}) scale(6)">`,
    symbolPath(choice.symbol, skin),
    '</g>',
    `<text x="${MARK_SIZE / 2}" y="${MARK_SIZE * 0.78}" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${escape(family)}" font-size="${nameSize}" font-weight="700" fill="${skin.ink}">${escape(choice.setAs)}</text>`,
  ].join('')
}

/**
 * The five symbols, each drawn on a 24×24 grid.
 *
 * Hand-drawn rather than pulled from an icon set: these are printed at A3 on
 * somebody's shopfront advertising, and an icon library's licence terms are a
 * question nobody wants to answer at that size.
 */
function symbolPath(symbol: LogoSymbol, skin: MarkSkin): string {
  const stroke = `fill="none" stroke="${skin.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`

  switch (symbol) {
    case 'bag':
      return `<path d="M5 8h14l-1.2 12.4a1.6 1.6 0 0 1-1.6 1.6H7.8a1.6 1.6 0 0 1-1.6-1.6Z" ${stroke}/><path d="M9 8V6a3 3 0 0 1 6 0v2" ${stroke}/>`
    case 'leaf':
      return `<path d="M20 4c0 9-5.6 15-13 15H5c0-8 5.4-14 13-14Z" ${stroke}/><path d="M5 21c2.5-5 6-8.5 11-11" ${stroke}/>`
    case 'cross':
      return `<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5Z" ${stroke}/>`
    case 'basket':
      return `<path d="M3 9h18l-1.8 10.2a1.8 1.8 0 0 1-1.8 1.5H6.6a1.8 1.8 0 0 1-1.8-1.5Z" ${stroke}/><path d="m8 9 3-6M16 9l-3-6" ${stroke}/>`
    case 'cup':
      return `<path d="M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" ${stroke}/><path d="M17 10h1.8a2.7 2.7 0 0 1 0 5.4H17" ${stroke}/>`
  }
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join('')
}

/**
 * XML-escaped, because every one of these strings came from a model.
 *
 * A shop name with an ampersand in it is ordinary — "Ahmed & Sons" — and it
 * breaks an SVG document. The apostrophe and quote are escaped too because the
 * same helper writes attribute values.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
