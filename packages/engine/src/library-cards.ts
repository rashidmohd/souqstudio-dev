/**
 * The repeating offer cards — the half of the library a page is mostly made of.
 *
 * Every one of these renders **once per offer** and reflows into whatever shape
 * the region it lands in turns out to be, which is why each carries four
 * arrangements whose ranges meet: tall for a booklet cell, square for a carousel
 * post, wide for a two-column merge, banner for a full row.
 *
 * ## What was drawn from, and what it changed
 *
 * Grocery leaflets, GCC hypermarket weeklies and e-commerce product cards agree
 * on less than you would expect, and the disagreements are the useful part:
 *
 * - **The price is the hero, not the photograph.** A flyer sets a "price bomb"
 *   two or three times the size of the product name; an e-commerce card sets the
 *   price at body size under the title. A printed offer book is the first thing,
 *   so most of these give the mark a fifth to a quarter of the card and several
 *   give it a band, a disc or a reversed panel of its own.
 * - **One badge, never a stack.** Product-badging studies are consistent that
 *   stacking *urgency + discount + bestseller + new* reduces clicks. There is
 *   exactly one chip on a card here, and it carries the promo tier.
 * - **The badge overlays the image or sits beside the name.** Both conventions
 *   are here — `TOP_START` over the packshot for the flyer look, `INLINE` beside
 *   the name for the catalog look.
 * - **Three densities on one page.** Real weeklies mix a hero tile, a standard
 *   tile and a compact list row, and the eye needs that hierarchy to find the
 *   lead deal. `feature`, `stacked` and `listRow`/`compact` are those three.
 * - **Most rows have no photograph.** 4.2% of the real catalog carries an image
 *   — see `harness/real.ts` — so a card that assumes one is a card that prints a
 *   grey box. Two designs here have no image element at all, and they are not a
 *   fallback: for a shop whose catalog is names and prices, they are the design.
 *
 * The promotion *mechanics* — BOGO, multibuy, was/now, percent off, bundle — are
 * deliberately **not** thirty-odd separate blocks. They are the offer's tier and
 * what the price mark draws internally, so one card serves all of them and a
 * shop that invents a new mechanic next month does not need a new block. What
 * differs between these designs is emphasis, not vocabulary.
 */

import type { Arrangement, BlockElement, PriceMarkStyle, Stroke, TokenRef } from '@souqstudio/types'
import {
  BANNER,
  SQUARISH,
  TALL,
  WIDE,
  at,
  bound,
  box,
  chip,
  disc,
  ground,
  outline,
  panel,
  photo,
  price,
  PLAIN_PRICE,
  REVERSED_PRICE,
  rule,
} from './library-kit'

/**
 * What makes two cards of the same structure different cards.
 *
 * A skin is the decision a shop's designer would make about a layout that
 * already works — ground it in the brand colour or leave it white, outline it or
 * not, let the price mark keep its tag or strip it to digits. Structure is
 * expensive to author and cheap to reuse; skins are the opposite, which is why
 * the library is a dozen structures wearing thirty skins rather than thirty
 * hand-drawn cards that drift apart.
 */
interface Skin {
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
const badge = (skin: Skin, b: ReturnType<typeof box>, anchor?: 'TOP_START' | 'TOP_END' | 'INLINE') =>
  chip(b, anchor ?? 'TOP_START', skin.chipFill)

const base = (skin: Skin): BlockElement =>
  ground(skin.ground, {
    ...(skin.radius === undefined ? {} : { radius: skin.radius }),
    ...(skin.stroke === undefined ? {} : { stroke: skin.stroke }),
  })

// ─── Structure 1: stacked ─────────────────────────────────────────────────────

/**
 * Packshot, name, spec, price, top to bottom. The one every flyer starts from.
 *
 * The name box is **20% of the card height, not 13%**. It was designed at the
 * friendly case first and the fit ladder escalated on every long Arabic product
 * in the catalog — E6 §5 is explicit that designing at the friendly case is the
 * wrong direction. At 20% the ladder steps down once and fits, which is what a
 * rung is for.
 */
export const stacked = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0.08, 0.06, 0.84, 0.34)),
    badge(skin, box(0.04, 0.02, 0.36, 0.09)),
    bound('name', box(0.08, 0.44, 0.84, 0.2), 'h3', ink(skin)),
    bound('spec', box(0.08, 0.65, 0.84, 0.07), 'caption', muted(skin)),
    price(box(0.08, 0.74, 0.84, 0.2), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0.08, 0.07, 0.84, 0.32)),
    badge(skin, box(0.04, 0.03, 0.32, 0.1)),
    bound('name', box(0.08, 0.43, 0.84, 0.2), 'h3', ink(skin)),
    bound('spec', box(0.08, 0.64, 0.84, 0.08), 'caption', muted(skin)),
    price(box(0.08, 0.74, 0.84, 0.19), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0.04, 0.1, 0.3, 0.8)),
    badge(skin, box(0.02, 0.04, 0.16, 0.16)),
    bound('name', box(0.38, 0.16, 0.36, 0.24), 'h3', ink(skin)),
    bound('spec', box(0.38, 0.43, 0.36, 0.14), 'caption', muted(skin)),
    price(box(0.7, 0.24, 0.27, 0.52), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.12, 0.14, 0.76)),
    bound('name', box(0.19, 0.24, 0.42, 0.3), 'h3', ink(skin)),
    bound('spec', box(0.19, 0.56, 0.42, 0.2), 'caption', muted(skin)),
    price(box(0.66, 0.18, 0.3, 0.64), skin.price),
  ]),
]

// ─── Structure 2: photo-led ───────────────────────────────────────────────────

/**
 * The packshot takes nearly half the card and the type gets out of its way.
 *
 * For the categories a photograph sells — fresh produce, bakery, anything where
 * the shopper is buying the look of the thing. It costs a type step on the name,
 * which is the trade and is why it is not the default.
 */
