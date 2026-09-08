#!/usr/bin/env node
/**
 * Put the bucket's CORS policy. `pnpm --filter @souqstudio/web r2:cors`
 *
 * **Every presigned upload in this product is a cross-origin PUT from a browser**
 * — the logo, a product photo, artwork dropped on the designer canvas — so each
 * one sends a preflight `OPTIONS` to `<bucket>.<account>.r2.cloudflarestorage.com`
 * first. A bucket with no policy answers that with
 * `403 Unauthorized: CORS not configured for this bucket`, and the PUT never
 * leaves the page. The presigned URL can be perfectly correct and the upload
 * still cannot happen.
 *
 * That was the third fault on the logo path in one afternoon, after the endpoint
 * carrying the bucket and the SDK's empty-body checksum. It is a script rather
 * than a dashboard click for the reason the other two are now startup errors: a
 * manual step nobody records is a manual step that is wrong in the next
 * environment. Run it against production before production has a user.
 *
 * `--dry-run` prints the policy and sends nothing.
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

const required = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(', ')}. Run with the app's environment loaded.`)
  process.exit(1)
}

/**
 * The origins that may upload, and nothing else.
 *
 * **Not `*`.** A wildcard would let any page on the internet PUT to a URL it had
 * somehow obtained — the presigned URL is the credential, and CORS is the second
 * thing standing between a leaked one and a write. `APP_ORIGINS` is a
 * comma-separated override so a new environment does not need a code change.
 *
 * `content-type` is the only header the client sets. `content-length` is in the
 * signature and set by the browser, and is listed because a preflight that asks
 * for it must be answered.
 */
const origins = (
  process.env.APP_ORIGINS ?? 'https://dev.souqstudio.com,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const rules = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    AllowedHeaders: ['content-type', 'content-length'],
    ExposeHeaders: ['etag'],
    MaxAgeSeconds: 3600,
  },
]

const bucket = process.env.R2_BUCKET_NAME

console.log(`bucket  ${bucket}`)
console.log(`origins ${origins.join(', ')}`)

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify(rules, null, 2))
  console.log('\nDry run — nothing sent.')
  process.exit(0)
}

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

await client.send(
  new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } })
)

// Read it back rather than trusting the write. The whole reason this script
// exists is a configuration that was assumed rather than checked.
const applied = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
console.log('\nApplied:')
console.log(JSON.stringify(applied.CORSRules, null, 2))
