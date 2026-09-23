/**
 * Five blocks, built by hand in the frame model. E14 Phase 4 — the second gate.
 *
 * **This is the phase that decides whether the model survives real design
 * rather than test fixtures.** The solver's 54 tests are all fixtures: boxes of
 * 20 and 30 with a gap of 10, chosen to make an arithmetic claim checkable.
 * These are the first things anybody would actually print.
 *
 * The plan names them and says why each is here:
 *
 * 1. **A shelf ticket** — row frame, currency and price, hug, justify end. The
 *    example that started the design: *"a longer price makes the row wider and
 *    it extends to the left, because the row is anchored at its end."*
 * 2. **A burst card** — a frame with `shape: 'star'`, a fill, padding, hugging a
 *    price. The one that answers *"how do I recolour the star"* by construction:
 *    the star **is** the frame, so recolouring it is selecting it and setting
 *    its fill.
 * 3. **A 3-up band with a card spanning two cells.** The real test. Figma
 *    shipped one-dimensional auto layout in 2020 and needed until May 2025 to
 *    admit that two-dimensional layout is not nested rows and columns. A flyer
 *    is a grid product, so find out in week one.
 * 4. **A header** and 5. **a footer**, because those exercise the data map and
 *    the offer card will not: logo, shop address, phone, the offer period.
 *
 * Every size here is in **design units** at the block's own `designSize`, per
 * §2.2 and §5.1. Nothing is a fraction of the frame, because a fraction is
 * circular in anything that hugs.
 */

import {
  NO_PADDING,
  fill,
  fixed,
  hug,
  type DesignSize,
  type LayoutFrame,
  type LayoutLeaf,
  type LayoutNode,
  type Padding,
} from '../src/index'
import { LINE_HEIGHT, estimateWidth, wrapText, type LeafPaint } from './frame-svg'

export interface FrameBlock {
  id: string
  name: string
  /** What the plan says this block is for, shown beside it in the gallery. */
  note: string
  design: DesignSize
  root: LayoutFrame
  paint: Record<string, LeafPaint>
  /** Drawn in both editions, because that is where the direction trap shows. */
  bothDirections: boolean
}

const pad = (p: Partial<Padding>): Padding => ({ ...NO_PADDING, ...p })

/** Ids are the ref too: one name per thing, so the sidecar map cannot drift. */
function text(
  id: string,
  paint: Extract<LeafPaint, { kind: 'text' }>,
  extra: Partial<LayoutLeaf> = {}
): { node: LayoutLeaf; paint: [string, LeafPaint] } {
  return {
    node: { id, kind: 'leaf', ref: id, width: hug(), height: hug(), ...extra },
    paint: [id, paint],
  }
}

function box(
  id: string,
  paint: LeafPaint,
  width: LayoutLeaf['width'],
  height: LayoutLeaf['height'],
  extra: Partial<LayoutLeaf> = {}
): { node: LayoutLeaf; paint: [string, LeafPaint] } {
  return {
    node: { id, kind: 'leaf', ref: id, width, height, ...extra },
    paint: [id, paint],
  }
}

/**
 * The measurer sees a leaf and must answer without knowing what it is, so every
 * text's intrinsic size is derived from its paint entry. This is the sidecar the
 * converter replaces with the element itself in Phase 5.
 */
export function measurerFor(paint: Record<string, LeafPaint>) {
  return (leaf: { ref?: string | undefined }, constraint: { width?: number | undefined }) => {
    const entry = leaf.ref === undefined ? undefined : paint[leaf.ref]
    if (entry === undefined || entry.kind !== 'text') return { width: 0, height: 0 }

    const content = entry.transform === 'uppercase' ? entry.content.toUpperCase() : entry.content

    /*
     * **The same `wrapText` the renderer calls.** Measuring one way and drawing
     * another is how the gallery came to show a name running through a price
     * while the solver believed it had wrapped.
     */
    const lines = wrapText(content, entry.size, constraint.width)
    const widest = lines.reduce((most, line) => Math.max(most, estimateWidth(line, entry.size)), 0)
    return { width: widest, height: lines.length * entry.size * LINE_HEIGHT }
  }
}

// ─── 1. Shelf ticket ──────────────────────────────────────────────────────────

/**
 * *"Currency and price, gap 5, price grows from right."*
 *
 * A row anchored at its end. A longer price makes the row wider and it extends
 * to the *left* — which is the sentence the whole design exists for, because it
 * is the thing the compass never solved. The compass let an owner say where a
 * part sits and not what happens when the digits change width.
 */