export const photoLed = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0.06, 0.05, 0.88, 0.46)),
    badge(skin, box(0.03, 0.02, 0.34, 0.09)),
    bound('name', box(0.08, 0.55, 0.84, 0.16), 'h4', ink(skin)),
    bound('spec', box(0.08, 0.715, 0.84, 0.06), 'caption', muted(skin)),
    price(box(0.08, 0.78, 0.84, 0.17), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0.06, 0.05, 0.88, 0.44)),
    badge(skin, box(0.03, 0.02, 0.32, 0.1)),
    bound('name', box(0.08, 0.52, 0.84, 0.17), 'h4', ink(skin)),
    bound('spec', box(0.08, 0.7, 0.84, 0.07), 'caption', muted(skin)),
    price(box(0.08, 0.78, 0.84, 0.17), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0.03, 0.06, 0.38, 0.88)),
    badge(skin, box(0.02, 0.03, 0.16, 0.14)),
    bound('name', box(0.45, 0.14, 0.32, 0.26), 'h4', ink(skin)),
    bound('spec', box(0.45, 0.42, 0.32, 0.12), 'caption', muted(skin)),
    price(box(0.72, 0.22, 0.25, 0.56), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.08, 0.16, 0.84)),
    bound('name', box(0.21, 0.22, 0.4, 0.3), 'h4', ink(skin)),
    bound('spec', box(0.21, 0.54, 0.4, 0.18), 'caption', muted(skin)),
    price(box(0.66, 0.16, 0.31, 0.68), skin.price),
  ]),
]

// ─── Structure 3: price band ──────────────────────────────────────────────────

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
  return [
    at(TALL, [
      base(skin),
      photo(box(0.08, 0.07, 0.84, 0.36)),
      badge(skin, box(0.04, 0.03, 0.34, 0.09)),
      bound('name', box(0.08, 0.46, 0.84, 0.19), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.66, 0.84, 0.06), 'caption', muted(skin)),
      panel('band', box(0, 0.73, 1, 0.27), band),
      price(box(0.06, 0.76, 0.88, 0.21), REVERSED_PRICE),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.08, 0.06, 0.84, 0.34)),
      badge(skin, box(0.04, 0.03, 0.32, 0.1)),
      bound('name', box(0.08, 0.44, 0.84, 0.18), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.63, 0.84, 0.06), 'caption', muted(skin)),
      panel('band', box(0, 0.71, 1, 0.29), band),
      price(box(0.06, 0.74, 0.88, 0.23), REVERSED_PRICE),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.08, 0.3, 0.84)),
      badge(skin, box(0.02, 0.04, 0.16, 0.15)),
      bound('name', box(0.36, 0.18, 0.3, 0.28), 'h3', ink(skin)),
      bound('spec', box(0.36, 0.48, 0.3, 0.14), 'caption', muted(skin)),
      panel('band', box(0.68, 0, 0.32, 1), band),
      price(box(0.7, 0.2, 0.28, 0.6), REVERSED_PRICE),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.1, 0.13, 0.8)),
      bound('name', box(0.17, 0.22, 0.42, 0.32), 'h3', ink(skin)),
      bound('spec', box(0.17, 0.56, 0.42, 0.2), 'caption', muted(skin)),
      panel('band', box(0.62, 0, 0.38, 1), band),
      price(box(0.65, 0.18, 0.32, 0.64), REVERSED_PRICE),
    ]),
  ]
}

// ─── Structure 4: photo overlay ───────────────────────────────────────────────

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
  const veil = (b: ReturnType<typeof box>): BlockElement =>
    panel('scrim', b, scrim, { opacity: 0.62 })
  const priceStyle: PriceMarkStyle =
    textInk === 'surface' ? REVERSED_PRICE : { frame: 'plain', tab: 'none' }

  return [
    at(TALL, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0.52, 1, 0.48)),
      chip(box(0.04, 0.03, 0.36, 0.09)),
      bound('name', box(0.07, 0.56, 0.86, 0.17), 'h3', { color: textInk }),
      bound('spec', box(0.07, 0.74, 0.86, 0.06), 'caption', { color: textInk, opacity: 0.82 }),
      price(box(0.07, 0.81, 0.86, 0.14), priceStyle),
    ]),
    at(SQUARISH, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0.5, 1, 0.5)),
      chip(box(0.04, 0.03, 0.34, 0.1)),
      bound('name', box(0.07, 0.54, 0.86, 0.18), 'h3', { color: textInk }),
      bound('spec', box(0.07, 0.73, 0.86, 0.07), 'caption', { color: textInk, opacity: 0.82 }),
      price(box(0.07, 0.81, 0.86, 0.14), priceStyle),
    ]),
    at(WIDE, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0, 0.52, 1)),
      chip(box(0.02, 0.04, 0.18, 0.14)),
      bound('name', box(0.05, 0.2, 0.42, 0.24), 'h3', { color: textInk }),
      bound('spec', box(0.05, 0.46, 0.42, 0.12), 'caption', { color: textInk, opacity: 0.82 }),
      price(box(0.05, 0.6, 0.42, 0.28), priceStyle),
    ]),
    at(BANNER, [
      photo(box(0, 0, 1, 1), { fit: 'cover' }),
      veil(box(0, 0, 0.62, 1)),
      bound('name', box(0.03, 0.22, 0.36, 0.3), 'h3', { color: textInk }),
      bound('spec', box(0.03, 0.54, 0.36, 0.2), 'caption', { color: textInk, opacity: 0.82 }),
      price(box(0.42, 0.2, 0.17, 0.6), priceStyle),
    ]),
  ]
}

// ─── Structure 5: price burst ─────────────────────────────────────────────────

/**
 * The price in a disc that overlaps the packshot. The supermarket "price bomb".
 *
 * The loudest thing in the library and the one to use sparingly — a page of
 * twelve bursts is a page with no hierarchy at all. Pair one of these with
 * `compact` around it and the lead deal is found in half a second.
 */
