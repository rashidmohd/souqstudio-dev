/**
 * Does the export path still emit vectors?
 * `pnpm --filter @souqstudio/engine export:check`
 *
 * **On demand, never in CI.** It needs a real browser, and the browser is the
 * point: Playwright drives Chromium to make the PDF, so the only trustworthy
 * answer about what Chromium rasterizes comes from Chromium.
 *
 * E14 §2.4 is the measurement this reproduces. Each case is rendered alone to
 * PDF and the PDF's objects are counted. A raster is not a performance
 * complaint — Chromium picks the resolution, roughly 2.3× CSS, about 220dpi for
 * a card on an A4 page, **under the 300dpi target and not reachable from
 * anything in the document**. And a filter over text takes the font out of the
 * PDF entirely, which turns a price into a picture: unselectable, unsearchable,
 * resampled by any printer that reprocesses it.
 *
 * Four things are therefore banned on anything reaching export —
 * `feGaussianBlur`, `feDropShadow`, `filter: drop-shadow()`, and any gradient
 * carrying alpha stops — and the last two rows below are what we draw instead.
 *
 * This file is the regression guard. If somebody makes a shadow prettier by
 * reaching for a filter, a row here turns red before a shop prints it.
 */

import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shapePath } from '../src/shapes'
import { ringCount, shadowRings, type Shadow } from '../src/shadow'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'export-check')

