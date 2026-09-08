import type { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  presignUpload,
  publicUrl,
} from '@/lib/r2'

/**
 * Artwork for a block. E7.
 *
 * Hands back a presigned URL the browser PUTs to directly. The bytes never pass
 * through this route — the same reason the logo path does not proxy them: a
 * serverless function caps its body well below the size an owner's artwork
 * legitimately reaches, and proxying would reject valid files with a platform
 * error the shop owner can do nothing about.
 *
 * **No SVG**, on the rule E5-04 already states: an SVG accepted from an upload
 * is script-bearing content served from our own domain, and the logo path can
 * only afford it because it rasterises everything it is given. Block artwork is
 * stored as uploaded.
 *
 * **The key is the id.** `ImageSource` names artwork by `assetId`, and for an
 * owner's own upload that id is the R2 object key — which is what the designer's
 * asset resolver turns back into a URL. It is a deliberate simplification:
 * `image_assets` exists but is scoped to a catalog product, and a table for
 * block artwork is a schema decision rather than an upload route's business.
 * Written up in `docs/E7-pending.md`.
 */

const schema = z.object({
  contentType: z.enum(ACCEPTED_PRODUCT_IMAGE_TYPES),
  contentLength: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
})

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // Designing a block changes what every future book in the organization looks
  // like, which is the bar the rest of this epic puts on it.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail(
      'invalid_input',
      `Upload a PNG, JPG or WebP under ${Math.round(MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024)}MB.`,
      422
    )
  }

  // Org-scoped and random. Org first so a whole tenant's objects can be found,
  // listed or deleted as a unit, which is what an erasure request actually asks
  // for; random rather than named after the file, because two owners uploading
  // `background.png` must not land on the same object.
  const key = `${session.user.organizationId}/blocks/${randomBytes(12).toString('hex')}`

  const uploadUrl = await presignUpload(key, parsed.data.contentType, parsed.data.contentLength)

  return ok({ uploadUrl, assetId: key, url: publicUrl(key) })
}
