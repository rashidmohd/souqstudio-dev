import 'server-only'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ensureFamily, enqueueFontComplete, type EnsureDeps } from '@souqstudio/db'
import { env } from '@/lib/env'
import { publicUrl } from '@/lib/r2'

/**
 * The app's side of mirror-on-select. `docs/fonts-from-google.md` §7 B2.
 *
 * **A second S3 client, and not an oversight.** `lib/r2.ts` builds its client
 * with `requestChecksumCalculation: 'WHEN_REQUIRED'`, which exists because a
 * *presigned* PUT is signed before its body exists. Nothing here is presigned —
 * these are ordinary server-side puts of bytes we already hold — so the mirror
 * takes a plain client and `putObject` keeps its presigning behaviour untouched.
 */

const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

function deps(apiKey: string): EnsureDeps {
  return {
    apiKey,
    publicUrl,
    async put(key, body, contentType, cacheControl) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      )
    },
  }
}

/** What went wrong, in a sentence a shop owner can act on. */
export type EnsureFailure = { family: string; reason: string }

/**
 * Make every family in a patch drawable before the patch is accepted.
 *
 * **Blocking, and that is the whole design.** If this were a background job the
 * kit would name a face before its files existed, and an export in that window
 * comes back in the fallback — silently, days later, in something a shop
 * printed. A spinner is the cheap price for never having to check at render
 * time. §7 B2.
 *
 * Families are ensured **in sequence, not in parallel**: each one is already
 * saturating the upload concurrency, and running four at once would quadruple
 * the load on R2 to make the slowest one no faster.
 */
export async function ensureFamilies(
  families: readonly string[],
  weights: readonly number[]
): Promise<EnsureFailure[]> {
  const unique = [...new Set(families)]
  if (unique.length === 0) return []

  if (env.GOOGLE_FONTS_API_KEY === undefined) {
    // Without the key the library cannot be widened, so the only families that
    // can be chosen are the ones already mirrored — which is what the picker
    // offers in that case. Anything else is a request we cannot honour.
    return unique.map((family) => ({
      family,
      reason: 'Typefaces cannot be added right now. Choose one of the ones already available.',
    }))
  }

  const failures: EnsureFailure[] = []
  const d = deps(env.GOOGLE_FONTS_API_KEY)

  for (const family of unique) {
    try {
      const { font } = await ensureFamily(family, weights, d)

      /**
       * **Enqueued every time the row is incomplete, not only when this call
       * mirrored it.** A family can be left half-mirrored by a save whose job
       * was dropped — a Redis restart, a worker deploy, three exhausted
       * retries — and nothing else would ever notice. Re-enqueueing is free:
       * the job id is the family name, so a duplicate collapses into the one
       * already queued, and the work is idempotent regardless.
       */
      if (!font.complete) {
        /**
         * **A queue failure must not fail the save.** The face is in R2 and
         * drawable, which is what the owner asked for; the outstanding work is
         * finishing the rest of the family. Refusing the whole patch here would
         * mean a Redis hiccup blocks a colour change — and that is exactly what
         * happened the first time this shipped, because BullMQ rejected a job id
         * containing a colon and the rejection surfaced as
         * `font_not_available` on a font that had just been mirrored.
         *
         * It is not silently ignored either: an un-enqueued family stays
         * incomplete and cannot be exported. The next save re-enqueues it, since
         * this runs whenever the row is incomplete rather than only when this
         * call mirrored it.
         */
        try {
          await enqueueFontComplete({ family: font.family })
        } catch (error) {
          console.error(
            `[fonts] ${font.family} mirrored but its completion job could not be queued:`,
            error instanceof Error ? error.message : error
          )
        }
      }
    } catch (error) {
      failures.push({
        family,
        reason: error instanceof Error ? error.message : `${family} could not be added.`,
      })
    }
  }
  return failures
}
