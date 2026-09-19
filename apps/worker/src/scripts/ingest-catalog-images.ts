import sharp from 'sharp'
import { Prisma, closeQueues, enqueueBgRemove, prisma } from '@souqstudio/db'
import {
  IMAGE_VARIANTS,
  publicUrl,
  putObject,
  universalProductKey,
  variantKey,
} from '../lib/r2'

/**
 * Fetch a catalog product's packshot, store it at every size, and record it.
 *
 * ```
 * pnpm --filter @souqstudio/worker catalog:images -- --dry-run
 * pnpm --filter @souqstudio/worker catalog:images -- --limit 50
 * pnpm --filter @souqstudio/worker catalog:images
 * ```
 *
 * **The second half of the Union Coop import, and a separate run on purpose.**
 * `packages/db/scripts/import-unioncoop.ts` writes the rows and records where
 * each packshot lives in `metadata.sourceImageUrl`; this reads that back. It is
 * here rather than there because this package already owns `sharp`, the S3
 * client and the rule that the worker is the only thing that writes a processed
 * asset — and because 17,000 network fetches must not be able to fail an import
 * whose rows are worth having on their own.
 *
 * **Resumable, and that is the property that matters at this size.** The work
 * queue is "universal rows with a `sourceImageUrl` and no `ORIGINAL` image
 * asset", computed fresh on every run. Interrupt it, re-run it, and it picks up
 * where it stopped. Nothing is cleared after a fetch: the presence of the
 * `image_assets` row is what says the image arrived, and the URL stays so a
 * later licensed replacement pass can find what it needs to replace.
 *
 * **It does not remove backgrounds.** That is `bg.remove`, it needs Rembg, and
 * at roughly two seconds a product it is a different order of run. `--cutouts`
 * enqueues those jobs once the originals are in place; without it this writes
 * ORIGINAL rows and stops, and a card falls back to the packshot with the
 * quality flag E5 §3 specifies.
 */

type Args = {
  dryRun: boolean
  limit: number | null
  concurrency: number
  cutouts: boolean
  retries: number
}

function parseArgs(argv: string[]): Args {
  const has = (flag: string): boolean => argv.includes(flag)
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag)
    return at === -1 ? null : (argv[at + 1] ?? null)
  }

  const limit = value('--limit')
  const concurrency = value('--concurrency')
  const retries = value('--retries')

  return {
    dryRun: has('--dry-run'),
    limit: limit === null ? null : Number(limit),
    /**
     * Eight at a time. High enough that 17,000 fetches finish in an hour rather
     * than a day, low enough to stay a polite crawl rather than a burst against
     * one origin — and bounded because each worker holds a decoded bitmap plus
     * three encodes, so the ceiling here is memory, not politeness.
     */
    concurrency: concurrency === null ? 8 : Number(concurrency),
    cutouts: has('--cutouts'),
    retries: retries === null ? 2 : Number(retries),
  }
}

/** Longest edge of the stored full-size image. */
const FULL_EDGE = 1600

/** Refuse anything that is not plausibly a packshot before decoding it. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

/** A fetch that has not answered by now is not going to. */
const FETCH_TIMEOUT_MS = 20_000

type Pending = {
  id: string
  sourceImageUrl: string
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const pending = await findPending(args.limit)
  console.log(`[images] ${pending.length} products awaiting an image`)

  if (args.dryRun) {
    for (const row of pending.slice(0, 10)) console.log(`  ${row.id} ← ${row.sourceImageUrl}`)
    console.log('[images] dry run — nothing fetched or written')
    return
  }

  let stored = 0
  let failed = 0
  let queuedCutouts = 0
  const failures: Array<{ id: string; reason: string }> = []

  /**
   * A fixed pool of workers pulling from one cursor, rather than slicing the
   * list into chunks and awaiting each chunk. A chunked loop runs at the speed
   * of the slowest fetch in every chunk; this keeps all eight busy until the
   * list is empty, which on a list with a handful of 20-second timeouts in it
   * is the difference between an hour and an afternoon.
   */
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const at = cursor
      cursor += 1
      const row = pending[at]
      if (!row) return

      try {
        await storeImage(row, args.retries)
        stored += 1
        if (args.cutouts) {
          await enqueueCutout(row.id)
          queuedCutouts += 1
        }
      } catch (error) {
        failed += 1
        failures.push({ id: row.id, reason: error instanceof Error ? error.message : String(error) })
      }

      const done = stored + failed
      if (done % 100 === 0) {
        console.log(`[images] ${done}/${pending.length} — ${stored} stored, ${failed} failed`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, worker))

  console.log(`[images] done: ${stored} stored, ${failed} failed`)
  if (args.cutouts) console.log(`[images] ${queuedCutouts} cutout jobs queued`)

  if (failures.length > 0) {
    // Named rather than counted. A failure here leaves the row exactly as it
    // was, so re-running picks it up again — but a systematic failure (one host
    // refusing, one format sharp will not decode) is only visible as a list.
    console.log('[images] first failures:')
    for (const failure of failures.slice(0, 20)) {
      console.log(`  ${failure.id}: ${failure.reason}`)
    }
  }
}

/**
 * Universal rows carrying a source image and no stored original.
 *
 * Raw SQL for the `metadata->>` extraction and the NOT EXISTS, neither of which
 * Prisma's query builder expresses — and the NOT EXISTS is what makes the run
 * resumable rather than a full re-fetch.
 */
async function findPending(limit: number | null): Promise<Pending[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; sourceImageUrl: string }>>`
    SELECT p.id, p.metadata->>'sourceImageUrl' AS "sourceImageUrl"
    FROM catalog_products p
    WHERE p."organizationId" IS NULL
      AND p."archivedAt" IS NULL
      AND p.metadata->>'sourceImageUrl' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM image_assets i
        WHERE i."productId" = p.id AND i.kind = 'ORIGINAL'
      )
    ORDER BY p."createdAt" ASC
    ${limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `
  return rows
}

