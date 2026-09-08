/**
 * The vocabulary the seeded library is written in.
 *
 * Sixty-odd blocks hand-authored as raw `BlockElement` literals would be sixty
 * chances to write `left` instead of `start`, to reach for a hex, or to give two
 * elements the same id. These factories make each of those a compile error or an
 * impossibility, and they make a block short enough to *read* — which is what
 * lets a design be reviewed by looking at it rather than by rendering it.
 *
 * Two rules are structural here rather than remembered:
 *
 * - **Every colour is a `TokenRef`.** `role()` is the only way to name one, and
 *   it takes nothing else. A block SouqStudio ships is loaded by every account
 *   and has to name a colour before it has met any of them — `usesOnlyRoles` in
 *   the web app enforces it at the edge, and this makes it hard to break here.
 * - **Every size is a fraction of the block.** There is no pixel in this file,
 *   so the same design is 1080 square in a carousel post and a third of a column
 *   in an A4 booklet.
 *
 * `docs/composition-model.md` §3.
 */

import type {
  Arrangement,
  BlockElement,
  ChipAnchorRef,
  FlatColor,
  ImageSource,
  LogicalAlign,
  PriceMarkStyle,
  Stroke,
  TextOverflow,
  TokenRef,
  TypeFamily,
  TypeLevel,
} from '@souqstudio/types'

// ─── Geometry ─────────────────────────────────────────────────────────────────

/** Fractions of block width and height. Logical: `start`, never `left`. */
export const box = (start: number, top: number, width: number, height: number) => ({
  start,
  top,
  width,
  height,
})

export type Box = ReturnType<typeof box>

/** A colour, the only way a seeded block may name one. */
export const role = (ref: TokenRef): FlatColor => ({ from: 'role', ref })

// ─── Aspect ranges ────────────────────────────────────────────────────────────

/**
 * The four shapes a merged region makes, as ranges that **meet** rather than
 * overlap.
 *
 * Shared endpoints are how a set of ranges covers the line without a hole in it,
 * and `coverageProblems` reads a shared endpoint as a touch. A repeating card
 * that carries all four is one that reflows into any merge an owner can draw.
 */
export const TALL = { aspectMin: 0.35, aspectMax: 0.85 }
export const SQUARISH = { aspectMin: 0.85, aspectMax: 1.35 }
export const WIDE = { aspectMin: 1.35, aspectMax: 2.6 }
export const BANNER = { aspectMin: 2.6, aspectMax: 12 }

/**
 * The shapes a block **placed once** is designed at, and they are narrow on
 * purpose.
 *
 * A static block only ever carries one arrangement, so its range is not doing
 * selection work — `pickArrangement` falls back to the nearest and never fails.
 * What the range *is* doing is saying what the design was drawn for, and two
 * screens read it: `defaultShape` in the designer opens a cover as a page rather
 * than a band, and the library preview draws each block at its own proportions
 * instead of letterboxing a masthead into a strip.
 *
 * `OPEN` stays for the genuinely shape-agnostic ones — a message panel crops
 * into anything close, which is the asymmetry the composition model predicts.
 */
export const OPEN = { aspectMin: 0.1, aspectMax: 30 }
export const PAGE = { aspectMin: 0.55, aspectMax: 0.85 }
export const SQUARE = { aspectMin: 0.86, aspectMax: 1.2 }
export const HALF = { aspectMin: 1.25, aspectMax: 2.2 }
export const STRIP = { aspectMin: 2.4, aspectMax: 30 }

// ─── Shapes ───────────────────────────────────────────────────────────────────

interface ShapeOptions {
  radius?: number
  stroke?: Stroke
  opacity?: number
  rotation?: number
}

/**
 * The card's ground, edge to edge.
 *
 * Every card has one, and `surface` is the honest default: a page is already a
 * colour, and a card that does not draw its own ground disappears into it. The
 * ones that ground themselves in `primary` or `accent` are making a decision —
 * a tinted card reads as *the* offer on a page of white ones, which is exactly
 * how a flyer marks its lead deal.
 */
