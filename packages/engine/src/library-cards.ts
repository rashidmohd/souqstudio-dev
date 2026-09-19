/**
 * The repeating offer cards — the half of the library a page is mostly made of.
 *
 * Every one of these renders **once per offer** and reflows into whatever shape
 * the region it lands in turns out to be, which is why each carries four
 * arrangements whose ranges meet: tall for a booklet cell, square for a carousel
 * post, wide for a two-column merge, banner for a full row.
 *
 * ## Redrawn from real cards, September 2026
 *
 * The set before this one was designed from a description of what a leaflet
 * does. This one was designed from seven photographed cards — a Gulf quick-
 * commerce tile, two German discounter leaflets, an electronics deal card, a
 * Bahraini grocery tile — and the differences between what they do and what the
 * library did are what changed:
 *
 * - **The card ends differently, card to card.** Sixteen of the previous
 *   twenty-five put the price in a full-measure box at the foot, so the
 *   structures differed in the middle and agreed on the ending, which is most of
 *   why they read as one card in costumes. A price here is a property of the
 *   register: end-aligned on a half measure for the discounter card, a saturated
 *   block at the start edge for the flyer, a pill beside a struck compare price
 *   for the e-commerce tile, a disc over the packshot for the lead deal.
 * - **The brand gets its own line.** Six of the seven references set it above
 *   the product name in small caps, and it was on three cards here. It is the
 *   line that makes a card look like a shop's rather than a spreadsheet's, and
 *   `brand` has been bindable the whole time.
 * - **The spec line is two or three lines, not one.** A discounter card carries
 *   variant, weight and unit count as a grey block under the name — the second
 *   most space on the card after the photograph. A single 6%-tall caption was
 *   the library treating it as an afterthought.
 * - **One promo mark, and the mark's own tab is often it.** The quietest
 *   reference has no badge at all: the tier is a coloured flag welded to the
 *   price. A card here carries a chip *or* an attached tab, never both —
 *   `duplicate-tier` is a warning and the loader refuses a shipped block that
 *   draws any warning.
 * - **Air is a register, not a default.** The discounter card is four fifths
 *   white; the flyer card is four fifths colour. Both are in the references and
 *   the library only had the middle.
 *
 * What did **not** change, because the references argued for it rather than
 * against it:
 *
 * - **Promotion mechanics are not blocks.** BOGO, multibuy, was/now, percent off
 *   and bundle are the offer's *tier* and what the price mark draws inside
 *   itself. Every reference card carries a different mechanic in the same
 *   furniture. What differs between these designs is emphasis, not vocabulary.
 * - **Most rows have no photograph.** 4.2% of the real catalog carries one —
 *   see `harness/real.ts` — so two designs here have no image element at all,
 *   and they are designs rather than fallbacks.
 *
 * **What a reference asks for and this cannot draw**: the unit-price line
 * ("1 kg = 11.98"), the validity window on the card, the deposit footnote and
 * the star rating. `packLabel` and `unitPriceLabel` already exist in
 * `@souqstudio/types` and `TextSource` already has `packSize` — what is missing
 * is `contentFor` in the painters, which returns an empty string for it, and
 * `library.test.ts` holds the seed to the three fields both painters resolve.
 * Until that is wired, a seeded card naming one would print a blank where the
 * design says there is a line.
 */

import type {
  Arrangement,
  BlockElement,
  LogicalAlign,
  PriceMarkStyle,
  Stroke,
  TokenRef,
} from '@souqstudio/types'
import {
  at,
  BANNER,
  type Box,
  bound,
  box,
  chip,
  disc,
  ground,
  markAs,
  markOn,
  noTab,
  outline,
  panel,
  photo,
  PLAIN_PRICE,
  price,
  REVERSED_PRICE,
  role,
  rule,
  SQUARISH,
  TALL,
  WIDE,
} from './library-kit'

/**
 * What makes two cards of the same structure different cards.
 *
 * A skin is the decision a shop's designer would make about a layout that
 * already works — ground it in the brand colour or leave it white, outline it or
 * not, let the price mark keep its tag or strip it to digits. Structure is
 * expensive to author and cheap to reuse; skins are the opposite, which is why
 * the library is two dozen structures wearing one skin each rather than a dozen
 * hand-drawn cards recoloured.
 *
 * **A skin may no longer be the only difference between two shipped cards.**
 * That was the finding that cut the library from thirty-three to twenty-five in
 * September: colour is the weakest differentiator at the size a library is
 * actually browsed, and seventeen structures times skins produced near
 * duplicates. One structure ships twice here — the default card, plain and
 * tinted — because the tinted one is the lead-deal marker on a page of white
 * ones and that is a use, not a swatch.
 */
export interface Skin {
  /** The card's ground. `surface` is a white card on a coloured page. */
  ground: TokenRef
  radius?: number
  /**
   * Product text defaults to the ink colour, which disappears on a tinted
   * ground. Setting this inverts every bound string on the card in one place,
   * rather than one `color` per element that somebody will forget on the spec.
   */
  onTint?: boolean
  price?: PriceMarkStyle
  stroke?: Stroke
  /** The accent shape a structure paints — a band, a disc, a rail, a tab. */
  accent?: TokenRef
  /**
   * The card's gutter — how far its content sits from the edge.
   *
   * **A register's margin is a design decision, and for a long time it was an
   * accident.** `0.08` was the number in the example box in
   * `docs/authoring-a-block.md` §2 — an illustration of what a `box` field looks
   * like, attached to an element called `name` — and it became 19% of every
   * element position in this library, the most common value by a factor of two.
   * Paired with `width: 0.84` it is one fixed 8% gutter on almost every card,
   * which is most of why twenty-five structures read as one card in costumes.
   *
   * Editorial wants air; compact and full-bleed want almost none. Omitted still
   * means 0.08, because that is what most drawn cards use and this is a dial
   * rather than a migration.
   */
  inset?: number
  /**
   * The tier pill's colour, when the tier's own would disappear.
   *
   * A chip defaults to the promo tier's token, which is one of the shop's brand
   * colours — and on a card grounded in a brand colour those can be the *same*
   * colour. The gallery showed a "Half price" pill in the primary colour sitting
   * on a primary-grounded card, held together only by its white label. Every
   * tinted card therefore names a neutral here: the tier's hue is already
   * unreadable on that ground, so what is lost was not being seen anyway.
   */
  chipFill?: TokenRef
}

/** Bound text on this skin. Product strings only; static copy inverts already. */
const ink = (skin: Skin): { color?: TokenRef } => (skin.onTint ? { color: 'surface' } : {})

/** A caption on this skin. Muted on white, and a shade under white on a tint. */
const muted = (skin: Skin): { color?: TokenRef; opacity?: number } =>
  skin.onTint ? { color: 'surface', opacity: 0.82 } : {}

/** The tier pill, in the skin's colour rather than always in the tier's. */
const badge = (
  skin: Skin,
  b: Box,
  anchor?: 'TOP_START' | 'TOP_END' | 'INLINE',
  options: { shape?: 'none' | 'pill' | 'burst' | 'ribbon' | 'tag'; ink?: TokenRef } = {}
) => chip(b, anchor ?? 'TOP_START', skin.chipFill, options)

/**
 * The brand, in small caps above the product name.
 *
 * **Six of the seven reference cards set it exactly this way** — one grey line
 * of letterspaced capitals, a third the size of the name, directly above it. It
 * was written out longhand on three cards here and absent from the rest; as a
 * factory it is one line at the call site, which is the difference between a
 * treatment the library has and one it remembers to apply.
 *
 * `caption` rather than a size: the level is what the fit ladder steps down
 * from, and a brand that has to shrink should shrink on the shop's own scale.
 */
const brandLine = (
  skin: Skin,
  b: Box,
  options: { align?: LogicalAlign; color?: TokenRef } = {}
): BlockElement =>
  bound('brand', b, 'caption', {
    // **A colour, when the line does not sit on the card's own ground.** The
    // skin's muted ink is right everywhere except inside a band the structure
    // painted, where it resolves to grey on a saturated colour — which the
    // gallery found on `nameBand`, a brand line the shop would never have seen
    // and nothing would have reported.
    ...(options.color === undefined ? muted(skin) : { color: options.color, opacity: 0.85 }),
    transform: 'uppercase',
    letterSpacing: 0.08,
    ...(options.align === undefined ? {} : { align: options.align }),
  })

/**
 * The detail block under the name — variant, weight, pack count.
 *
 * **Three lines, clamped.** The discounter reference gives this more space than
 * anything on the card except the photograph, and the library gave it a single
 * 6%-tall caption that a two-clause spec truncated on contact. Clamping rather
 * than shrinking is what keeps a long spec from stealing the name's size: the
 * fit ladder shrinks what it is given, and what it is given here is a fixed
 * number of lines.
 */
const detail = (skin: Skin, b: Box, lines = 2, align?: LogicalAlign): BlockElement =>
  bound('spec', b, 'caption', {
    ...muted(skin),
    overflow: { mode: 'clamp', lines },
    ...(align === undefined ? {} : { align }),
  })

/**
 * The gutter this skin asks for, and the measure that follows from it.
 *
 * Two numbers rather than one because they are the same decision: content that
 * starts at `inset` and ends at `inset` is `1 - 2 × inset` wide. Writing them
 * separately is how `0.08` and `0.84` became two independent constants that
 * always travelled together.
 */
const gut = (skin: Skin) => skin.inset ?? 0.08
const measure = (skin: Skin) => 1 - 2 * gut(skin)

const base = (skin: Skin): BlockElement =>
  ground(skin.ground, {
    ...(skin.radius === undefined ? {} : { radius: skin.radius }),
    ...(skin.stroke === undefined ? {} : { stroke: skin.stroke }),
  })

/**
 * A price that ends the card at the trailing edge rather than across it.
 *
 * The discounter references all do this — the mark occupies the last two fifths
 * of the foot and the space before it is left empty, which is what makes a
 * column of them scan as a price list. A full-measure box centres the digits in
 * dead space and lands every card's number in a different place.
 */
const endPrice = (b: Box, style?: PriceMarkStyle): BlockElement =>
  price(b, {
    ...(style ?? {}),
    recipe: { align: { inline: 'end', block: 'middle' }, ...(style?.recipe ?? {}) },
  })

/** The same, flush to the leading edge — the flyer's saturated price block. */
const startPrice = (b: Box, style?: PriceMarkStyle): BlockElement =>
  price(b, {
    ...(style ?? {}),
    recipe: { align: { inline: 'start', block: 'middle' }, ...(style?.recipe ?? {}) },
  })

// ─── Structure 1: stacked ─────────────────────────────────────────────────────

