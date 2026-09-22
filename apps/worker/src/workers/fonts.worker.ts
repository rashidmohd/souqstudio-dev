import { Worker } from 'bullmq'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  assembleBrandCss,
  completeFamily,
  listFonts,
  type EnsureDeps,
  type FontCompletePayload,
} from '@souqstudio/db'
import { BRAND_CSS_KEY } from '@souqstudio/types'
import { env } from '../lib/env'
import { publicUrl } from '../lib/r2'

/**
 * Finishing a typeface a shop picked in a hurry.
 * `docs/fonts-from-google.md` §7 B2.
 *
 * **Why there is a background half at all.** Mirroring a whole family costs up
 * to 7.2s — 99 objects for Rubik, and the cost is per-object round trips rather
 * than bandwidth, so concurrency does not rescue it. Blocking a font change on
 * that is an eight-second spinner on a routine act. So the save waits only for
 * the weights the type scale can bind and the scripts the product ships in, and
 * this finishes the rest.
 *
 * Until it does, `fonts.complete` is false and **the export gate is the only
 * thing that cares**. Every rendering surface draws with whatever is mirrored.
 *
 * Idempotent: every key is deterministic, so a retry re-uploads the same bytes
 * to the same place. That is what lets this be retried without bookkeeping.
 */

const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

async function put(key: string, body: Buffer, contentType: string, cacheControl?: string) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  )
}

function deps(): EnsureDeps {
  if (env.GOOGLE_FONTS_API_KEY === undefined) {
    throw new Error(
      'GOOGLE_FONTS_API_KEY is not set. A family cannot be completed without the ' +
        'Developer API, and leaving it half-mirrored blocks every export that uses it.'
    )
  }
  return { apiKey: env.GOOGLE_FONTS_API_KEY, publicUrl, put }
}

/**
 * Rewritten after every completion, from the registry rather than from this job.
 *
 * A sheet naming only the family just finished would unstyle every shop on the
 * other nine — the same reasoning the pre-warm CLI writes it last and from
 * `listFonts()`.
 */
async function republishBrandCss(): Promise<number> {
  const fonts = await listFonts()
  const css = assembleBrandCss(fonts)
  await put(BRAND_CSS_KEY, Buffer.from(css, 'utf8'), 'text/css; charset=utf-8', 'public, max-age=300')
  return fonts.length
}

export const fontsWorker = new Worker(
  'fonts',
  async (job) => {
    const { family } = job.data as FontCompletePayload
    const started = Date.now()

    const font = await completeFamily(family, deps())
    if (font === null) {
      console.log(`[fonts] ${family} has no registry row, nothing to finish`)
      return
    }

    const families = await republishBrandCss()
    console.log(
      `[fonts] ${family} completed in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
        `${font.weights.length} weights, ${font.italicWeights.length} italic; ` +
        `brand.css republished over ${families} families`
    )
  },
  {
    connection: { url: env.REDIS_URL },
    // One at a time. Each job saturates the upload concurrency on its own, and
    // running several would multiply the load on R2 without finishing any of
    // them sooner.
    concurrency: 1,
  }
)

fontsWorker.on('failed', (job, err) => {
  // Worth saying loudly: a family stuck incomplete is a family no book can be
  // exported with, and nothing in the product surfaces that to an owner.
  console.error(`[fonts] ${String(job?.data?.family)} failed to complete:`, err.message)
})
