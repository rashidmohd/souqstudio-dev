import type { Arrangement, BlockElement, TypeLevel } from '@souqstudio/types'

/**
 * The seeded block library — the building blocks every shop starts with.
 *
 * **Always seed.** An owner can author their own blocks, but a blank artboard
 * produces something worse than a good default and the owner blames the product.
 * Owner authoring is an escape hatch from a decent starting point, not a
 * substitute for having one. `docs/composition-model.md` §3.6.
 *
 * They live in the engine rather than beside the seed because two consumers
 * need the same bytes: `packages/db` seeds them into `blocks`, and the render
 * harness draws them. A second copy would drift, and a drifted seed block is one
 * that renders differently in the database from the one that was checked. Nothing here is a hex or a pixel: every
 * colour is a `TokenRef` resolved against the shop's palette, every text element
 * names a `TypeLevel` from its type scale, and every box is a fraction of the
 * block so one design serves a 1080 carousel post and a third of an A4 column.
 */

const box = (start: number, top: number, width: number, height: number) => ({
  start,
  top,
  width,
  height,
})

const surface: BlockElement = {
  kind: 'shape',
  box: box(0, 0, 1, 1),
  surface: 'surface',
  radius: 3,
}

const productImage = (b: ReturnType<typeof box>): BlockElement => ({
  kind: 'image',
  box: b,
  source: { from: 'product' },
})

const productText = (
  b: ReturnType<typeof box>,
  field: 'name' | 'spec',
  level: TypeLevel
): BlockElement => ({
  kind: 'text',
  box: b,
  source: { from: 'product', field },
  level,
  align: 'start',
})

const tierChip = (b: ReturnType<typeof box>): BlockElement => ({
  kind: 'chip',
  box: b,
  anchor: 'TOP_START',
})

const price = (b: ReturnType<typeof box>): BlockElement => ({ kind: 'priceMark', box: b })

/**
 * The repeating offer card, in four arrangements.
 *
 * Designed tall first — the shape a booklet grid produces most often — then
 * reflowed for the merges. "Fit" cannot mean stretch: a stretched card is a
 * distorted card, so the engine picks the arrangement whose aspect range
 * contains the region's.
 */
const OFFER_CARD_ARRANGEMENTS: Arrangement[] = [
  {
    // TALL — the default booklet cell, and an Instagram story slot.
    aspectMin: 0.35,
    aspectMax: 0.85,
    elements: [
      surface,
      productImage(box(0.08, 0.06, 0.84, 0.34)),
      tierChip(box(0.04, 0.02, 0.36, 0.09)),
      // Three lines of a worst-case Arabic name, not one of an English one. The
      // name box was 13% of card height and the fit ladder escalated on every
      // long product in the catalog — designed at the friendly case, which E6 §5
      // says is the wrong direction to design in. At 20% the ladder steps down
      // once and fits, which is what a rung is for.
      productText(box(0.08, 0.44, 0.84, 0.2), 'name', 'h3'),
      productText(box(0.08, 0.65, 0.84, 0.07), 'spec', 'caption'),
      price(box(0.08, 0.74, 0.84, 0.2)),
    ],
  },
  {
    // SQUARE — a carousel post, and a four-across booklet cell.
    aspectMin: 0.85,
    aspectMax: 1.35,
    elements: [
      surface,
      productImage(box(0.08, 0.07, 0.84, 0.32)),
      tierChip(box(0.04, 0.03, 0.32, 0.1)),
      productText(box(0.08, 0.43, 0.84, 0.2), 'name', 'h3'),
      productText(box(0.08, 0.64, 0.84, 0.08), 'spec', 'caption'),
      price(box(0.08, 0.74, 0.84, 0.19)),
    ],
  },
  {
    // WIDE — a two-column merge. Image leads, price anchors the end.
    aspectMin: 1.35,
    aspectMax: 2.6,
    elements: [
      surface,
      productImage(box(0.04, 0.1, 0.3, 0.8)),
      tierChip(box(0.02, 0.04, 0.16, 0.16)),
      productText(box(0.38, 0.16, 0.36, 0.24), 'name', 'h3'),
      productText(box(0.38, 0.43, 0.36, 0.14), 'spec', 'caption'),
      price(box(0.7, 0.24, 0.27, 0.52)),
    ],
  },
  {
    // BANNER — a full-row merge. Name and price sit inline.
    aspectMin: 2.6,
    aspectMax: 12,
    elements: [
      surface,
      productImage(box(0.02, 0.12, 0.14, 0.76)),
      productText(box(0.19, 0.24, 0.42, 0.3), 'name', 'h3'),
      productText(box(0.19, 0.56, 0.42, 0.2), 'spec', 'caption'),
      price(box(0.66, 0.18, 0.3, 0.64)),
    ],
  },
]

