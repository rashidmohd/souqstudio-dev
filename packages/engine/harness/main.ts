/**
 * Render harness. `pnpm --filter @souqstudio/engine harness`
 *
 * Feeds the engine hardcoded blocks and dummy products, renders every page to
 * SVG, and writes an index.html that shows them side by side. No database, no
 * API, no UI.
 *
 * It exists to answer the question E6 names as the risk: does an
 * engine-composed page look like a real flyer with no hand-finishing? If it does
 * not, the block model is wrong, and it is far cheaper to learn that here than
 * after a migration.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { PageGrid, Pin, Region } from '@souqstudio/types'
import { flowBook } from '../src/index'
import { BLOCKS, BRAND_AD, FOOTER, HERO_BAND, MESSAGE_POST, OFFER_CARD } from './blocks'
import { FRIENDLY, WORST_CASE } from './dummy'
import type { HarnessProduct } from './product'
import { censusLine, loadRealCatalog, SET_NOTES } from './real'
import { renderPage, type RenderContext } from './svg'

const A4 = { width: 1240, height: 1754 }
const SQUARE = { width: 1080, height: 1080 }
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out')

// ─── Grids ────────────────────────────────────────────────────────────────────

const cell = (col: number, row: number, id: string): Region => ({
  id,
  colStart: col,
  colEnd: col,
  rowStart: row,
  rowEnd: row,
  blockId: OFFER_CARD.id,
  fill: 'flow',
})

/** Three across, three rows of cards, and a short merged footer row. */
function booklet(): PageGrid {
  const regions: Region[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) regions.push(cell(col, row, `r${row}c${col}`))
  }
  regions.push({
    id: 'footer',
    colStart: 0,
    colEnd: 2,
    rowStart: 3,
    rowEnd: 3,
    blockId: FOOTER.id,
    fill: 'static',
  })
  return { cols: [1, 1, 1], rows: [1, 1, 1, 0.34], gap: 0.022, margin: 0.04, regions }
}

/**
 * The merge case, as an owner would build it: a full-width banner across the
 * top, one two-column feature beside a tall card, then a normal row. Every card
 * is the same block reflowing into a different aspect.
 */
function merged(): PageGrid {
  return {
    cols: [1, 1, 1],
    rows: [0.55, 1, 1, 1],
    gap: 0.022,
    margin: 0.04,
    regions: [
      { id: 'banner', colStart: 0, colEnd: 2, rowStart: 0, rowEnd: 0, blockId: OFFER_CARD.id, fill: 'flow' },
      { id: 'feature', colStart: 0, colEnd: 1, rowStart: 1, rowEnd: 1, blockId: OFFER_CARD.id, fill: 'flow' },
      cell(2, 1, 'tall'),
      cell(0, 2, 'r2c0'),
      cell(1, 2, 'r2c1'),
      cell(2, 2, 'r2c2'),
      { id: 'wide', colStart: 0, colEnd: 1, rowStart: 3, rowEnd: 3, blockId: OFFER_CARD.id, fill: 'flow' },
      cell(2, 3, 'r3c2'),
    ],
  }
}

/**
 * A cover: hero band across the top, offers beneath. One page, two typefaces,
 * and the whole reason a headline slot exists.
 */
function cover(): PageGrid {
  return {
    cols: [1, 1, 1],
    rows: [0.9, 1, 1],
    gap: 0.022,
    margin: 0.04,
    regions: [
      { id: 'hero', colStart: 0, colEnd: 2, rowStart: 0, rowEnd: 0, blockId: HERO_BAND.id, fill: 'static' },
      cell(0, 1, 'r1c0'),
      cell(1, 1, 'r1c1'),
      cell(2, 1, 'r1c2'),
      cell(0, 2, 'r2c0'),
      cell(1, 2, 'r2c1'),
      cell(2, 2, 'r2c2'),
    ],
  }
}

const carousel = (): PageGrid => ({
  cols: [1],
  rows: [1],
  gap: 0,
  regions: [cell(0, 0, 'post')],
})

// ─── Rendering ────────────────────────────────────────────────────────────────