function shelfTicket(price: string): FrameBlock {
  /*
   * **`fill` on the width, not `hug`.** A hugging text reports its unwrapped
   * width and overflows a narrower parent — which is what CSS and Figma both
   * do, and which drew the spec line straight through the currency on the
   * long-price ticket. Filling is how an author says "take the column and wrap
   * inside it", and it is the authoring answer until the fit ladder is ported.
   */
  const name = text(
    'name',
    { kind: 'text', content: 'Almarai fresh laban', size: 15, weight: 600 },
    { width: fill() }
  )
  const spec = text(
    'spec',
    { kind: 'text', content: 'Assorted flavours, 200 ml', size: 11, color: 'inkMuted' },
    { width: fill() }
  )
  const currency = text('currency', {
    kind: 'text',
    content: 'AED',
    size: 13,
    weight: 600,
    color: 'primary',
  })
  const amount = text('price', {
    kind: 'text',
    content: price,
    size: 34,
    weight: 700,
    color: 'primary',
  })

  const priceRow: LayoutFrame = {
    id: 'price-row',
    kind: 'frame',
    width: hug(),
    height: hug(),
    // Pinned ltr: a currency and its amount keep their order in both editions.
    // The block still mirrors as a whole; the pair does not. §5.5.
    direction: 'ltr',
    layout: {
      mode: 'row',
      gap: 5,
      padding: NO_PADDING,
      justify: 'end',
      align: 'end',
    },
    children: [currency.node, amount.node],
  }

  const stack: LayoutFrame = {
    id: 'stack',
    kind: 'frame',
    width: fill(),
    height: hug(),
    // `stretch`, so the two texts take the stack's width and wrap inside it.
    layout: { mode: 'column', gap: 4, padding: NO_PADDING, justify: 'start', align: 'stretch' },
    children: [name.node, spec.node],
  }

  return {
    id: `shelf-ticket-${price.length}`,
    name: `Shelf ticket (${price})`,
    note: 'Row frame, currency and price, hug, justify end. A longer price extends to the left.',
    design: { width: 320, height: 96 },
    bothDirections: true,
    root: {
      id: 'ticket',
      kind: 'frame',
      width: fixed(320),
      height: fixed(96),
      paint: { fill: 'surface', stroke: { color: 'inkMuted', width: 1 }, radius: 6 },
      layout: {
        mode: 'row',
        gap: 12,
        padding: pad({ start: 14, end: 14, top: 12, bottom: 12 }),
        justify: 'between',
        align: 'center',
      },
      children: [stack, priceRow],
    },
    paint: Object.fromEntries([name.paint, spec.paint, currency.paint, amount.paint]),
  }
}

// ─── 2. Burst card ────────────────────────────────────────────────────────────

/**
 * *"I drag a shape and text, I group them, the shape grows to fit the text."*
 *
 * The star **is** the frame. It has a fill, padding and `hug` on both axes, and
 * one text child. There is no shape element sitting behind a text element that
 * somebody keeps re-centring by hand, and recolouring it is one field.
 *
 * `ignoreLayout` puts it in the corner, overhanging the card — which is §2.3's
 * escape hatch and the reason absolute positioning was kept rather than removed.
 */
function burstCard(): FrameBlock {
  const save = text('save', {
    kind: 'text',
    content: 'SAVE 25%',
    size: 13,
    weight: 700,
    color: 'surface',
    align: 'center',
  })
  const product = box('shot', { kind: 'image', label: 'packshot' }, fill(), fill())
  const label = text('label', {
    kind: 'text',
    content: 'Tide original powder 3 kg',
    size: 14,
    weight: 600,
    align: 'center',
  })
  const price = text('burst-price', {
    kind: 'text',
    content: 'AED 24.50',
    size: 22,
    weight: 700,
    color: 'primary',
    align: 'center',
  })

  const star: LayoutFrame = {
    id: 'star',
    kind: 'frame',
    // Hug on both axes: the star grows to fit whatever the badge says.
    width: hug(),
    height: hug(),
    ignoreLayout: true,
    box: { start: 0.58, top: -0.04, width: 0.46, height: 0.3 },
    paint: { shape: 'star', fill: 'accent' },
    layout: {
      mode: 'row',
      gap: 0,
      // Padding is what makes the star wrap the words rather than being a shape
      // somebody resizes by hand.
      padding: pad({ start: 18, end: 18, top: 22, bottom: 22 }),
      justify: 'center',
      align: 'center',
    },
    children: [save.node],
  }

  return {
    id: 'burst-card',
    name: 'Burst card',
    note: 'The star IS the frame: shape, fill, padding, hug. Recolouring it is one field.',
    design: { width: 240, height: 300 },
    bothDirections: true,
    root: {
      id: 'card',
      kind: 'frame',
      width: fixed(240),
      height: fixed(300),
      paint: { fill: 'surface', stroke: { color: 'inkMuted', width: 1 }, radius: 8 },
      layout: {
        mode: 'column',
        gap: 8,
        padding: pad({ start: 14, end: 14, top: 14, bottom: 14 }),
        justify: 'start',
        align: 'stretch',
      },
      children: [product.node, label.node, price.node, star],
    },
    paint: Object.fromEntries([save.paint, product.paint, label.paint, price.paint]),
  }
}