/**
 * Packshot, brand, name, detail, price. The one every flyer starts from.
 *
 * **Redrawn against the discounter reference, and two things moved.** The price
 * no longer runs the full measure: it sits in the last half of the foot, flush
 * to the trailing edge, with the space before it left empty — which is what
 * makes a column of these scan as a price list rather than as twelve separate
 * objects. And the detail block gets two lines instead of one, because a
 * discounter card gives variant, weight and pack count more room than anything
 * but the photograph.
 *
 * **No chip.** The tier rides the mark's own attached tab, which is the quietest
 * reference card exactly: a small coloured flag welded to the price and no badge
 * anywhere else. It is also why this card can carry a tab at all — a chip and a
 * tab both draw the tier, and `duplicate-tier` is a warning a shipped block may
 * not have.
 *
 * The name box is **19% of the card height, not 13%**. It was designed at the
 * friendly case first and the fit ladder escalated on every long Arabic product
 * in the catalog — E6 §5 is explicit that designing at the friendly case is the
 * wrong direction.
 */
export const stacked = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(gut(skin), 0.06, measure(skin), 0.33)),
    brandLine(skin, box(gut(skin), 0.43, measure(skin), 0.05)),
    bound('name', box(gut(skin), 0.49, measure(skin), 0.19), 'h3', ink(skin)),
    detail(skin, box(gut(skin), 0.68, measure(skin), 0.1)),
    endPrice(box(0.4, 0.79, 0.52, 0.17), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(gut(skin), 0.07, measure(skin), 0.31)),
    brandLine(skin, box(gut(skin), 0.42, measure(skin), 0.05)),
    bound('name', box(gut(skin), 0.48, measure(skin), 0.19), 'h3', ink(skin)),
    detail(skin, box(gut(skin), 0.67, measure(skin), 0.1)),
    endPrice(box(0.38, 0.78, 0.54, 0.18), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0.04, 0.1, 0.28, 0.8)),
    brandLine(skin, box(0.36, 0.14, 0.34, 0.09)),
    bound('name', box(0.36, 0.25, 0.34, 0.28), 'h3', ink(skin)),
    detail(skin, box(0.36, 0.55, 0.34, 0.22)),
    endPrice(box(0.72, 0.26, 0.25, 0.48), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.12, 0.13, 0.76)),
    brandLine(skin, box(0.17, 0.18, 0.4, 0.14)),
    bound('name', box(0.17, 0.34, 0.4, 0.28), 'h3', ink(skin)),
    detail(skin, box(0.17, 0.64, 0.4, 0.18), 1),
    endPrice(box(0.66, 0.2, 0.31, 0.6), skin.price),
  ]),
]

// ─── Structure 2: top ribbon ──────────────────────────────────────────────────

/**
 * A coloured bar across the head carrying the promotion, and a price block at
 * the foot.
 *
 * **The German weekly's card, and the one the library had no answer for.** The
 * promotion is named in words on a saturated bar — *weekend highlight*, *deal of
 * the day* — rather than abbreviated into a pill over the packshot, and the
 * price is a solid block at the leading edge rather than a tag. Both halves are
 * what makes the register: the bar is a horizontal the eye runs along across a
 * whole page of cards, and the block is the only thing on the card with a
 * saturated ground, so it is found before anything else.
 *
 * The badge draws **no shape of its own** — the bar is already its ground, and a
 * pill inside a bar is a box in a box. That is also what lets the price block
 * exist: with the tier drawn once, here, the mark is free to be pure colour.
 */
export const topRibbon = (skin: Skin): Arrangement[] => {
  const band = skin.accent ?? 'primary'
  // The mark keeps the skin's preset and takes the band's colours — `markOn`
  // last, so a skin cannot accidentally hand the tab back and draw the tier
  // twice on the one card whose whole head is the tier.
  const blockMark: PriceMarkStyle = { ...(skin.price ?? {}), ...markOn('box', band) }
  const label = (b: Box): BlockElement =>
    badge(skin, b, 'INLINE', { shape: 'none', ink: 'surface' })
  return [
    at(TALL, [
      base(skin),
      panel('ribbon', box(0, 0, 1, 0.105), band, { radius: 0 }),
      label(box(0.05, 0.014, 0.9, 0.077)),
      photo(box(gut(skin), 0.15, measure(skin), 0.32)),
      brandLine(skin, box(gut(skin), 0.5, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.56, measure(skin), 0.18), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.75, measure(skin), 0.06), 1),
      startPrice(box(gut(skin), 0.82, 0.54, 0.15), blockMark),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('ribbon', box(0, 0, 1, 0.115), band, { radius: 0 }),
      label(box(0.05, 0.016, 0.9, 0.083)),
      photo(box(gut(skin), 0.16, measure(skin), 0.3)),
      brandLine(skin, box(gut(skin), 0.49, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.55, measure(skin), 0.18), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.74, measure(skin), 0.06), 1),
      startPrice(box(gut(skin), 0.81, 0.56, 0.16), blockMark),
    ]),
    at(WIDE, [
      base(skin),
      panel('ribbon', box(0, 0, 1, 0.17), band, { radius: 0 }),
      label(box(0.04, 0.025, 0.92, 0.12)),
      photo(box(0.04, 0.24, 0.26, 0.68)),
      brandLine(skin, box(0.34, 0.26, 0.3, 0.09)),
      bound('name', box(0.34, 0.37, 0.3, 0.26), 'h3', ink(skin)),
      detail(skin, box(0.34, 0.65, 0.3, 0.13), 1),
      startPrice(box(0.68, 0.3, 0.29, 0.42), blockMark),
    ]),
    at(BANNER, [
      base(skin),
      panel('ribbon', box(0, 0, 1, 0.2), band, { radius: 0 }),
      label(box(0.03, 0.03, 0.94, 0.14)),
      photo(box(0.02, 0.28, 0.11, 0.62)),
      brandLine(skin, box(0.16, 0.3, 0.36, 0.13)),
      bound('name', box(0.16, 0.45, 0.36, 0.34), 'h3', ink(skin)),
      startPrice(box(0.6, 0.32, 0.37, 0.48), blockMark),
    ]),
  ]
}

// ─── Structure 3: deal frame ──────────────────────────────────────────────────

/**
 * Bars at the head and the foot, the product between them, the price in the
 * foot bar.
 *
 * **The deal-of-the-day frame.** A card bracketed top and bottom reads as a
 * unit at a glance even in a grid with no gutters, which is the problem a
 * carousel or a five-across page actually has — and it is the one structure
 * here that puts the price *inside* furniture at the foot rather than on the
 * ground of the card.
 *
 * `wide-band` in the foot: the bar gives the mark a box four times wider than
 * it is tall, which is the shape that preset exists for, and the stacked
 * treatments waste it.
 */
export const dealFrame = (skin: Skin): Arrangement[] => {
  const band = skin.accent ?? 'primary'
  const footMark: PriceMarkStyle = {
    ...REVERSED_PRICE,
    ...(skin.price ?? {}),
    preset: 'wide-band',
    tab: 'none',
  }
  const label = (b: Box): BlockElement =>
    badge(skin, b, 'INLINE', { shape: 'none', ink: 'surface' })
  return [
    at(TALL, [
      base(skin),
      panel('cap', box(0, 0, 1, 0.08), band, { radius: 0 }),
      label(box(0.05, 0.008, 0.9, 0.062)),
      photo(box(gut(skin), 0.12, measure(skin), 0.3)),
      brandLine(skin, box(gut(skin), 0.45, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.51, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.69, measure(skin), 0.07), 1),
      panel('foot', box(0, 0.79, 1, 0.21), band, { radius: 0 }),
      price(box(0.06, 0.82, 0.88, 0.15), footMark),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('cap', box(0, 0, 1, 0.09), band, { radius: 0 }),
      label(box(0.05, 0.01, 0.9, 0.07)),
      photo(box(gut(skin), 0.13, measure(skin), 0.28)),
      brandLine(skin, box(gut(skin), 0.44, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.5, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.68, measure(skin), 0.07), 1),
      panel('foot', box(0, 0.78, 1, 0.22), band, { radius: 0 }),
      price(box(0.06, 0.81, 0.88, 0.16), footMark),
    ]),
    at(WIDE, [
      base(skin),
      panel('cap', box(0, 0, 1, 0.14), band, { radius: 0 }),
      label(box(0.04, 0.02, 0.92, 0.1)),
      photo(box(0.04, 0.2, 0.26, 0.5)),
      brandLine(skin, box(0.34, 0.22, 0.3, 0.09)),
      bound('name', box(0.34, 0.33, 0.3, 0.24), 'h3', ink(skin)),
      detail(skin, box(0.34, 0.59, 0.3, 0.11), 1),
      panel('foot', box(0, 0.74, 1, 0.26), band, { radius: 0 }),
      price(box(0.06, 0.78, 0.88, 0.18), footMark),
    ]),
    at(BANNER, [
      base(skin),
      panel('cap', box(0, 0, 1, 0.18), band, { radius: 0 }),
      label(box(0.03, 0.025, 0.94, 0.13)),
      photo(box(0.02, 0.24, 0.1, 0.44)),
      brandLine(skin, box(0.15, 0.26, 0.34, 0.12)),
      bound('name', box(0.15, 0.4, 0.34, 0.26), 'h3', ink(skin)),
      panel('foot', box(0, 0.72, 1, 0.28), band, { radius: 0 }),
      price(box(0.05, 0.76, 0.9, 0.2), footMark),
    ]),
  ]
}

// ─── Structure 4: price pill ──────────────────────────────────────────────────

/**
 * The quick-commerce tile: a tinted plate behind the packshot, the brand in
 * caps, a two-line name, and the price as a filled pill with the was-price
 * struck beside it.
 *
 * **The one register drawn from an app rather than from paper**, and worth
 * having because a shop's WhatsApp audience has seen a thousand of these and
 * none of a German weekly. Two details carry it: the price is a *pill*, not a
 * tag and not bare digits, and the compare price sits **beside** it rather than
 * above or below — which is the arrangement every Gulf delivery app uses and the
 * one the library could not express until the mark's recipe opened.
 *
 * The plate is a tint at low opacity rather than a second ground: a packshot
 * shot on white needs an edge, and a saturated plate behind a photograph with
 * its own white background is two whites and a border.
 */
