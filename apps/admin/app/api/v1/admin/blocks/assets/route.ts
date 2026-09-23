import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { assetName, measurePng } from '@souqstudio/designer/lib/artwork-raster'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { LIBRARY_ASSET_PREFIX } from '@/lib/library-drafts'
import { getObjectBytes, publicUrl, r2Config } from '@/lib/r2'

/**
 * The library's artwork: list it, and record an upload. E13-04.
 *
 * The admin designer's half of the shop app's `/api/v1/blocks/assets`, with
 * the same request and response shapes. Library artwork is a `block_assets` row
 * with no organization, which is how the shop app already recognises
 * SouqStudio's own artwork.
 */

export const runtime = 'nodejs'

const schema = z.object({
  assetId: z.string().min(1).max(200),
  filename: z.string().min(1).max(200),
})

export async function GET() {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const rows = await prisma.blockAsset.findMany({
    where: { organizationId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, key: true, name: true, width: true, height: true },
    take: 200,
  })

  return ok({
    assets: rows.map((row) => ({ ...row, seeded: true, url: publicUrl(row.key) })),
  })
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const r2 = r2Config()
  if (!r2.ok) return fail('not_configured', r2.reason, 503)

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That upload could not be recorded.', 422)

  if (!parsed.data.assetId.startsWith(LIBRARY_ASSET_PREFIX)) {
    return fail('forbidden', 'That upload could not be recorded.', 403)
  }

  // Measured from what landed in the bucket, not from what the browser said it
  // sent: the layout engine sizes artwork from these numbers.
  const bytes = await getObjectBytes(parsed.data.assetId)
  if (bytes === null) return fail('invalid_input', 'That upload could not be read back.', 422)

  const size = await measurePng(bytes)
  if (size === null) return fail('invalid_input', 'That file is not an image.', 422)

  const asset = await prisma.blockAsset.upsert({
    where: { key: parsed.data.assetId },
    update: {},
    create: {
      organizationId: null,
      key: parsed.data.assetId,
      name: assetName(parsed.data.filename),
      width: size.width,
      height: size.height,
      bytes: bytes.byteLength,
    },
    select: { id: true, name: true },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.artwork.uploaded',
    entityType: 'library',
    entityId: asset.id,
    after: { key: parsed.data.assetId, name: asset.name },
  })

  return ok({ assetId: parsed.data.assetId, url: publicUrl(parsed.data.assetId) })
}
