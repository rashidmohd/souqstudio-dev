import type { NextRequest } from 'next/server'
import { parseSvgShape } from '@souqstudio/designer/lib/svg-shape'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'

/**
 * Read an uploaded SVG as a shape. E13-04, for the admin designer.
 *
 * The same parser as the shop app's `POST /api/v1/blocks/shape`. Nothing is
 * stored: what comes back is geometry that goes into the document, so there is
 * no mutation to audit.
 */

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const body = await request.text()
  if (body.length === 0) {
    return fail('invalid_input', 'Upload an SVG to use as a shape.', 422)
  }

  const parsed = parseSvgShape(body)
  if (!parsed.ok) return fail('invalid_input', parsed.reason, 422)

  return ok({ art: parsed.art })
}