export const pricePill = (skin: Skin): Arrangement[] => {
  const tint = skin.accent ?? 'accent'
  const pill: PriceMarkStyle = {
    ...(skin.price ?? {}),
    ...markOn('box', tint),
    recipe: { compare: { place: 'end', scale: 0.42 }, ...(skin.price?.recipe ?? {}) },
  }
  return [
    at(TALL, [
      base(skin),
      panel('plate', box(0.04, 0.04, 0.92, 0.36), tint, { opacity: 0.12, radius: 8 }),
      photo(box(0.11, 0.07, 0.78, 0.3)),
      badge(skin, box(0.03, 0.02, 0.34, 0.08)),
      brandLine(skin, box(gut(skin), 0.45, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.51, measure(skin), 0.19), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(gut(skin), 0.71, measure(skin), 0.06), 1),
      startPrice(box(gut(skin), 0.79, 0.68, 0.15), pill),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('plate', box(0.04, 0.04, 0.92, 0.34), tint, { opacity: 0.12, radius: 8 }),
      photo(box(0.12, 0.07, 0.76, 0.28)),
      badge(skin, box(0.03, 0.02, 0.32, 0.09)),
      brandLine(skin, box(gut(skin), 0.43, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.49, measure(skin), 0.19), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(gut(skin), 0.69, measure(skin), 0.06), 1),
      startPrice(box(gut(skin), 0.78, 0.7, 0.16), pill),
    ]),
    at(WIDE, [
      base(skin),
      panel('plate', box(0.03, 0.06, 0.34, 0.88), tint, { opacity: 0.12, radius: 8 }),
      photo(box(0.06, 0.12, 0.28, 0.76)),
      badge(skin, box(0.02, 0.03, 0.18, 0.13)),
      brandLine(skin, box(0.41, 0.14, 0.32, 0.09)),
      bound('name', box(0.41, 0.25, 0.32, 0.26), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(0.41, 0.53, 0.32, 0.12), 1),
      startPrice(box(0.41, 0.68, 0.56, 0.22), pill),
    ]),
    at(BANNER, [
      base(skin),
      panel('plate', box(0.015, 0.08, 0.16, 0.84), tint, { opacity: 0.12, radius: 8 }),
      photo(box(0.03, 0.14, 0.13, 0.72)),
      brandLine(skin, box(0.2, 0.2, 0.34, 0.14)),
      bound('name', box(0.2, 0.36, 0.34, 0.3), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      startPrice(box(0.6, 0.26, 0.37, 0.48), pill),
    ]),
  ]
}

// ─── Structure 5: price band ──────────────────────────────────────────────────

/**
 * A coloured band across the foot of the card, and the price sits in it.
 *
 * The single most common treatment in a printed weekly, and the reason is
 * mechanical: a band is a horizontal line the eye can run along, so twelve cards
 * on a page become one price list rather than twelve separate objects. The mark
 * loses its tag and reverses out, because a tag inside a band is a box in a box.
 */
export const priceBand = (skin: Skin): Arrangement[] => {
  const band = skin.accent ?? 'primary'
  /**
   * The reversed mark, with the block's own skin over it.
   *
   * `REVERSED_PRICE` is a constant, so before this the skin could say nothing
   * about the mark on the one card whose whole subject is the price.
   */
  const mark: PriceMarkStyle = { ...REVERSED_PRICE, ...(skin.price ?? {}), tab: 'none' }
  /**
   * **A preset is per element, not per block, and this card is why.**
   *
   * In the two upright arrangements the band runs along the foot and the mark
   * gets a box about four times wider than it is tall — which is exactly what
   * `wide-band` is for, and what a stacked treatment wastes. In the wide and
   * banner arrangements the band stands on end and the same mark gets a tall
   * narrow strip, where `wide-band` would be the wrong answer to a different
   * shape. The `Skin` cannot express that; the call site can.
   */
  const bandMark: PriceMarkStyle = { ...mark, preset: 'wide-band' }
  return [
    at(TALL, [
      base(skin),
      photo(box(gut(skin), 0.07, measure(skin), 0.33)),
      badge(skin, box(0.04, 0.03, 0.34, 0.09)),
      brandLine(skin, box(gut(skin), 0.44, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.5, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.68, measure(skin), 0.06), 1),
      panel('band', box(0, 0.76, 1, 0.24), band, { radius: 0 }),
      price(box(0.06, 0.79, 0.88, 0.18), bandMark),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(gut(skin), 0.06, measure(skin), 0.31)),
      badge(skin, box(0.04, 0.03, 0.32, 0.1)),
      brandLine(skin, box(gut(skin), 0.42, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.48, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.66, measure(skin), 0.06), 1),
      panel('band', box(0, 0.74, 1, 0.26), band, { radius: 0 }),
      price(box(0.06, 0.77, 0.88, 0.2), bandMark),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.08, 0.28, 0.84)),
      badge(skin, box(0.02, 0.04, 0.16, 0.15)),
      brandLine(skin, box(0.35, 0.14, 0.3, 0.09)),
      bound('name', box(0.35, 0.25, 0.3, 0.26), 'h3', ink(skin)),
      detail(skin, box(0.35, 0.53, 0.3, 0.14), 1),
      panel('band', box(0.68, 0, 0.32, 1), band, { radius: 0 }),
      price(box(0.7, 0.2, 0.28, 0.6), mark),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.1, 0.12, 0.8)),
      brandLine(skin, box(0.16, 0.18, 0.42, 0.13)),
      bound('name', box(0.16, 0.33, 0.42, 0.3), 'h3', ink(skin)),
      detail(skin, box(0.16, 0.65, 0.42, 0.16), 1),
      panel('band', box(0.62, 0, 0.38, 1), band, { radius: 0 }),
      price(box(0.65, 0.18, 0.32, 0.64), mark),
    ]),
  ]
}

// ─── Structure 6: name band ───────────────────────────────────────────────────

/**
 * The colour band sits behind the **product line**, and the price is left plain.
 *
 * The inversion of `priceBand`, and the reason to have both is that they suit
 * opposite catalogs. A band behind the price is right when the number is the
 * news; a band behind the name is right when the *product* is — a named cut of
 * meat, a brand a shop has just started carrying — and the price then reads as
 * information rather than as a shout.
 */
export const nameBand = (skin: Skin): Arrangement[] => {
  const band = skin.accent ?? 'primary'
  return [
    at(TALL, [
      base(skin),
      photo(box(gut(skin), 0.06, measure(skin), 0.32)),
      badge(skin, box(0.04, 0.02, 0.34, 0.09)),
      panel('band', box(0, 0.42, 1, 0.2), band, { radius: 0 }),
      brandLine(skin, box(0.07, 0.443, 0.86, 0.045), { color: 'surface' }),
      bound('name', box(0.07, 0.495, 0.86, 0.11), 'h3', { color: 'surface' }),
      detail(skin, box(gut(skin), 0.67, measure(skin), 0.1)),
      endPrice(box(0.4, 0.79, 0.52, 0.16), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(gut(skin), 0.06, measure(skin), 0.3)),
      badge(skin, box(0.04, 0.02, 0.32, 0.1)),
      panel('band', box(0, 0.4, 1, 0.21), band, { radius: 0 }),
      brandLine(skin, box(0.07, 0.423, 0.86, 0.05), { color: 'surface' }),
      bound('name', box(0.07, 0.483, 0.86, 0.11), 'h3', { color: 'surface' }),
      detail(skin, box(gut(skin), 0.66, measure(skin), 0.1)),
      endPrice(box(0.38, 0.78, 0.54, 0.17), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.1, 0.26, 0.8)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      panel('band', box(0.32, 0.12, 0.66, 0.34), band, { radius: 0 }),
      brandLine(skin, box(0.35, 0.15, 0.6, 0.07), { color: 'surface' }),
      bound('name', box(0.35, 0.24, 0.6, 0.2), 'h3', { color: 'surface' }),
      detail(skin, box(0.32, 0.52, 0.34, 0.2)),
      endPrice(box(0.68, 0.54, 0.3, 0.32), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.12, 0.11, 0.76)),
      panel('band', box(0.15, 0.16, 0.48, 0.34), band, { radius: 0 }),
      brandLine(skin, box(0.17, 0.19, 0.44, 0.1), { color: 'surface' }),
      bound('name', box(0.17, 0.3, 0.44, 0.17), 'h3', { color: 'surface' }),
      detail(skin, box(0.15, 0.56, 0.44, 0.22), 1),
      endPrice(box(0.66, 0.2, 0.31, 0.6), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 7: price burst ─────────────────────────────────────────────────

/**
 * The price in a burst that overlaps the packshot. The supermarket price bomb.
 *
 * The loudest thing in the library and the one to use sparingly — a page of
 * twelve bursts is a page with no hierarchy at all. Pair one of these with
 * `compact` around it and the lead deal is found in half a second.
 */
export const burst = (skin: Skin): Arrangement[] => {
  const dot = skin.accent ?? 'accent'
  // Same gap as `priceBand` above: `markOn` built the skin from scratch, so the
  // block could not say anything about the mark it is named after.
  const mark: PriceMarkStyle = { ...(skin.price ?? {}), ...markOn('burst', dot) }
  return [
    at(TALL, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.42)),
      badge(skin, box(0.03, 0.02, 0.32, 0.09)),
      price(box(0.55, 0.26, 0.41, 0.31), mark),
      brandLine(skin, box(gut(skin), 0.58, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.64, measure(skin), 0.19), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.85, measure(skin), 0.09)),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.4)),
      badge(skin, box(0.03, 0.02, 0.32, 0.1)),
      price(box(0.55, 0.24, 0.41, 0.32), mark),
      brandLine(skin, box(gut(skin), 0.57, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.63, measure(skin), 0.19), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.84, measure(skin), 0.1)),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.08, 0.32, 0.84)),
      badge(skin, box(0.02, 0.04, 0.16, 0.15)),
      brandLine(skin, box(0.38, 0.16, 0.28, 0.09)),
      bound('name', box(0.38, 0.27, 0.28, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.38, 0.57, 0.28, 0.16)),
      price(box(0.67, 0.14, 0.31, 0.72), mark),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.1, 0.13, 0.8)),
      brandLine(skin, box(0.17, 0.2, 0.42, 0.13)),
      bound('name', box(0.17, 0.35, 0.42, 0.3), 'h3', ink(skin)),
      detail(skin, box(0.17, 0.67, 0.42, 0.16), 1),
      price(box(0.65, 0.1, 0.33, 0.8), mark),
    ]),
  ]
}

// ─── Structure 8: price bomb ──────────────────────────────────────────────────

/**
 * The mark at a third of the card, on a disc, with everything else deferring.
 *
 * `burst` overlaps the packshot with a badge-sized price; this one **is** the
 * price and gives the photograph what is left. The distinction is worth two
 * blocks because they belong on different pages: a burst is one loud card among
 * quiet ones, and a bomb is the whole of a half-page advertisement.
 */
