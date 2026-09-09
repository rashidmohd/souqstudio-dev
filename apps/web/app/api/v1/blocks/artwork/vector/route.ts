import type { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { rasteriseVector } from '@/lib/artwork'
import { assetName, measurePng, recordAsset } from '@/lib/block-asset-store'
import { MAX_VECTOR_BYTES, publicUrl, putObject } from '@/lib/r2'

/**
 * Vector artwork for a block. E7.
 *
 * **The one upload on this path whose bytes go through the server**, and the
 * asymmetry is the point rather than an inconsistency. Raster artwork is
 * presigned because it can reach 10MB and a serverless body cannot; a vector
 * badge is tens of kilobytes, and something has to read it before R2 does.
 *
 * What it reads it for: **the SVG is rasterised and the PNG is what is stored.**
 * The sibling route refuses SVG outright on the rule that an SVG served from our
 * own domain is script-bearing content, and nothing here weakens that — an owner
 * may now *upload* the file their designer gave them, and the bucket still holds
 * nothing but bitmaps. See `lib/artwork.ts` for what that trade costs.
 *
 * `Content-Type` is not trusted. It is a string the client chose, and the only
 * thing that decides whether this is a drawing is whether sharp can rasterise
 * it — which is also the check that a `.svg` full of something else fails.
 */
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // Designing a block changes what every future book in the organization looks
  // like, which is the bar the rest of this epic puts on it.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const body = Buffer.from(await request.arrayBuffer())

  // Checked against the bytes that arrived rather than against a declared
  // length: a header is a claim and this is the thing itself.
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

  // Org-scoped and random, matching the sibling route: org first so a tenant's
  // objects can be found and deleted as a unit, random so two owners uploading
  // `badge.svg` do not land on the same object.
  const key = `${session.user.organizationId}/blocks/${randomBytes(12).toString('hex')}`
  await putObject(key, png, 'image/png')

  // Recorded inline rather than through the completion route: this one has the
  // PNG in hand, because it made it. Nothing to read back.
  const size = await measurePng(png)
  await recordAsset({
    organizationId: session.user.organizationId,
    key,
    name: assetName(request.headers.get('x-filename') ?? 'Artwork'),
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    bytes: png.byteLength,
  })

  return ok({ assetId: key, url: publicUrl(key) })
}