// ─── 3. The 3-up band, one card spanning two cells ────────────────────────────

/**
 * **The real test.** Phase 0.2 proved a grid fits in nested frames on paper;
 * this is it in the solver.
 *
 * The band is a row of three columns. The first column holds one tall card; the
 * second holds two stacked half-height cards; the third holds one. So the
 * "span" is expressed as *a column that does not subdivide*, which is how
 * nested one-dimensional layout has to say it.
 *
 * **That is the thing to look at.** It works, and it costs a level of nesting
 * per subdivision — the band is depth 1, a column is 2, a card inside it is 3,
 * and §8's cap is 3. A 3-up band with a spanning card is exactly at the cap, and
 * anything wanting a card subdivided again has nowhere to go. That is the
 * finding, and it is what a `grid` mode would buy.
 */
function spanBand(): FrameBlock {
  const paint: [string, LeafPaint][] = []

  const cell = (id: string, title: string, price: string, tall: boolean): LayoutFrame => {
    const t = text(`${id}-t`, { kind: 'text', content: title, size: tall ? 15 : 12, weight: 600 })
    const p = text(`${id}-p`, {
      kind: 'text',
      content: price,
      size: tall ? 26 : 17,
      weight: 700,
      color: 'primary',
    })
    paint.push(t.paint, p.paint)

    return {
      id,
      kind: 'frame',
      width: fill(),
      height: fill(),
      paint: { fill: 'surface', stroke: { color: 'inkMuted', width: 1 }, radius: 6 },
      layout: {
        mode: 'column',
        gap: 4,
        padding: pad({ start: 10, end: 10, top: 10, bottom: 10 }),
        justify: tall ? 'between' : 'center',
        align: 'start',
      },
      children: [t.node, p.node],
    }
  }

  const column = (id: string, children: LayoutNode[]): LayoutFrame => ({
    id,
    kind: 'frame',
    width: fill(),
    height: fill(),
    layout: { mode: 'column', gap: 10, padding: NO_PADDING, justify: 'start', align: 'stretch' },
    children,
  })

  return {
    id: 'span-band',
    name: '3-up band, one card spanning two cells',
    note: 'A span is a column that does not subdivide. Depth 3 at the cap: band, column, card.',
    design: { width: 620, height: 260 },
    bothDirections: true,
    root: {
      id: 'band',
      kind: 'frame',
      width: fixed(620),
      height: fixed(260),
      paint: { fill: 'secondary', radius: 8 },
      layout: {
        mode: 'row',
        gap: 10,
        padding: pad({ start: 12, end: 12, top: 12, bottom: 12 }),
        justify: 'start',
        align: 'stretch',
      },
      children: [
        // The spanning card: a column with one child, so it takes both rows.
        column('col-1', [cell('big', 'Basmati rice 5 kg', 'AED 34.00', true)]),
        column('col-2', [
          cell('small-a', 'Sunflower oil 1.8 L', 'AED 18.75', false),
          cell('small-b', 'White sugar 2 kg', 'AED 9.50', false),
        ]),
        column('col-3', [cell('tall-c', 'Chicken 1 kg', 'AED 14.90', true)]),
      ],
    },
    paint: Object.fromEntries(paint),
  }
}

// ─── 4. Header ────────────────────────────────────────────────────────────────