export const priceBomb = (skin: Skin): Arrangement[] => {
  const dot = skin.accent ?? 'accent'
  const mark: PriceMarkStyle = {
    ...(skin.price ?? {}),
    ...markOn('burst', dot),
    preset: 'price-bomb',
  }
  return [
    at(TALL, [
      base(skin),
      photo(box(0.1, 0.05, 0.8, 0.28)),
      badge(skin, box(0.03, 0.02, 0.32, 0.08)),
      price(box(0.12, 0.34, 0.76, 0.34), mark),
      brandLine(skin, box(gut(skin), 0.71, measure(skin), 0.05), { align: 'center' }),
      bound('name', box(gut(skin), 0.77, measure(skin), 0.17), 'h3', {
        ...ink(skin),
        align: 'center',
      }),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.12, 0.05, 0.76, 0.26)),
      badge(skin, box(0.03, 0.02, 0.32, 0.09)),
      price(box(0.16, 0.32, 0.68, 0.36), mark),
      brandLine(skin, box(gut(skin), 0.71, measure(skin), 0.05), { align: 'center' }),
      bound('name', box(gut(skin), 0.77, measure(skin), 0.17), 'h3', {
        ...ink(skin),
        align: 'center',
      }),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.04, 0.12, 0.26, 0.76)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      price(box(0.58, 0.08, 0.4, 0.84), mark),
      brandLine(skin, box(0.34, 0.24, 0.22, 0.1)),
      bound('name', box(0.34, 0.36, 0.22, 0.32), 'h3', ink(skin)),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.12, 0.12, 0.76)),
      brandLine(skin, box(0.17, 0.24, 0.34, 0.12)),
      bound('name', box(0.17, 0.38, 0.34, 0.3), 'h3', ink(skin)),
      price(box(0.56, 0.06, 0.42, 0.88), mark),
    ]),
  ]
}

// ─── Structure 9: corner flag ─────────────────────────────────────────────────

/**
 * A band tilted across the corner with the price reversed out of it.
 *
 * The electronics-deal and forecourt convention: the flag is read as a sticker
 * applied *over* the card, which is why it is the one place in the library
 * something is drawn at an angle. The tier keeps a chip of its own at the far
 * corner, because a flag already carrying a price cannot also carry a word.
 *
 * **The boxes stay inside the block and the drawing does not.** Rotation is
 * about an element's own centre, so a band whose box ends at the edge sweeps
 * past it once turned — which is the overhang the design wants, and not
 * something `validateBlock` measures. Push the box itself outside and the
 * warning is real.
 */
export const cornerFlag = (skin: Skin): Arrangement[] => {
  const band = skin.accent ?? 'primary'
  const mark: PriceMarkStyle = {
    ...REVERSED_PRICE,
    ...(skin.price ?? {}),
    tab: 'none',
    preset: 'wide-band',
  }
  return [
    at(TALL, [
      base(skin),
      photo(box(0.08, 0.32, 0.84, 0.25)),
      panel('flag', box(0, 0.06, 0.56, 0.17), band, { rotation: -20, radius: 0 }),
      price(box(0.015, 0.075, 0.53, 0.14), mark, { rotation: -20 }),
      badge(skin, box(0.64, 0.02, 0.34, 0.08), 'TOP_END'),
      brandLine(skin, box(gut(skin), 0.6, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.66, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.85, measure(skin), 0.1)),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.1, 0.33, 0.8, 0.22)),
      panel('flag', box(0, 0.065, 0.56, 0.18), band, { rotation: -18, radius: 0 }),
      price(box(0.015, 0.08, 0.53, 0.15), mark, { rotation: -18 }),
      badge(skin, box(0.64, 0.02, 0.34, 0.09), 'TOP_END'),
      brandLine(skin, box(gut(skin), 0.58, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.64, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.83, measure(skin), 0.11)),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.05, 0.14, 0.28, 0.74)),
      panel('flag', box(0, 0.06, 0.34, 0.2), band, { rotation: -26, radius: 0 }),
      price(box(0.015, 0.08, 0.31, 0.16), mark, { rotation: -26 }),
      badge(skin, box(0.82, 0.04, 0.16, 0.13), 'TOP_END'),
      brandLine(skin, box(0.38, 0.22, 0.34, 0.09)),
      bound('name', box(0.38, 0.33, 0.34, 0.26), 'h3', ink(skin)),
      detail(skin, box(0.38, 0.61, 0.34, 0.16)),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.03, 0.14, 0.13, 0.72)),
      panel('flag', box(0, 0.08, 0.2, 0.3), band, { rotation: -20, radius: 0 }),
      price(box(0.01, 0.11, 0.18, 0.24), mark, { rotation: -20 }),
      brandLine(skin, box(0.24, 0.22, 0.36, 0.13)),
      bound('name', box(0.24, 0.37, 0.36, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.24, 0.67, 0.36, 0.16), 1),
    ]),
  ]
}

// ─── Structure 10: feature ────────────────────────────────────────────────────

/**
 * The lead deal: brand line, big name, big price, room around all three.
 *
 * Designed for a merged 2×2, which is where a weekly puts the product it is
 * actually advertising. `h2` on the name and a mark given a fifth of the card
 * are the whole design — a feature card that carries more than a lesser one is
 * not a feature, it is a bigger card.
 */
export const feature = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    badge(skin, box(0.04, 0.03, 0.3, 0.07)),
    photo(box(gut(skin), 0.1, measure(skin), 0.36)),
    brandLine(skin, box(gut(skin), 0.49, measure(skin), 0.06)),
    bound('name', box(gut(skin), 0.56, measure(skin), 0.18), 'h2', ink(skin)),
    detail(skin, box(gut(skin), 0.75, measure(skin), 0.06), 1),
    endPrice(box(0.36, 0.82, 0.56, 0.14), noTab(skin)),
  ]),
  at(SQUARISH, [
    base(skin),
    badge(skin, box(0.04, 0.03, 0.28, 0.08)),
    photo(box(0.1, 0.08, 0.8, 0.4)),
    brandLine(skin, box(0.1, 0.5, 0.8, 0.06)),
    bound('name', box(0.1, 0.57, 0.8, 0.18), 'h2', ink(skin)),
    detail(skin, box(0.1, 0.76, 0.8, 0.06), 1),
    endPrice(box(0.36, 0.82, 0.56, 0.14), noTab(skin)),
  ]),
  at(WIDE, [
    base(skin),
    badge(skin, box(0.02, 0.04, 0.16, 0.13)),
    photo(box(0.04, 0.08, 0.4, 0.84)),
    brandLine(skin, box(0.48, 0.14, 0.28, 0.08)),
    bound('name', box(0.48, 0.23, 0.28, 0.3), 'h2', ink(skin)),
    detail(skin, box(0.48, 0.55, 0.28, 0.14)),
    endPrice(box(0.78, 0.24, 0.19, 0.52), noTab(skin)),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.08, 0.2, 0.84)),
    brandLine(skin, box(0.25, 0.18, 0.34, 0.12)),
    bound('name', box(0.25, 0.31, 0.34, 0.34), 'h2', ink(skin)),
    detail(skin, box(0.25, 0.66, 0.34, 0.16), 1),
    endPrice(box(0.63, 0.16, 0.34, 0.68), noTab(skin)),
  ]),
]

// ─── Structure 11: ticket ─────────────────────────────────────────────────────

/**
 * A tab across the head of the card with the tier sitting in it.
 *
 * The shelf-talker shape, brought onto the page. Moving the chip off the
 * packshot and into a tab of its own is what makes this work at small sizes: a
 * pill over a photograph is the first thing that becomes unreadable in a 5×6
 * grid, and a full-width strip is the last.
 *
 * **The tab is a neutral, never a brand colour, and that is not a preference.**
 * The pill draws in the promo tier's own token, which is one of the shop's brand
 * colours — so a tab in `primary` under a tier whose token is `primary` is a
 * pill that vanishes into it. The gallery showed exactly that. Ink or surface
 * contrast with all three brand roles, whichever the shop picked.
 */
export const ticket = (skin: Skin): Arrangement[] => {
  const tab = skin.accent ?? 'ink'
  return [
    at(TALL, [
      base(skin),
      panel('tab', box(0, 0, 1, 0.13), tab, { radius: 0 }),
      badge(skin, box(0.06, 0.025, 0.5, 0.08), 'INLINE'),
      photo(box(gut(skin), 0.17, measure(skin), 0.31)),
      brandLine(skin, box(gut(skin), 0.51, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.57, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.75, measure(skin), 0.06), 1),
      endPrice(box(0.4, 0.82, 0.52, 0.15), markAs(skin, 'tag')),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('tab', box(0, 0, 1, 0.14), tab, { radius: 0 }),
      badge(skin, box(0.06, 0.03, 0.46, 0.08), 'INLINE'),
      photo(box(gut(skin), 0.18, measure(skin), 0.28)),
      brandLine(skin, box(gut(skin), 0.49, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.55, measure(skin), 0.17), 'h3', ink(skin)),
      detail(skin, box(gut(skin), 0.73, measure(skin), 0.06), 1),
      endPrice(box(0.38, 0.81, 0.54, 0.16), markAs(skin, 'tag')),
    ]),
    at(WIDE, [
      base(skin),
      panel('tab', box(0, 0, 1, 0.2), tab, { radius: 0 }),
      badge(skin, box(0.04, 0.045, 0.3, 0.11), 'INLINE'),
      photo(box(0.04, 0.26, 0.26, 0.66)),
      brandLine(skin, box(0.34, 0.28, 0.32, 0.09)),
      bound('name', box(0.34, 0.39, 0.32, 0.24), 'h3', ink(skin)),
      detail(skin, box(0.34, 0.65, 0.32, 0.13), 1),
      endPrice(box(0.7, 0.32, 0.27, 0.5), markAs(skin, 'tag')),
    ]),
    at(BANNER, [
      base(skin),
      panel('tab', box(0, 0, 0.14, 1), tab, { radius: 0 }),
      badge(skin, box(0.015, 0.42, 0.11, 0.16), 'INLINE'),
      photo(box(0.17, 0.12, 0.12, 0.76)),
      brandLine(skin, box(0.31, 0.2, 0.34, 0.13)),
      bound('name', box(0.31, 0.35, 0.34, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.31, 0.65, 0.34, 0.16), 1),
      endPrice(box(0.68, 0.18, 0.29, 0.64), markAs(skin, 'tag')),
    ]),
  ]
}

// ─── Structure 12: compact ────────────────────────────────────────────────────

