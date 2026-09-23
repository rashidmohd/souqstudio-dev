import { enqueueBgRemove, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { cutoutKey, publicUrl } from '@/lib/r2'

/**
 * Run background removal on one original, again. E13-02, E8-05's manual half.
 *
 * Cutouts run automatically when a photo arrives. This is for the one that did
 * not — Rembg was down, or it came back badly and landed in review.
 *
 * **Only on an ORIGINAL.** Re-cutting a cutout feeds a transparent PNG back
 * through matting and produces a worse one; the worker guards the exact case
 * where source and target are the same key, and this refuses the whole class
 * earlier, where the message can say why.
 *
 * **Nothing is charged**, for the reason `POST …/images` gives: there is no
 * tenant spending here.
 */
export async function POST(_request: Request, { params }: { params: { imageId: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const asset = await prisma.imageAsset.findUnique({
    where: { id: params.imageId },
    select: { id: true, productId: true, kind: true, r2Key: true },
  })
  if (asset === null) return fail('not_found', 'That image does not exist.', 404)

  if (asset.kind !== 'ORIGINAL') {
    return fail(
      'not_an_original',
      `This is the ${asset.kind}. Run removal on the original it came from.`
    )
  }

  try {
    await enqueueBgRemove({
      imageUrl: publicUrl(asset.r2Key),
      targetPath: cutoutKey(asset.r2Key),
      catalogProductId: asset.productId,
      sourceAssetId: asset.id,
    })
  } catch (error) {
    console.error('[admin] bg.remove enqueue failed', asset.id, error)
    return fail(
      'queue_unavailable',
      'The job queue did not accept it. Check REDIS_URL and the worker, then try again.',
      502
    )
  }

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'catalog.image.recut_queued',
    entityType: 'catalog_product',
    entityId: asset.productId,
    after: { imageAssetId: asset.id, targetPath: cutoutKey(asset.r2Key) },
  })

  /*
   * Queued, not done. The worker writes a new CUTOUT row when it finishes, so
   * the screen has to be reloaded to see it — said plainly rather than
   * implied by a spinner that stops.
   */
  return ok({
    queued: true,
    next: 'The worker writes a new cutout when it finishes. Reload to see it.',
  })
}
