import type { BlockElement, Box, FlatColor } from '@souqstudio/types'

/**
 * Minting elements for the designer. E7.
 *
 * **Every element carries an id from the moment it exists**, because everything
 * the designer does to more than one thing at a time — select, group, align,
 * reorder, copy — needs to name them. Indexes stopped identifying anything the
 * day two elements could swap places.
 *
 * The ids are short and random rather than sequential. Sequential ids collide
 * the instant an owner pastes elements copied from another block, which is a
 * thing this designer now lets them do.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function newElementId(): string {
  let id = ''
  for (let i = 0; i < 8; i += 1) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `e_${id}`
}

/** A fresh copy of an element, with new identity. Used by paste and duplicate. */
export function reidentify(element: BlockElement, groupId?: string): BlockElement {
  const next = { ...element, id: newElementId() }
  if (groupId !== undefined) return { ...next, groupId }
  const { groupId: _dropped, ...ungrouped } = next
  return ungrouped as BlockElement
}

/**
 * Where a dropped element lands, and how big it starts.
 *
 * In the middle rather than at the origin: an element that appears under the
 * palette is one the owner has to go and find, and one that appears where they
 * are looking is one they can drag immediately.
 */
export const DROP: Box = { start: 0.25, top: 0.4, width: 0.5, height: 0.14 }

const role = (ref: 'primary' | 'secondary' | 'accent' | 'surface' | 'ink' | 'inkMuted'): FlatColor => ({
  from: 'role',
  ref,
})

/** Every shape a `kind: 'shape'` element may be. */
export type ShapeVariant = NonNullable<Extract<BlockElement, { kind: 'shape' }>['variant']>

/**
 * Which shapes exist, in the order they are offered, and what each is called.
 *
 * **One list, read by the shapes panel and by the properties panel’s variant
 * grid.** They were two lists, and two copies of the same thirteen shapes drift
 * the first time a fourteenth is added to one of them: the panel would offer a
 * shape the picker could not name, or the reverse, and nothing would fail.
 *
 * The order is the one the variant grid already used — the three primitives
 * first, because a rectangle is what most owners reach for, then the offer
 * furniture, because a burst is what an offer card is usually about.
 */
