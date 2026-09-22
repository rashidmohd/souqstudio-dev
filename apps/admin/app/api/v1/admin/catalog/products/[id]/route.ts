import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { diffFields, recordAudit } from '@/lib/audit'
import { productSchema } from '@/lib/catalog-schema'

/**
 * Edit, archive, restore or promote one catalog product. E13-02.
 *
 * **There is no DELETE, and there will not be one.** A published offer book
 * references this row by id and renders its name and its cutout; deleting it
 * breaks a flyer a shop has already sent to its customers over WhatsApp.
 * `archivedAt` is the whole mechanism — the row stops appearing in search and
 * keeps rendering wherever it is already used.
 */

/**
 * The three state changes live behind an `action` rather than in the general
 * update, so each gets its own audit entry and its own name. Folding
 * `archivedAt` into the field list would bury "this product was withdrawn"
 * inside a diff of forty fields.
 */
const actionSchema = z.object({
  action: z.enum(['archive', 'restore', 'promote']),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const body = (await request.json().catch(() => null)) as unknown

  const existing = await prisma.catalogProduct.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      brandEn: true,
      brandAr: true,
      specEn: true,
      specAr: true,
      originEn: true,
      originAr: true,
      category: true,
      subcategory: true,
      barcode: true,
      sku: true,
      supplier: true,
      packSize: true,
      packUnit: true,
      packCount: true,
      sellBy: true,
      organizationId: true,
      archivedAt: true,
    },
  })

  if (existing === null) return fail('not_found', 'That product does not exist.', 404)

  // ── State changes ──────────────────────────────────────────────────────────
  const asAction = actionSchema.safeParse(body)
  if (asAction.success) {
    const { action } = asAction.data

    if (action === 'promote') {
      if (existing.organizationId === null) {
        return fail('already_universal', 'That product is already in the universal catalog.')
      }
      /*
       * Promotion clears `organizationId`, which moves the row from one
       * uniqueness scope to the other. A universal row already holding this
       * barcode would make the promoted one a duplicate in the collection every
       * shop reads, so it is refused by name rather than by constraint.
       */
      if (existing.barcode !== null) {
        const clash = await prisma.catalogProduct.findFirst({
          where: { organizationId: null, barcode: existing.barcode },
          select: { id: true, nameEn: true },
        })
        if (clash !== null) {
          return fail(
            'duplicate_barcode',
            `The universal catalog already has ${clash.nameEn} on that barcode. Merge them rather than promoting this one.`,
            409
          )
        }
      }

      await prisma.catalogProduct.update({
        where: { id: params.id },
        data: { organizationId: null },
      })

      await recordAudit({
        adminUserId: gate.session.admin.id,
        action: 'catalog.product.promoted',
        entityType: 'catalog_product',
        entityId: params.id,
        before: { organizationId: existing.organizationId },
        after: { organizationId: null },
      })

      return ok({ id: params.id, organizationId: null })
    }

    const archivedAt = action === 'archive' ? new Date() : null
    await prisma.catalogProduct.update({
      where: { id: params.id },
      data: { archivedAt },
    })

    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: action === 'archive' ? 'catalog.product.archived' : 'catalog.product.restored',
      entityType: 'catalog_product',
      entityId: params.id,
      before: { archivedAt: existing.archivedAt },
      after: { archivedAt },
    })

    return ok({ id: params.id, archivedAt })
  }

  // ── Field update ───────────────────────────────────────────────────────────
  const parsed = productSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail('invalid_request', issue?.message ?? 'That product cannot be saved.')
  }

  const input = parsed.data

  if (input.barcode !== null && input.barcode !== existing.barcode) {
    const clash = await prisma.catalogProduct.findFirst({
      where: {
        organizationId: existing.organizationId,
        barcode: input.barcode,
        NOT: { id: params.id },
      },
      select: { id: true, nameEn: true },
    })
    if (clash !== null) {
      return fail(
        'duplicate_barcode',
        `${clash.nameEn} already has that barcode in this collection.`,
        409
      )
    }
  }

  await prisma.catalogProduct.update({ where: { id: params.id }, data: input })

  /*
   * `packSize` is a Prisma Decimal, which does not compare equal to the number
   * the form sent even when the value is the same. Normalised to a number
   * before the diff so an untouched pack size does not appear as a change on
   * every save.
   */
  const before = {
    ...existing,
    packSize: existing.packSize === null ? null : Number(existing.packSize),
  }
  const changes = diffFields(before, input)

  /*
   * A save that changed nothing writes no audit entry. A log where half the
   * rows say "updated: {}" is a log people stop reading.
   */
  if (Object.keys(changes.after).length > 0) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'catalog.product.updated',
      entityType: 'catalog_product',
      entityId: params.id,
      before: changes.before,
      after: changes.after,
    })
  }

  return ok({ id: params.id })
}
