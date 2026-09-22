import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { productSchema } from '@/lib/catalog-schema'

/**
 * Add a product to the universal catalog. E13-02.
 *
 * **Every product created here is universal** — `organizationId` stays null.
 * There is no field for it and there should not be: a staff member creating a
 * row inside one customer's private collection is either doing support work
 * that belongs in that customer's own app, or making a mistake nobody will
 * notice until the shop sees a product they never added. Promotion runs the
 * other way, from private to universal, and is its own action.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  const parsed = productSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail('invalid_request', issue?.message ?? 'That product cannot be saved.')
  }

  const input = parsed.data

  /*
   * Checked before the insert so the answer names the duplicate, rather than
   * letting the unique constraint throw a message about an index. Uniqueness is
   * per collection: this only looks at the universal rows, because an
   * organization holding its own row for the same barcode is the entire point
   * of the private collection.
   */
  if (input.barcode !== null) {
    const clash = await prisma.catalogProduct.findFirst({
      where: { organizationId: null, barcode: input.barcode },
      select: { id: true, nameEn: true },
    })
    if (clash !== null) {
      return fail(
        'duplicate_barcode',
        `The universal catalog already has ${clash.nameEn} on that barcode. Edit that row instead.`,
        409
      )
    }
  }

  const product = await prisma.catalogProduct.create({
    data: {
      ...input,
      organizationId: null,
      source: 'manual',
    },
    select: { id: true },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'catalog.product.created',
    entityType: 'catalog_product',
    entityId: product.id,
    after: input,
  })

  return ok({ id: product.id }, 201)
}
