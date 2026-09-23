import type { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@souqstudio/db'
import {
  assetName,
  measurePng,
  rasteriseVector,
} from '@souqstudio/designer/lib/artwork-raster'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { LIBRARY_ASSET_PREFIX } from '@/lib/library-drafts'
import { publicUrl, putObject, r2Config } from '@/lib/r2'

/**
 * Take an SVG for a library draft, store it as a PNG. E13-04.
 *
 * An SVG served from our own domain is script-bearing content, so it is
 * rasterised on the way in and only the bitmap is stored. The same rasteriser
 * as the shop app's `/api/v1/blocks/artwork/vector`, from the same module.
 */

export const runtime = 'nodejs'

/** Generous for a drawing, and far under the body cap a route can accept. */
const MAX_VECTOR_BYTES = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const r2 = r2Config()
  if (!r2.ok) return fail('not_configured', r2.reason, 503)

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength === 0 || body.byteLength > MAX_VECTOR_BYTES) {
    return fail(
      'invalid_input',
      `Upload an SVG under ${Math.round(MAX_VECTOR_BYTES / 1024 / 1024)}MB.`,
      422
    )
  }

  const png = await rasteriseVector(body)
  if (png === null) {
    return fail('invalid_input', 'That file could not be read as a drawing.', 422)
  }

  const key = `${LIBRARY_ASSET_PREFIX}${randomBytes(12).toString('hex')}`
  await putObject(key, png, 'image/png')
  const size = await measurePng(png)

  const filename = decodeURIComponent(request.headers.get('x-filename') ?? 'Artwork')
  const asset = await prisma.blockAsset.create({
    data: {
      organizationId: null,
      key,
      name: assetName(filename),
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      bytes: png.byteLength,
    },
    select: { id: true, name: true },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.artwork.uploaded',
    entityType: 'library',
    entityId: asset.id,
    after: { key, name: asset.name },
  })

  return ok({ assetId: key, url: publicUrl(key) })
}