export const SHAPE_VARIANTS: { value: ShapeVariant; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Circle' },
  { value: 'line', label: 'Line' },
  { value: 'burst', label: 'Burst' },
  { value: 'star', label: 'Star' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'tag', label: 'Tag' },
  { value: 'flash', label: 'Corner flash' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arch', label: 'Curved panel' },
  { value: 'wave', label: 'Wave' },
  { value: 'bubble', label: 'Speech bubble' },
]

type ShapeSeed = {
  box: Box
  fill: FlatColor
  radius: number
  stroke?: { color: FlatColor; width: number }
}

/**
 * Where each shape lands when it is dropped, and in what colour.
 *
 * **A table rather than a factory each, because two entry points mint these
 * now.** The rail drops a burst and so does the shapes panel, and a burst that
 * starts square from one and oblong from the other is two shapes wearing one
 * name — the drift `packages/engine` keeps out of the *drawing* of a shape,
 * kept out of the placing of one.
 *
 * **The boxes follow `HOLDS_PROPORTION` in the engine rather than guessing.** A
 * burst and a star are read as circular objects, so they get a square to centre
 * in; a ribbon, a tag and an arrow are things whose length is the point, so they
 * get a band. A corner flash is the one shape that does not land in the middle:
 * it is a triangle cut from the reading corner, and dropping it centred hands
 * the owner a wedge floating in the card with the corner it belongs in still
 * empty.
 *
 * **Accent for the furniture, primary for the grounds.** A burst, a ribbon or a
 * tag is said *on top of* the card and wants to be seen against it; a rectangle,
 * a curved panel and a wave are grounds that other things sit on. Both are role
 * references, so they follow the shop’s palette rather than freezing a colour
 * the owner never picked, and the fill control is beside them when they want a
 * different one.
 */
const SHAPE_SEEDS: Record<ShapeVariant, ShapeSeed> = {
  rect: { box: { start: 0.15, top: 0.3, width: 0.7, height: 0.3 }, fill: role('primary'), radius: 3 },
  ellipse: { box: { start: 0.3, top: 0.3, width: 0.4, height: 0.4 }, fill: role('accent'), radius: 0 },
  line: {
    box: { start: 0.1, top: 0.5, width: 0.8, height: 0.02 },
    fill: role('ink'),
    radius: 0,
    stroke: { color: role('ink'), width: 0.004 },
  },
  burst: { box: { start: 0.32, top: 0.28, width: 0.36, height: 0.36 }, fill: role('accent'), radius: 0 },
  star: { box: { start: 0.32, top: 0.28, width: 0.36, height: 0.36 }, fill: role('accent'), radius: 0 },
  ribbon: { box: { start: 0.1, top: 0.38, width: 0.8, height: 0.22 }, fill: role('accent'), radius: 0 },
  tag: { box: { start: 0.2, top: 0.32, width: 0.6, height: 0.34 }, fill: role('accent'), radius: 0 },
  // The reading corner, not the middle. `shapePath` flips it in Arabic, and
  // `start` is a logical edge, so this is the same corner in both directions.
  flash: { box: { start: 0, top: 0, width: 0.34, height: 0.34 }, fill: role('accent'), radius: 0 },
  arrow: { box: { start: 0.12, top: 0.4, width: 0.76, height: 0.2 }, fill: role('accent'), radius: 0 },
  polygon: { box: { start: 0.32, top: 0.28, width: 0.36, height: 0.36 }, fill: role('accent'), radius: 0 },
  arch: { box: { start: 0.1, top: 0.28, width: 0.8, height: 0.34 }, fill: role('primary'), radius: 0 },
  // A scalloped header spans the card, because a header that stops short of the
  // edges is a panel.
  wave: { box: { start: 0, top: 0, width: 1, height: 0.22 }, fill: role('primary'), radius: 0 },
  bubble: { box: { start: 0.18, top: 0.3, width: 0.64, height: 0.3 }, fill: role('accent'), radius: 0 },
}

/** Mint one shape, placed and coloured by the table above. */
export function shapeElement(variant: ShapeVariant): BlockElement {
  const seed = SHAPE_SEEDS[variant]
  return {
    id: newElementId(),
    kind: 'shape',
    box: seed.box,
    fill: seed.fill,
    variant,
    radius: seed.radius,
    ...(seed.stroke === undefined ? {} : { stroke: seed.stroke }),
  }
}

/**
 * What each palette entry creates.
 *
 * **The bound half and the free half are separate lists**, and a block that is
 * placed once never sees the bound one — a static block has no product in
 * scope, so a product field there is not merely empty, it is a question with no
 * subject.
 */
export const BOUND_ELEMENTS = {
  'product-image': (): BlockElement => ({
    id: newElementId(),
    kind: 'image',
    box: { ...DROP, height: 0.3 },
    source: { from: 'product' },
  }),
  'product-name': (): BlockElement => ({
    id: newElementId(),
    kind: 'text',
    box: DROP,
    source: { from: 'product', field: 'name' },
    level: 'h3',
    align: 'start',
  }),
  'product-spec': (): BlockElement => ({
    id: newElementId(),
    kind: 'text',
    box: { ...DROP, height: 0.08 },
    source: { from: 'product', field: 'spec' },
    level: 'caption',
    align: 'start',
  }),
  'product-brand': (): BlockElement => ({
    id: newElementId(),
    kind: 'text',
    box: { ...DROP, height: 0.08 },
    source: { from: 'product', field: 'brand' },
    level: 'h6',
    align: 'start',
  }),
  price: (): BlockElement => ({
    id: newElementId(),
    kind: 'priceMark',
    box: { ...DROP, height: 0.2 },
  }),
  chip: (): BlockElement => ({
    id: newElementId(),
    kind: 'chip',
    box: { start: 0.04, top: 0.03, width: 0.34, height: 0.1 },
    anchor: 'TOP_START',
  }),
} as const

export const FREE_ELEMENTS = {
  text: (): BlockElement => ({
    id: newElementId(),
    kind: 'text',
    box: DROP,
    source: { from: 'static', textEn: 'Your text', textAr: 'النص' },
    level: 'h2',
    align: 'start',
  }),
  'shop-detail': (): BlockElement => ({
    id: newElementId(),
    kind: 'text',
    box: { ...DROP, height: 0.1 },
    source: { from: 'shop', field: 'name' },
    level: 'h4',
    align: 'start',
  }),
  /**
   * The shop's mark.
   *
   * **An image bound to `brand.logo`, not the `logo` kind** — E14 §3.1. The old
   * kind carried no source and no options: it could not be cropped, could not
   * take a radius or a stroke, and every property added to images had to be
   * added to it separately or silently not exist. It is a picture.
   *
   * The converter took the seeded library and every stored block across; this
   * is the third place, and the one that was missed — so every logo an owner
   * added went on being the dead kind, drawing a blank box that no binding
   * reached. The kind itself stays renderable until Phase 8, because a block
   * published to R2 is read by every shop.
   */
  logo: (): BlockElement => ({
    id: newElementId(),
    kind: 'image',
    source: { from: 'brand', field: 'logo' },
    // A mark letterboxes. Cropping one cuts its edges off.
    fit: 'contain',
    box: { start: 0.04, top: 0.04, width: 0.18, height: 0.14 },
  }),
  rectangle: (): BlockElement => shapeElement('rect'),
  /**
   * The one offer shape on the rail.
   *
   * **The other five are a click away in the properties panel and this one is
   * not**, because a burst is what an offer card is usually *about* — and a
   * shape nobody knows exists is a shape nobody uses. Putting all six on the
   * rail would make a strip of nineteen tools out of one that is already long.
   */
  burst: (): BlockElement => shapeElement('burst'),
  ellipse: (): BlockElement => shapeElement('ellipse'),
  line: (): BlockElement => shapeElement('line'),
  /**
   * A full-bleed ground, which is what most owners reach for first.
   *
   * **It goes to the bottom of the stack, and it is not white.** Both of those
   * were wrong on the first version and the pair of them made the control
   * destructive: a background is *defined* by being behind everything, so
   * appending it like any other element painted an opaque sheet over the whole
   * design — and defaulting it to `surface`, which resolves to white on white
   * paper, meant the owner saw their card go blank with nothing apparently
   * added. Clicking it twice, because the first click looked like it had done
   * nothing, is exactly what happened.
   *
   * The first brand colour instead: visible the moment it lands, and obviously
   * the thing that was just added.
   */
  background: (): BlockElement => ({
    id: newElementId(),
    kind: 'shape',
    box: { start: 0, top: 0, width: 1, height: 1 },
    fill: role('primary'),
    variant: 'rect',
    radius: 3,
  }),
  /**
   * Artwork the owner uploaded. It lands `cover` and full-bleed, because the
   * overwhelming reason to place one is as a background — and an owner who
   * wanted a small decorative image can drag it smaller in one gesture, where
   * one who wanted a background would otherwise have to drag all four edges.
   */
  artwork: (assetId: string): BlockElement => ({
    id: newElementId(),
    kind: 'image',
    box: { start: 0, top: 0, width: 1, height: 1 },
    source: { from: 'asset', assetId },
    fit: 'cover',
  }),
} as const