/** Where a browser lives, in the order worth trying. `CHROME_BIN` wins. */
const CHROME_CANDIDATES = [
  process.env['CHROME_BIN'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => typeof p === 'string' && p.length > 0)

function findChrome(): string {
  for (const path of CHROME_CANDIDATES) if (existsSync(path)) return path
  throw new Error(
    'No browser found. Set CHROME_BIN to a Chrome or Chromium binary.\n' +
      'This harness needs one, which is why it does not run in CI.',
  )
}

// ─── The page each case draws on ──────────────────────────────────────────────

/**
 * **Deliberately not square, and not the element's aspect either.** Telling an
 * element raster from a page raster is done by aspect: Chromium writes the
 * image's pixel dimensions but not what it covers, and the pixel count alone
 * says nothing because the device scale is Chromium's to pick. A raster whose
 * width and height are the same multiple of the page's is the page.
 */
const PAGE = { width: 360, height: 280 }

const page = (body: string, head = '') => `<!doctype html><meta charset="utf-8">
<style>@page{size:${PAGE.width}px ${PAGE.height}px;margin:0}html,body{margin:0;padding:0}
svg{display:block}${head}</style>
<svg width="${PAGE.width}" height="${PAGE.height}" viewBox="0 0 ${PAGE.width} ${PAGE.height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

const BOX = { x: 60, y: 60, width: 180, height: 110 }
const RECT = `x="${BOX.x}" y="${BOX.y}" width="${BOX.width}" height="${BOX.height}"`
const PRICE = (extra = '') =>
  `<text x="40" y="240" font-family="Helvetica" font-size="44" font-weight="700" ${extra}>AED 9.90</text>`

/** A rounded rect as a path, so a ring and its shape are the same geometry. */
const roundedPath = (r: { x: number; y: number; width: number; height: number }, radius: number) => {
  const k = Math.max(0, Math.min(radius, r.width / 2, r.height / 2))
  return (
    `M${r.x + k},${r.y}H${r.x + r.width - k}A${k},${k} 0 0 1 ${r.x + r.width},${r.y + k}` +
    `V${r.y + r.height - k}A${k},${k} 0 0 1 ${r.x + r.width - k},${r.y + r.height}` +
    `H${r.x + k}A${k},${k} 0 0 1 ${r.x},${r.y + r.height - k}` +
    `V${r.y + k}A${k},${k} 0 0 1 ${r.x + k},${r.y}Z`
  )
}

/** The shadow the last two cases draw, expanded through the engine. */
const SHADOW: Shadow = { x: 4, y: 6, blur: 8, color: { from: 'hex', hex: '#000000' } }
/** Screen scale. `export:check` renders at 1:1 CSS px, so `s` is 1. */
const OUTPUT = { scale: 1, dpi: 96 }

const ringsFor = (rect: typeof BOX, radius: number, shape: 'rect' | 'burst') =>
  shadowRings(SHADOW, rect, radius, OUTPUT)
    .map(
      (ring) =>
        `<path d="${shape === 'rect' ? roundedPath(ring.rect, ring.radius) : shapePath('burst', ring.rect)}"` +
        ` fill="#000000" fill-opacity="${ring.alpha.toFixed(4)}"/>`,
    )
    .join('')

interface Case {
  name: string
  what: string
  /** What §2.4 measured. A row that stops matching is the regression. */
  expect: 'vector' | 'element-raster' | 'page-raster'
  /** Whether the price text must still be text in the PDF. */
  expectText: boolean
  html: string
}

const CASES: Case[] = [
  {
    name: 'plain-shape',
    what: 'filled rect',
    expect: 'vector',
    expectText: false,
    html: page(`<rect ${RECT} fill="#cc2222" rx="8"/>`),
  },
  {
    name: 'plain-text',
    what: 'text, no effects',
    expect: 'vector',
    expectText: true,
    html: page(PRICE()),
  },
  {
    name: 'opacity',
    what: 'opacity alone',
    expect: 'vector',
    expectText: true,
    html: page(`<rect ${RECT} fill="#cc2222" rx="8" opacity="0.5"/>${PRICE('opacity="0.6"')}`),
  },
  {
    name: 'text-stroke',
    what: 'text + stroke + paint-order',
    expect: 'vector',
    expectText: true,
    html: page(PRICE('fill="#ffffff" stroke="#cc2222" stroke-width="6" paint-order="stroke fill"')),
  },
  {
    name: 'fe-drop-shadow',
    what: 'feDropShadow on a shape',
    expect: 'element-raster',
    expectText: true,
    html: page(
      `<defs><filter id="s"><feDropShadow dx="4" dy="6" stdDeviation="8" flood-color="#000"/></filter></defs>` +
        `<rect ${RECT} fill="#cc2222" rx="8" filter="url(#s)"/>${PRICE()}`,
    ),
  },
  {
    name: 'fe-gaussian-blur',
    what: 'feGaussianBlur',
    expect: 'element-raster',
    expectText: true,
    html: page(
      `<defs><filter id="b"><feGaussianBlur stdDeviation="8"/></filter></defs>` +
        `<rect ${RECT} fill="#cc2222" rx="8" filter="url(#b)"/>${PRICE()}`,
    ),
  },
  {
    name: 'filter-on-text',
    what: 'filter: drop-shadow() on text',
    expect: 'element-raster',
    // The disqualifying one: the font leaves the PDF and the price is a picture.
    expectText: false,
    html: page(PRICE('style="filter:drop-shadow(3px 4px 6px rgba(0,0,0,.5))"')),
  },
  {
    /**
     * **r5 corrected this row.** §2.4 recorded a gradient with alpha stops as
     * "the whole page, 72dpi" and called it the worst option available. What
     * current Chromium actually emits is a PDF *shading pattern* — vector —
     * plus a page-sized soft mask to carry the alpha, and the page's text
     * survives as text. The gradient is still resolution-limited by a mask
     * nothing in the document can size, so it stays banned on the export path;
     * it is not the page-destroying case it was written up as.
     */
    name: 'gradient-alpha',
    what: 'gradient with alpha stops',
    expect: 'page-raster',
    expectText: true,
    html: page(
      `<defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.6"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse cx="150" cy="120" rx="120" ry="70" fill="url(#g)"/>${PRICE()}`,
    ),
  },
  {
    name: 'rings-rect',
    what: 'concentric rings, rounded rect',
    expect: 'vector',
    expectText: true,
    html: page(`${ringsFor(BOX, 8, 'rect')}<rect ${RECT} fill="#cc2222" rx="8"/>${PRICE()}`),
  },
  {
    /**
     * **A glyph has no box to expand**, so a text shadow is the string again
     * under a stroke of twice the step, which grows the outline outward by the
     * step. §2.4 specified the ring model for shapes and left text open; this
     * is the case that says the answer keeps the text as text.
     *
     * It matters more than the shape cases do. `filter: drop-shadow()` over
     * text is the one disqualifying result in this table — the font leaves the
     * PDF and the price becomes a picture — so a text shadow that quietly did
     * the same thing would be the defect this whole harness exists to catch.
     *
     * **It stays text, and it is still why `blur` is refused on text.** The
     * size column is the finding: Chromium outlines every stroked copy into
     * path geometry, so this case is 663 kB and 26,385 curve operators for one
     * price, against 274 kB for the twenty-four ringed bursts below. Linear at
     * about 24 kB a ring — 34/61/108/205/396/663 at 1/2/4/8/16/27. The document
     * schema refuses a blurred text shadow because of this row; the row stays
     * so that the number is measured rather than remembered.
     */
    name: 'rings-text',
    what: 'concentric rings on text',
    expect: 'vector',
    expectText: true,
    html: page(
      shadowRings(SHADOW, { x: 40, y: 200, width: 220, height: 50 }, 0, OUTPUT)
        .map((ring) => {
          const grow = ring.rect.width - 220
          return PRICE(
            `fill="#000000" fill-opacity="${ring.alpha.toFixed(4)}"` +
              ` stroke="#000000" stroke-opacity="${ring.alpha.toFixed(4)}"` +
              ` stroke-width="${grow.toFixed(3)}" paint-order="stroke fill" stroke-linejoin="round"`
          )
        })
        .join('') + PRICE('fill="#cc2222"')
    ),
  },
  {
    name: 'rings-burst',
    what: 'concentric rings, 12-point burst',
    expect: 'vector',
    expectText: true,
    html: page(
      `${ringsFor({ x: 60, y: 60, width: 160, height: 160 }, 0, 'burst')}` +
        `<path d="${shapePath('burst', { x: 60, y: 60, width: 160, height: 160 })}" fill="#cc2222"/>${PRICE()}`,
    ),
  },
]

