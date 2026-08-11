import 'server-only'

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/env'

/**
 * Cloudflare R2. S3-compatible, so the AWS SDK talks to it unchanged.
 *
 * **Uploads are presigned and go browser → R2 directly, never through a route.**
 * A Vercel serverless function caps its request body at 4.5MB, and E4-01 allows
 * a 10MB logo — so routing the bytes through Next would reject perfectly valid
 * files with a platform error the owner cannot act on. The route hands back a
 * URL; the browser does the PUT.
 *
 * That also means **the server never sees the file it is authorising**. The
 * content type and size ceiling are pinned into the signature, and the object
 * is verified after the fact in the completion route.
 */

const client = new S3Client({
  region: 'auto', // R2 has no regions; the SDK still demands the field.
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

/** How long a presigned upload URL stays valid. Long enough for a slow 4G upload. */
const UPLOAD_URL_TTL_SECONDS = 10 * 60

export const MAX_LOGO_BYTES = 10 * 1024 * 1024

/** E4-01. SVG is accepted for upload but rasterised before storage. */
export const ACCEPTED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const

export type AcceptedLogoType = (typeof ACCEPTED_LOGO_TYPES)[number]

/**
 * Where a shop's assets live. Org first so a whole tenant's objects can be
 * found, listed or deleted as a unit — which is what a GDPR or PDPL erasure
 * request actually asks for.
 */
export function shopAssetKey(
  organizationId: string,
  shopId: string,
  filename: string
): string {
  return `${organizationId}/${shopId}/${filename}`
}

/**
 * Where an organization's own assets live — E2-01's org-level logo, which every
 * shop inherits unless its brandOverride says otherwise.
 *
 * The `org` segment is a literal, not a shop id. Shop ids are cuids and cannot
 * collide with it, so an organization's objects and its shops' objects stay
 * separable under the same prefix, and the erasure-by-prefix property above
 * still holds for the organization as a whole.
 */
export function orgAssetKey(organizationId: string, filename: string): string {
  return `${organizationId}/org/${filename}`
}

/** The public URL for a stored object. R2_PUBLIC_URL is the CDN origin. */
export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

/**
 * A URL the browser can PUT to.
 *
 * `ContentType` and `ContentLength` are part of the signature, so a client that
 * sends a different type or a larger body gets a signature mismatch from R2
 * rather than a stored file nobody checked.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  )
}

/** Read an object back — used to verify and to extract colours after upload. */
export async function getObjectBytes(key: string): Promise<Buffer | null> {
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
    )
    if (!result.Body) return null
    return Buffer.from(await result.Body.transformToByteArray())
  } catch {
    // Missing object, expired credentials, R2 down — the caller's only useful
    // question is "did I get the bytes", and every no is the same no.
    return null
  }
}

/** Store bytes we produced ourselves — a rasterised or processed logo. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
  return publicUrl(key)
}
