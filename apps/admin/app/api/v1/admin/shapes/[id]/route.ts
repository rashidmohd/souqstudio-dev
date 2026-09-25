import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { OCCASIONS } from '@souqstudio/engine'
import type { Occasion } from '@souqstudio/engine'
import { SHAPE_GROUPS, type ShapeGroup } from '@souqstudio/designer/lib/shape-gallery'
import { fail, ok } from '@/lib/api'
import { requireAdminApi, roleAtLeast } from '@/lib/admin-auth'
import { diffFields, recordAudit } from '@/lib/audit'

/**
 * Edit, publish or retire one gallery shape. E13-04.
 *
 * **Two bars.** Renaming or regrouping changes what the team sees and needs
 * `catalog_manager`. Publishing and retiring change what every shop's designer
 * offers, which is the same reach as publishing a block, so they need
 * `super_admin`, the bar the block library already sets.
 *
 * The outline itself is not editable: a different drawing is a new shape. That
 * keeps "what did shops get" answerable from the audit log alone.
 *
 * **No delete.** `archived` is the off switch. Retiring never touches a block,
 * because a placed shape is a copy in the block's own document.
 */

const schema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    // `z.enum` wants a non-empty tuple; both lists are literals.
    group: z.enum(SHAPE_GROUPS.map((g) => g.value) as [ShapeGroup, ...ShapeGroup[]]).optional(),
    occasion: z
      .enum(OCCASIONS.map((o) => o.value) as [Occasion, ...Occasion[]])
      .nullable()
      .optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Say what to change.')

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.errors[0]?.message ?? 'That change is not valid.')
  }

  const existing = await prisma.libraryShape.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, group: true, occasion: true, status: true },
  })
  if (existing === null) return fail('not_found', 'That shape does not exist.', 404)

  const changesStatus =
    parsed.data.status !== undefined && parsed.data.status !== existing.status
  if (changesStatus && !roleAtLeast(gate.session.admin.role, 'super_admin')) {
    return fail(
      'forbidden',
      'Publishing or retiring a shape changes every shop’s designer, so it needs the super admin role.',
      403
    )
  }

  // Only the fields that were sent. An absent one is "leave it", never "clear it".
  const { name, group, occasion, status } = parsed.data
  const changes = {
    ...(name === undefined ? {} : { name }),
    ...(group === undefined ? {} : { group }),
    ...(occasion === undefined ? {} : { occasion }),
    ...(status === undefined ? {} : { status }),
  }

  const updated = await prisma.libraryShape.update({
    where: { id: existing.id },
    data: changes,
    select: { id: true, name: true, group: true, occasion: true, status: true },
  })

  const action = !changesStatus
    ? 'library.shape.edited'
    : updated.status === 'published'
      ? 'library.shape.published'
      : updated.status === 'archived'
        ? 'library.shape.retired'
        : 'library.shape.unpublished'
  const diff = diffFields(existing, changes)

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action,
    entityType: 'library',
    entityId: existing.id,
    before: diff.before,
    after: { ...diff.after, name: updated.name },
  })

  return ok(updated)
}
