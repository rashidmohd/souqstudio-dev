import type { NextRequest } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  customProductKey,
  presignUpload,
  publicUrl,
} from '@/lib/r2'

/**
 * E5-04 — authorise a product photo upload.
 *
 * Same shape as the logo's presigned PUT and for the same reason: the bytes go
 * browser → R2 directly, because a serverless function caps its request body
 * well below the 10MB a phone camera produces, and proxying would reject
 * perfectly good photos with a platform error the owner cannot act on.
 *
 * **The key carries a nanoid, unlike the logo's fixed `logo-upload`.** A shop
 * has one logo and many products, so a stable staging key would mean two people
 * adding products at the same time overwrite each other's photo — and the one
 * who loses gets someone else's packshot on their product, silently.
 */

const schema = z.object({
  contentType: z.enum(ACCEPTED_PRODUCT_IMAGE_TYPES),
  contentLength: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
})

const EXTENSION: Record<(typeof ACCEPTED_PRODUCT_IMAGE_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail(
      'invalid_input',
      `Upload a PNG, JPG or WebP under ${Math.round(MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024)}MB.`,
      422
    )
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // Adding a product is ordinary shop work, so an editor may do it. It changes
  // nothing about the organization and nothing about the bill.
  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to add a product.', 403)
  }

  const key = customProductKey(
    session.user.organizationId,
    shop.id,
    `${nanoid()}.${EXTENSION[parsed.data.contentType]}`
  )

  return ok({
    uploadUrl: await presignUpload(key, parsed.data.contentType, parsed.data.contentLength),
    key,
    publicUrl: publicUrl(key),
  })
}
