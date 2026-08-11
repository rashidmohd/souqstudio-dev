import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { levelFor } from '@/lib/brand-inheritance'
import {
  presignUpload,
  shopAssetKey,
  orgAssetKey,
  publicUrl,
  MAX_LOGO_BYTES,
  ACCEPTED_LOGO_TYPES,
} from '@/lib/r2'

/**
 * E4-01 — authorise a logo upload.
 *
 * Hands back a presigned URL the browser PUTs to directly. The bytes never pass
 * through this route: a Vercel serverless function caps its body at 4.5MB and
 * E4-01 allows 10MB, so proxying would reject valid files with a platform error
 * the shop owner can do nothing about.
 *
 * The trade is that the server authorises a file it has not seen. Type and size
 * are pinned into the signature so R2 itself rejects a mismatch, and the
 * completion route re-reads the object and validates it as an image before
 * anything is stored on the shop.
 */

const schema = z.object({
  contentType: z.enum(ACCEPTED_LOGO_TYPES),
  contentLength: z.number().int().positive().max(MAX_LOGO_BYTES),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
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
      `Upload a PNG, JPG, WebP or SVG under ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)}MB.`,
      422
    )
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the logo.', 403)
  }

  // The upload lands on a staging key, not on `logo.png`. Overwriting the live
  // logo with an unverified file would break the brand kit for as long as it
  // took someone to notice — the completion route promotes it once it is known
  // to be a real image.
  //
  // The staging key follows the level that owns the logo, so that the
  // completion route reads back from where this wrote. Both derive it from
  // `brandOverride` the same way; they must not disagree.
  const key =
    levelFor(shop.brandOverride, 'logo') === 'org'
      ? orgAssetKey(session.user.organizationId, 'logo-upload')
      : shopAssetKey(session.user.organizationId, shop.id, 'logo-upload')

  return ok({
    uploadUrl: await presignUpload(key, parsed.data.contentType, parsed.data.contentLength),
    key,
    publicUrl: publicUrl(key),
  })
}