/**
 * Name and price, nothing else. The 5×6 page.
 *
 * The spec line is **absent rather than small**: at this size it would set at
 * four or five pixels in print, which is a line nobody reads occupying space the
 * name needs. Density is derived from track count — composition model §4.3 — so
 * the honest answer to a dense grid is a block with less in it, not a block with
 * the same things shrunk. The brand goes with it, for the same reason.
 */
export const compact = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0.06, 0.05, 0.88, 0.36)),
    badge(skin, box(0.02, 0.02, 0.34, 0.1)),
    bound('name', box(0.06, 0.45, 0.88, 0.22), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    endPrice(box(0.3, 0.72, 0.64, 0.22), noTab(skin)),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0.06, 0.06, 0.88, 0.34)),
    badge(skin, box(0.02, 0.02, 0.32, 0.11)),
    bound('name', box(0.06, 0.44, 0.88, 0.22), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    endPrice(box(0.3, 0.7, 0.64, 0.24), noTab(skin)),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0.03, 0.1, 0.3, 0.8)),
    badge(skin, box(0.02, 0.04, 0.16, 0.15)),
    bound('name', box(0.36, 0.22, 0.3, 0.34), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    endPrice(box(0.68, 0.2, 0.29, 0.6), noTab(skin)),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.12, 0.13, 0.76)),
    bound('name', box(0.18, 0.28, 0.42, 0.4), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    endPrice(box(0.65, 0.18, 0.32, 0.64), noTab(skin)),
  ]),
]

// ─── Structure 13: list row ───────────────────────────────────────────────────

/**
 * A line item: thumbnail, name, price at the end, a rule underneath.
 *
 * The block for the last page — the thirty lines a shop wants *listed* rather
 * than sold — and the wide and banner shapes are the ones it is for.
 *
 * **It carries the tall and square shapes anyway, and the gallery is why.** Two
 * arrangements looked like the honest answer: a list row in a tall cell is not a
 * list row. But `pickArrangement` never fails — it falls back to the nearest
 * range — so what an owner actually got when they dropped this into a normal
 * cell was the wide layout crushed into a portrait box: a thumbnail stretched
 * into a vertical strip, a price mark two characters wide, and the product name
 * escalated red by the fit ladder. Refusing to design a shape does not stop the
 * shape happening; it only stops anyone deciding what it looks like. So the tall
 * and square arrangements reflow into a small card, which is what a line item
 * *is* when the region is portrait.
 */
export const listRow = (skin: Skin, ruled: boolean): Arrangement[] => {
  const trailing = ruled ? [rule('divider', box(0.03, 0.965, 0.94, 0.006), 'inkMuted')] : []
  return [
    at(TALL, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.3)),
      badge(skin, box(0.03, 0.03, 0.36, 0.09)),
      bound('name', box(gut(skin), 0.42, measure(skin), 0.2), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(gut(skin), 0.64, measure(skin), 0.1)),
      endPrice(box(0.36, 0.77, 0.56, 0.16), markAs(skin, 'none')),
      ...trailing,
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.28)),
      badge(skin, box(0.03, 0.03, 0.34, 0.1)),
      bound('name', box(gut(skin), 0.4, measure(skin), 0.2), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(gut(skin), 0.62, measure(skin), 0.1)),
      endPrice(box(0.34, 0.76, 0.58, 0.17), markAs(skin, 'none')),
      ...trailing,
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.12, 0.2, 0.74)),
      badge(skin, box(0.02, 0.04, 0.14, 0.13)),
      brandLine(skin, box(0.27, 0.18, 0.38, 0.1)),
      bound('name', box(0.27, 0.3, 0.38, 0.26), 'h4', ink(skin)),
      detail(skin, box(0.27, 0.58, 0.38, 0.16), 1),
      endPrice(box(0.68, 0.22, 0.29, 0.54), markAs(skin, 'none')),
      ...trailing,
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.015, 0.14, 0.09, 0.72)),
      brandLine(skin, box(0.13, 0.2, 0.4, 0.13)),
      bound('name', box(0.13, 0.35, 0.4, 0.28), 'h4', ink(skin)),
      detail(skin, box(0.13, 0.65, 0.4, 0.16), 1),
      endPrice(box(0.66, 0.2, 0.31, 0.58), markAs(skin, 'none')),
      ...trailing,
    ]),
  ]
}

// ─── Structure 14: inline price ───────────────────────────────────────────────

/**
 * Name at the start of a row, price at the end of the same row. The quietest
 * card here.
 *
 * Not a smaller `listRow` — the difference is that there is no thumbnail and no
 * rule, so a column of these is a *price list* set as type, which is what the
 * back page of a weekly and a café board both actually are. It is also the
 * cheapest card to fit a long Arabic name into, because the name owns its whole
 * line and only has to share the row.
 */
export const inlinePrice = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0.1, 0.06, 0.8, 0.34)),
    badge(skin, box(0.03, 0.02, 0.34, 0.09)),
    brandLine(skin, box(gut(skin), 0.46, measure(skin), 0.05)),
    bound('name', box(gut(skin), 0.53, measure(skin), 0.24), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    rule('divider', box(gut(skin), 0.79, measure(skin), 0.006), skin.accent ?? 'inkMuted'),
    endPrice(box(0.34, 0.82, 0.58, 0.14), markAs(skin, 'none')),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0.12, 0.06, 0.76, 0.32)),
    badge(skin, box(0.03, 0.02, 0.32, 0.1)),
    brandLine(skin, box(gut(skin), 0.44, measure(skin), 0.05)),
    bound('name', box(gut(skin), 0.51, measure(skin), 0.24), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    rule('divider', box(gut(skin), 0.78, measure(skin), 0.006), skin.accent ?? 'inkMuted'),
    endPrice(box(0.32, 0.81, 0.6, 0.15), markAs(skin, 'none')),
  ]),
  at(WIDE, [
    base(skin),
    badge(skin, box(0.02, 0.05, 0.16, 0.14)),
    brandLine(skin, box(0.05, 0.26, 0.46, 0.1)),
    bound('name', box(0.05, 0.38, 0.46, 0.3), 'h3', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 2 },
    }),
    rule('divider', box(0.55, 0.22, 0.006, 0.56), skin.accent ?? 'inkMuted'),
    endPrice(box(0.6, 0.26, 0.37, 0.48), markAs(skin, 'none')),
  ]),
  at(BANNER, [
    base(skin),
    brandLine(skin, box(0.03, 0.24, 0.42, 0.14)),
    bound('name', box(0.03, 0.4, 0.42, 0.32), 'h3', ink(skin)),
    rule('divider', box(0.5, 0.2, 0.006, 0.6), skin.accent ?? 'inkMuted'),
    endPrice(box(0.55, 0.22, 0.42, 0.56), markAs(skin, 'none')),
  ]),
]

// ─── Structure 15: framed ─────────────────────────────────────────────────────

/**
 * A hairline frame, centred type and a rule above the price.
 *
 * The pharmacy and speciality-grocer register: quieter, more symmetrical, and it
 * survives a page with no photography far better than the flyer designs do. The
 * price is centred here rather than end-aligned — it is the one structure whose
 * whole argument is symmetry, and a flush-right number breaks it.
 */
