import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { assetName, listAssets, measurePng, recordAsset } from '@/lib/block-asset-store'
import { getObjectBytes, publicUrl } from '@/lib/r2'

/**
 * The artwork a block can use. E7-C.
 *
 * **GET is why this exists.** A block document names artwork by R2 key, which is
 * enough to *draw* it and not enough to *find* it — so before this route there
 * was no listing, and therefore no reuse: an owner who uploaded a badge for one
 * block re-uploaded it for the next, and every use left another object nothing
 * referenced. See `docs/E7-pending.md` §6.3, which deferred the table.
 *
 * **POST is the completion step for a presigned upload**, and it is why the
 * raster path needs one at all. The bytes go browser → R2 without touching a
 * route, so nothing on this side knows the file's size or shape until it reads
 * the object back. The same arrangement as the logo path, for the same reason —
 * and the same reason it re-reads rather than trusting what the client says the
 * dimensions were.
 *
 * The vector route records its own row inline: it has the PNG in hand, because
 * it made it.
 */

const schema = z.object({
  assetId: z.string().min(1).max(200),
  filename: z.string().min(1).max(200),
})

export const runtime = 'nodejs'

export async function GET() {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const assets = await listAssets(session.user.organizationId)

  return ok({
    assets: assets.map((asset) => ({ ...asset, url: publicUrl(asset.key) })),
  })
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That upload could not be recorded.', 422)

  // **The key must be inside this organization's prefix.** It arrives from the
  // client, and without this check a manager could record — and then see in
  // their own picker — any object in the bucket, including another shop's
  // artwork. The prefix is the same one the upload routes mint.
  const prefix = `${session.user.organizationId}/blocks/`
  if (!parsed.data.assetId.startsWith(prefix)) {
    return fail('forbidden', 'That upload could not be recorded.', 403)
  }

  const bytes = await getObjectBytes(parsed.data.assetId)
  if (bytes === null) return fail('invalid_input', 'That upload could not be read back.', 422)

  const size = await measurePng(bytes)
  if (size === null) return fail('invalid_input', 'That file is not an image.', 422)

  await recordAsset({
    organizationId: session.user.organizationId,
    key: parsed.data.assetId,
    name: assetName(parsed.data.filename),
    width: size.width,
    height: size.height,
    bytes: bytes.byteLength,
  })

  return ok({ assetId: parsed.data.assetId, url: publicUrl(parsed.data.assetId) })
}
