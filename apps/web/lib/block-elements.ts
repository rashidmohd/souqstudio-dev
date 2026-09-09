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
  logo: (): BlockElement => ({
    id: newElementId(),
    kind: 'logo',
    box: { start: 0.04, top: 0.04, width: 0.18, height: 0.14 },
  }),
  rectangle: (): BlockElement => ({
    id: newElementId(),
    kind: 'shape',
    box: { start: 0.15, top: 0.3, width: 0.7, height: 0.3 },
    fill: role('primary'),
    variant: 'rect',
    radius: 3,
  }),
  /**
   * The one offer shape on the rail.
   *
   * **The other five are a click away in the properties panel and this one is
   * not**, because a burst is what an offer card is usually *about* — and a
   * shape nobody knows exists is a shape nobody uses. Putting all six on the
   * rail would make a strip of nineteen tools out of one that is already long.
   */
  burst: (): BlockElement => ({
    id: newElementId(),
    kind: 'shape',
    box: { start: 0.32, top: 0.28, width: 0.36, height: 0.36 },
    fill: role('accent'),
    variant: 'burst',
    radius: 0,
  }),
  ellipse: (): BlockElement => ({
    id: newElementId(),
    kind: 'shape',
    box: { start: 0.3, top: 0.3, width: 0.4, height: 0.4 },
    fill: role('accent'),
    variant: 'ellipse',
    radius: 0,
  }),
  line: (): BlockElement => ({
    id: newElementId(),
    kind: 'shape',
    box: { start: 0.1, top: 0.5, width: 0.8, height: 0.02 },
    fill: role('ink'),
    variant: 'line',
    radius: 0,
    stroke: { color: role('ink'), width: 0.004 },
  }),
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
