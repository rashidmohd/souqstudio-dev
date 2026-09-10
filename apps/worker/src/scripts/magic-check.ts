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

// blockId → the structure it was built from, per library-cards.ts
console.log(`provider: ${env.MAGIC_BLOCK_PROVIDER}\n`)

const CASES: [string, string][] = [
  ['blk_price_band', 'priceBand'],
  ['blk_burst', 'burst'],
  ['blk_list_row', 'listRow'],
]

async function main() {
for (const [blockId, expected] of CASES) {
  const size = blockId === 'blk_list_row' ? { width: 540, height: 270 } : { width: 380, height: 380 }
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
    const choice = await readCardDesign({ bytes, mediaType: 'image/png' })
    const hit = choice.structure === expected ? 'MATCH  ' : 'differs'
    console.log(
      `${hit}  ${blockId}: expected ${expected}, got ${choice.structure} ` +
        `(ground ${choice.ground}, accent ${choice.accent ?? '—'}, ${choice.confidence})`
    )
    console.log(`         name: "${choice.name}"`)
    for (const note of choice.notes) console.log(`         · ${note}`)
  } catch (error) {
    console.log(`ERROR    ${blockId}: ${(error as Error).name} ${(error as Error).message}`)
  }
}
}

void main()
