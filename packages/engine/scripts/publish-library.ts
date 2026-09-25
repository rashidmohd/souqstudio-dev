/**
 * Publish the block library to R2.
 * `pnpm --filter @souqstudio/engine blocks:publish -- --prefix library/production`
 *
 * **This is what puts the library in the bucket in the first place**, and it is
 * the engine's job rather than the web app's because the engine is what produces
 * a library. The generated blocks are still generated — seventeen structures
 * times a skin, in TypeScript, for the reason `docs/E7-pending.md` §8 gives —
 * but generating and *distributing* are different jobs and this is the second.
 *
 * After this, `BLOCK_LIBRARY_URL` pointing at the same prefix means the seed
 * reads only R2 and never the compiled-in library.
 *
 * ## Documents first, manifest last
 *
 * A reader fetches the manifest and then what it names. A manifest that lands
 * *before* its documents is a window in which every sync fails; a manifest that
 * lands *after* them is a window in which the library is one publish out of
 * date. One of those is an outage and the other is a delay, so the order is not
 * a detail.
 *
 * Nothing is deleted without `--prune`, for the same reason: an object the
 * manifest no longer names is already invisible to every reader, so removing it
 * is a separate decision from publishing.
 *
 * `--dry-run` validates and prints and writes nothing. Run it first.
 *
 * ## Blocks the admin panel published are kept
 *
 * The panel publishes one block at a time into the same prefix and marks its
 * manifest entries `origin: 'panel'`. This script used to replace the manifest
 * with the repo's blocks alone, which dropped every one of those, and the next
 * sync then archived or deleted them in every shop. It now reads the manifest
 * that is there and keeps them (`mergeManifest`); a repo block the panel has
 * replaced under the same id is left as the panel published it. To retire a
 * panel block, name it: `--drop blk_ramadan_band` (repeatable, or
 * comma-separated). If the current manifest cannot be read, it refuses rather
 * than guess.
 *
 * **Credentials come from `apps/web/.env.local` if it is there**, which is the
 * same trick `pnpm --filter @souqstudio/web r2:cors` uses and for the same
 * reason: the R2 keys live in one file and a script that cannot find them is a
 * script nobody runs. `--env-file-if-exists` rather than `--env-file`, so this
 * still runs on Railway, where the variables are already in the process and
 * there is no such file.
 */

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { loadLibrary } from '../src/library-load'
import { mergeManifest } from '../src/library-merge'
import { BLOCK_OCCASION } from '../src/seasonal'
import type { LibraryManifest } from '../src/library-source'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const value = (name: string) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

const die = (message: string): never => {
  console.error(message)
  process.exit(1)
}

/** Every value given to `--drop`, repeated or comma-separated. */
const dropIds = new Set(
  args
    .flatMap((arg, at) => (args[at - 1] === '--drop' ? arg.split(',') : []))
    .map((id) => id.trim())
    .filter((id) => id !== '')
)

/**
 * The manifest already at the prefix, or null when nothing has been published
 * there. Anything else unreadable stops the run: guessing "empty" is exactly
 * the mistake that drops the panel's blocks.
 */
