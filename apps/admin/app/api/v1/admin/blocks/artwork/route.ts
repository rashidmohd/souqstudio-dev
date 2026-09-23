import type { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { LIBRARY_ASSET_PREFIX } from '@/lib/library-drafts'
import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  presignUpload,
  publicUrl,
  r2Config,
} from '@/lib/r2'

/**
 * Authorise one artwork upload for a library draft. E13-04.
 *
 * The bytes go from the browser straight to R2 on the presigned URL, as the
 * shop app's `/api/v1/blocks/artwork` does; nothing is recorded until the
 * assets route reads the object back. No audit here: this writes nothing.
 */

const schema = z.object({
  contentType: z.enum(ACCEPTED_PRODUCT_IMAGE_TYPES),
  contentLength: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
})

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const r2 = r2Config()
  if (!r2.ok) return fail('not_configured', r2.reason, 503)

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail(
      'invalid_input',
      `Upload a PNG, JPG or WebP under ${Math.round(MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024)}MB.`,
      422
    )
  }

  const key = `${LIBRARY_ASSET_PREFIX}${randomBytes(12).toString('hex')}`
  const uploadUrl = await presignUpload(key, parsed.data.contentType, parsed.data.contentLength)

  return ok({ uploadUrl, assetId: key, url: publicUrl(key) })
}
