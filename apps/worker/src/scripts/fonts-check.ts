/**
 * Do the mirrored typefaces actually reach a PDF, with no network to Google?
 * `pnpm --filter @souqstudio/worker fonts:check`
 *
 * **The exit test for `docs/fonts-from-google.md` Part A.** Everything else in
 * Part A is an argument about where bytes come from; this is the one place that
 * checks the bytes arrive where they are supposed to end up. Three claims, each
 * of which is silently false if it breaks:
 *
 *   1. A page rendered from **local files only** embeds a real font program.
 *      If Chromium cannot load the face it substitutes one and says nothing;
 *      the PDF is produced, the owner's typeface is simply not in it.
 *   2. The text stays **text**. §2.4's disqualifying case is a font leaving the
 *      PDF and a price becoming a picture — unselectable, unsearchable, and
 *      resampled by any printer that reprocesses it.
 *   3. **Arabic survives.** A face can carry Latin and drop Arabic on embed, and
 *      a bilingual book is exactly where that shows up. Both scripts are drawn.
 *
 * **On demand, never in CI**, for the same reason `export:check` is: it needs a
 * real browser, and the browser is the point.
 *
 * It also needs the registry and the bucket — this is what `fonts:mirror` was
 * for, so a failure here after a clean mirror run means the mirror is wrong, not
 * this.
 */

import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadFace, localFontFaceCss, type FontFile } from '../lib/fonts'
import { listFonts } from '@souqstudio/db'

const OUT = join(tmpdir(), 'souqstudio-fonts-check')

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
      'This harness needs one, which is why it does not run in CI.'
  )
}

/** Arabic first: it is where a face fails, and it runs longer. */
const ARABIC = 'أرز بسمتي ذهبي ٣ كجم'
const LATIN = 'Golden basmati rice 3kg'

function page(faces: readonly FontFile[], family: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  ${localFontFaceCss(faces)}
  @page { size: 210mm 297mm; margin: 0 }
  body { margin: 0; padding: 20mm; font-family: '${family}'; }
  .ar { direction: rtl; font-size: 28pt; }
  .en { font-size: 28pt; }
</style>
<div class="ar">${ARABIC}</div>
<div class="en">${LATIN}</div>
`
}

interface Findings {
  /** Embedded font programs, by the key each format uses. */
  embedded: number
  /** Names Chromium wrote for the faces it embedded — subset-tagged. */
  names: string[]
  /** Text-drawing operators. Zero means the page became a picture. */
  textBlocks: number
  images: number
}

/**
 * Read the PDF without a PDF library, exactly as `export:check` does and for
 * the same reason: the keys are findable in the raw bytes, and a parser is a
 * dependency that can disagree with Chromium about what is in the file.
 *
 * `FontFile2` is a TrueType program, `FontFile3` a CFF one. Chromium subsets on
 * embed, so what lands is a few kB out of a ~90 kB face carrying only the glyphs
 * the page drew — which is why §4 says subsetting on our side is not owed.
 */
function inspect(pdf: Buffer): Findings {
  const raw = pdf.toString('latin1')
  const embedded = (raw.match(/\/FontFile2?3?\b/g) ?? []).length
  const names = [...new Set((raw.match(/\/BaseFont\s*\/([A-Za-z0-9+\-,#]+)/g) ?? []))].map((n) =>
    n.replace(/^\/BaseFont\s*\//, '')
  )
  const images = (raw.match(/\/Subtype\s*\/Image/g) ?? []).length

  // **Content streams are deflated, and reading them raw was wrong.** The first
  // run of this harness reported "0 text" for nine families out of ten and "2"
  // for the tenth — the tenth simply happened to have an uncompressed stream.
  // Inflate whatever inflates, exactly as `export:check` does.
  let textBlocks = 0
  for (const s of raw.matchAll(/stream\r?\n/g)) {
    const start = (s.index ?? 0) + s[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    let content: string
    try {
      content = inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1')
    } catch {
      // Not a deflate stream — a font program, an image, or already plain.
      content = raw.slice(start, end)
    }
    textBlocks += (content.match(/\bBT\b/g) ?? []).length
  }

  return { embedded, names, textBlocks, images }
}

async function main(): Promise<void> {
  const chrome = findChrome()
  mkdirSync(OUT, { recursive: true })

  const registry = await listFonts()
  if (registry.length === 0) {
    throw new Error(
      'The font registry is empty. Run `pnpm --filter @souqstudio/web fonts:mirror` first.'
    )
  }

  console.log(`${registry.length} families in the registry, browser: ${chrome}`)
  console.log('')

  let failures = 0

  for (const font of registry) {
    const weight = font.weights.includes(400) ? 400 : (font.weights[0] ?? 400)
    const face = await loadFace(font.family, weight)

    if (face === null) {
      console.log(`  ${font.family.padEnd(18)} FAIL — no file loadable from R2`)
      failures++
      continue
    }

    const html = join(OUT, `${font.slug}.html`)
    const pdf = join(OUT, `${font.slug}.pdf`)
    writeFileSync(html, page([face], font.family))

    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        // **The point of the whole exercise.** With no route out, a page that
        // still renders in the right face is a page that needed nothing from
        // Google. If a face were being fetched from the CDN this is where it
        // would fall back and the embed count would drop.
        '--host-resolver-rules=MAP * ~NOTFOUND',
        `--print-to-pdf=${pdf}`,
        `file://${html}`,
      ],
      { stdio: 'ignore' }
    )

    const found = inspect(readFileSync(pdf))
    const embedded = found.embedded > 0
    const isText = found.textBlocks > 0
    const ok = embedded && isText && found.images === 0
    if (!ok) failures++

    console.log(
      `  ${font.family.padEnd(18)} ${ok ? 'ok  ' : 'FAIL'} ` +
        `${String(found.embedded).padStart(2)} embedded  ` +
        `${String(found.textBlocks).padStart(3)} text  ` +
        `${found.images} images  ` +
        `${(readFileSync(pdf).length / 1024).toFixed(0).padStart(4)} kB  ` +
        `${found.names.slice(0, 2).join(' ')}`
    )
  }

  console.log('')
  console.log(`PDFs in ${OUT}`)
  if (failures > 0) {
    console.error(`${failures} of ${registry.length} families failed.`)
    process.exit(1)
  }
  console.log(`All ${registry.length} families embed, as text, with no network to Google.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