export const framed = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'inkMuted'
  return [
    at(TALL, [
      base(skin),
      photo(box(0.12, 0.09, 0.76, 0.3)),
      badge(skin, box(0.06, 0.04, 0.32, 0.08)),
      brandLine(skin, box(0.1, 0.43, 0.8, 0.05), { align: 'center' }),
      bound('name', box(0.1, 0.49, 0.8, 0.17), 'h3', { ...ink(skin), align: 'center' }),
      detail(skin, box(0.1, 0.67, 0.8, 0.06), 1, 'center'),
      rule('divider', box(0.32, 0.76, 0.36, 0.006), line),
      price(box(0.1, 0.79, 0.8, 0.15), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.14, 0.08, 0.72, 0.28)),
      badge(skin, box(0.06, 0.04, 0.3, 0.09)),
      brandLine(skin, box(0.1, 0.4, 0.8, 0.05), { align: 'center' }),
      bound('name', box(0.1, 0.46, 0.8, 0.17), 'h3', { ...ink(skin), align: 'center' }),
      detail(skin, box(0.1, 0.64, 0.8, 0.07), 1, 'center'),
      rule('divider', box(0.32, 0.74, 0.36, 0.006), line),
      price(box(0.1, 0.77, 0.8, 0.16), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.05, 0.12, 0.26, 0.76)),
      badge(skin, box(0.03, 0.05, 0.16, 0.14)),
      brandLine(skin, box(0.36, 0.17, 0.32, 0.09)),
      bound('name', box(0.36, 0.28, 0.32, 0.24), 'h3', ink(skin)),
      detail(skin, box(0.36, 0.54, 0.32, 0.14)),
      rule('divider', box(0.72, 0.15, 0.006, 0.7), line),
      price(box(0.75, 0.24, 0.22, 0.52), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.14, 0.12, 0.72)),
      brandLine(skin, box(0.17, 0.2, 0.4, 0.12)),
      bound('name', box(0.17, 0.34, 0.4, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.17, 0.64, 0.4, 0.16), 1),
      rule('divider', box(0.62, 0.18, 0.006, 0.64), line),
      price(box(0.66, 0.2, 0.3, 0.6), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 16: editorial ──────────────────────────────────────────────────

/**
 * Type as the graphic: a big name, a small packshot and a quiet price.
 *
 * The magazine register, and the one that reads best on a shop whose brand is
 * not shouting. It is the only card where the photograph is deliberately the
 * *smallest* element, which is why it needs the widest gutter in the library —
 * air is what the design is actually made of, and at an 8% inset it is just a
 * card with a large name on it.
 */
export const editorial = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'inkMuted'
  return [
    at(TALL, [
      base(skin),
      badge(skin, box(gut(skin), 0.05, 0.3, 0.07)),
      brandLine(skin, box(gut(skin), 0.16, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.22, measure(skin), 0.26), 'h2', ink(skin)),
      rule('divider', box(gut(skin), 0.52, measure(skin), 0.006), line),
      photo(box(gut(skin), 0.57, measure(skin) * 0.44, 0.22)),
      detail(skin, box(gut(skin), 0.82, measure(skin), 0.06), 1),
      endPrice(box(0.5, 0.56, 0.36, 0.2), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      badge(skin, box(gut(skin), 0.05, 0.28, 0.08)),
      brandLine(skin, box(gut(skin), 0.17, measure(skin), 0.05)),
      bound('name', box(gut(skin), 0.23, measure(skin), 0.25), 'h2', ink(skin)),
      rule('divider', box(gut(skin), 0.52, measure(skin), 0.006), line),
      photo(box(gut(skin), 0.57, measure(skin) * 0.42, 0.24)),
      detail(skin, box(gut(skin), 0.84, measure(skin), 0.06), 1),
      endPrice(box(0.5, 0.56, 0.36, 0.22), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      badge(skin, box(0.06, 0.08, 0.16, 0.12)),
      brandLine(skin, box(0.06, 0.26, 0.42, 0.08)),
      bound('name', box(0.06, 0.36, 0.42, 0.34), 'h2', ink(skin)),
      rule('divider', box(0.53, 0.14, 0.006, 0.72), line),
      photo(box(0.58, 0.16, 0.2, 0.68)),
      endPrice(box(0.8, 0.3, 0.17, 0.4), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      brandLine(skin, box(0.04, 0.22, 0.4, 0.12)),
      bound('name', box(0.04, 0.36, 0.4, 0.32), 'h2', ink(skin)),
      rule('divider', box(0.49, 0.16, 0.006, 0.68), line),
      photo(box(0.54, 0.16, 0.14, 0.68)),
      endPrice(box(0.72, 0.26, 0.25, 0.48), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 17: no photograph ──────────────────────────────────────────────

/**
 * Name and price at full size, no image element at all.
 *
 * **A design, not a fallback.** 4.2% of the real catalog carries a photograph,
 * so a library where every card assumes one is a library that prints grey boxes.
 * With the packshot's third of the card given back, the name can take `h2` and
 * the price a fifth — which is how a market board and a butcher's window have
 * always been set, and they are not apologising for the missing picture.
 */
export const wordsOnly = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    badge(skin, box(gut(skin), 0.06, 0.32, 0.08)),
    brandLine(skin, box(gut(skin), 0.2, measure(skin), 0.06)),
    bound('name', box(gut(skin), 0.27, measure(skin), 0.3), 'h2', ink(skin)),
    detail(skin, box(gut(skin), 0.59, measure(skin), 0.12)),
    rule('divider', box(gut(skin), 0.74, measure(skin), 0.006), skin.accent ?? 'inkMuted'),
    endPrice(box(0.34, 0.78, 0.58, 0.16), noTab(skin)),
  ]),
  at(SQUARISH, [
    base(skin),
    badge(skin, box(gut(skin), 0.06, 0.3, 0.09)),
    brandLine(skin, box(gut(skin), 0.21, measure(skin), 0.06)),
    bound('name', box(gut(skin), 0.28, measure(skin), 0.3), 'h2', ink(skin)),
    detail(skin, box(gut(skin), 0.6, measure(skin), 0.12)),
    rule('divider', box(gut(skin), 0.74, measure(skin), 0.006), skin.accent ?? 'inkMuted'),
    endPrice(box(0.32, 0.78, 0.6, 0.17), noTab(skin)),
  ]),
  at(WIDE, [
    base(skin),
    badge(skin, box(0.05, 0.08, 0.16, 0.13)),
    brandLine(skin, box(0.05, 0.28, 0.44, 0.09)),
    bound('name', box(0.05, 0.39, 0.44, 0.32), 'h2', ink(skin)),
    detail(skin, box(0.05, 0.73, 0.44, 0.14), 1),
    rule('divider', box(0.54, 0.16, 0.006, 0.68), skin.accent ?? 'inkMuted'),
    endPrice(box(0.6, 0.24, 0.37, 0.52), noTab(skin)),
  ]),
  at(BANNER, [
    base(skin),
    brandLine(skin, box(0.03, 0.22, 0.44, 0.13)),
    bound('name', box(0.03, 0.37, 0.44, 0.32), 'h2', ink(skin)),
    rule('divider', box(0.52, 0.18, 0.006, 0.64), skin.accent ?? 'inkMuted'),
    endPrice(box(0.57, 0.22, 0.4, 0.56), noTab(skin)),
  ]),
]

// ─── Structure 18: spec card ──────────────────────────────────────────────────

/**
 * Brand, model, then the specification. The electronics and appliance page.
 *
 * The one card built for a product whose *name is a part number*: the brand goes
 * first and largest because it is what a shopper recognises, the name is allowed
 * three lines because "EQ.6 plus s700 TE657M03DE" is a real product name, and
 * the spec block gets three lines rather than two. The price is a whole number —
 * appliances are not priced in fils, and a mark that sets `.00` on a 589 is a
 * mark drawing two characters of nothing.
 */
export const specLed = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'inkMuted'
  return [
    at(TALL, [
      base(skin),
      photo(box(0.1, 0.07, 0.8, 0.3)),
      badge(skin, box(0.04, 0.03, 0.32, 0.08)),
      brandLine(skin, box(gut(skin), 0.41, measure(skin), 0.06)),
      bound('name', box(gut(skin), 0.48, measure(skin), 0.19), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 3 },
      }),
      rule('divider', box(gut(skin), 0.69, measure(skin), 0.006), line),
      detail(skin, box(gut(skin), 0.72, measure(skin), 0.12), 3),
      endPrice(box(0.42, 0.85, 0.5, 0.12), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.12, 0.07, 0.76, 0.28)),
      badge(skin, box(0.04, 0.03, 0.3, 0.09)),
      brandLine(skin, box(gut(skin), 0.39, measure(skin), 0.06)),
      bound('name', box(gut(skin), 0.46, measure(skin), 0.19), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 3 },
      }),
      rule('divider', box(gut(skin), 0.67, measure(skin), 0.006), line),
      detail(skin, box(gut(skin), 0.7, measure(skin), 0.13), 3),
      endPrice(box(0.4, 0.84, 0.52, 0.13), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.04, 0.1, 0.28, 0.8)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      brandLine(skin, box(0.36, 0.13, 0.32, 0.08)),
      bound('name', box(0.36, 0.23, 0.32, 0.22), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 3 },
      }),
      rule('divider', box(0.36, 0.48, 0.32, 0.006), line),
      detail(skin, box(0.36, 0.52, 0.32, 0.26), 3),
      endPrice(box(0.7, 0.28, 0.27, 0.44), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.12, 0.12, 0.76)),
      brandLine(skin, box(0.16, 0.16, 0.36, 0.12)),
      bound('name', box(0.16, 0.3, 0.36, 0.24), 'h4', {
        ...ink(skin),
        overflow: { mode: 'clamp', lines: 2 },
      }),
      detail(skin, box(0.16, 0.58, 0.36, 0.24), 2),
      endPrice(box(0.66, 0.2, 0.31, 0.6), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 19: brand led ──────────────────────────────────────────────────

/**
 * The brand set largest, above the product, under a rule.
 *
 * For the supplier-funded placement — the page a manufacturer has paid for,
 * where the thing being advertised is the marque and the product is the excuse.
 * It is the inverse of every other card here, which is exactly why it earns a
 * slot: nothing else in the library lets a brand name be the biggest word.
 */
export const brandLed = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'primary'
  return [
    at(TALL, [
      base(skin),
      bound('brand', box(gut(skin), 0.07, measure(skin), 0.13), 'h2', {
        ...ink(skin),
        transform: 'uppercase',
        letterSpacing: 0.04,
      }),
      rule('divider', box(gut(skin), 0.23, measure(skin), 0.008), line),
      photo(box(gut(skin), 0.28, measure(skin), 0.3)),
      badge(skin, box(0.62, 0.02, 0.34, 0.08), 'TOP_END'),
      bound('name', box(gut(skin), 0.61, measure(skin), 0.17), 'h4', ink(skin)),
      detail(skin, box(gut(skin), 0.79, measure(skin), 0.06), 1),
      endPrice(box(0.42, 0.85, 0.5, 0.12), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      bound('brand', box(gut(skin), 0.07, measure(skin), 0.13), 'h2', {
        ...ink(skin),
        transform: 'uppercase',
        letterSpacing: 0.04,
      }),
      rule('divider', box(gut(skin), 0.23, measure(skin), 0.008), line),
      photo(box(gut(skin), 0.28, measure(skin), 0.28)),
      badge(skin, box(0.62, 0.02, 0.34, 0.09), 'TOP_END'),
      bound('name', box(gut(skin), 0.59, measure(skin), 0.17), 'h4', ink(skin)),
      detail(skin, box(gut(skin), 0.77, measure(skin), 0.06), 1),
      endPrice(box(0.4, 0.84, 0.52, 0.13), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      bound('brand', box(0.05, 0.14, 0.32, 0.22), 'h2', {
        ...ink(skin),
        transform: 'uppercase',
        letterSpacing: 0.04,
      }),
      rule('divider', box(0.05, 0.4, 0.32, 0.008), line),
      bound('name', box(0.05, 0.46, 0.32, 0.22), 'h4', ink(skin)),
      photo(box(0.42, 0.1, 0.26, 0.8)),
      badge(skin, box(0.82, 0.04, 0.16, 0.13), 'TOP_END'),
      endPrice(box(0.72, 0.3, 0.25, 0.4), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      bound('brand', box(0.03, 0.2, 0.28, 0.26), 'h2', {
        ...ink(skin),
        transform: 'uppercase',
        letterSpacing: 0.04,
      }),
      rule('divider', box(0.03, 0.5, 0.28, 0.008), line),
      bound('name', box(0.03, 0.56, 0.28, 0.24), 'h4', ink(skin)),
      photo(box(0.36, 0.12, 0.16, 0.76)),
      endPrice(box(0.58, 0.22, 0.39, 0.56), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 20: halo ───────────────────────────────────────────────────────

/**
 * A tinted disc behind the packshot.
 *
 * A cutout on a coloured circle is the produce-counter and cosmetics look, and
 * it does something useful beyond decoration: it gives a photograph with a white
 * background an edge, so a packshot that was shot on white stops bleeding into
 * the card.
 */
export const halo = (skin: Skin): Arrangement[] => {
  const tint = skin.accent ?? 'accent'
  return [
    at(TALL, [
      base(skin),
      disc('halo', box(0.16, 0.05, 0.68, 0.36), tint, { opacity: 0.28 }),
      photo(box(0.22, 0.08, 0.56, 0.3)),
      badge(skin, box(0.04, 0.02, 0.32, 0.09)),
      brandLine(skin, box(gut(skin), 0.45, measure(skin), 0.05), { align: 'center' }),
      bound('name', box(gut(skin), 0.51, measure(skin), 0.17), 'h3', {
        ...ink(skin),
        align: 'center',
      }),
      detail(skin, box(gut(skin), 0.69, measure(skin), 0.06), 1, 'center'),
      price(box(gut(skin), 0.78, measure(skin), 0.17), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      disc('halo', box(0.18, 0.05, 0.64, 0.36), tint, { opacity: 0.28 }),
      photo(box(0.24, 0.08, 0.52, 0.3)),
      badge(skin, box(0.04, 0.02, 0.3, 0.1)),
      brandLine(skin, box(gut(skin), 0.44, measure(skin), 0.05), { align: 'center' }),
      bound('name', box(gut(skin), 0.5, measure(skin), 0.17), 'h3', {
        ...ink(skin),
        align: 'center',
      }),
      detail(skin, box(gut(skin), 0.68, measure(skin), 0.06), 1, 'center'),
      price(box(gut(skin), 0.77, measure(skin), 0.18), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      disc('halo', box(0.03, 0.1, 0.32, 0.8), tint, { opacity: 0.28 }),
      photo(box(0.07, 0.18, 0.24, 0.64)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      brandLine(skin, box(0.39, 0.18, 0.3, 0.09)),
      bound('name', box(0.39, 0.29, 0.3, 0.26), 'h3', ink(skin)),
      detail(skin, box(0.39, 0.57, 0.3, 0.14), 1),
      endPrice(box(0.7, 0.26, 0.27, 0.48), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      disc('halo', box(0.015, 0.12, 0.15, 0.76), tint, { opacity: 0.28 }),
      photo(box(0.04, 0.2, 0.1, 0.6)),
      brandLine(skin, box(0.19, 0.2, 0.38, 0.13)),
      bound('name', box(0.19, 0.35, 0.38, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.19, 0.65, 0.38, 0.16), 1),
      endPrice(box(0.66, 0.2, 0.31, 0.6), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 21: plated photo ───────────────────────────────────────────────

/**
 * The photograph is the whole card, with an opaque plate floating over the foot.
 *
 * The plate is what makes this legible: type laid straight onto an arbitrary
 * packshot is type over whatever happened to be behind it, and a shop cannot
 * check every photograph in its catalog. A plate is a promise about contrast
 * that does not depend on the picture.
 */
export const platedPhoto = (skin: Skin): Arrangement[] => {
  const plateInk = skin.onTint ? 'surface' : 'ink'
  const plate = skin.onTint ? 'ink' : 'surface'
  return [
    at(TALL, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      badge(skin, box(0.04, 0.03, 0.34, 0.08)),
      panel('plate', box(0.06, 0.52, 0.88, 0.42), plate, { radius: 6 }),
      brandLine(skin, box(0.1, 0.56, 0.8, 0.05)),
      bound('name', box(0.1, 0.62, 0.8, 0.16), 'h3', { color: plateInk }),
      endPrice(box(0.4, 0.79, 0.52, 0.13), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      badge(skin, box(0.04, 0.03, 0.32, 0.09)),
      panel('plate', box(0.06, 0.5, 0.88, 0.44), plate, { radius: 6 }),
      brandLine(skin, box(0.1, 0.54, 0.8, 0.05)),
      bound('name', box(0.1, 0.6, 0.8, 0.17), 'h3', { color: plateInk }),
      endPrice(box(0.38, 0.78, 0.54, 0.14), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      badge(skin, box(0.02, 0.04, 0.18, 0.13)),
      panel('plate', box(0.44, 0.08, 0.52, 0.84), plate, { radius: 6 }),
      brandLine(skin, box(0.48, 0.16, 0.44, 0.08)),
      bound('name', box(0.48, 0.27, 0.44, 0.26), 'h3', { color: plateInk }),
      endPrice(box(0.5, 0.6, 0.42, 0.26), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      panel('plate', box(0.4, 0.1, 0.56, 0.8), plate, { radius: 6 }),
      brandLine(skin, box(0.44, 0.2, 0.3, 0.12)),
      bound('name', box(0.44, 0.35, 0.3, 0.3), 'h3', { color: plateInk }),
      endPrice(box(0.76, 0.24, 0.18, 0.52), markAs(skin, 'none')),
    ]),
  ]
}

// ─── Structure 22: full bleed ─────────────────────────────────────────────────

/**
 * The photograph reaches three edges and the words sit on the fourth.
 *
 * The difference from `platedPhoto` is that nothing floats: the type has a band
 * of ground to itself, so the card reads as two zones rather than as a picture
 * with a label on it. It is the densest photographic card here, which is what
 * makes it the one for a page where every product has a packshot.
 */
export const fullBleed = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0, 0, 1, 0.52), { fit: 'cover' }),
    badge(skin, box(0.03, 0.02, 0.34, 0.08)),
    brandLine(skin, box(0.06, 0.56, 0.88, 0.05)),
    bound('name', box(0.06, 0.62, 0.88, 0.17), 'h3', ink(skin)),
    detail(skin, box(0.06, 0.8, 0.88, 0.06), 1),
    endPrice(box(0.42, 0.86, 0.5, 0.11), markAs(skin, 'none')),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0, 0, 1, 0.5), { fit: 'cover' }),
    badge(skin, box(0.03, 0.02, 0.32, 0.09)),
    brandLine(skin, box(0.06, 0.54, 0.88, 0.05)),
    bound('name', box(0.06, 0.6, 0.88, 0.17), 'h3', ink(skin)),
    detail(skin, box(0.06, 0.78, 0.88, 0.06), 1),
    endPrice(box(0.4, 0.85, 0.52, 0.12), markAs(skin, 'none')),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0, 0, 0.46, 1), { fit: 'cover' }),
    badge(skin, box(0.02, 0.04, 0.18, 0.13)),
    brandLine(skin, box(0.51, 0.14, 0.44, 0.09)),
    bound('name', box(0.51, 0.25, 0.44, 0.26), 'h3', ink(skin)),
    detail(skin, box(0.51, 0.53, 0.44, 0.13), 1),
    endPrice(box(0.55, 0.7, 0.4, 0.2), markAs(skin, 'none')),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0, 0, 0.3, 1), { fit: 'cover' }),
    brandLine(skin, box(0.34, 0.2, 0.3, 0.13)),
    bound('name', box(0.34, 0.35, 0.3, 0.3), 'h3', ink(skin)),
    endPrice(box(0.68, 0.22, 0.29, 0.56), markAs(skin, 'none')),
  ]),
]

// ─── Structure 23: photo overlay ──────────────────────────────────────────────

/**
 * The photograph is the whole card and the type sits on a scrim over it.
 *
 * Instagram's convention rather than the leaflet's, and it is here because a
 * carousel post is a square region with one product in it. `cover` rather than
 * `contain`: a full-bleed card that letterboxes has a white bar in it, which is
 * the one thing this design cannot have.
 *
 * The scrim is a shape at 62% over the ink role, not a colour — a translucent
 * black is what keeps a name legible over a photograph nobody has seen yet.
 */
export const overlay = (scrim: TokenRef, textInk: TokenRef): Arrangement[] => {
  const veil = (b: Box): BlockElement => panel('scrim', b, scrim, { opacity: 0.62, radius: 0 })
  const priceStyle: PriceMarkStyle =
    textInk === 'surface' ? REVERSED_PRICE : { frame: 'plain', tab: 'none' }
  const caps = (b: Box): BlockElement =>
    bound('brand', b, 'caption', {
      color: textInk,
      opacity: 0.82,
      transform: 'uppercase',
      letterSpacing: 0.08,
    })

  return [
    at(TALL, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0.52, 1, 0.48)),
      chip(box(0.04, 0.03, 0.36, 0.09)),
      caps(box(0.07, 0.56, 0.86, 0.05)),
      bound('name', box(0.07, 0.62, 0.86, 0.16), 'h3', { color: textInk }),
      bound('spec', box(0.07, 0.79, 0.86, 0.06), 'caption', {
        color: textInk,
        opacity: 0.82,
        overflow: { mode: 'clamp', lines: 1 },
      }),
      price(box(0.07, 0.85, 0.86, 0.12), priceStyle),
    ]),
    at(SQUARISH, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0.5, 1, 0.5)),
      chip(box(0.04, 0.03, 0.34, 0.1)),
      caps(box(0.07, 0.54, 0.86, 0.05)),
      bound('name', box(0.07, 0.6, 0.86, 0.17), 'h3', { color: textInk }),
      bound('spec', box(0.07, 0.78, 0.86, 0.06), 'caption', {
        color: textInk,
        opacity: 0.82,
        overflow: { mode: 'clamp', lines: 1 },
      }),
      price(box(0.07, 0.85, 0.86, 0.12), priceStyle),
    ]),
    at(WIDE, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0, 0.52, 1)),
      chip(box(0.02, 0.04, 0.18, 0.14)),
      caps(box(0.05, 0.2, 0.42, 0.08)),
      bound('name', box(0.05, 0.3, 0.42, 0.24), 'h3', { color: textInk }),
      price(box(0.05, 0.6, 0.42, 0.28), priceStyle),
    ]),
    at(BANNER, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0, 0.62, 1)),
      caps(box(0.03, 0.2, 0.36, 0.12)),
      bound('name', box(0.03, 0.34, 0.36, 0.3), 'h3', { color: textInk }),
      price(box(0.42, 0.2, 0.17, 0.6), priceStyle),
    ]),
  ]
}

