import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'

/**
 * Approve or reject one matte. E13-02's matte review queue, per product.
 *
 * `image_assets` rows with `reviewState = PENDING` are cutouts the worker was
 * not confident about — it scores the matting and sends a poor one to review
 * rather than onto a printed page. Approving lets it render; rejecting falls
 * the card back to the ORIGINAL with a quality flag in the editor.
 *
 * **This is a different queue from the contribution one.** That reviews
 * *products* a shop submitted; this reviews *images* a machine produced. E13
 * says so and the two are easy to conflate because both are called review.
 *
 * **There is no DELETE.** An offer book already rendering this cutout would
 * break; rejecting is the reversible answer and keeps the row addressable.
 */

const schema = z.object({
  action: z.enum(['approve', 'reject']),
})

export async function PATCH(request: NextRequest, { params }: { params: { imageId: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const asset = await prisma.imageAsset.findUnique({
    where: { id: params.imageId },
    select: { id: true, productId: true, kind: true, reviewState: true, quality: true },
  })
  if (asset === null) return fail('not_found', 'That image does not exist.', 404)

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return fail('invalid_request', 'Say approve or reject.')

  const reviewState = parsed.data.action === 'approve' ? 'APPROVED' : 'REJECTED'
  if (asset.reviewState === reviewState) {
    return ok({ id: asset.id, reviewState })
  }

  await prisma.imageAsset.update({
    where: { id: asset.id },
    data: { reviewState },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: parsed.data.action === 'approve' ? 'catalog.image.approved' : 'catalog.image.rejected',
    entityType: 'catalog_product',
    entityId: asset.productId,
    before: { imageAssetId: asset.id, reviewState: asset.reviewState },
    after: { imageAssetId: asset.id, reviewState, quality: asset.quality },
  })

  return ok({ id: asset.id, reviewState })
}