interface Shot {
  file: string
  title: string
  note: string
  svg: string
}

const shots: Shot[] = []

function shoot(
  file: string,
  title: string,
  note: string,
  opts: {
    master: PageGrid
    products: HarnessProduct[]
    size: { width: number; height: number }
    direction?: 'ltr' | 'rtl'
    pins?: Pin[]
    pageIndex?: number
  }
): void {
  const direction = opts.direction ?? 'ltr'
  const pageIndex = opts.pageIndex ?? 0

  const result = flowBook({
    master: opts.master,
    offerIds: opts.products.map((p) => p.id),
    pins: opts.pins ?? [],
    page: opts.size,
    direction,
  })

  const page = result.pages[pageIndex]
  if (page === undefined) throw new Error(`${file}: no page at index ${pageIndex}`)

  const ctx: RenderContext = {
    blocks: BLOCKS,
    products: Object.fromEntries(opts.products.map((p) => [p.id, p])),
    direction,
    shopName: direction === 'rtl' ? 'أسواق النخيل' : 'Al Nakheel Market',
  }

  shots.push({ file, title, note, svg: renderPage(page.placements, opts.size, ctx) })
}

// A cover: hero band in the headline face, product cards in the display face.
shoot(
  'cover-hero.svg',
  'Cover — hero band plus offers',
  'One page, two typefaces. h1 and h2 resolve to the headline slot; product names to display. A level is a property of the brand, not of a card.',
  { master: cover(), products: FRIENDLY, size: A4 }
)

shoot(
  'cover-hero-arabic.svg',
  'Cover — Arabic edition',
  'The same master mirrored. The hero band, its logo and its headline all flip; the price marks do not.',
  { master: cover(), products: FRIENDLY, size: A4, direction: 'rtl' }
)

// A booklet page with friendly data — the demo case.
shoot('booklet-friendly.svg', 'Booklet — friendly data', '3 across, 3 rows, merged footer row.', {
  master: booklet(),
  products: FRIENDLY,
  size: A4,
})

// The same page with the longest real strings and a 3-decimal currency. This is
// the one to judge on.
shoot(
  'booklet-worstcase.svg',
  'Booklet — worst case',
  'Longest Arabic-length names, two-line specs, three-decimal KWD. No fit ladder yet, so overflow is visible on purpose.',
  { master: booklet(), products: WORST_CASE, size: A4 }
)

// The AR edition of the same rows. Grid mirrors; the price mark does not.
shoot(
  'booklet-arabic.svg',
  'Booklet — Arabic edition',
  'Same master, same offers, direction rtl. The grid and the merged footer mirror; price marks stay LTR with Western numerals.',
  { master: booklet(), products: WORST_CASE, size: A4, direction: 'rtl' }
)

// One block, four aspects, one page.
shoot(
  'booklet-merged.svg',
  'Merged regions — one block, four arrangements',
  'Full-width banner, a two-column feature, normal cells, a wide merge. Every card is blk_offer_card reflowing to its region aspect.',
  { master: merged(), products: FRIENDLY, size: A4 }
)

// A two-cell brand ad pinned on page 2, displacing two products downstream.
const AD_PIN: Pin = {
  id: 'pin_ad',
  pageIndex: 1,
  blockId: BRAND_AD.id,
  colStart: 1,
  colEnd: 2,
  rowStart: 1,
  rowEnd: 1,
}
shoot(
  'booklet-pinned-ad.svg',
  'Page 2 with a pinned brand ad',
  'Two cells claimed by a static block. The two products that would have sat there move downstream — the book grows, nothing is dropped.',
  {
    master: booklet(),
    products: [...FRIENDLY, ...FRIENDLY.map((p) => ({ ...p, id: `${p.id}_b` }))],
    size: A4,
    pins: [AD_PIN],
    pageIndex: 1,
  }
)