/**
 * What the offer card will not exercise: the logo, the book title and the offer
 * period. All three are bindings E14 Phase 1 added or repaired.
 *
 * The period is `book.validFrom` / `validTo` — columns that did not exist before
 * Phase 1, and deliberately not `expiresAt`, which is when the share *link*
 * stops working and would print a wrong date if borrowed.
 */
function header(): FrameBlock {
  const logo = box('logo', { kind: 'image', label: 'brand.logo', radius: 4 }, fixed(68), fixed(68))
  const title = text('title', {
    kind: 'text',
    content: 'Weekend offers',
    size: 30,
    family: 'headline',
    color: 'surface',
  })
  const period = text('period', {
    kind: 'text',
    content: 'Valid 1 to 7 October',
    size: 13,
    color: 'surface',
    transform: 'uppercase',
  })

  const words: LayoutFrame = {
    id: 'words',
    kind: 'frame',
    width: fill(),
    height: hug(),
    layout: { mode: 'column', gap: 4, padding: NO_PADDING, justify: 'center', align: 'start' },
    children: [title.node, period.node],
  }

  return {
    id: 'header',
    name: 'Header',
    note: 'Logo, book title, offer period. The bindings an offer card never touches.',
    design: { width: 620, height: 110 },
    bothDirections: true,
    root: {
      id: 'header-root',
      kind: 'frame',
      width: fixed(620),
      height: fixed(110),
      paint: { fill: 'primary', radius: 8 },
      layout: {
        mode: 'row',
        gap: 14,
        padding: pad({ start: 18, end: 18, top: 16, bottom: 16 }),
        justify: 'start',
        align: 'center',
      },
      children: [logo.node, words],
    },
    paint: Object.fromEntries([logo.paint, title.paint, period.paint]),
  }
}

// ─── 5. Footer ────────────────────────────────────────────────────────────────

/**
 * `shop.address` and `shop.phone` — both declared in `TextSource` for as long as
 * it has existed, both falling through to `''` in two painters that "agreed with
 * each other and with nothing else", and both repaired by Phase 1. This is the
 * block that would have shown it.
 *
 * The phone is pinned `ltr`: a number in an Arabic footer reorders otherwise,
 * which is the same class of defect as the pack label that printed backwards.
 */
function footer(): FrameBlock {
  const shopName = text('shop', {
    kind: 'text',
    content: 'Al Madina Hypermarket',
    size: 15,
    weight: 600,
  })
  const address = text('address', {
    kind: 'text',
    content: 'Hor Al Anz East, Deira, Dubai',
    size: 12,
    color: 'inkMuted',
  })
  const phone = text('phone', {
    kind: 'text',
    content: '+971 4 123 4567',
    size: 16,
    weight: 600,
    color: 'primary',
    align: 'end',
  })

  const left: LayoutFrame = {
    id: 'shop-block',
    kind: 'frame',
    width: fill(),
    height: hug(),
    layout: { mode: 'column', gap: 3, padding: NO_PADDING, justify: 'start', align: 'start' },
    children: [shopName.node, address.node],
  }

  return {
    id: 'footer',
    name: 'Footer',
    note: 'shop.address and shop.phone, both of which drew nothing before Phase 1.',
    design: { width: 620, height: 82 },
    bothDirections: true,
    root: {
      id: 'footer-root',
      kind: 'frame',
      width: fixed(620),
      height: fixed(82),
      paint: { fill: 'surface', stroke: { color: 'inkMuted', width: 1 }, radius: 8 },
      layout: {
        mode: 'row',
        gap: 14,
        padding: pad({ start: 18, end: 18, top: 14, bottom: 14 }),
        justify: 'between',
        align: 'center',
      },
      children: [
        left,
        {
          id: 'phone-pin',
          kind: 'frame',
          width: hug(),
          height: hug(),
          // A phone number keeps its order in both editions.
          direction: 'ltr',
          layout: { mode: 'row', gap: 0, padding: NO_PADDING, justify: 'end', align: 'center' },
          children: [phone.node],
        },
      ],
    },
    paint: Object.fromEntries([shopName.paint, address.paint, phone.paint]),
  }
}

/**
 * The five, plus the shelf ticket a second time with a longer price — because
 * "a longer price makes the row wider and it extends to the left" is a claim
 * about two renders, not one.
 */
export const FRAME_BLOCKS: FrameBlock[] = [
  shelfTicket('8.25'),
  shelfTicket('1,249.00'),
  burstCard(),
  spanBand(),
  header(),
  footer(),
]
