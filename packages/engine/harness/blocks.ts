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

import type { Block, BlockElement } from '@souqstudio/types'
import { SEED_BLOCKS } from '../src/index'

/**
 * The seeded library, as `Block` rows.
 *
 * Imported rather than restated. These are the same bytes `packages/db` writes
 * into the `blocks` table, so what this harness draws is what a shop actually
 * gets — a second copy here would drift, and a drifted seed block is one that
 * renders differently in the database from the one that was checked.
 */
const seeded = Object.fromEntries(
  SEED_BLOCKS.map((block) => [
    block.id,
    {
      id: block.id,
      organizationId: null,
      name: block.name,
      repeats: block.repeats,
      arrangements: block.arrangements,
      thumbnailUrl: null,
    } satisfies Block,
  ])
)

export const OFFER_CARD = seeded['blk_offer_card'] as Block
export const HERO_BAND = seeded['blk_hero_band'] as Block
export const FOOTER = seeded['blk_footer'] as Block
export const MESSAGE_POST = seeded['blk_message'] as Block

const box = (start: number, top: number, width: number, height: number) => ({
  start,
  top,
  width,
  height,
})

/**
 * The repeating offer card. Designed tall first, because that is the shape a
 * booklet grid produces most often, then reflowed for the merges.
 */
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



export const BLOCKS: Record<string, Block> = {
  [OFFER_CARD.id]: OFFER_CARD,
  [HERO_BAND.id]: HERO_BAND,
  [FOOTER.id]: FOOTER,
  [BRAND_AD.id]: BRAND_AD,
  [MESSAGE_POST.id]: MESSAGE_POST,
}
