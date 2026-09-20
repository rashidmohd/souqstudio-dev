#!/usr/bin/env node
/**
 * Mirror the brand-kit typefaces into R2.
 * `pnpm --filter @souqstudio/web fonts:mirror -- --dry-run`
 *
 * **Chrome loads these faces from Google's CDN for the specimen, and the render
 * path must not.** Three reasons, all of them in CLAUDE.md's known gaps already:
 * Playwright cannot depend on an external network on a critical path, PDF
 * embedding needs the real font file, and a measurer needs the *file* rather
 * than a CSS link.
 *
 * That third one is new and it is what moved this off E9's list onto E14's.
 * `hug` means measuring a string, and E14 Phase 0.1 measured 1.1M strings to
 * establish that only a real shaper over the real font bytes agrees with what
 * Chromium will draw — `estimateWidth` is off by 5–40% at the *median*. So the
 * files have to be somewhere the server, the browser and the export worker can
 * all read them, and that is this.
 *
 * ## Licensing
 *
 * Every family in `BRAND_FONTS` is OFL, verified against `METADATA.pb` in
 * google/fonts rather than against the picker's own claim. OFL permits
 * redistribution and hosting; it requires the licence travel with the files,
 * which is why `OFL.txt` is mirrored beside each family and why nothing here
 * renames a family.
 *
 * ## What is mirrored
 *
 * **TTF, one file per family and weight.** Not the woff2 subsets Google serves a
 * browser: a shaper cannot read woff2 without a brotli decompressor, and the
 * whole point is that one set of bytes answers for the measurer, the specimen
 * and the export.
 *
 * **Subsetting is deliberately not done here**, and that is a measured decision
 * rather than an omission. Chromium subsets on embed: a PDF carrying a
 * bilingual page of Cairo holds a 9,096-byte `AAAAAA+Cairo-Regular` font
 * program out of a 91,500-byte face, covering both scripts. The note in
 * CLAUDE.md about "shipping every Arabic glyph twice" is about the download,
 * not the PDF, and Google's per-script split already answers that for the
 * specimen — 36 kB of woff2 against 91 kB of TTF for Cairo 400.
 *
 * ## The manifest
 *
 * Written last, for the reason `blocks:publish` gives: a manifest that lands
 * before its files is a window in which every read fails. A reader fetches
 * `fonts/manifest.json` and then what it names.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const dryRun = flag('dry-run')

const required = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0 && !dryRun) {
  console.error(`Missing: ${missing.join(', ')}. Run with the app's environment loaded.`)
  process.exit(1)
}

/**
 * The catalog, read out of `lib/brand-fonts.ts` rather than restated.
 *
 * **A second list of families is how the picker and the render path start
 * disagreeing** about which faces exist — and the failure would be a shop
 * picking a face the export cannot load, which nobody sees until a PDF comes
 * back in the fallback. The file is TypeScript and this is a `.mjs` script, so
 * it is parsed rather than imported: the two fields needed are a family name
 * and a weight list, and both are literals.
 */
function readCatalog() {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(join(here, '..', 'lib', 'brand-fonts.ts'), 'utf8')
  const start = source.indexOf('export const BRAND_FONTS')
  if (start === -1) throw new Error('brand-fonts.ts: BRAND_FONTS not found')
  const body = source.slice(start, source.indexOf('\n]', start))

  const families = [...body.matchAll(/family:\s*'([^']+)'/g)].map((m) => m[1])
  const weights = [...body.matchAll(/weights:\s*\[([^\]]+)\]/g)].map((m) =>
    m[1].split(',').map((n) => Number(n.trim())).filter(Number.isFinite)
  )

  if (families.length !== weights.length || families.length === 0) {
    throw new Error(
      `brand-fonts.ts: read ${families.length} families and ${weights.length} weight lists. ` +
        'Refusing to mirror a catalog this did not understand.'
    )
  }
  return families.map((family, i) => ({ family, weights: weights[i] }))
}

/** Google serves TTF to an ancient user agent and woff2 to a modern one. */
const ANCIENT_UA = 'Mozilla/4.0'

async function fetchFace(family, weight) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}` +
    `:wght@${weight}`
  const css = await fetch(url, { headers: { 'user-agent': ANCIENT_UA } }).then((r) => {
    if (!r.ok) throw new Error(`${family} ${weight}: CSS ${r.status}`)
    return r.text()
  })
  const match = /src:\s*url\((\S+?)\)/.exec(css)
  if (match === null) throw new Error(`${family} ${weight}: no font url in the CSS`)
  const bytes = Buffer.from(await fetch(match[1]).then((r) => r.arrayBuffer()))
  // A TTF starts `\0\1\0\0` or `true`; an HTML error page does not. Google
  // answers an unknown weight with a 200 and a CSS file naming the nearest one,
  // so a wrong weight here is silent without this.
  const tag = bytes.subarray(0, 4).toString('latin1')
  if (tag !== '\u0000\u0001\u0000\u0000' && tag !== 'true' && tag !== 'ttcf') {
    throw new Error(`${family} ${weight}: not a TrueType file (${bytes.length} bytes)`)
  }
  return bytes
}

/** `Noto Sans Arabic` → `noto-sans-arabic`. Stable, and it is the key in R2. */
const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function main() {
  const catalog = readCatalog()
  const faces = catalog.flatMap(({ family, weights }) =>
    weights.map((weight) => ({ family, weight }))
  )
  console.log(`${catalog.length} families, ${faces.length} faces`)

  const client = dryRun
    ? null
    : new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })

  const entries = []
  let total = 0

  for (const { family, weight } of faces) {
    const bytes = await fetchFace(family, weight)
    const key = `fonts/${slug(family)}/${weight}.ttf`
    total += bytes.length
    entries.push({ family, weight, key, bytes: bytes.length })
    console.log(`  ${key.padEnd(40)} ${bytes.length.toLocaleString().padStart(9)} bytes`)

    if (client !== null) {
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: bytes,
          ContentType: 'font/ttf',
          // Immutable: the key names a family and a weight, and Google's files
          // for a released version do not change under them. A new version is a
          // new mirror run, not a cache bust.
          CacheControl: 'public, max-age=31536000, immutable',
        })
      )
    }
  }

  // The licence travels with the files. OFL requires it, and a mirror that
  // dropped it would be redistribution without the one condition attached.
  for (const { family } of catalog) {
    const licence = await fetch(
      `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug(family).replace(/-/g, '')}/OFL.txt`
    )
    if (!licence.ok) {
      console.warn(`  ! ${family}: OFL.txt not found — check the family before publishing`)
      continue
    }
    const text = await licence.text()
    if (client !== null) {
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: `fonts/${slug(family)}/OFL.txt`,
          Body: text,
          ContentType: 'text/plain; charset=utf-8',
        })
      )
    }
  }

  // Last, always. A manifest ahead of its files is a window in which every
  // read fails; behind them it is a window in which the list is one run stale.
  const manifest = {
    version: new Date().toISOString(),
    faces: entries.map(({ family, weight, key }) => ({ family, weight, key })),
  }
  if (client !== null) {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: 'fonts/manifest.json',
        Body: JSON.stringify(manifest, null, 2),
        ContentType: 'application/json',
        // Short, unlike the files: this is the thing that changes.
        CacheControl: 'public, max-age=300',
      })
    )
  }

  console.log('')
  console.log(`${entries.length} faces, ${(total / 1024 / 1024).toFixed(1)} MB`)
  if (dryRun) console.log('dry run — nothing written')
  else console.log(`manifest → ${process.env.R2_PUBLIC_URL}/fonts/manifest.json`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