// ─── Reading the PDF back ─────────────────────────────────────────────────────

interface Findings {
  images: { width: number; height: number }[]
  /**
   * How many text-drawing blocks the page's content stream holds.
   *
   * **Not whether a font is embedded**, which was the first thing this measured
   * and was wrong: a PDF can carry a font it never draws with, and the case
   * that matters — `filter: drop-shadow()` on text — leaves the font object in
   * place while replacing the text with an image. The honest question is
   * whether anything still executes `BT … Tf … Tj`.
   */
  textBlocks: number
  /** Image XObjects actually painted, as opposed to merely defined. */
  xobjectDraws: number
  bytes: number
}

/**
 * Count what the PDF actually holds.
 *
 * Crude on purpose: Chrome writes its object dictionaries uncompressed, so the
 * keys are findable in the raw bytes and this needs no PDF library. If that
 * ever stops being true every case reports zero images at once, which is a
 * failure mode loud enough to notice.
 */
function inspect(pdf: Buffer): Findings {
  const raw = pdf.toString('latin1')
  const images: { width: number; height: number }[] = []
  const re = /\/Subtype\s*\/Image/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    // The dictionary holding the subtype also holds the dimensions; look both
    // ways, because key order is the writer's choice.
    const window = raw.slice(Math.max(0, m.index - 400), m.index + 400)
    const w = /\/Width\s+(\d+)/.exec(window)
    const h = /\/Height\s+(\d+)/.exec(window)
    if (w !== null && h !== null) images.push({ width: Number(w[1]), height: Number(h[1]) })
  }

  // The content stream is deflated. Inflate every stream that inflates, and
  // read the operators out of whichever one draws the page.
  let textBlocks = 0
  let xobjectDraws = 0
  for (const s of raw.matchAll(/stream\r?\n/g)) {
    const start = s.index + s[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    let content: string
    try {
      content = inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1')
    } catch {
      continue
    }
    if (!content.includes('BT') && !content.includes(' Do')) continue
    textBlocks += (content.match(/\bBT\b/g) ?? []).length
    xobjectDraws += (content.match(/\bDo\b/g) ?? []).length
  }
  return { images, textBlocks, xobjectDraws, bytes: pdf.length }
}

/**
 * Is this image the page, or one element on it?
 *
 * The page if its width and height are the *same* multiple of the page's —
 * which is a statement about aspect, and survives Chromium changing the device
 * scale it picks. An element's bounding box has a different aspect, and the
 * page above is sized so that it does.
 */
const coversPage = (img: { width: number; height: number }) => {
  const sx = img.width / PAGE.width
  const sy = img.height / PAGE.height
  return Math.abs(sx - sy) / Math.max(sx, sy) < 0.03
}

/** What Chromium chose to rasterize at, which is the number nothing can set. */
const impliedDpi = (img: { width: number; height: number }) =>
  Math.round((img.width / PAGE.width) * 72)

function classify(f: Findings): 'vector' | 'element-raster' | 'page-raster' {
  if (f.images.length === 0) return 'vector'
  return f.images.some(coversPage) ? 'page-raster' : 'element-raster'
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const chrome = findChrome()
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

interface Row {
  c: Case
  found: ReturnType<typeof classify>
  f: Findings
  ok: boolean
  textOk: boolean
}

const rows: Row[] = []
for (const c of CASES) {
  const html = join(OUT, `${c.name}.html`)
  const pdf = join(OUT, `${c.name}.pdf`)
  writeFileSync(html, c.html)
  execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdf}`,
    `file://${html}`,
  ], { stdio: 'ignore' })
  const f = inspect(readFileSync(pdf))
  const found = classify(f)
  rows.push({ c, found, f, ok: found === c.expect, textOk: f.textBlocks > 0 === c.expectText })
}

