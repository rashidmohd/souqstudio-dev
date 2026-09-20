import type { NextRequest } from 'next/server'
import { enqueueBgRemove, prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { MIN_PRODUCT_IMAGE_EDGE, readProductImage } from '@/lib/catalog-image'
import { cutoutKey, customProductKey, getObjectBytes, publicUrl } from '@/lib/r2'

/**
 * A photo for a product that has none. E5-04's other half.
 *
 * **The catalog can name a product it cannot picture.** Only a small share of
 * rows carry a packshot, so the common case in the editor is a card drawing a
 * placeholder under a real name and a real price — and the properties panel
 * has said "This product has no photo" for as long as it has existed, with
 * nothing beside it to press. Its sibling flag, `fallback-image`, has had a
 * fix button all along. This is the missing one.
 *
 * **It writes to the shared row on purpose.** Nothing is overwritten, every
 * other shop is drawing a placeholder today, and a catalog that learns a
 * packshot once is the whole reason the universal catalog exists. So it is
 * contributed rather than kept private.
 *
 * Its sibling — `products/[id]/cutout` — used to refuse a universal product
 * outright on the grounds that re-mattéing somebody else's photo changes what
 * every other shop's cards draw. It now takes this route's bargain instead: the
 * cutout is attributed to the shop that paid for it and released to the rest by
 * a reviewer. Same rule, both halves.
 *
 * **Review decides promotion, not availability** — the rule
 * `product_contributions` already states, and the reason `contributedBy` is a
 * column. The asset lands PENDING and visible to the shop that supplied it
 * alone; a reviewer approving it is what releases it to everyone. So the owner
 * uploading at 11pm on a Friday sees their own flyer finished, and no other
 * shop inherits an unreviewed photo.
 *
 * The cutout is queued afterwards and its failure is not this request's
 * failure, exactly as at product ingest: a product with only an ORIGINAL
 * renders today and carries a visible flag, which beats refusing the photo
 * because a queue is down.
 */

const schema = z.object({
  // The upload key, not a URL. A client-supplied URL is a client-supplied
  // fetch target; a key is validated against the prefix this shop may write to.
  imageKey: z.string().min(1).max(300),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // The same bar E5-04 puts on contributing a product, and the same one the
  // cutout route puts on changing a photo: an editor builds books from the
  // catalog and does not change what is in it.
  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to add a product photo.', 403)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That photo could not be added. Try choosing it again.')
  }

  /*
   * The key is checked against the prefix this shop may write to, not trusted.
   * `POST /api/v1/catalog/upload-url` is the only thing that presigns one, and
   * it builds the key from the session — so a key outside this prefix is a
   * crafted request naming somebody else's upload.
   */
  const prefix = customProductKey(session.user.organizationId, shop.id, '')
  if (!parsed.data.imageKey.startsWith(prefix)) {
    return fail('invalid_key', 'That photo could not be added. Try choosing it again.', 422)
  }

  /*
   * Visible to this organization: its own row or a universal one. Archived is
   * excluded because an archived product is one nothing may be added to, and a
   * book referencing it is reading history.
   */
  const product = await prisma.catalogProduct.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
      OR: [{ organizationId: session.user.organizationId }, { organizationId: null }],
    },
    select: { id: true, organizationId: true, nameEn: true, brandEn: true, category: true },
  })

  if (product === null) {
    return fail('not_found', 'That product does not exist.', 404)
  }

  /*
   * **Everything past here is wrapped, and the reason is what the client
   * sees.** An unhandled throw in a route handler is rendered by Next as an
   * HTML error page, so the browser's `response.json()` fails with
   * "Unexpected token '<'" — the owner is shown a parser complaining about an
   * angle bracket and the actual error reaches nobody. R2 being unreachable
   * and `sharp` failing to load are both real ways to get there.
   *
   * So the handler answers its own envelope whatever happens, and the stack
   * goes to the server log where it is useful.
   */
  let bytes: Buffer | null
  try {
    bytes = await getObjectBytes(parsed.data.imageKey)
  } catch (problem) {
    console.error('[product-image] reading the upload back from R2 failed', problem)
    return fail('storage_unavailable', 'We could not read that photo back. Try again.', 503)
  }

  if (!bytes) {
    return fail('upload_missing', 'That photo did not arrive. Try choosing it again.', 409)
  }

  let image: Awaited<ReturnType<typeof readProductImage>>
  try {
    image = await readProductImage(bytes)
  } catch (problem) {
    console.error('[product-image] reading the image failed', problem)
    return fail('invalid_image', 'That file could not be read as a photo. Try a PNG or JPG.', 422)
  }

  if (!image.ok) {
    return image.reason === 'too_small'
      ? fail(
          'image_too_small',
          `That photo is too small to print. Use one at least ${MIN_PRODUCT_IMAGE_EDGE} pixels on each side.`,
          422
        )
      : fail('invalid_image', 'That file could not be read as a photo. Try a PNG or JPG.', 422)
  }

  /*
   * **Their own product is theirs: approved, unattributed, no queue entry.**
   * There is nobody to review it for — the row is not in the shared catalog
   * and never will be unless the product itself is promoted. Attributing it
   * would also make `imageVisibility` hide it from the rest of the
   * organization's own shops, which is the opposite of what the column is for.
   */
  const own = product.organizationId !== null
  const imageUrl = publicUrl(parsed.data.imageKey)

  let asset: { id: string }
  try {
    asset = await prisma.$transaction(async (tx) => {
      const created = await tx.imageAsset.create({
        data: {
          productId: product.id,
          kind: 'ORIGINAL',
          r2Key: parsed.data.imageKey,
          width: image.meta.width,
          height: image.meta.height,
          reviewState: own ? 'APPROVED' : 'PENDING',
          ...(own ? {} : { contributedBy: session.user.organizationId }),
        },
        select: { id: true },
      })

      // The reviewer's queue entry, and only for a photo that would reach
      // other shops. Written in the same transaction as the asset: a
      // contributed asset with no queue row is one that sits PENDING forever,
      // visible to one shop and waiting on a review nobody was asked for.
      if (!own) {
        await tx.productContribution.create({
          data: {
            shopId: shop.id,
            catalogId: product.id,
            imageUrl,
            name: product.nameEn,
            brand: product.brandEn,
            category: product.category,
          },
        })
      }

      return created
    })
  } catch (problem) {
    console.error('[product-image] writing the asset failed', problem)
    return fail('write_failed', 'That photo could not be saved. Try again.', 500)
  }

  // E5 §3 — the cutout is an ingest stage, not the owner's chore, and never
  // this request's failure. Unlike the manual re-run next door it costs no
  // credit: this is ingest, the same as adding a product, and charging for the
  // matte on a photo the shop just donated would be a strange bill.
  let cutoutQueued = true
  try {
    await enqueueBgRemove({
      imageUrl,
      // A *different* key from the source — the worker writes to `targetPath`
      // without looking at what is there, and overwriting the original would
      // leave the ORIGINAL row pointing at a cutout with nothing to re-run
      // against.
      targetPath: cutoutKey(parsed.data.imageKey),
      catalogProductId: product.id,
      sourceAssetId: asset.id,
    })
  } catch {
    cutoutQueued = false
  }

  return ok({ imageAssetId: asset.id, shared: !own, cutoutQueued }, 201)
}
