import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { universalProductKey } from '@souqstudio/types'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  EXTENSION,
  MAX_PRODUCT_IMAGE_BYTES,
  presignUpload,
  r2Config,
} from '@/lib/r2'

/**
 * Authorise one product photo upload. E13-02.
 *
 * Returns a presigned PUT and the key it writes to. The bytes never pass
 * through this app — see `presignUpload` for why. Registering the object as an
 * `image_assets` row is the next call, `POST …/images`, because until the
 * browser has actually finished the PUT there is nothing to record.
 *
 * **The key carries a random suffix rather than being stable per product.** A
 * fixed name would mean replacing a photo overwrites the object every other
 * `image_assets` row still points at — including the cutout derived from it and
 * any offer book already printing it. A new key leaves the old one addressable
 * and makes replacement an append.
 */

const schema = z.object({
  contentType: z.enum(ACCEPTED_PRODUCT_IMAGE_TYPES),
  contentLength: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const config = r2Config()
  if (!config.ok) return fail('not_configured', config.reason, 503)

  const product = await prisma.catalogProduct.findUnique({
    where: { id: params.id },
    select: { id: true, organizationId: true },
  })
  if (product === null) return fail('not_found', 'That product does not exist.', 404)

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail(
      'invalid_request',
      parsed.error.issues[0]?.message ??
        `Send a ${ACCEPTED_PRODUCT_IMAGE_TYPES.join(', ')} under ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.`
    )
  }

  /*
   * `universalProductKey` even for a row that belongs to an organization.
   *
   * The prefix describes *where catalog images live*, not who owns the row, and
   * the worker's ingest, the web app's URL builder and a future licensed
   * replacement pass all read it. An org-prefixed key here would put an admin's
   * photo somewhere none of those three look. A private row promoted to
   * universal also keeps its images without a copy, which is the case that
   * settles it.
   */
  const suffix = Math.random().toString(36).slice(2, 10)
  const key = universalProductKey(
    product.id,
    `admin-${suffix}.${EXTENSION[parsed.data.contentType]}`
  )

  const url = await presignUpload(key, parsed.data.contentType, parsed.data.contentLength)

  return ok({ url, key, expiresInSeconds: 15 * 60 })
}