/**
 * Fetch one packshot, write the full size and every variant, record the row.
 *
 * **The `image_assets` row is written last, and that ordering is the whole
 * resumability story.** The row is what `findPending` tests for, so writing it
 * before the objects land would mark a product done whose image never arrived —
 * and nothing would ever come back for it. The reverse failure, objects with no
 * row, costs one re-fetch on the next run.
 */
async function storeImage(row: Pending, retries: number): Promise<void> {
  const source = await fetchWithRetry(row.sourceImageUrl, retries)

  /**
   * Re-encoded rather than stored as fetched, and it is not only about bytes.
   * Decoding through sharp is what establishes the file is an image at all —
   * the same second look `apps/web/lib/r2.ts` relies on for presigned uploads,
   * and the reason a renamed executable cannot reach the bucket.
   *
   * `withoutEnlargement` so a small packshot is stored at its own size rather
   * than upscaled into a soft one, and `animated: false` because six rows in
   * this feed point at GIFs and only the first frame is the product.
   */
  const pipeline = sharp(source, { animated: false }).rotate()
  const metadata = await pipeline.metadata()

  const full = await pipeline
    .clone()
    .resize({ width: FULL_EDGE, height: FULL_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const key = universalProductKey(row.id, 'original.jpg')
  await putObject(key, full.data, 'image/jpeg')

  // The ladder, written in the same pass. `variantKey` is a derivation rather
  // than a lookup — nothing in the database records that these exist — so a
  // partial ladder is a silent 404 on a grid. See the helper.
  for (const variant of IMAGE_VARIANTS) {
    const rendition = await pipeline
      .clone()
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    await putObject(variantKey(key, variant.name), rendition, 'image/webp')
  }

  await prisma.imageAsset.create({
    data: {
      productId: row.id,
      kind: 'ORIGINAL',
      r2Key: key,
      width: full.info.width,
      height: full.info.height,
      /**
       * **`APPROVED`, unlike a cutout's default.** `reviewState` exists to keep
       * a bad *matte* off a printed page — `quality` is a matting score and
       * `analyseMatte` is what sets it. A packshot has had no matte applied, so
       * there is nothing to score and nothing to review; leaving it PENDING
       * would hide every one of these from `IMAGE_PICK`, which excludes nothing
       * but REJECTED, and from a grid that is now expected to be full.
       */
      reviewState: 'APPROVED',
    },
  })

  if (metadata.width === undefined) {
    console.warn(`[images] ${row.id}: source reported no dimensions; stored anyway`)
  }
}

/**
 * One fetch, with a bounded retry.
 *
 * A retry is for the transient case — a reset connection, a 5xx, a timeout. A
 * 404 is not transient and is not retried: the URL is wrong or the product is
 * gone, and three attempts at it only slow the run down.
 */
async function fetchWithRetry(url: string, retries: number): Promise<Buffer> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchImage(url)
    } catch (error) {
      lastError = error
      if (error instanceof PermanentFetchError) throw error
      // Linear backoff. This is a bulk crawl against one origin, so slowing
      // down after a failure is the correct response to it.
      if (attempt < retries) await sleep(1_000 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** A failure that retrying cannot fix. */
class PermanentFetchError extends Error {}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Identifying the crawler is the minimum courtesy owed to an origin being
      // read in bulk, and it is what lets them rate-limit us specifically
      // rather than blocking a range.
      'user-agent': 'SouqStudio catalog ingest (+https://souqstudio.com)',
      accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
    },
  })

  if (response.status === 404 || response.status === 410 || response.status === 403) {
    throw new PermanentFetchError(`HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_SOURCE_BYTES) {
    throw new PermanentFetchError(`${declared} bytes exceeds the ceiling`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  // Checked again after the read: `content-length` is a claim, not a guarantee,
  // and a chunked response does not send one at all.
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new PermanentFetchError(`${bytes.byteLength} bytes exceeds the ceiling`)
  }
  if (bytes.byteLength === 0) throw new PermanentFetchError('empty response')

  return bytes
}

/**
 * Queue the background removal for a product whose original has just landed.
 *
 * Deliberately going through the same `bg.remove` job the rest of the system
 * uses rather than calling Rembg here: that handler already writes the CUTOUT
 * row, records `bboxTight`, scores the matte and routes a bad one to review,
 * and a second implementation of that is how the printed page stops matching
 * the screen. `billOrganizationId` is left unset, which is what keeps an ingest
 * cutout free — see the note on that field in `bg.job.ts`.
 */
async function enqueueCutout(productId: string): Promise<void> {
  const original = await prisma.imageAsset.findFirst({
    where: { productId, kind: 'ORIGINAL' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, r2Key: true },
  })
  if (!original) return

  await enqueueBgRemove({
    imageUrl: publicUrl(original.r2Key),
    // A *different* key from the source. `handleBgRemove` refuses a target
    // equal to its source, and E5 §3 keeps the original so a bad matte is
    // recoverable.
    targetPath: universalProductKey(productId, 'cutout.png'),
    catalogProductId: productId,
    sourceAssetId: original.id,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .catch((error: unknown) => {
    console.error('[images] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    /**
     * **Without this the script never exits.** `@souqstudio/db` builds its five
     * BullMQ queues at module load and each one opens a Redis connection there,
     * so the handles keep the event loop alive long after the last image has
     * landed. Closing them is unconditional rather than gated on `--cutouts`:
     * the connections are opened by the import, not by the enqueue.
     */
    await closeQueues()
  })
