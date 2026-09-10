/**
 * The seeded library, drawn. `pnpm --filter @souqstudio/engine gallery`
 *
 * `main.ts` answers "does an engine-composed *page* read like a flyer". This
 * answers the question underneath it: **is each block in the library a design?**
 * Sixty-seven blocks that typecheck, validate and carry no hex are sixty-seven
 * blocks nobody has looked at, and every rule the engine enforces is a rule
 * about correctness rather than about whether a card is worth printing.
 *
 * Every repeating card is drawn at all four shapes it claims — tall, square,
 * wide, banner — because the reflow is the part that goes wrong: a design tuned
 * in a booklet cell and never seen as a banner is a design with a price mark
 * sitting on top of a product name in one merge out of four. Each is drawn once
 * with a friendly product and once with the worst case, which is the pair E6 §5
 * says a layout has to survive.
 *
 * Static blocks are drawn once, at the shape their arrangement's aspect range
 * says they were designed for.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Block } from '@souqstudio/types'
import { type Placement } from '../src/index'
// Awaited at module scope: the library is a loaded document, and the gallery's
// whole job is to draw every block that exists. See `harness/blocks.ts`.
import { loadLibrary } from '../src/library-source'

const SEED_BLOCKS = await loadLibrary()
import { FRIENDLY, WORST_CASE } from './dummy'
import type { HarnessProduct } from './product'
import { renderPage, type RenderContext } from './svg'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out')
const INSET = 16

mkdirSync(OUT, { recursive: true })

// Renaming a block leaves its old renders behind, and a gallery holding a design
// that no longer exists is worse than one missing a design that does — the stale
// file is the one somebody reviews.
for (const stale of readdirSync(OUT)) {
  if (stale.startsWith('gallery-') && stale.endsWith('.svg')) rmSync(join(OUT, stale))
}

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

/** The four shapes a merged region makes, at sizes a card is actually printed at. */
const SHAPES = [
  { key: 'tall', label: 'Tall · a booklet cell', width: 300, height: 500 },
  { key: 'square', label: 'Square · a carousel post', width: 380, height: 380 },
  { key: 'wide', label: 'Wide · a two-column merge', width: 540, height: 270 },
  { key: 'banner', label: 'Banner · a full row', width: 840, height: 175 },
] as const

const friendly = FRIENDLY[0]!
const worst = WORST_CASE[0]!

function context(products: HarnessProduct[], direction: 'ltr' | 'rtl'): RenderContext {
  return {
    blocks,
    products: Object.fromEntries(products.map((product) => [product.id, product])),
    direction,
    shopName: direction === 'rtl' ? 'أسواق النخيل' : 'Al Nakheel Market',
  }
}

function draw(
  blockId: string,
  size: { width: number; height: number },
  product: HarnessProduct | null,
  direction: 'ltr' | 'rtl' = 'ltr'
): string {
  const placement: Placement = {
    sourceId: 'gallery',
    blockId,
    offerId: product === null ? null : product.id,
    kind: product === null ? 'static' : 'flow',
    rect: {
      x: INSET,
      y: INSET,
      width: size.width - INSET * 2,
      height: size.height - INSET * 2,
    },
  }
  return renderPage([placement], size, context(product === null ? [] : [product], direction))
}

/**
 * The shape a block placed once was designed at, read from its own range.
 *
 * The same reading `defaultShape` makes in the designer, and the reason the
 * static blocks carry narrow ranges rather than the open one: a masthead
 * letterboxed into a strip is not what the owner will get, and a gallery that
 * shows it that way is a gallery that teaches the wrong thing.
 */
function stillSize(block: (typeof SEED_BLOCKS)[number]): { width: number; height: number } {
  const arrangement = block.arrangements[0]!
  const aspect = Math.min(6, Math.max(0.4, Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)))
  const width = 760
  return { width, height: Math.round(width / aspect) }
}

interface Shot {
  file: string
  label: string
}

interface Row {
  id: string
  name: string
  description: string
  category: string
  repeats: boolean
  shots: Shot[]
}

const rows: Row[] = []