const pad = (s: string, n: number) => s.padEnd(n)
const px = (f: Findings) => {
  if (f.images.length === 0) return '—'
  const i = f.images[0] as { width: number; height: number }
  const more = f.images.length > 1 ? ` ×${f.images.length}` : ''
  return `${i.width}×${i.height}${more}`
}

/** Only meaningful for a page raster, where the multiple is the device scale. */
const dpi = (f: Findings) => {
  const cover = f.images.find(coversPage)
  return cover === undefined ? '—' : `${impliedDpi(cover)}`
}

console.log('')
console.log('Export regression — what Chromium put in the PDF. E14 §2.4.')
console.log('')
console.log(
  pad('case', 22) + pad('what', 34) + pad('expected', 16) + pad('found', 16) + pad('raster px', 16) + pad('page dpi', 10) + pad('text', 6) + 'kB',
)
console.log('─'.repeat(120))
for (const r of rows) {
  const mark = r.ok && r.textOk ? ' ' : '✗'
  console.log(
    mark +
      ' ' +
      pad(r.c.name, 20) +
      pad(r.c.what, 34) +
      pad(r.c.expect, 16) +
      pad(r.found, 16) +
      pad(px(r.f), 16) +
      pad(dpi(r.f), 10) +
      pad(r.f.textBlocks > 0 ? 'text' : 'gone', 6) +
      (r.f.bytes / 1024).toFixed(1),
  )
}
console.log('')

const failed = rows.filter((r) => !r.ok || !r.textOk)
for (const r of failed) {
  if (!r.ok) console.log(`✗ ${r.c.name}: expected ${r.c.expect}, got ${r.found}`)
  if (!r.textOk) {
    console.log(
      `✗ ${r.c.name}: text is ${r.f.textBlocks > 0 ? 'still text' : 'gone'}, expected ` +
        `${r.c.expectText ? 'still text' : 'gone'}`,
    )
  }
}

/**
 * **What a page of shadows costs.** §8 left this open: the ring count is derived
 * from blur and output scale, which at 300 dpi on a large burst is a few hundred
 * paths — cheap individually, unmeasured across a page. So measure it, and only
 * then argue about a cap.
 *
 * A booklet page is 24 cards. Each gets a ringed burst at the ring count a
 * 300 dpi render would ask for, which is the worst case that can actually reach
 * a printer.
 */
const COST_CARDS = 24
const COST_DPI = 300

const costPage = () => {
  const cols = 4
  const cell = { width: 84, height: 44 }
  let body = ''
  for (let i = 0; i < COST_CARDS; i++) {
    const rect = {
      x: 12 + (i % cols) * (cell.width + 4),
      y: 12 + Math.floor(i / cols) * (cell.height + 2),
      width: cell.width - 8,
      height: cell.height - 8,
    }
    const rings = shadowRings(SHADOW, rect, 0, { scale: 1, dpi: COST_DPI })
    body +=
      rings
        .map(
          (ring) =>
            `<path d="${shapePath('burst', ring.rect)}" fill="#000000" fill-opacity="${ring.alpha.toFixed(4)}"/>`,
        )
        .join('') + `<path d="${shapePath('burst', rect)}" fill="#cc2222"/>`
  }
  return page(body)
}

const costHtml = join(OUT, 'cost.html')
const costPdf = join(OUT, 'cost.pdf')
writeFileSync(costHtml, costPage())
const costStart = Date.now()
execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${costPdf}`,
  `file://${costHtml}`,
], { stdio: 'ignore' })
const costMs = Date.now() - costStart
const costFindings = inspect(readFileSync(costPdf))
const perCard = ringCount(SHADOW.blur, 1, COST_DPI)

const ringsAt = (dpi: number) => ringCount(SHADOW.blur, 1, dpi)
console.log(
  `ring count for blur=${SHADOW.blur} at s=1: screen(96dpi)=${ringsAt(96)}  print(300dpi)=${ringsAt(300)}`,
)
console.log(
  `page cost: ${COST_CARDS} ringed bursts at ${COST_DPI}dpi = ${perCard} rings each, ` +
    `${COST_CARDS * perCard} paths — ${(costFindings.bytes / 1024).toFixed(0)}kB, ` +
    `${costFindings.images.length} rasters, ${costMs}ms to render`,
)
console.log('')

if (failed.length > 0) {
  console.log(`${failed.length} of ${rows.length} cases did not match §2.4. PDFs are in ${OUT}`)
  process.exit(1)
}
console.log(`all ${rows.length} cases match §2.4`)