export const burst = (skin: Skin): Arrangement[] => {
  const dot = skin.accent ?? 'accent'
  return [
    at(TALL, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.44)),
      badge(skin, box(0.03, 0.02, 0.32, 0.09)),
      disc('burst', box(0.56, 0.28, 0.4, 0.3), dot),
      price(box(0.585, 0.315, 0.35, 0.23), REVERSED_PRICE),
      bound('name', box(0.08, 0.62, 0.84, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.83, 0.84, 0.08), 'caption', muted(skin)),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.42)),
      badge(skin, box(0.03, 0.02, 0.32, 0.1)),
      disc('burst', box(0.56, 0.26, 0.4, 0.32), dot),
      price(box(0.585, 0.3, 0.35, 0.24), REVERSED_PRICE),
      bound('name', box(0.08, 0.62, 0.84, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.83, 0.84, 0.08), 'caption', muted(skin)),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.08, 0.34, 0.84)),
      badge(skin, box(0.02, 0.04, 0.16, 0.15)),
      bound('name', box(0.4, 0.2, 0.26, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.4, 0.52, 0.26, 0.16), 'caption', muted(skin)),
      disc('burst', box(0.68, 0.14, 0.3, 0.72), dot),
      price(box(0.705, 0.27, 0.25, 0.46), REVERSED_PRICE),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.1, 0.14, 0.8)),
      bound('name', box(0.18, 0.24, 0.44, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.18, 0.56, 0.44, 0.18), 'caption', muted(skin)),
      disc('burst', box(0.7, 0.06, 0.28, 0.88), dot),
      price(box(0.735, 0.26, 0.21, 0.48), REVERSED_PRICE),
    ]),
  ]
}

// ─── Structure 6: framed ──────────────────────────────────────────────────────

/**
 * A hairline frame, centred type and a rule above the price.
 *
 * The pharmacy and speciality-grocer register: quieter, more symmetrical, and it
 * survives a page with no photography far better than the flyer designs do.
 */
export const framed = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'inkMuted'
  return [
    at(TALL, [
      base(skin),
      photo(box(0.1, 0.09, 0.8, 0.32)),
      badge(skin, box(0.06, 0.04, 0.32, 0.08)),
      bound('name', box(0.1, 0.46, 0.8, 0.19), 'h3', { ...ink(skin), align: 'center' }),
      bound('spec', box(0.1, 0.66, 0.8, 0.06), 'caption', { ...muted(skin), align: 'center' }),
      rule('divider', box(0.3, 0.745, 0.4, 0.006), line),
      price(box(0.1, 0.77, 0.8, 0.17), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.1, 0.08, 0.8, 0.3)),
      badge(skin, box(0.06, 0.04, 0.3, 0.09)),
      bound('name', box(0.1, 0.43, 0.8, 0.19), 'h3', { ...ink(skin), align: 'center' }),
      bound('spec', box(0.1, 0.63, 0.8, 0.07), 'caption', { ...muted(skin), align: 'center' }),
      rule('divider', box(0.3, 0.725, 0.4, 0.006), line),
      price(box(0.1, 0.75, 0.8, 0.18), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.05, 0.12, 0.28, 0.76)),
      badge(skin, box(0.03, 0.05, 0.16, 0.14)),
      bound('name', box(0.38, 0.18, 0.32, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.38, 0.46, 0.32, 0.14), 'caption', muted(skin)),
      rule('divider', box(0.72, 0.15, 0.006, 0.7), line),
      price(box(0.75, 0.24, 0.22, 0.52), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.14, 0.13, 0.72)),
      bound('name', box(0.18, 0.24, 0.4, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.18, 0.56, 0.4, 0.18), 'caption', muted(skin)),
      rule('divider', box(0.62, 0.18, 0.006, 0.64), line),
      price(box(0.66, 0.2, 0.3, 0.6), skin.price),
    ]),
  ]
}

// ─── Structure 7: ticket ──────────────────────────────────────────────────────

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
      panel('tab', box(0, 0, 1, 0.13), tab),
      badge(skin, box(0.06, 0.025, 0.5, 0.08), 'INLINE'),
      photo(box(0.08, 0.17, 0.84, 0.32)),
      bound('name', box(0.08, 0.52, 0.84, 0.19), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.72, 0.84, 0.06), 'caption', muted(skin)),
      price(box(0.08, 0.79, 0.84, 0.17), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('tab', box(0, 0, 1, 0.14), tab),
      badge(skin, box(0.06, 0.03, 0.46, 0.08), 'INLINE'),
      photo(box(0.08, 0.18, 0.84, 0.28)),
      bound('name', box(0.08, 0.49, 0.84, 0.19), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.69, 0.84, 0.07), 'caption', muted(skin)),
      price(box(0.08, 0.77, 0.84, 0.17), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      panel('tab', box(0, 0, 1, 0.2), tab),
      badge(skin, box(0.04, 0.045, 0.3, 0.11), 'INLINE'),
      photo(box(0.04, 0.26, 0.28, 0.66)),
      bound('name', box(0.36, 0.3, 0.32, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.36, 0.58, 0.32, 0.14), 'caption', muted(skin)),
      price(box(0.71, 0.32, 0.26, 0.5), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      panel('tab', box(0, 0, 0.14, 1), tab),
      badge(skin, box(0.015, 0.42, 0.11, 0.16), 'INLINE'),
      photo(box(0.17, 0.12, 0.12, 0.76)),
      bound('name', box(0.31, 0.24, 0.34, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.31, 0.56, 0.34, 0.18), 'caption', muted(skin)),
      price(box(0.68, 0.18, 0.29, 0.64), skin.price),
    ]),
  ]
}

// ─── Structure 8: price first ─────────────────────────────────────────────────

/**
 * The price at the top of the card, above the photograph.
 *
 * Reading order is the argument. A shopper scanning a page for a number finds it
 * on the first line of every card instead of the last, and on a dense page that
 * is the difference between scanning and hunting. It costs the packshot its
 * prominence, so it belongs on a page of known products rather than new ones.
 */
