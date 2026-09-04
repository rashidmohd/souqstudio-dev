/**
 * Hand-authored blocks for the harness.
 *
 * These stand in for the seeded library. The offer card carries four
 * arrangements so a merged region reflows rather than stretching; the footer and
 * the brand ad carry one open range each, which is the asymmetry the model
 * predicts for static blocks.
 *
 * Every colour here is a `TokenRef`. Nothing in a block is a hex value — that is
 * the rule that lets one brand kit carry many blocks.
 */

import type { Block, BlockElement, TypeLevel } from '@souqstudio/types'

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
 * The repeating offer card. Designed tall first, because that is the shape a
 * booklet grid produces most often, then reflowed for the merges.
 */
export const OFFER_CARD: Block = {
  id: 'blk_offer_card',
  organizationId: null,
  name: 'Standard offer card',
  repeats: true,
  thumbnailUrl: null,
  arrangements: [
    {
      // TALL — the default booklet cell, and an Instagram story slot.
      aspectMin: 0.35,
      aspectMax: 0.85,
      elements: [
        surface,
        productImage(box(0.08, 0.06, 0.84, 0.4)),
        tierChip(box(0.04, 0.02, 0.36, 0.09)),
        productText(box(0.08, 0.5, 0.84, 0.13), 'name', 'h3'),
        productText(box(0.08, 0.64, 0.84, 0.08), 'spec', 'caption'),
        price(box(0.08, 0.74, 0.84, 0.2)),
      ],
    },
    {
      // SQUARE — a carousel post, and a 4-across booklet cell.
      aspectMin: 0.85,
      aspectMax: 1.35,
      elements: [
        surface,
        productImage(box(0.08, 0.07, 0.84, 0.38)),
        tierChip(box(0.04, 0.03, 0.32, 0.1)),
        productText(box(0.08, 0.49, 0.84, 0.14), 'name', 'h3'),
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
  ],
}

/** Static. One open range — a footer is designed at one aspect and crops. */
export const FOOTER: Block = {
  id: 'blk_footer',
  organizationId: null,
  name: 'Shop footer',
  repeats: false,
  thumbnailUrl: null,
  arrangements: [
    {
      aspectMin: 0.1,
      aspectMax: 30,
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
            textEn: 'Prices valid while stocks last · souqstudio.com',
            textAr: 'الأسعار سارية حتى نفاد الكمية · souqstudio.com',
          },
          level: 'caption',
          align: 'end',
        },
      ],
    },
  ],
}

/** Static. The two-cell brand ad an owner pins on page 2. */
export const BRAND_AD: Block = {
  id: 'blk_brand_ad',
  organizationId: 'org_demo',
  name: 'Brand ad — two cells',
  repeats: false,
  thumbnailUrl: null,
  arrangements: [
    {
      aspectMin: 0.1,
      aspectMax: 30,
      elements: [
        { kind: 'shape', box: box(0, 0, 1, 1), surface: 'accent', radius: 3 },
        { kind: 'image', box: box(0.55, 0.08, 0.4, 0.84), source: { from: 'asset', assetId: 'demo' } },
        {
          kind: 'text',
          box: box(0.06, 0.2, 0.45, 0.3),
          source: { from: 'static', textEn: 'Ramadan Kareem', textAr: 'رمضان كريم' },
          level: 'h1',
          align: 'start',
        },
        {
          kind: 'text',
          box: box(0.06, 0.54, 0.45, 0.26),
          source: {
            from: 'static',
            textEn: 'Save more on every basket this month',
            textAr: 'وفر أكثر على كل سلة هذا الشهر',
          },
          level: 'h4',
          align: 'start',
        },
      ],
    },
  ],
}

/** Static, whole-post. The message an owner pins at slot 5 of a carousel. */
export const MESSAGE_POST: Block = {
  id: 'blk_message',
  organizationId: 'org_demo',
  name: 'Carousel message',
  repeats: false,
  thumbnailUrl: null,
  arrangements: [
    {
      aspectMin: 0.1,
      aspectMax: 30,
      elements: [
        { kind: 'shape', box: box(0, 0, 1, 1), surface: 'primary', radius: 3 },
        { kind: 'logo', box: box(0.38, 0.12, 0.24, 0.16) },
        {
          kind: 'text',
          box: box(0.1, 0.36, 0.8, 0.2),
          source: { from: 'static', textEn: 'Open until midnight', textAr: 'مفتوح حتى منتصف الليل' },
          level: 'h2',
          align: 'center',
        },
        {
          kind: 'text',
          box: box(0.1, 0.6, 0.8, 0.16),
          source: {
            from: 'static',
            textEn: 'All three branches, every day this week',
            textAr: 'جميع الفروع الثلاثة، كل يوم هذا الأسبوع',
          },
          level: 'h4',
          align: 'center',
        },
      ],
    },
  ],
}

export const BLOCKS: Record<string, Block> = {
  [OFFER_CARD.id]: OFFER_CARD,
  [FOOTER.id]: FOOTER,
  [BRAND_AD.id]: BRAND_AD,
  [MESSAGE_POST.id]: MESSAGE_POST,
}