// Carousel: post 1 is a product, post 5 is a pinned message.
const MESSAGE_PIN: Pin = {
  id: 'pin_msg',
  pageIndex: 4,
  blockId: MESSAGE_POST.id,
  colStart: 0,
  colEnd: 0,
  rowStart: 0,
  rowEnd: 0,
}
shoot('carousel-post-1.svg', 'Carousel — post 1', 'A 1×1 grid. Same block, square arrangement.', {
  master: carousel(),
  products: FRIENDLY.slice(0, 10),
  size: SQUARE,
  pins: [MESSAGE_PIN],
})
shoot(
  'carousel-post-5.svg',
  'Carousel — post 5, pinned message',
  'Ten products plus one message makes eleven posts. A whole-post pin is a cell pin in a 1×1 grid.',
  {
    master: carousel(),
    products: FRIENDLY.slice(0, 10),
    size: SQUARE,
    pins: [MESSAGE_PIN],
    pageIndex: 4,
  }
)

// ─── Real catalog rows, when someone has exported them ────────────────────────

/**
 * The same masters, the same blocks, real products.
 *
 * This is the half of E6 §10's question the dummies could not ask. `dummy.ts`
 * was written to be hard — the longest Arabic names, three-decimal KWD, two-line
 * specs — and a real catalog is hard in different places: names that are shorter
 * on the median but longer at the tail, mixed scripts inside one English page,
 * and above all *absences*. Nothing here is invented except the price.
 *
 * Absent, the harness renders the dummy pages alone and says so at the top of
 * the index. It is not a failure: the file is a snapshot of a developer's
 * database and is deliberately not checked in.
 */
const real = loadRealCatalog()

if (real !== null) {
  for (const [name, products] of Object.entries(real.sets)) {
    const meta = SET_NOTES[name] ?? { title: `Real catalog — ${name}`, note: '' }
    const rtl = name === 'arabic'

    shoot(`real-${name}.svg`, meta.title, meta.note, {
      master: booklet(),
      products,
      size: A4,
      ...(rtl ? { direction: 'rtl' as const } : {}),
    })
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
for (const shot of shots) writeFileSync(join(OUT, shot.file), shot.svg, 'utf8')

const index = `<!doctype html>
<meta charset="utf-8">
<title>Engine render harness</title>
<style>
  body { margin: 0; padding: 32px; background: #14161A; color: #E8E6E1;
         font: 14px/1.5 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  p.lede { color: #9AA0A8; margin: 0 0 12px; max-width: 68ch; }
  p.lede.warn { color: #E0C06A; margin-bottom: 32px; }
  p.lede.warn strong { color: #F0D89A; }
  section { margin-bottom: 40px; }
  h2 { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
  p.note { color: #9AA0A8; margin: 0 0 12px; max-width: 70ch; }
  img { max-width: 620px; width: 100%; background: #fff; border-radius: 4px; display: block; }
</style>
<h1>Layout engine — render harness</h1>
<p class="lede">Seeded blocks, no database import. Everything below came out of
<code>flowBook</code> with no manual positioning.</p>
${
  real === null
    ? `<p class="lede warn">Dummy products only — the pages below are composed from about a dozen
products invented in <code>harness/dummy.ts</code>. To compose real catalog rows as well, run
<code>pnpm --filter @souqstudio/db catalog:harness-export</code> and render again.</p>`
    : `<p class="lede warn">Real catalog pages included, exported ${real.generatedAt.slice(0, 10)}.
${censusLine(real.counts)} <strong>Prices and promo tiers on those pages are invented</strong> — a
catalog row has no price. Names, brands, specs and their absences are real.</p>`
}
${shots
  .map(
    (shot) => `<section>
  <h2>${shot.title}</h2>
  <p class="note">${shot.note}</p>
  <img src="${shot.file}" alt="${shot.title}">
</section>`
  )
  .join('\n')}
`
writeFileSync(join(OUT, 'index.html'), index, 'utf8')

process.stdout.write(
  `Rendered ${shots.length} pages to ${OUT}\n` +
    (real === null
      ? 'Dummy products only — run `pnpm --filter @souqstudio/db catalog:harness-export` for real rows.\n'
      : `Includes ${Object.keys(real.sets).length} real-catalog pages (invented prices).\n`) +
    `Open ${join(OUT, 'index.html')}\n`
)
