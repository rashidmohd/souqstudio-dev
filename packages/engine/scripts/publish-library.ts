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
 * **Credentials come from `apps/web/.env.local` if it is there**, which is the
 * same trick `pnpm --filter @souqstudio/web r2:cors` uses and for the same
 * reason: the R2 keys live in one file and a script that cannot find them is a
 * script nobody runs. `--env-file-if-exists` rather than `--env-file`, so this
 * still runs on Railway, where the variables are already in the process and
 * there is no such file.
 */

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { loadLibrary } from '../src/library-load'
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

  const manifest: LibraryManifest = {
    version: new Date().toISOString(),
    count: library.length,
    blocks: library.map((block) => ({ id: block.id, category: block.category })),
  }

  console.log(`${library.length} blocks → ${prefix}/`)
  const counts = new Map<string, number>()
  for (const block of library) counts.set(block.category, (counts.get(block.category) ?? 0) + 1)
  for (const [category, n] of counts) console.log(`  ${category.padEnd(12)} ${n}`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written. Manifest that would be published:')
    console.log(JSON.stringify(manifest, null, 2))
    return
  }

  const missing = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(
    (name) => process.env[name] === undefined || process.env[name] === ''
  )
  if (missing.length > 0) {
    die(`Missing: ${missing.join(', ')}. Run with the app's environment loaded.`)
  }

  const bucket = process.env['R2_BUCKET_NAME'] as string
  const client = new S3Client({
    region: 'auto', // R2 has no regions; the SDK still demands the field.
    endpoint: process.env['R2_ENDPOINT'] as string,
    credentials: {
      accessKeyId: process.env['R2_ACCESS_KEY_ID'] as string,
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] as string,
    },
  })

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
  for (const block of library) {
    await put(`${prefix}/${block.id}.json`, block)
    done += 1
    if (done % 10 === 0 || done === library.length) {
      process.stdout.write(`  ${done}/${library.length}\n`)
    }
  }

  await put(`${prefix}/manifest.json`, manifest)
  console.log(`\nPublished ${library.length} blocks and the manifest to ${prefix}/`)
  console.log(`Point BLOCK_LIBRARY_URL at <R2_PUBLIC_URL>/${prefix}/ to read it.`)

  if (flag('prune')) {
    const keep = new Set([
      ...library.map((block) => `${prefix}/${block.id}.json`),
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