export const ground = (fill: TokenRef, options: ShapeOptions = {}): BlockElement => ({
  id: 'ground',
  kind: 'shape',
  box: box(0, 0, 1, 1),
  fill: role(fill),
  radius: options.radius ?? 3,
  ...(options.stroke === undefined ? {} : { stroke: options.stroke }),
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
})

/** A rectangle that is not the ground: a price band, a header strip, a rail. */
export const panel = (
  id: string,
  b: Box,
  fill: TokenRef,
  options: ShapeOptions = {}
): BlockElement => ({
  id,
  kind: 'shape',
  box: b,
  fill: role(fill),
  radius: options.radius ?? 3,
  ...(options.stroke === undefined ? {} : { stroke: options.stroke }),
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
})

/** A circle or an oval. The produce-counter shape, and the burst behind a price. */
export const disc = (
  id: string,
  b: Box,
  fill: TokenRef,
  options: ShapeOptions = {}
): BlockElement => ({
  id,
  kind: 'shape',
  variant: 'ellipse',
  box: b,
  fill: role(fill),
  radius: 0,
  ...(options.stroke === undefined ? {} : { stroke: options.stroke }),
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
})

/**
 * A rule, horizontal or vertical.
 *
 * `variant: 'line'` draws its stroke along the box's **middle, left to right**,
 * in both painters — so a tall, narrow box asking for a vertical divider comes
 * out as a two-pixel dash, which is what three of these were until the gallery
 * was looked at. A vertical rule is therefore a thin filled rectangle, where the
 * box's own width is the thickness, and the caller writes the same call either
 * way.
 *
 * The horizontal case stays a line because that is what it should be: a hairline
 * under a list row drawn as a 0.002-tall rectangle rounds away to nothing at
 * small sizes, where a stroke has a one-pixel floor.
 */
export const rule = (id: string, b: Box, fill: TokenRef, width = 0.004): BlockElement =>
  b.height > b.width
    ? { id, kind: 'shape', box: b, fill: role(fill), radius: 0 }
    : {
        id,
        kind: 'shape',
        variant: 'line',
        box: b,
        fill: role(fill),
        radius: 0,
        stroke: { color: role(fill), width },
      }

/** A hairline border, for the framed cards. */
export const outline = (fill: TokenRef, width = 0.005): Stroke => ({
  color: role(fill),
  width,
})

// ─── Content ──────────────────────────────────────────────────────────────────

interface ImageOptions {
  /** `contain` letterboxes a packshot; `cover` crops a background photograph. */
  fit?: 'contain' | 'cover'
  radius?: number
  stroke?: Stroke
  opacity?: number
}

/**
 * The product photograph.
 *
 * `contain` on every card that has a ground, because a packshot cropped to fill
 * a box loses the top of the bottle. `cover` is for the cards that make the
 * photo *the* card — and those are the ones that then have to put the name and
 * the price on something opaque.
 */
export const photo = (b: Box, options: ImageOptions = {}): BlockElement => ({
  id: 'photo',
  kind: 'image',
  box: b,
  source: { from: 'product' } satisfies ImageSource,
  fit: options.fit ?? 'contain',
  ...(options.radius === undefined ? {} : { radius: options.radius }),
  ...(options.stroke === undefined ? {} : { stroke: options.stroke }),
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
})

interface TextOptions {
  align?: LogicalAlign
  weight?: number
  transform?: 'none' | 'uppercase'
  color?: TokenRef
  family?: TypeFamily
  letterSpacing?: number
  overflow?: TextOverflow
  opacity?: number
  rotation?: number
  italic?: boolean
}

const textElement = (
  id: string,
  b: Box,
  source: Extract<BlockElement, { kind: 'text' }>['source'],
  level: TypeLevel,
  options: TextOptions
): BlockElement => ({
  id,
  kind: 'text',
  box: b,
  source,
  level,
  align: options.align ?? 'start',
  ...(options.weight === undefined ? {} : { weight: options.weight }),
  ...(options.transform === undefined ? {} : { transform: options.transform }),
  ...(options.color === undefined ? {} : { color: role(options.color) }),
  ...(options.family === undefined ? {} : { family: options.family }),
  ...(options.letterSpacing === undefined ? {} : { letterSpacing: options.letterSpacing }),
  ...(options.overflow === undefined ? {} : { overflow: options.overflow }),
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
  ...(options.italic === undefined ? {} : { italic: options.italic }),
})

