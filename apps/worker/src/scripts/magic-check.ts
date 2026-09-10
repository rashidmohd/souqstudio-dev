/**
 * Does the match actually work? `pnpm --filter @souqstudio/worker magic:check`
 *
 * **The one thing the test suite cannot answer.** `magic.test.ts` proves that
 * every choice a model *can* make builds a drawable block — it enumerates the
 * whole output space. What it cannot prove is whether the model makes the right
 * choice, because that needs a real picture and a real call.
 *
 * So this closes the loop the only way it can be closed: it renders a seeded
 * card whose structure is known, feeds the picture back, and reports whether
 * what came out is what went in. A card built from `priceBand` that comes back
 * as `priceBand` is the whole feature working end to end.
 *
 * It costs a real API call per case, which is why it is a script you run rather
 * than a test that runs itself. A `differs` line is not necessarily a failure —
 * two structures can be honestly hard to tell apart in one rendering — but a
 * column of them means the prompt in `lib/anthropic.ts` needs work.
 */
import sharp from 'sharp'
import type { MagicCategory } from '@souqstudio/engine'
import { SEED_BLOCKS } from '@souqstudio/engine/src/library'
import type { Block } from '@souqstudio/types'
import { renderPage, type RenderContext } from '@souqstudio/engine/harness/svg'
import { FRIENDLY } from '@souqstudio/engine/harness/dummy'
import { env } from '../lib/env'
import { readCardDesign } from '../lib/vision'

const product = FRIENDLY[0]!

const blocks: Record<string, Block> = Object.fromEntries(
  SEED_BLOCKS.map((seed) => [
    seed.id,
    {
      id: seed.id,
      organizationId: null,
      name: seed.name,
      repeats: seed.repeats,
      arrangements: seed.arrangements,
      thumbnailUrl: null,
    } satisfies Block,
  ])
)

const context: RenderContext = {
  blocks,
  products: { [product.id]: product },
  direction: 'ltr',
  shopName: 'Al Nakheel Market',
}

console.log(`provider: ${env.MAGIC_BLOCK_PROVIDER}\n`)

/**
 * blockId → the kind it is, and the answer that would be right.
 *
 * For a card that is the structure it was built from, per `library-cards.ts`.
 * For everything else it is the block's own id, because a still design is
 * matched to itself — feed `blk_footer` back in under "footer" and the right
 * answer is `blk_footer`. That case is worth having here precisely because it is
 * the strictest: there is no skin to be generous about, and the model either
 * picked the design it was shown or it did not.
 */
const CASES: [string, MagicCategory, string][] = [
  ['blk_price_band', 'offer-card', 'priceBand'],
  ['blk_burst', 'offer-card', 'burst'],
  ['blk_list_row', 'offer-card', 'listRow'],
  ['blk_footer', 'footer', 'blk_footer'],
  ['blk_cover_square', 'social-post', 'blk_cover_square'],
]

async function main() {
for (const [blockId, category, expected] of CASES) {
  // Each block at the shape it was drawn for, or the match is being asked to
  // read a design out of a crop of itself.
  const size =
    blockId === 'blk_list_row' || blockId === 'blk_footer'
      ? { width: 540, height: 270 }
      : { width: 380, height: 380 }
  const svg = renderPage(
    [
      {
        sourceId: 'check',
        blockId,
        offerId: product.id,
        kind: 'flow',
        rect: { x: 16, y: 16, width: size.width - 32, height: size.height - 32 },
      },
    ],
    size,
    context
  )

  const bytes = await sharp(Buffer.from(svg)).png().toBuffer()

  try {
    const choice = await readCardDesign({ bytes, mediaType: 'image/png' }, category)
    const hit = choice.structure === expected ? 'MATCH  ' : 'differs'
    // The skin is only reported for the kind that has one.
    const skin =
      'ground' in choice ? `ground ${choice.ground}, accent ${choice.accent ?? '—'}, ` : ''
    console.log(
      `${hit}  ${blockId} (${category}): expected ${expected}, got ${choice.structure} ` +
        `(${skin}${choice.confidence})`
    )
    console.log(`         name: "${choice.name}"`)
    for (const note of choice.notes) console.log(`         · ${note}`)
  } catch (error) {
    console.log(`ERROR    ${blockId}: ${(error as Error).name} ${(error as Error).message}`)
  }
}
}

void main()
