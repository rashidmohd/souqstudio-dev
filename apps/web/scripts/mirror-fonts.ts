/**
 * Pre-warm the font registry.
 * `pnpm --filter @souqstudio/web fonts:mirror -- --dry-run`
 * `pnpm --filter @souqstudio/web fonts:mirror -- Cairo "Reem Kufi"`
 *
 * **This is no longer "mirror the catalog".** There is no catalog to mirror —
 * `lib/brand-fonts.ts`'s ten families stop being the set a shop may choose from
 * and become the *Recommended* group in front of a library filtered by the
 * shop's languages. Mirroring happens on selection, in
 * `PATCH /api/v1/brand`, through the same `mirrorFamily()` this calls.
 *
 * So what this is for is warming the likely picks, once, so that the common case
 * never pays the 2–3s a cold family costs. Named families, or the ten by
 * default. `docs/fonts-from-google.md` §6 A1.
 *
 * **The work is in `@souqstudio/db`, not here.** A CLI with its own copy of the
 * fetching is how a pre-warmed family comes to differ from a lazily mirrored one
 * under the same key — and the worker that finishes a family in the background
 * is a third caller of the same code, in another app.
 *
 * Credentials come from `apps/web/.env.local` if it is there — the same trick
 * `r2:cors` and `blocks:publish` use, for the same reason: the R2 keys live in
 * one file and a script that cannot find them is a script nobody runs.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  assembleBrandCss,
  fetchGoogleCatalog,
  listFonts,
  mirrorFamily,
  registerFont,
  type GoogleFamily,
  type MirrorDeps,
} from '@souqstudio/db'
import { BRAND_CSS_KEY } from '@souqstudio/types'

/**
 * The ten that were the whole catalog until this landed — every one covering
 * Arabic and Latin. They stay worth warming because they remain the defaults and
 * the Recommended group, so they are what most shops will land on.
 *
 * Spelled out rather than imported from `lib/brand-fonts.ts`. That module is on
 * its way out, and a script that imports a dying module is a script that breaks
 * when it dies. These are Google family names; they are not ours to drift.
 */
const RECOMMENDED = [
  'Cairo',
  'Tajawal',
  'Almarai',
  'Readex Pro',
  'Rubik',
  'Changa',
  'Lalezar',
  'Reem Kufi',
  'Baloo Bhaijaan 2',
  'Noto Sans Arabic',
]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const requested = args.filter((arg) => !arg.startsWith('--'))
const families = requested.length > 0 ? requested : RECOMMENDED

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`Missing ${name}. Run with the app's environment loaded.`)
  }
  return value
}

function makeDeps(): MirrorDeps {
  const publicBase = (process.env.R2_PUBLIC_URL ?? 'https://example.invalid').replace(/\/$/, '')
  const publicUrl = (key: string) => `${publicBase}/${key}`

  if (dryRun) {
    return { put: async () => {}, publicUrl }
  }

  const bucket = requireEnv('R2_BUCKET_NAME')
  const client = new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })

  return {
    publicUrl,
    async put(key, body, contentType, cacheControl) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      )
    },
  }
}

async function main(): Promise<void> {
  if (!dryRun) requireEnv('R2_PUBLIC_URL')

  const catalog = await fetchGoogleCatalog(requireEnv('GOOGLE_FONTS_API_KEY'))
  const byFamily = new Map<string, GoogleFamily>(catalog.map((item) => [item.family, item]))

  const missing = families.filter((family) => !byFamily.has(family))
  if (missing.length > 0) {
    // Before any upload. A typo in a family name is the likeliest way to run
    // this wrongly, and finding out after four families are in the bucket is
    // worse than finding out now.
    throw new Error(
      `Not in Google Fonts: ${missing.join(', ')}. Names are case- and space-sensitive.`
    )
  }

  console.log(`${families.length} families${dryRun ? ' — dry run' : ''}`)

  const deps = makeDeps()
  let totalBytes = 0
  const registered = []

  for (const family of families) {
    const entry = byFamily.get(family)!
    const started = Date.now()
    const { registration, keys, bytes } = await mirrorFamily(entry, deps)
    const seconds = ((Date.now() - started) / 1000).toFixed(1)

    totalBytes += bytes
    registered.push(registration)

    const faces = registration.weights.length + registration.italicWeights.length
    console.log(
      `  ${family.padEnd(20)} ${registration.version.padEnd(5)} ` +
        `${String(faces).padStart(2)} faces  ${keys.length.toString().padStart(3)} files  ` +
        `${(bytes / 1024 / 1024).toFixed(1).padStart(5)} MB  ${seconds}s  ${registration.license}`
    )
    console.log(`  ${''.padEnd(20)} ${registration.subsets.join(' ')}`)

    if (!dryRun) await registerFont(registration)
  }

  // The stylesheet is written last, from the registry rather than from this
  // run — a run that warms two families must not publish a stylesheet naming
  // only those two, which would unstyle every shop on the other eight.
  const all = dryRun ? registered : await listFonts()
  const css = assembleBrandCss(all)
  if (!dryRun) {
    await deps.put(
      BRAND_CSS_KEY,
      Buffer.from(css, 'utf8'),
      'text/css; charset=utf-8',
      // Short, unlike the faces: this is the file that changes when a family is
      // added, and every browser surface links it.
      'public, max-age=300'
    )
  }

  console.log('')
  console.log(
    `${registered.length} families, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ` +
      `${BRAND_CSS_KEY} ${(css.length / 1024).toFixed(1)} kB over ${all.length} families`
  )
  if (dryRun) console.log('dry run — nothing written to R2 or the database')
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