export const priceFirst = (skin: Skin): Arrangement[] => {
  // **The tier tab comes off the mark here, and only here.** Every other card
  // carries the tier once, as a chip; this one puts the mark where the chip
  // usually sits, so leaving the tab attached drew "DEAL" twice across the top
  // of the same card — the stacked-badge failure the research is unanimous
  // about. The chip keeps the tier because it is the element an owner can move.
  const mark: PriceMarkStyle = { ...(skin.price ?? {}), tab: 'none' }
  return [
  at(TALL, [
    base(skin),
    price(box(0.08, 0.06, 0.84, 0.2), mark),
    rule('divider', box(0.08, 0.29, 0.84, 0.006), skin.accent ?? 'inkMuted'),
    photo(box(0.08, 0.33, 0.84, 0.32)),
    badge(skin, box(0.62, 0.02, 0.34, 0.08), 'TOP_END'),
    bound('name', box(0.08, 0.68, 0.84, 0.19), 'h3', ink(skin)),
    bound('spec', box(0.08, 0.88, 0.84, 0.07), 'caption', muted(skin)),
  ]),
  at(SQUARISH, [
    base(skin),
    price(box(0.08, 0.06, 0.84, 0.21), mark),
    rule('divider', box(0.08, 0.3, 0.84, 0.006), skin.accent ?? 'inkMuted'),
    photo(box(0.08, 0.34, 0.84, 0.3)),
    badge(skin, box(0.62, 0.02, 0.34, 0.09), 'TOP_END'),
    bound('name', box(0.08, 0.67, 0.84, 0.19), 'h3', ink(skin)),
    bound('spec', box(0.08, 0.87, 0.84, 0.08), 'caption', muted(skin)),
  ]),
  at(WIDE, [
    base(skin),
    price(box(0.04, 0.16, 0.26, 0.68), mark),
    rule('divider', box(0.33, 0.14, 0.006, 0.72), skin.accent ?? 'inkMuted'),
    photo(box(0.37, 0.1, 0.26, 0.8)),
    badge(skin, box(0.8, 0.04, 0.18, 0.14), 'TOP_END'),
    bound('name', box(0.67, 0.24, 0.3, 0.28), 'h3', ink(skin)),
    bound('spec', box(0.67, 0.54, 0.3, 0.16), 'caption', muted(skin)),
  ]),
  at(BANNER, [
    base(skin),
    price(box(0.02, 0.18, 0.24, 0.64), mark),
    rule('divider', box(0.28, 0.16, 0.006, 0.68), skin.accent ?? 'inkMuted'),
    photo(box(0.31, 0.12, 0.13, 0.76)),
    bound('name', box(0.47, 0.24, 0.36, 0.3), 'h3', ink(skin)),
    bound('spec', box(0.47, 0.56, 0.36, 0.18), 'caption', muted(skin)),
  ]),
]
}

// ─── Structure 9: list row ────────────────────────────────────────────────────

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
      photo(box(0.06, 0.06, 0.88, 0.32)),
      badge(skin, box(0.03, 0.03, 0.36, 0.09)),
      bound('name', box(0.08, 0.44, 0.84, 0.2), 'h4', ink(skin)),
      bound('spec', box(0.08, 0.66, 0.84, 0.07), 'caption', muted(skin)),
      price(box(0.08, 0.75, 0.84, 0.18), skin.price),
      ...trailing,
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.06, 0.06, 0.88, 0.3)),
      badge(skin, box(0.03, 0.03, 0.34, 0.1)),
      bound('name', box(0.08, 0.42, 0.84, 0.2), 'h4', ink(skin)),
      bound('spec', box(0.08, 0.64, 0.84, 0.08), 'caption', muted(skin)),
      price(box(0.08, 0.74, 0.84, 0.18), skin.price),
      ...trailing,
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.03, 0.12, 0.22, 0.76)),
      badge(skin, box(0.02, 0.04, 0.14, 0.13)),
      bound('name', box(0.29, 0.2, 0.36, 0.28), 'h4', ink(skin)),
      bound('spec', box(0.29, 0.5, 0.36, 0.16), 'caption', muted(skin)),
      price(box(0.68, 0.22, 0.29, 0.56), skin.price),
      ...trailing,
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.015, 0.14, 0.1, 0.72)),
      bound('name', box(0.14, 0.24, 0.4, 0.3), 'h4', ink(skin)),
      bound('spec', box(0.14, 0.56, 0.4, 0.18), 'caption', muted(skin)),
      price(box(0.7, 0.2, 0.28, 0.6), skin.price),
      ...trailing,
    ]),
  ]
}

// ─── Structure 10: compact ────────────────────────────────────────────────────

/**
 * Name and price, nothing else. The 5×6 page.
 *
 * The spec line is **absent rather than small**: at this size it would set at
 * four or five pixels in print, which is a line nobody reads occupying space the
 * name needs. Density is derived from track count — composition model §4.3 — so
 * the honest answer to a dense grid is a block with less in it, not a block with
 * the same things shrunk.
 */
export const compact = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    photo(box(0.06, 0.05, 0.88, 0.36)),
    badge(skin, box(0.02, 0.02, 0.34, 0.1)),
    bound('name', box(0.06, 0.45, 0.88, 0.22), 'h4', ink(skin)),
    price(box(0.06, 0.7, 0.88, 0.25), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    photo(box(0.06, 0.06, 0.88, 0.34)),
    badge(skin, box(0.02, 0.02, 0.32, 0.11)),
    bound('name', box(0.06, 0.44, 0.88, 0.22), 'h4', ink(skin)),
    price(box(0.06, 0.68, 0.88, 0.26), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    photo(box(0.03, 0.1, 0.3, 0.8)),
    badge(skin, box(0.02, 0.04, 0.16, 0.15)),
    bound('name', box(0.36, 0.22, 0.3, 0.34), 'h4', ink(skin)),
    price(box(0.68, 0.2, 0.29, 0.6), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.12, 0.13, 0.76)),
    bound('name', box(0.18, 0.28, 0.42, 0.4), 'h4', ink(skin)),
    price(box(0.65, 0.18, 0.32, 0.64), skin.price),
  ]),
]

// ─── Structure 11: feature ────────────────────────────────────────────────────

/**
 * The lead deal: brand line, big name, big price, room around all three.
 *
 * Designed for a merged 2×2, which is where a weekly puts the product it is
 * actually advertising. The brand line above the name is the one place in the
 * library a brand gets its own row — everywhere else it is inside the name
 * string, which is how the catalog stores it.
 */
