import 'server-only'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/env'

/**
 * R2, for the catalog image tools. E13-02.
 *
 * **A narrow copy of `apps/web/lib/r2.ts`, not a shared module.** That file
 * carries shop keys, org keys, block artwork, SVG rasterisation and the
 * variant ladder, all of it reached through a shop owner's session. This needs
 * two operations against one prefix. Importing the other app's module is not
 * possible and moving the whole thing into a package to get two functions would
 * drag the tenant key scheme into an app that has no tenants.
 *
 * **What is *not* copied is the key derivation.** `universalProductKey`,
 * `variantKey` and `IMAGE_VARIANTS` come from `@souqstudio/types`, which is
 * where they live precisely so the worker, the web app and anything else agree.
 * `cutoutKey` is duplicated below and says so; it is four characters of string
 * manipulation and the alternative is a package boundary for one line.
 */

export type R2Config =
  | { ok: true; bucket: string }
  | { ok: false; reason: string }

/**
 * All four variables, or none. A partial configuration is the case that
 * produces a presigned URL that 403s at upload time, which looks to a reviewer
 * like a broken file rather than a missing secret.
 */
export function r2Config(): R2Config {
  const missing = (
    [
      ['R2_ACCESS_KEY_ID', env.R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', env.R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET_NAME', env.R2_BUCKET_NAME],
      ['R2_ENDPOINT', env.R2_ENDPOINT],
    ] as const
  )
    .filter(([, value]) => value === undefined)
    .map(([name]) => name)

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Image upload is off on this deployment: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
    }
  }

  return { ok: true, bucket: env.R2_BUCKET_NAME as string }
}

let cached: S3Client | null = null

function client(): S3Client {
  if (cached !== null) return cached

  cached = new S3Client({
    region: 'auto', // R2 has no regions; the SDK still demands the field.
    endpoint: env.R2_ENDPOINT as string,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    },
    /**
     * **Without this, every presigned upload URL is born broken**, and the
     * failure is invisible until a browser tries to use one.
     *
     * Since v3.729 the SDK adds a CRC32 checksum to `PutObject` by default. On
     * a presigned request there is no body at signing time, so it computes the
     * checksum of nothing — `AAAAAA==` — and bakes it into the query string.
     * The browser then PUTs real bytes against a URL that swears they hash to
     * empty, and R2 rejects it.
     *
     * `apps/web/lib/r2.ts` carries the same line and the same comment. It is
     * repeated rather than referenced because deleting it looks harmless.
     */
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })

  return cached
}

export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024

export const ACCEPTED_PRODUCT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type AcceptedProductImageType = (typeof ACCEPTED_PRODUCT_IMAGE_TYPES)[number]

export const EXTENSION: Readonly<Record<AcceptedProductImageType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function isAcceptedImageType(value: string): value is AcceptedProductImageType {
  return (ACCEPTED_PRODUCT_IMAGE_TYPES as readonly string[]).includes(value)
}

/**
 * A URL the browser may PUT one object to, for fifteen minutes.
 *
 * **The bytes go browser → R2 directly**, the same shape E5-04 uses and for the
 * same reason: a serverless function caps its request body well below the 10 MB
 * a phone camera produces, and proxying would reject perfectly good photos with
 * a platform error nobody can act on.
 */
export async function presignUpload(
  key: string,
  contentType: AcceptedProductImageType,
  contentLength: number
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME as string,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })

  return getSignedUrl(client(), command, { expiresIn: 15 * 60 })
}

export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

/**
 * Where the cutout of an original lands.
 *
 * **Duplicated from `apps/web/lib/r2.ts` deliberately.** The worker derives the
 * same name and both must agree, so this is a place two copies can drift — but
 * the copies are one line each, and the thing that actually keeps them honest
 * is that the worker writes `r2Key = targetPath` from whatever it is handed.
 * This function only decides where to ask for it.
 */
export function cutoutKey(originalKey: string): string {
  return `${originalKey.replace(/\.[^./]+$/, '')}-cutout.png`
}
