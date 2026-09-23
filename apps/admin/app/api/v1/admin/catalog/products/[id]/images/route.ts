import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { enqueueBgRemove, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { cutoutKey, publicUrl, r2Config } from '@/lib/r2'

/**
 * Record a photo that has just been uploaded, and queue its cutout. E13-02.
 *
 * The second half of the upload: `upload-url` signs a PUT, the browser does it,
 * and this writes the `image_assets` row. Split because the row must not exist
 * until the bytes do — a row pointing at a key nobody uploaded renders as a
 * broken image on every card that picks it up.
 *
 * **The cutout is queued here, not chosen.** E5 §3 makes background removal an
 * ingest stage rather than a chore: the grammar that separates a real offer book
 * from a slide deck is a cutout floating on a tinted panel, and a photo that
 * arrives on white stays on white unless something asks. The manual re-run
 * exists too — `POST /images/[imageId]/recut` — for the one that failed or came
 * back badly.
 *
 * **Nothing is charged.** The shop-owner route checks a credit balance because
 * a tenant is spending; an admin improving the shared catalog is not a tenant,
 * and there is no organization to bill.
 */

const schema = z.object({
  key: z.string().min(1).max(512),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  /** Queue the cutout. False for a photo that is already cut out. */
  removeBackground: z.boolean().default(true),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const product = await prisma.catalogProduct.findUnique({
    where: { id: params.id },
    select: { id: true, nameEn: true },
  })
  if (product === null) return fail('not_found', 'That product does not exist.', 404)

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.issues[0]?.message ?? 'That image cannot be saved.')
  }

  const { key, width, height, removeBackground } = parsed.data

  /*
   * The key must be one this product's own upload route issued. Without the
   * check, a catalog manager could point a product at any object in the bucket
   * — including another tenant's logo — by calling this route directly.
   */
  if (!key.startsWith(`catalog/universal/${product.id}/`)) {
    return fail(
      'invalid_request',
      'That key does not belong to this product. Upload through the signed URL this product issued.'
    )
  }

  const existing = await prisma.imageAsset.findFirst({
    where: { productId: product.id, r2Key: key },
    select: { id: true },
  })
  if (existing !== null) {
    return fail('already_registered', 'That image is already on this product.', 409)
  }

  const asset = await prisma.imageAsset.create({
    data: {
      productId: product.id,
      kind: 'ORIGINAL',
      r2Key: key,
      width,
      height,
      /*
       * An admin's own upload is approved on arrival. `reviewState` exists for
       * photos a *shop* contributed to a shared product, which is the case that
       * needs a reviewer — and the reviewer is whoever is doing this.
       */
      reviewState: 'APPROVED',
    },
    select: { id: true },
  })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'catalog.image.added',
    entityType: 'catalog_product',
    entityId: product.id,
    after: { imageAssetId: asset.id, r2Key: key, width, height },
  })

  let queued = false
  let queueError: string | null = null

  if (removeBackground) {
    const config = r2Config()
    try {
      await enqueueBgRemove({
        imageUrl: publicUrl(key),
        targetPath: cutoutKey(key),
        catalogProductId: product.id,
        sourceAssetId: asset.id,
      })
      queued = true
    } catch (error) {
      /*
       * **A failed queue does not fail the upload.** The photo is in the bucket
       * and the row is written; the product is better off than it was. Losing
       * that because Redis blinked would mean re-uploading, and the cutout can
       * be re-run from the screen with one button.
       */
      queueError = error instanceof Error ? error.message : 'The queue did not accept the job.'
      console.error('[admin] bg.remove enqueue failed', product.id, error)
      void config
    }
  }

  return ok({ id: asset.id, key, queued, queueError }, 201)
}