export const feature = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    badge(skin, box(0.04, 0.03, 0.3, 0.07)),
    photo(box(0.08, 0.1, 0.84, 0.36)),
    bound('brand', box(0.08, 0.49, 0.84, 0.06), 'caption', {
      ...muted(skin),
      transform: 'uppercase',
      letterSpacing: 0.08,
    }),
    bound('name', box(0.08, 0.56, 0.84, 0.18), 'h2', ink(skin)),
    bound('spec', box(0.08, 0.75, 0.84, 0.06), 'caption', muted(skin)),
    price(box(0.08, 0.82, 0.84, 0.14), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    badge(skin, box(0.04, 0.03, 0.28, 0.08)),
    photo(box(0.1, 0.08, 0.8, 0.4)),
    bound('brand', box(0.1, 0.5, 0.8, 0.06), 'caption', {
      ...muted(skin),
      transform: 'uppercase',
      letterSpacing: 0.08,
    }),
    bound('name', box(0.1, 0.57, 0.8, 0.18), 'h2', ink(skin)),
    bound('spec', box(0.1, 0.76, 0.8, 0.06), 'caption', muted(skin)),
    price(box(0.1, 0.82, 0.8, 0.14), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    badge(skin, box(0.02, 0.04, 0.16, 0.13)),
    photo(box(0.04, 0.08, 0.4, 0.84)),
    bound('brand', box(0.48, 0.14, 0.28, 0.08), 'caption', {
      ...muted(skin),
      transform: 'uppercase',
      letterSpacing: 0.08,
    }),
    bound('name', box(0.48, 0.23, 0.28, 0.3), 'h2', ink(skin)),
    bound('spec', box(0.48, 0.55, 0.28, 0.14), 'caption', muted(skin)),
    price(box(0.78, 0.24, 0.19, 0.52), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    photo(box(0.02, 0.08, 0.2, 0.84)),
    bound('brand', box(0.25, 0.18, 0.34, 0.12), 'caption', {
      ...muted(skin),
      transform: 'uppercase',
      letterSpacing: 0.08,
    }),
    bound('name', box(0.25, 0.31, 0.34, 0.34), 'h2', ink(skin)),
    bound('spec', box(0.25, 0.66, 0.34, 0.16), 'caption', muted(skin)),
    price(box(0.63, 0.16, 0.34, 0.68), skin.price),
  ]),
]

// ─── Structure 12: halo ───────────────────────────────────────────────────────

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
      disc('halo', box(0.14, 0.05, 0.72, 0.38), tint, { opacity: 0.28 }),
      photo(box(0.2, 0.08, 0.6, 0.32)),
      badge(skin, box(0.04, 0.02, 0.32, 0.09)),
      bound('name', box(0.08, 0.47, 0.84, 0.19), 'h3', { ...ink(skin), align: 'center' }),
      bound('spec', box(0.08, 0.67, 0.84, 0.06), 'caption', { ...muted(skin), align: 'center' }),
      price(box(0.08, 0.75, 0.84, 0.19), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      disc('halo', box(0.16, 0.05, 0.68, 0.38), tint, { opacity: 0.28 }),
      photo(box(0.22, 0.08, 0.56, 0.32)),
      badge(skin, box(0.04, 0.02, 0.3, 0.1)),
      bound('name', box(0.08, 0.46, 0.84, 0.19), 'h3', { ...ink(skin), align: 'center' }),
      bound('spec', box(0.08, 0.66, 0.84, 0.07), 'caption', { ...muted(skin), align: 'center' }),
      price(box(0.08, 0.74, 0.84, 0.19), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      disc('halo', box(0.03, 0.08, 0.32, 0.84), tint, { opacity: 0.28 }),
      photo(box(0.07, 0.16, 0.24, 0.68)),
      badge(skin, box(0.02, 0.03, 0.16, 0.14)),
      bound('name', box(0.39, 0.18, 0.32, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.39, 0.46, 0.32, 0.14), 'caption', muted(skin)),
      price(box(0.73, 0.24, 0.24, 0.52), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      disc('halo', box(0.015, 0.08, 0.16, 0.84), tint, { opacity: 0.28 }),
      photo(box(0.04, 0.18, 0.11, 0.64)),
      bound('name', box(0.21, 0.24, 0.4, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.21, 0.56, 0.4, 0.18), 'caption', muted(skin)),
      price(box(0.65, 0.18, 0.32, 0.64), skin.price),
    ]),
  ]
}

// ─── Structure 13: brand led ──────────────────────────────────────────────────

/**
 * The brand across the head of the card, under a rule, with the tier at the end.
 *
 * The supplier-funded page: when a brand has paid for the placement, its name
 * goes above the product rather than inside it. Set as an uppercase caption with
 * tracking, so it reads as a masthead and not as a second product name.
 */