/** Static blocks carry one open range: designed at one aspect, cropping to fit. */
const OPEN = { aspectMin: 0.1, aspectMax: 30 }

const HERO_BAND_ARRANGEMENTS: Arrangement[] = [
  {
    ...OPEN,
    elements: [
      { kind: 'shape', box: box(0, 0, 1, 1), surface: 'primary', radius: 3 },
      { kind: 'logo', box: box(0.04, 0.12, 0.08, 0.2) },
      {
        kind: 'text',
        box: box(0.04, 0.4, 0.56, 0.3),
        source: { from: 'static', textEn: 'Your headline', textAr: 'العنوان الرئيسي' },
        // h1 resolves to the headline face, which is deliberately not the face
        // product names use. A hero and a product name are not one voice.
        level: 'h1',
        align: 'start',
      },
      {
        kind: 'text',
        box: box(0.04, 0.74, 0.56, 0.14),
        source: { from: 'static', textEn: 'Supporting line', textAr: 'سطر داعم' },
        level: 'body',
        align: 'start',
      },
      {
        kind: 'text',
        box: box(0.66, 0.4, 0.3, 0.3),
        source: { from: 'static', textEn: 'This week only', textAr: 'هذا الأسبوع فقط' },
        level: 'h2',
        align: 'end',
      },
    ],
  },
]

const FOOTER_ARRANGEMENTS: Arrangement[] = [
  {
    ...OPEN,
    elements: [
      { kind: 'shape', box: box(0, 0, 1, 1), surface: 'secondary', radius: 3 },
      { kind: 'logo', box: box(0.02, 0.2, 0.1, 0.6) },
      {
        kind: 'text',
        box: box(0.14, 0.24, 0.3, 0.5),
        source: { from: 'shop', field: 'name' },
        level: 'h4',
        align: 'start',
      },
      {
        kind: 'text',
        box: box(0.5, 0.3, 0.48, 0.4),
        source: {
          from: 'static',
          textEn: 'Prices valid while stocks last',
          textAr: 'الأسعار سارية حتى نفاد الكمية',
        },
        level: 'caption',
        align: 'end',
      },
    ],
  },
]

const MESSAGE_ARRANGEMENTS: Arrangement[] = [
  {
    ...OPEN,
    elements: [
      { kind: 'shape', box: box(0, 0, 1, 1), surface: 'primary', radius: 3 },
      { kind: 'logo', box: box(0.38, 0.12, 0.24, 0.16) },
      {
        kind: 'text',
        box: box(0.1, 0.36, 0.8, 0.2),
        source: { from: 'static', textEn: 'Your message', textAr: 'رسالتك' },
        level: 'h2',
        align: 'center',
      },
      {
        kind: 'text',
        box: box(0.1, 0.6, 0.8, 0.16),
        source: { from: 'static', textEn: 'A second line', textAr: 'سطر ثانٍ' },
        level: 'body',
        align: 'center',
      },
    ],
  },
]

export interface SeedBlock {
  id: string
  name: string
  description: string
  repeats: boolean
  arrangements: Arrangement[]
}

export const SEED_BLOCKS: SeedBlock[] = [
  {
    id: 'blk_offer_card',
    name: 'Offer card',
    description: 'One product, its price and its badge. Reflows for merged regions.',
    repeats: true,
    arrangements: OFFER_CARD_ARRANGEMENTS,
  },
  {
    id: 'blk_hero_band',
    name: 'Hero band',
    description: 'A headline across the top of a page, in the headline typeface.',
    repeats: false,
    arrangements: HERO_BAND_ARRANGEMENTS,
  },
  {
    id: 'blk_footer',
    name: 'Footer',
    description: 'Shop name, logo and the small print. Sits on a merged last row.',
    repeats: false,
    arrangements: FOOTER_ARRANGEMENTS,
  },
  {
    id: 'blk_message',
    name: 'Message',
    description: 'A whole post or a pinned panel carrying a message instead of a product.',
    repeats: false,
    arrangements: MESSAGE_ARRANGEMENTS,
  },
]