// ─── Structure 24: split vertical ─────────────────────────────────────────────

/**
 * Half photograph, half words — **in a tall cell as well as a wide one.**
 *
 * Every other card in the library stacks in a portrait region and only splits
 * side by side when the region is already wide. This one splits at every shape,
 * which makes a column of them read as a completely different page from a column
 * of stacked cards.
 */
export const splitVertical = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0, 0, 0.46, 1), { fit: 'cover' }),
    badge(skin, box(0.02, 0.03, 0.4, 0.07)),
    brandLine(skin, box(0.52, 0.12, 0.42, 0.06)),
    bound('name', box(0.52, 0.2, 0.42, 0.26), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 3 },
    }),
    detail(skin, box(0.52, 0.5, 0.42, 0.14)),
    endPrice(box(0.52, 0.68, 0.42, 0.24), PLAIN_PRICE),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0, 0, 0.48, 1), { fit: 'cover' }),
    badge(skin, box(0.02, 0.03, 0.4, 0.09)),
    brandLine(skin, box(0.54, 0.14, 0.4, 0.06)),
    bound('name', box(0.54, 0.22, 0.4, 0.24), 'h4', {
      ...ink(skin),
      overflow: { mode: 'clamp', lines: 3 },
    }),
    detail(skin, box(0.54, 0.5, 0.4, 0.14)),
    endPrice(box(0.54, 0.68, 0.4, 0.24), PLAIN_PRICE),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0, 0, 0.5, 1), { fit: 'cover' }),
    badge(skin, box(0.02, 0.04, 0.2, 0.14)),
    brandLine(skin, box(0.56, 0.16, 0.38, 0.08)),
    bound('name', box(0.56, 0.26, 0.38, 0.24), 'h4', ink(skin)),
    detail(skin, box(0.56, 0.52, 0.38, 0.14), 1),
    endPrice(box(0.56, 0.68, 0.38, 0.22), PLAIN_PRICE),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0, 0, 0.34, 1), { fit: 'cover' }),
    brandLine(skin, box(0.38, 0.2, 0.3, 0.12)),
    bound('name', box(0.38, 0.34, 0.3, 0.3), 'h4', ink(skin)),
    endPrice(box(0.7, 0.22, 0.27, 0.56), PLAIN_PRICE),
  ]),
]