for (const block of SEED_BLOCKS) {
  const shots: Shot[] = []

  if (block.repeats) {
    for (const shape of SHAPES) {
      const file = `gallery-${block.id}-${shape.key}.svg`
      writeFileSync(join(OUT, file), draw(block.id, shape, friendly), 'utf8')
      shots.push({ file, label: shape.label })
    }
    // The worst case in the shape the card was designed at. A layout that
    // survives friendly dummies and breaks on a real Arabic name is worse than
    // no preview at all — composition model §8.
    const stress = `gallery-${block.id}-worst.svg`
    writeFileSync(join(OUT, stress), draw(block.id, SHAPES[0], worst), 'utf8')
    shots.push({ file: stress, label: 'Tall · worst case' })

    const arabic = `gallery-${block.id}-rtl.svg`
    writeFileSync(join(OUT, arabic), draw(block.id, SHAPES[1], worst, 'rtl'), 'utf8')
    shots.push({ file: arabic, label: 'Square · Arabic' })
  } else {
    const size = stillSize(block)
    const file = `gallery-${block.id}.svg`
    writeFileSync(join(OUT, file), draw(block.id, size, null), 'utf8')
    shots.push({ file, label: 'At its own shape' })

    const arabic = `gallery-${block.id}-rtl.svg`
    writeFileSync(join(OUT, arabic), draw(block.id, size, null, 'rtl'), 'utf8')
    shots.push({ file: arabic, label: 'Arabic' })
  }

  rows.push({
    id: block.id,
    name: block.name,
    description: block.description,
    category: block.category,
    repeats: block.repeats,
    shots,
  })
}

// ─── Output ───────────────────────────────────────────────────────────────────

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const CATEGORY_LABEL: Record<string, string> = {
  'offer-card': 'Offer cards — one per product',
  header: 'Headers, covers and dividers',
  panel: 'Panels — pinned, not filled',
  footer: 'Footers and the small print',
  seasonal: 'Seasonal',
}

const groups = Object.keys(CATEGORY_LABEL).map((category) => ({
  category,
  rows: rows.filter((row) => row.category === category),
}))

const index = `<!doctype html>
<meta charset="utf-8">
<title>Seeded block library</title>
<style>
  body { margin: 0; padding: 32px; background: #14161A; color: #E8E6E1;
         font: 14px/1.5 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  p.lede { color: #9AA0A8; margin: 0 0 32px; max-width: 74ch; }
  h2 { font-size: 16px; font-weight: 700; margin: 40px 0 16px;
       padding-top: 16px; border-top: 1px solid #2A2E35; }
  section { margin-bottom: 32px; }
  h3 { font-size: 14px; font-weight: 700; margin: 0; }
  h3 code { color: #7E858E; font-weight: 400; font-size: 12px; margin-inline-start: 8px; }
  p.note { color: #9AA0A8; margin: 2px 0 10px; max-width: 74ch; }
  .strip { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; }
  figcaption { color: #7E858E; font-size: 11px; margin-top: 4px; }
  img { background: #fff; border-radius: 4px; display: block; max-width: 100%; }
</style>
<h1>Seeded block library — ${rows.length} blocks</h1>
<p class="lede">Every block <code>packages/db</code> writes into <code>blocks</code>, drawn by the
engine at the shapes it claims. Repeating cards appear at all four merge shapes plus the worst-case
Arabic name; blocks placed once appear at the shape their aspect range was drawn for. Prices, promo
tiers and the shop name are invented.</p>
${groups
  .map(
    (group) => `<h2>${CATEGORY_LABEL[group.category]} · ${group.rows.length}</h2>
${group.rows
  .map(
    (row) => `<section>
  <h3>${esc(row.name)}<code>${row.id}</code></h3>
  <p class="note">${esc(row.description)}</p>
  <div class="strip">
${row.shots
  .map(
    (shot) => `    <figure>
      <img src="${shot.file}" alt="${esc(row.name)} — ${shot.label}">
      <figcaption>${shot.label}</figcaption>
    </figure>`
  )
  .join('\n')}
  </div>
</section>`
  )
  .join('\n')}`
  )
  .join('\n')}
`

writeFileSync(join(OUT, 'gallery.html'), index, 'utf8')

process.stdout.write(
  `Drew ${rows.length} blocks (${rows.reduce((n, row) => n + row.shots.length, 0)} renders)\n` +
    `Open ${join(OUT, 'gallery.html')}\n`
)