/**
 * A product field, bound.
 *
 * **Owners never type a product name onto a page**, so there is no factory here
 * that would let a seeded block do it either. The id is the field name, which
 * makes a diff of a design say `spec moved` rather than `e4 moved`, and keeps
 * ids unique inside an arrangement by construction as long as a field appears
 * once — which is the only way it should appear.
 */
export const bound = (
  field: 'name' | 'spec' | 'brand' | 'origin' | 'packSize',
  b: Box,
  level: TypeLevel,
  options: TextOptions = {}
): BlockElement => textElement(field, b, { from: 'product', field }, level, options)

/** A shop field: the name, the phone, the address. Available to any block. */
export const shopField = (
  field: 'name' | 'phone' | 'address',
  b: Box,
  level: TypeLevel,
  options: TextOptions = {}
): BlockElement => textElement(`shop-${field}`, b, { from: 'shop', field }, level, options)

/**
 * Static copy — a headline, a legal line, a validity date.
 *
 * **Both languages, always.** A static line with only an English value renders a
 * hole in the Arabic edition, and the owner who typed it will never look at that
 * edition. The schema refuses one at the edge; taking both as required arguments
 * means a seeded block cannot be written with one in the first place.
 */
export const words = (
  id: string,
  b: Box,
  textEn: string,
  textAr: string,
  level: TypeLevel,
  options: TextOptions = {}
): BlockElement => textElement(id, b, { from: 'static', textEn, textAr }, level, options)

/**
 * The price mark: placed and sized, never opened.
 *
 * The raised minor digits, the tier tab, the three-decimal KWD/OMR/BHD branch
 * and LTR-in-Arabic are internal — E6 §3. What `style` opens is the *skin*:
 * colour, ground, whether there is a frame at all, whether the tab shows. That
 * is the shop's brand rather than our typography, and it is what stops the mark
 * feeling like somebody else's component in the middle of their card.
 */
export const price = (
  b: Box,
  style?: PriceMarkStyle,
  options: { rotation?: number } = {}
): BlockElement => ({
  id: 'price',
  kind: 'priceMark',
  box: b,
  ...(style === undefined ? {} : { style }),
  // Rotation is placement, not composition — it lives on `ElementBase` like it
  // does for every other kind. A mark tilted with the band it sits in is still
  // the same mark; what E6 §3 refuses is opening it up, not moving it.
  ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
})

/** `plain` drops the ground and the outline: digits alone on a tinted card. */
export const PLAIN_PRICE: PriceMarkStyle = { frame: 'plain', tab: 'none' }
/** The mark on a coloured band, reading in the surface colour. */
export const REVERSED_PRICE: PriceMarkStyle = {
  frame: 'plain',
  tab: 'none',
  ink: role('surface'),
}

/**
 * The promo tier, as a pill.
 *
 * It overhangs the card on purpose — E6 §7 — and the engine reserves the bleed
 * when it calculates the gap, which is why `validateBlock` allows a chip a
 * quarter of the block outside its own bounds and nothing else any.
 */
export const chip = (b: Box, anchor: ChipAnchorRef = 'TOP_START', fill?: TokenRef): BlockElement => ({
  id: 'chip',
  kind: 'chip',
  box: b,
  anchor,
  ...(fill === undefined ? {} : { fill: role(fill) }),
})

export const logo = (b: Box, options: { opacity?: number } = {}): BlockElement => ({
  id: 'logo',
  kind: 'logo',
  box: b,
  ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
})

// ─── Assembly ─────────────────────────────────────────────────────────────────

/** One layout, valid over a range of container aspects. */
export const at = (
  range: { aspectMin: number; aspectMax: number },
  elements: BlockElement[]
): Arrangement => ({ ...range, elements })

/**
 * A block placed once, at the shape it was designed for.
 *
 * One arrangement is the rule rather than an economy: a panel is drawn at one
 * aspect and crops into anything close, and giving it four would be four designs
 * to keep in step for a gain no owner would see.
 */
export const still = (
  range: { aspectMin: number; aspectMax: number },
  elements: BlockElement[]
): Arrangement[] => [at(range, elements)]