export const brandLed = (skin: Skin): Arrangement[] => {
  const line = skin.accent ?? 'primary'
  const brandStyle = { ...ink(skin), transform: 'uppercase' as const, letterSpacing: 0.1 }
  return [
    at(TALL, [
      base(skin),
      bound('brand', box(0.08, 0.055, 0.6, 0.06), 'caption', brandStyle),
      badge(skin, box(0.66, 0.035, 0.3, 0.08), 'TOP_END'),
      rule('divider', box(0.08, 0.135, 0.84, 0.006), line),
      photo(box(0.08, 0.17, 0.84, 0.31)),
      bound('name', box(0.08, 0.51, 0.84, 0.19), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.71, 0.84, 0.06), 'caption', muted(skin)),
      price(box(0.08, 0.78, 0.84, 0.17), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      bound('brand', box(0.08, 0.06, 0.58, 0.07), 'caption', brandStyle),
      badge(skin, box(0.66, 0.04, 0.3, 0.09), 'TOP_END'),
      rule('divider', box(0.08, 0.15, 0.84, 0.006), line),
      photo(box(0.08, 0.18, 0.84, 0.28)),
      bound('name', box(0.08, 0.49, 0.84, 0.19), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.69, 0.84, 0.07), 'caption', muted(skin)),
      price(box(0.08, 0.77, 0.84, 0.17), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      bound('brand', box(0.04, 0.08, 0.4, 0.1), 'caption', brandStyle),
      badge(skin, box(0.8, 0.06, 0.18, 0.13), 'TOP_END'),
      rule('divider', box(0.04, 0.21, 0.93, 0.006), line),
      photo(box(0.04, 0.26, 0.28, 0.66)),
      bound('name', box(0.36, 0.3, 0.32, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.36, 0.58, 0.32, 0.14), 'caption', muted(skin)),
      price(box(0.71, 0.32, 0.26, 0.5), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      bound('brand', box(0.02, 0.1, 0.3, 0.14), 'caption', brandStyle),
      rule('divider', box(0.02, 0.27, 0.96, 0.006), line),
      photo(box(0.02, 0.34, 0.12, 0.56)),
      bound('name', box(0.17, 0.36, 0.42, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.17, 0.68, 0.42, 0.18), 'caption', muted(skin)),
      price(box(0.66, 0.32, 0.31, 0.56), skin.price),
    ]),
  ]
}

// ─── Structure 14: spec led ───────────────────────────────────────────────────

/**
 * Brand, model, then three lines of specification. The electronics page.
 *
 * The only structure that gives the spec more room than the name, and the reason
 * is that in electronics the spec *is* the product — "55 inch, 4K, smart" sells
 * a television that a model number does not. The spec is clamped to three lines
 * rather than shrunk: a spec may be cut, a name may not.
 */
export const specLed = (skin: Skin): Arrangement[] => {
  const brandStyle = { ...muted(skin), transform: 'uppercase' as const, letterSpacing: 0.06 }
  const specClamp = { mode: 'clamp' as const, lines: 3 }
  return [
    at(TALL, [
      base(skin),
      photo(box(0.08, 0.05, 0.84, 0.3)),
      badge(skin, box(0.04, 0.02, 0.32, 0.08)),
      bound('brand', box(0.08, 0.38, 0.84, 0.055), 'caption', brandStyle),
      bound('name', box(0.08, 0.44, 0.84, 0.17), 'h4', ink(skin)),
      bound('spec', box(0.08, 0.62, 0.84, 0.15), 'caption', {
        ...muted(skin),
        overflow: specClamp,
      }),
      price(box(0.08, 0.79, 0.84, 0.17), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      photo(box(0.08, 0.05, 0.84, 0.28)),
      badge(skin, box(0.04, 0.02, 0.3, 0.09)),
      bound('brand', box(0.08, 0.36, 0.84, 0.06), 'caption', brandStyle),
      bound('name', box(0.08, 0.43, 0.84, 0.17), 'h4', ink(skin)),
      bound('spec', box(0.08, 0.61, 0.84, 0.16), 'caption', {
        ...muted(skin),
        overflow: specClamp,
      }),
      price(box(0.08, 0.78, 0.84, 0.17), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      photo(box(0.04, 0.1, 0.3, 0.8)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      bound('brand', box(0.38, 0.14, 0.32, 0.08), 'caption', brandStyle),
      bound('name', box(0.38, 0.23, 0.32, 0.22), 'h4', ink(skin)),
      bound('spec', box(0.38, 0.47, 0.32, 0.3), 'caption', { ...muted(skin), overflow: specClamp }),
      price(box(0.73, 0.24, 0.24, 0.52), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      photo(box(0.02, 0.12, 0.13, 0.76)),
      bound('brand', box(0.18, 0.16, 0.4, 0.12), 'caption', brandStyle),
      bound('name', box(0.18, 0.3, 0.4, 0.26), 'h4', ink(skin)),
      bound('spec', box(0.18, 0.58, 0.4, 0.28), 'caption', { ...muted(skin), overflow: specClamp }),
      price(box(0.64, 0.18, 0.33, 0.64), skin.price),
    ]),
  ]
}

// ─── Structure 15: side rail ──────────────────────────────────────────────────

/**
 * A coloured rail down the start edge of the card.
 *
 * The rail is the whole reason this exists: it is a vertical line running down
 * every card in a column, which turns a grid of separate objects into a set of
 * columns the eye can follow. `start`, not `left` — in an Arabic edition the
 * rail is on the trailing edge and the design is unchanged, because the
 * coordinate is logical rather than physical.
 *
 * The tier pill sits **beside** the rail rather than in it. It hung off the
 * start edge in the first draft, half on the rail and half on the page, which
 * read as a mistake rather than as a decision.
 */
export const sideRail = (skin: Skin): Arrangement[] => {
  const rail = skin.accent ?? 'primary'
  return [
    at(TALL, [
      base(skin),
      panel('rail', box(0, 0, 0.1, 1), rail),
      badge(skin, box(0.14, 0.03, 0.34, 0.08)),
      photo(box(0.16, 0.06, 0.78, 0.34)),
      bound('name', box(0.16, 0.45, 0.78, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.16, 0.66, 0.78, 0.06), 'caption', muted(skin)),
      price(box(0.16, 0.74, 0.78, 0.19), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('rail', box(0, 0, 0.09, 1), rail),
      badge(skin, box(0.13, 0.03, 0.32, 0.09)),
      photo(box(0.15, 0.06, 0.79, 0.32)),
      bound('name', box(0.15, 0.44, 0.79, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.15, 0.65, 0.79, 0.07), 'caption', muted(skin)),
      price(box(0.15, 0.74, 0.79, 0.19), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      panel('rail', box(0, 0, 0.05, 1), rail),
      badge(skin, box(0.08, 0.05, 0.2, 0.13)),
      photo(box(0.08, 0.22, 0.24, 0.68)),
      bound('name', box(0.36, 0.2, 0.32, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.36, 0.48, 0.32, 0.14), 'caption', muted(skin)),
      price(box(0.71, 0.24, 0.26, 0.52), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      panel('rail', box(0, 0, 0.03, 1), rail),
      photo(box(0.06, 0.12, 0.12, 0.76)),
      bound('name', box(0.21, 0.24, 0.4, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.21, 0.56, 0.4, 0.18), 'caption', muted(skin)),
      price(box(0.66, 0.18, 0.31, 0.64), skin.price),
    ]),
  ]
}

// ─── Structure 16: split tint ─────────────────────────────────────────────────

/**
 * The top of the card is tinted, the bottom is white. The packshot straddles it.
 *
 * A cheap way to get colour onto a page without losing legibility anywhere it
 * matters: the tint is behind the photograph, where nothing has to be read, and
 * the name and the price sit on white.
 */
export const splitTint = (skin: Skin): Arrangement[] => {
  const tint = skin.accent ?? 'accent'
  return [
    at(TALL, [
      base(skin),
      panel('tint', box(0, 0, 1, 0.46), tint),
      photo(box(0.1, 0.06, 0.8, 0.36)),
      badge(skin, box(0.04, 0.02, 0.32, 0.09)),
      bound('name', box(0.08, 0.5, 0.84, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.71, 0.84, 0.06), 'caption', muted(skin)),
      price(box(0.08, 0.78, 0.84, 0.17), skin.price),
    ]),
    at(SQUARISH, [
      base(skin),
      panel('tint', box(0, 0, 1, 0.44), tint),
      photo(box(0.1, 0.06, 0.8, 0.34)),
      badge(skin, box(0.04, 0.02, 0.3, 0.1)),
      bound('name', box(0.08, 0.48, 0.84, 0.2), 'h3', ink(skin)),
      bound('spec', box(0.08, 0.69, 0.84, 0.07), 'caption', muted(skin)),
      price(box(0.08, 0.77, 0.84, 0.17), skin.price),
    ]),
    at(WIDE, [
      base(skin),
      panel('tint', box(0, 0, 0.4, 1), tint),
      photo(box(0.05, 0.12, 0.3, 0.76)),
      badge(skin, box(0.02, 0.04, 0.16, 0.14)),
      bound('name', box(0.44, 0.18, 0.3, 0.26), 'h3', ink(skin)),
      bound('spec', box(0.44, 0.46, 0.3, 0.14), 'caption', muted(skin)),
      price(box(0.76, 0.24, 0.21, 0.52), skin.price),
    ]),
    at(BANNER, [
      base(skin),
      panel('tint', box(0, 0, 0.2, 1), tint),
      photo(box(0.03, 0.12, 0.14, 0.76)),
      bound('name', box(0.23, 0.24, 0.4, 0.3), 'h3', ink(skin)),
      bound('spec', box(0.23, 0.56, 0.4, 0.18), 'caption', muted(skin)),
      price(box(0.66, 0.18, 0.31, 0.64), skin.price),
    ]),
  ]
}

// ─── Structure 17: no photograph ──────────────────────────────────────────────

/**
 * Name and price, with no image element at all.
 *
 * **Not a fallback — a design.** The real catalog carries a photograph on 4.2%
 * of rows (`harness/real.ts`), so a library where every card assumes one is a
 * library that mostly prints grey boxes. Without the packshot the name can take
 * two type steps it never gets elsewhere, and the result reads like a price list
 * on purpose rather than like a flyer with holes in it.
 */
export const wordsOnly = (skin: Skin): Arrangement[] => [
  at(TALL, [
    base(skin),
    badge(skin, box(0.06, 0.06, 0.4, 0.1)),
    bound('name', box(0.08, 0.22, 0.84, 0.3), 'h2', ink(skin)),
    bound('spec', box(0.08, 0.54, 0.84, 0.1), 'caption', muted(skin)),
    price(box(0.08, 0.68, 0.84, 0.24), skin.price),
  ]),
  at(SQUARISH, [
    base(skin),
    badge(skin, box(0.06, 0.07, 0.38, 0.11), 'INLINE'),
    bound('name', box(0.08, 0.24, 0.84, 0.28), 'h2', ink(skin)),
    bound('spec', box(0.08, 0.54, 0.84, 0.1), 'caption', muted(skin)),
    price(box(0.08, 0.67, 0.84, 0.25), skin.price),
  ]),
  at(WIDE, [
    base(skin),
    badge(skin, box(0.05, 0.08, 0.22, 0.16), 'INLINE'),
    bound('name', box(0.05, 0.3, 0.55, 0.32), 'h2', ink(skin)),
    bound('spec', box(0.05, 0.66, 0.55, 0.16), 'caption', muted(skin)),
    price(box(0.63, 0.22, 0.33, 0.56), skin.price),
  ]),
  at(BANNER, [
    base(skin),
    bound('name', box(0.04, 0.24, 0.5, 0.34), 'h2', ink(skin)),
    bound('spec', box(0.04, 0.6, 0.5, 0.2), 'caption', muted(skin)),
    price(box(0.6, 0.18, 0.37, 0.64), skin.price),
  ]),
]

// ─── The cards ────────────────────────────────────────────────────────────────

export interface CardBlock {
  id: string
  name: string
  description: string
  arrangements: Arrangement[]
}

const TAG_ON_TINT: PriceMarkStyle = { surface: { from: 'role', ref: 'surface' } }

/**
 * Thirty-three repeating cards.
 *
 * Ordered by how likely a shop is to want one, not by structure: the plain card
 * every grocer needs is first, and the specialist shapes are further down. A
 * library is a list somebody scrolls, and the order is the only navigation it
 * has until there is a filter.
 */
export const CARD_BLOCKS: CardBlock[] = [
  {
    id: 'blk_offer_card',
    name: 'Offer card',
    description: 'One product, its price and its badge. Reflows for merged regions.',
    arrangements: stacked({ ground: 'surface' }),
  },
  {
    id: 'blk_offer_card_tinted',
    name: 'Offer card, tinted',
    description: 'The same card grounded in your first brand colour. One per page, for the lead deal.',
    arrangements: stacked({ ground: 'primary', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
  {
    id: 'blk_offer_card_accent',
    name: 'Offer card, accent',
    description: 'Grounded in the accent colour. Reads as a second tier of emphasis under the tinted card.',
    arrangements: stacked({ ground: 'accent', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
  {
    id: 'blk_offer_card_outlined',
    name: 'Offer card, outlined',
    description: 'A hairline border instead of a fill. Separates cards on a page that has no gaps.',
    arrangements: stacked({ ground: 'surface', stroke: outline('inkMuted', 0.004) }),
  },
  {
    id: 'blk_price_band',
    name: 'Price band card',
    description: 'The price reversed out of a coloured band along the foot. The weekly-flyer default.',
    arrangements: priceBand({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_price_band_accent',
    name: 'Price band card, accent',
    description: 'The same band in the accent colour, for a page that already uses the primary elsewhere.',
    arrangements: priceBand({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_price_band_ink',
    name: 'Price band card, ink',
    description: 'A near-black band. The quietest way to make a price the loudest thing on a card.',
    arrangements: priceBand({ ground: 'surface', accent: 'ink' }),
  },
  {
    id: 'blk_photo_led',
    name: 'Photo-led card',
    description: 'Nearly half the card is the packshot. For produce, bakery and anything sold by its look.',
    arrangements: photoLed({ ground: 'surface' }),
  },
  {
    id: 'blk_photo_led_tinted',
    name: 'Photo-led card, tinted',
    description: 'A photo-led card on a coloured ground, for a section that should read as its own.',
    arrangements: photoLed({ ground: 'secondary', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
  {
    id: 'blk_compact',
    name: 'Compact card',
    description: 'Name and price only. The block for a five-across page, where a spec line would not be read.',
    arrangements: compact({ ground: 'surface' }),
  },
  {
    id: 'blk_compact_tinted',
    name: 'Compact card, tinted',
    description: 'A dense card on a coloured ground. Useful for a whole aisle rather than one product.',
    arrangements: compact({ ground: 'primary', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
  {
    id: 'blk_feature',
    name: 'Feature card',
    description: 'Brand line, big name, big price. Designed for a merged two-by-two — your lead deal.',
    arrangements: feature({ ground: 'surface' }),
  },
  {
    id: 'blk_feature_tinted',
    name: 'Feature card, tinted',
    description: 'The lead deal on a coloured ground, so it separates from the cards around it.',
    arrangements: feature({ ground: 'primary', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
  {
    id: 'blk_burst',
    name: 'Price burst card',
    description: 'The price in a disc over the packshot. Loud on purpose — one to a page.',
    arrangements: burst({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_burst_primary',
    name: 'Price burst card, primary',
    description: 'The same burst in your first brand colour.',
    arrangements: burst({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_overlay',
    name: 'Photo overlay card',
    description: 'Full-bleed photograph with the name and price on a dark scrim. Built for a square post.',
    arrangements: overlay('ink', 'surface'),
  },
  {
    id: 'blk_overlay_light',
    name: 'Photo overlay card, light',
    description: 'The same overlay with a pale scrim and dark type, for photographs that are already dark.',
    arrangements: overlay('surface', 'ink'),
  },
  {
    id: 'blk_ticket',
    name: 'Ticket card',
    description: 'A dark tab across the head carrying the badge. Reads at the smallest sizes.',
    arrangements: ticket({ ground: 'surface', accent: 'ink' }),
  },
  {
    id: 'blk_ticket_tinted',
    name: 'Ticket card, tinted',
    description: 'A white tab on a coloured card, so the badge keeps its own colour and still reads.',
    arrangements: ticket({
      ground: 'primary',
      onTint: true,
      accent: 'surface',
      price: TAG_ON_TINT,
    }),
  },
  {
    id: 'blk_framed',
    name: 'Framed card',
    description: 'A hairline frame, centred type and a rule above the price. The quieter register.',
    arrangements: framed({ ground: 'surface', stroke: outline('primary', 0.005) }),
  },
  {
    id: 'blk_framed_quiet',
    name: 'Framed card, quiet',
    description: 'The same frame in a muted line, for a page that should not shout.',
    arrangements: framed({ ground: 'surface', stroke: outline('inkMuted', 0.004), price: PLAIN_PRICE }),
  },
  {
    id: 'blk_price_first',
    name: 'Price-first card',
    description: 'The price on the first line of every card, above the packshot. Fast to scan.',
    arrangements: priceFirst({ ground: 'surface' }),
  },
  {
    id: 'blk_price_first_tinted',
    name: 'Price-first card, tinted',
    description: 'Price-first on a coloured ground, for a page of one category.',
    arrangements: priceFirst({ ground: 'secondary', onTint: true, price: TAG_ON_TINT, accent: 'surface', chipFill: 'ink' }),
  },
  {
    id: 'blk_list_row',
    name: 'List row',
    description: 'A line item: thumbnail, name, price at the end. For a wide region or a full row.',
    arrangements: listRow({ ground: 'surface' }, false),
  },
  {
    id: 'blk_list_row_ruled',
    name: 'List row, ruled',
    description: 'The same row with a rule beneath, so a stack of them reads as one table.',
    arrangements: listRow({ ground: 'surface' }, true),
  },
  {
    id: 'blk_side_rail',
    name: 'Side rail card',
    description: 'A coloured rail down the start edge with the badge turned into it. Mirrors in Arabic.',
    arrangements: sideRail({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_split_tint',
    name: 'Split tint card',
    description: 'Tinted behind the packshot, white behind the words. Colour without losing legibility.',
    arrangements: splitTint({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_halo',
    name: 'Halo card',
    description: 'A tinted disc behind the packshot, which gives a shot-on-white photograph an edge.',
    arrangements: halo({ ground: 'surface', accent: 'accent' }),
  },
  {
    id: 'blk_brand_led',
    name: 'Brand-led card',
    description: 'The brand above the product under a rule. For supplier-funded placements.',
    arrangements: brandLed({ ground: 'surface', accent: 'primary' }),
  },
  {
    id: 'blk_spec_led',
    name: 'Spec card',
    description: 'Brand, model, then three lines of specification. The electronics and appliance page.',
    arrangements: specLed({ ground: 'surface' }),
  },
  {
    id: 'blk_pharmacy',
    name: 'Pharmacy card',
    description: 'Centred, framed and unhurried, with the pack detail given room. For pharmacy and beauty.',
    arrangements: framed({ ground: 'surface', stroke: outline('secondary', 0.004), accent: 'secondary' }),
  },
  {
    id: 'blk_words_only',
    name: 'Card without a photograph',
    description: 'Name and price at full size, no image. For the two thirds of a catalog with no packshot.',
    arrangements: wordsOnly({ ground: 'surface' }),
  },
  {
    id: 'blk_words_only_tinted',
    name: 'Card without a photograph, tinted',
    description: 'The same card grounded in colour, which is what makes a page of them look deliberate.',
    arrangements: wordsOnly({ ground: 'primary', onTint: true, price: TAG_ON_TINT, chipFill: 'ink' }),
  },
]