// ─── Structure 25: side rail ──────────────────────────────────────────────────

/**
 * A coloured rail down the start edge, with the badge turned into it.
 *
 * **It mirrors, and that is the whole reason it is here.** `start` is not
 * `left`, so on an Arabic edition the rail moves to the other side of the card
 * and the design is still the design — which is the property the entire
 * fractional coordinate system exists to give, and worth one block that shows
 * it off. A brand colour down one edge is also the cheapest way to make a page
 * of white cards look like a shop's.
 */
export const sideRail = (skin: Skin): Arrangement[] => {
  const rail = skin.accent ?? 'primary'
  return [
    at(TALL, [
      base(skin),
      panel('rail', box(0, 0, 0.09, 1), rail, { radius: 0 }),
      badge(skin, box(0.12, 0.03, 0.36, 0.08)),
      photo(box(0.15, 0.13, 0.78, 0.3)),
      brandLine(skin, box(0.15, 0.47, 0.78, 0.05)),
      bound('name', box(0.15, 0.53, 0.78, 0.17), 'h3', ink(skin)),
      detail(skin, box(0.15, 0.71, 0.78, 0.1)),
      endPrice(box(0.42, 0.83, 0.5, 0.13), markAs(skin, 'none')),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('rail', box(0, 0, 0.09, 1), rail, { radius: 0 }),
      badge(skin, box(0.12, 0.03, 0.34, 0.09)),
      photo(box(0.15, 0.14, 0.78, 0.28)),
      brandLine(skin, box(0.15, 0.46, 0.78, 0.05)),
      bound('name', box(0.15, 0.52, 0.78, 0.17), 'h3', ink(skin)),
      detail(skin, box(0.15, 0.7, 0.78, 0.1)),
      endPrice(box(0.4, 0.82, 0.52, 0.14), markAs(skin, 'none')),
    ]),
    at(WIDE, [
      base(skin),
      panel('rail', box(0, 0, 0.05, 1), rail, { radius: 0 }),
      badge(skin, box(0.08, 0.04, 0.18, 0.13)),
      photo(box(0.09, 0.22, 0.26, 0.66)),
      brandLine(skin, box(0.39, 0.2, 0.3, 0.09)),
      bound('name', box(0.39, 0.31, 0.3, 0.26), 'h3', ink(skin)),
      detail(skin, box(0.39, 0.59, 0.3, 0.14), 1),
      endPrice(box(0.7, 0.28, 0.27, 0.44), markAs(skin, 'none')),
    ]),
    at(BANNER, [
      base(skin),
      panel('rail', box(0, 0, 0.03, 1), rail, { radius: 0 }),
      photo(box(0.06, 0.14, 0.11, 0.72)),
      brandLine(skin, box(0.2, 0.2, 0.36, 0.13)),
      bound('name', box(0.2, 0.35, 0.36, 0.28), 'h3', ink(skin)),
      detail(skin, box(0.2, 0.65, 0.36, 0.16), 1),
      endPrice(box(0.66, 0.2, 0.31, 0.6), markAs(skin, 'none')),
    ]),
  ]
}

// ─── The cards ────────────────────────────────────────────────────────────────

export interface CardBlock {
  id: string
  name: string
  description: string
  arrangements: Arrangement[]
}

/**
 * The mark's ground on a card that is itself tinted.
 *
 * A tag drawn in the surface colour is the one treatment that stays legible
 * whichever brand colour the shop grounded the card in — the alternative is a
 * mark that resolves to the same hue as the card under it, which the gallery
 * found on the tinted card and nothing else.
 */
const TAG_ON_TINT: PriceMarkStyle = { surface: role('surface') }

/**
 * Twenty-six repeating cards.
 *
 * Ordered by how likely a shop is to want one, not by structure: the plain card
 * every grocer needs is first, the three leaflet registers follow it, and the
 * specialist shapes are further down. A library is a list somebody scrolls, and
 * the order is the only navigation it has until there is a filter.
 *
 * **Two ids retired here and three arrived.** `blk_price_first` put the price
 * above the packshot, which the references do not do and which cost the
 * photograph its prominence for a reading-order gain nobody asked for;
 * `blk_split_tint` was `blk_split_vertical` with one half coloured, which is the
 * skin-only difference that cut the library from thirty-three in the first
 * place. `pnpm db:seed` prunes both, and **archives rather than deletes** either
 * one a live book still names.
 */
export const CARD_BLOCKS: CardBlock[] = [
  {
    id: 'blk_offer_card',
    name: 'Offer card',
    description: 'One product, its brand, its detail and its price. Reflows for merged regions.',
    arrangements: stacked({ ground: 'surface' }),
  },
  {
    id: 'blk_offer_card_tinted',
    name: 'Offer card, tinted',
    description:
      'The same card grounded in your first brand colour. One per page, for the lead deal.',
    arrangements: stacked({ ground: 'primary', onTint: true, price: TAG_ON_TINT }),
  },
  {
    id: 'blk_top_ribbon',
    name: 'Ribbon card',
    description:
      'A coloured bar across the head naming the promotion, and a solid price block at the foot.',
    arrangements: topRibbon({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_price_band',
    name: 'Price band card',
    description:
      'The price reversed out of a coloured band along the foot. The weekly-flyer default.',
    arrangements: priceBand({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_price_pill',
    name: 'Delivery-app card',
    description:
      'A tinted plate behind the packshot and the price as a pill, with the old price struck beside it.',
    arrangements: pricePill({ ground: 'surface', accent: 'accent', radius: 12 }),
  },
  {
    id: 'blk_deal_frame',
    name: 'Deal frame card',
    description: 'Bars at the head and the foot, the product between them, the price in the foot.',
    arrangements: dealFrame({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_compact',
    name: 'Compact card',
    description:
      'Name and price only. The block for a five-across page, where a detail line would not be read.',
    arrangements: compact({ ground: 'surface', inset: 0.05 }),
  },
  {
    id: 'blk_feature',
    name: 'Feature card',
    description: 'Brand line, big name, big price. Designed for a merged two-by-two: your lead deal.',
    arrangements: feature({ ground: 'surface', inset: 0.06, price: { preset: 'was-now-stack' } }),
  },
  {
    id: 'blk_ticket',
    name: 'Ticket card',
    description: 'A dark tab across the head carrying the badge. Reads at the smallest sizes.',
    arrangements: ticket({ ground: 'surface', accent: 'ink', price: { preset: 'shelf-ticket' } }),
  },
  {
    id: 'blk_burst',
    name: 'Price burst card',
    description: 'The price in a burst over the packshot. Loud on purpose, so one to a page.',
    arrangements: burst({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_price_bomb',
    name: 'Price bomb card',
    description: 'The mark at a third of the card. The lead deal, and one to a page.',
    arrangements: priceBomb({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_corner_flag',
    name: 'Corner flag card',
    description: 'A band tilted across the corner with the price reversed out of it.',
    arrangements: cornerFlag({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_name_band',
    name: 'Name band card',
    description: 'The colour band sits behind the product line, and the price is left plain.',
    arrangements: nameBand({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_list_row',
    name: 'List row',
    description: 'A line item: thumbnail, name, price at the end. For a wide region or a full row.',
    arrangements: listRow({ ground: 'surface', inset: 0.04, price: { preset: 'super-riyal' } }, true),
  },
  {
    id: 'blk_inline_price',
    name: 'Inline price card',
    description: 'Name at the start of a row, price at the end. The quietest card here.',
    arrangements: inlinePrice({ ground: 'surface', price: { preset: 'super-riyal' } }),
  },
  {
    id: 'blk_framed',
    name: 'Framed card',
    description: 'A hairline frame, centred type and a rule above the price. The quieter register.',
    arrangements: framed({ ground: 'surface', stroke: outline('primary', 0.005), inset: 0.11 }),
  },
  {
    id: 'blk_spec_led',
    name: 'Spec card',
    description: 'Brand, model, then three lines of specification. The electronics and appliance page.',
    arrangements: specLed({ ground: 'surface', inset: 0.1, price: { preset: 'whole-number' } }),
  },
  {
    id: 'blk_brand_led',
    name: 'Brand-led card',
    description: 'The brand above the product under a rule. For supplier-funded placements.',
    arrangements: brandLed({
      ground: 'surface',
      accent: 'primary',
      inset: 0.1,
      price: { preset: 'super-riyal' },
    }),
  },
  {
    id: 'blk_halo',
    name: 'Halo card',
    description: 'A tinted disc behind the packshot, which gives a shot-on-white photograph an edge.',
    arrangements: halo({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_plated_photo',
    name: 'Plated photo card',
    description: 'The photograph is the whole card, with a white plate floating over the foot.',
    arrangements: platedPhoto({ ground: 'surface' }),
  },
  {
    id: 'blk_full_bleed',
    name: 'Full-bleed card',
    description: 'The photograph reaches three edges and the words sit on the fourth.',
    arrangements: fullBleed({ ground: 'surface', price: { preset: 'stacked-currency' } }),
  },
  {
    id: 'blk_overlay',
    name: 'Photo overlay card',
    description: 'Full-bleed photograph with the name and price on a dark scrim. Built for a square post.',
    arrangements: overlay('ink', 'surface'),
  },
  {
    id: 'blk_split_vertical',
    name: 'Split card',
    description: 'Half photograph, half words. At every shape, not only when the region is wide.',
    arrangements: splitVertical({ ground: 'surface' }),
  },
  {
    id: 'blk_side_rail',
    name: 'Side rail card',
    description: 'A coloured rail down the start edge with the badge beside it. Mirrors in Arabic.',
    arrangements: sideRail({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_editorial',
    name: 'Editorial card',
    description: 'Type as the graphic: a big name, a small packshot and a quiet price.',
    arrangements: editorial({ ground: 'surface', inset: 0.14, price: { preset: 'super-riyal' } }),
  },
  {
    id: 'blk_words_only',
    name: 'Card without a photograph',
    description: 'Name and price at full size, no image. For the two thirds of a catalog with no packshot.',
    arrangements: wordsOnly({ ground: 'surface', inset: 0.12, price: { preset: 'was-now-stack' } }),
  },
]