async function readExisting(
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<LibraryManifest | null> {
  let text: string
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/manifest.json` })
    )
    text = (await result.Body?.transformToString()) ?? ''
  } catch (error) {
    if (error instanceof NoSuchKey) return null
    return die(`Could not read ${prefix}/manifest.json (${(error as Error).name}). Refusing to overwrite it blind.`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return die(`${prefix}/manifest.json is not JSON. Refusing to overwrite it blind.`)
  }
  const blocks = (raw as { blocks?: unknown }).blocks
  if (!Array.isArray(blocks)) return die(`${prefix}/manifest.json has no block list. Refusing to overwrite it blind.`)
  // Only id, category and origin are read; `mergeManifest` decides with them.
  return raw as LibraryManifest
}

async function main() {
  const prefix = (value('prefix') ?? process.env['BLOCK_LIBRARY_PREFIX'] ?? '').replace(
    /^\/+|\/+$/g,
    ''
  )
  const dryRun = flag('dry-run')

  if (prefix === '') {
    // **No default, deliberately.** Writing this prefix puts a design in front
    // of every shop that reads it, and a default would make the destination the
    // thing nobody typed and nobody checked. §5: "Get it wrong once and a
    // half-finished design is in every shop."
    die(
      'Say where. --prefix library/production (or BLOCK_LIBRARY_PREFIX).\n' +
        'There is no default: writing a prefix puts these designs in front of every shop that reads it.'
    )
  }

  /**
   * **Read from the repo, never from the bucket we are about to write.**
   *
   * `loadLibrary()` with no argument consults `BLOCK_LIBRARY_URL`, which is set
   * in any environment that has been published to before — so the default would
   * fetch what is already there and write it back. That is a no-op wearing the
   * costume of a successful publish, and it would quietly stop new designs ever
   * shipping.
   */
  const library = await loadLibrary({ kind: 'local' })

  if (library.length === 0) {
    die('The library loaded empty. Refusing to publish: a sync against it would prune every block.')
  }

  const missing = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(
    (name) => process.env[name] === undefined || process.env[name] === ''
  )
  if (missing.length > 0 && !dryRun) {
    die(`Missing: ${missing.join(', ')}. Run with the app's environment loaded.`)
  }

  // Checked by the line above: past it, either every variable is set or this is
  // a dry run, and a dry run with none set never builds a client.
  const bucket = process.env['R2_BUCKET_NAME'] as string
  const client =
    missing.length > 0
      ? null
      : new S3Client({
          region: 'auto', // R2 has no regions; the SDK still demands the field.
          endpoint: process.env['R2_ENDPOINT'] as string,
          credentials: {
            accessKeyId: process.env['R2_ACCESS_KEY_ID'] as string,
            secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] as string,
          },
        })

  const existing = client === null ? null : await readExisting(client, bucket, prefix)
  if (client === null) {
    console.warn(
      'No R2 credentials, so this dry run cannot see what the admin panel has published ' +
        'to the prefix. The list below is the repo alone; a real run keeps the panel\'s blocks.'
    )
  }

  const panelIds = new Set(
    (existing?.blocks ?? []).filter((entry) => entry.origin === 'panel').map((entry) => entry.id)
  )
  const unknownDrops = [...dropIds].filter((id) => !panelIds.has(id))
  if (client !== null && unknownDrops.length > 0) {
    die(
      `--drop names ${unknownDrops.join(', ')}, which the admin panel has not published to ${prefix}/. ` +
        'Only a panel block can be dropped; a repo block leaves by being removed from the repo.'
    )
  }

  const merged = mergeManifest(
    library.map((block) => ({ id: block.id, category: block.category })),
    existing,
    dropIds
  )
  const replaced = new Set(merged.replacedByPanel)
  const toWrite = library.filter((block) => !replaced.has(block.id))
  const manifest: LibraryManifest = { version: new Date().toISOString(), ...merged.manifest }

  console.log(`${manifest.count} blocks → ${prefix}/`)
  console.log(`  from the repo       ${toWrite.length}`)
  console.log(`  kept from the panel ${merged.keptFromPanel.length}`)
  if (merged.replacedByPanel.length > 0) {
    console.log(`  repo blocks the panel has replaced, left as published: ${merged.replacedByPanel.join(', ')}`)
  }
  if (merged.dropped.length > 0) console.log(`  dropped: ${merged.dropped.join(', ')}`)
  const counts = new Map<string, number>()
  for (const block of manifest.blocks) counts.set(block.category, (counts.get(block.category) ?? 0) + 1)
  for (const [category, n] of counts) console.log(`  ${category.padEnd(12)} ${n}`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written. Manifest that would be published:')
    console.log(JSON.stringify(manifest, null, 2))
    return
  }
  if (client === null) return die('unreachable: a real run without credentials stopped above')

  const put = (key: string, body: unknown) =>
    client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: `${JSON.stringify(body, null, 2)}\n`,
        ContentType: 'application/json; charset=utf-8',
        // A library object is replaced by the next publish and read once per
        // sync. Long CDN caching here is how a sync reports success, changes
        // nothing, and leaves everyone looking for a bug in the seed.
        CacheControl: 'no-cache',
      })
    )

  let done = 0
  for (const block of toWrite) {
    // The occasion goes into the document, so a reader needs no copy of the
    // map to know what a seasonal block is for.
    const occasion = block.occasion ?? BLOCK_OCCASION[block.id]
    await put(`${prefix}/${block.id}.json`, occasion === undefined ? block : { ...block, occasion })
    done += 1
    if (done % 10 === 0 || done === toWrite.length) {
      process.stdout.write(`  ${done}/${toWrite.length}\n`)
    }
  }

  await put(`${prefix}/manifest.json`, manifest)
  console.log(
    `\nPublished ${toWrite.length} repo blocks and a manifest of ${manifest.count} to ${prefix}/`
  )
  console.log(`Point BLOCK_LIBRARY_URL at <R2_PUBLIC_URL>/${prefix}/ to read it.`)

  if (flag('prune')) {
    // Everything the manifest names, the panel's documents included. A dropped
    // panel block is not named, so its document goes.
    const keep = new Set([
      ...manifest.blocks.map((block) => `${prefix}/${block.id}.json`),
      `${prefix}/manifest.json`,
    ])
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/` })
    )
    const stale = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => key !== undefined && !keep.has(key))

    if (stale.length === 0) {
      console.log('Nothing stale at this prefix.')
    } else {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: stale.map((Key) => ({ Key })) },
        })
      )
      console.log(`Removed ${stale.length} object(s) the manifest no longer names.`)
    }
  }
}

void main()
