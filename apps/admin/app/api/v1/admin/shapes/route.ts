import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { listGalleryShapes, prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { OCCASIONS, shapeArtSchema } from '@souqstudio/engine'
import type { Occasion } from '@souqstudio/engine'
import { SHAPE_GROUPS, type ShapeGroup } from '@souqstudio/designer/lib/shape-gallery'
import { parseSvgShape } from '@souqstudio/designer/lib/svg-shape'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'

/**
 * The shape gallery: list it, and add a shape to it. E13-04.
 *
 * **A new shape is a draft.** Nothing reaches a shop until it is published
 * from `/shapes`, which is its own action with its own role and audit entry.
 *
 * The SVG goes through the same parser as a shop's own uploaded shape
 * (`parseSvgShape`), then the engine's schema. What is stored is path data,
 * never the file, so there is nothing to serve and nothing to sanitise.
 */

export const runtime = 'nodejs'

const STATUSES = ['draft', 'published', 'archived'] as const

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const status = request.nextUrl.searchParams.get('status')
  const statuses =
    status !== null && (STATUSES as readonly string[]).includes(status) ? [status] : [...STATUSES]

  const rows = await listGalleryShapes(statuses)
  return ok({
    shapes: rows.map((row) => ({
      id: row.id,
      name: row.name,
      group: row.group,
      occasion: row.occasion,
      status: row.status,
      art: row.art,
    })),
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  group: z
    // `z.enum` wants a non-empty tuple; SHAPE_GROUPS is a six-entry literal.
    .enum(SHAPE_GROUPS.map((g) => g.value) as [ShapeGroup, ...ShapeGroup[]]),
  occasion: z
    // Same tuple assertion: OCCASIONS is a ten-entry literal.
    .enum(OCCASIONS.map((o) => o.value) as [Occasion, ...Occasion[]])
    .nullable()
    .optional(),
  svg: z.string().min(1).max(512_000),
})

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Give the shape a name, a group and an SVG file.')
  }

  const read = parseSvgShape(parsed.data.svg)
  if (!read.ok) return fail('invalid_input', read.reason, 422)

  // The parser is the convenience layer; the engine's schema is the boundary.
  const art = shapeArtSchema.safeParse(read.art)
  if (!art.success) {
    return fail('invalid_input', 'That drawing is too large or too complex to be a shape.', 422)
  }

  const shape = await prisma.libraryShape.create({
    data: {
      name: parsed.data.name,
      group: parsed.data.group,
      occasion: parsed.data.occasion ?? null,
      // `ShapeArt` is an interface, which has no index signature, so it is not
      // assignable to Prisma's JSON input type. It is plain JSON by schema.
      art: art.data as unknown as Prisma.InputJsonValue,
      status: 'draft',
    },
    select: { id: true, name: true, group: true },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.shape.created',
    entityType: 'library',
    entityId: shape.id,
    after: { name: shape.name, group: shape.group },
  })

  return ok(shape, 201)
}
