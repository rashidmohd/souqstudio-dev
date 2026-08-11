import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { env } from './env'

/**
 * R2 from the worker side. Deliberately a separate small client from
 * apps/web/lib/r2.ts rather than a shared package: the worker never presigns
 * anything and the web app never writes a processed asset, so a shared module
 * would be the union of two things neither side wants all of.
 */

const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const result = await client.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
  )
  if (!result.Body) throw new Error(`R2 object has no body: ${key}`)
  return Buffer.from(await result.Body.transformToByteArray())
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await client.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType })
  )
  return publicUrl(key)
}

/** R2 keys are paths; the public URL is that path under the CDN origin. */
export function keyFromPublicUrl(url: string): string | null {
  const origin = env.R2_PUBLIC_URL.replace(/\/$/, '')
  if (!url.startsWith(origin)) return null
  return url.slice(origin.length + 1)
}
