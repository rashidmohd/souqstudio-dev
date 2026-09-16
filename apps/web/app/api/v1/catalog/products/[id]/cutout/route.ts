import type { NextRequest } from 'next/server'
import { CREDIT_COSTS, enqueueBgRemove, getCreditSnapshot, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { cutoutKey, publicUrl } from '@/lib/r2'

/**
 * Remove the background from one product photo, on request. E8-05.
 *
 * Cutouts already run automatically at ingest — a logo upload, a catalog
 * contribution — and that is the path almost every product takes. This is the
 * other half E8-05 specified and nothing had: **the manual action, one credit
 * per image**, for the product whose cutout never happened because Rembg was
 * down, or happened badly and was sent to review.
 *
 * It is reachable from the editor's properties panel, on the card carrying the
 * `fallback-image` flag — which is the only place an owner ever learns that a
 * photo still has its background, so it is the only place the fix belongs.
 *
 * **A universal catalog product is refused.** Rows with a null `organizationId`
 * are the shared catalog every tenant reads; writing a new cutout against one
 * would change what every other shop's cards draw, paid for by whoever happened
 * to press the button. That is not a permission check that can be softened — it
 * is the difference between this organization's data and everybody's.
 *
 * **Nothing is charged here.** The balance is checked so an owner who cannot pay
 * is refused before the work starts, and the worker deducts on success —
 * `background-jobs.md`, and the same ordering magic block uses. A cutout that
 * fails, or one that finds Rembg unavailable and keeps the original, costs
 * nothing.
 */

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // The same bar E5-04 puts on contributing a product: an editor builds books
  // from the catalog and does not change what is in it.
  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change a product photo.', 403)
  }

  /**
   * Scoped by organization **in the query**, and the org comes from the session.
   * A universal row has a null `organizationId` and does not match, so it is
   * refused by the same clause that refuses another tenant's — one condition,
   * rather than a check that can be deleted separately from the one beside it.
   */
  const product = await prisma.catalogProduct.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: {
      id: true,
      images: {
        where: { kind: 'ORIGINAL', reviewState: { not: 'REJECTED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, r2Key: true },
        take: 1,
      },
    },
  })

  if (product === null) {
    // Not found rather than forbidden, for a universal row as much as for
    // another tenant's: "forbidden" would confirm which of the two it is.
    return fail(
      'not_found',
      'That product is not one of yours. Shared catalog photos cannot be changed here.',
      404
    )
  }

  const original = product.images[0]
  if (original === undefined) {
    /**
     * **The ORIGINAL is what a cutout is derived from, so there is nothing to
     * re-run without one.** A product can reach this state: `derivedFrom` keeps
     * the link precisely so a bad matte is recoverable, and a product whose only
     * asset is a cutout has already lost that.
     */
    return fail(
      'no_original',
      'That product has no original photo to work from. Upload the photo again.',
      409
    )
  }

  const cost = CREDIT_COSTS.background_removal
  const snapshot = await getCreditSnapshot(session.user.organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `Removing a background costs ${cost} credit and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  try {
    await enqueueBgRemove({
      imageUrl: publicUrl(original.r2Key),
      // A *different* key from the source — `cutoutKey` derives it, and the
      // worker refuses the job outright if the two ever match. Writing over the
      // source would leave the ORIGINAL row pointing at a cutout and nothing to
      // re-run against, which is the one mistake here that destroys data.
      targetPath: cutoutKey(original.r2Key),
      catalogProductId: product.id,
      sourceAssetId: original.id,
      billOrganizationId: session.user.organizationId,
      billShopId: shop.id,
    })
  } catch {
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  /**
   * **202 with no job id to poll, deliberately.** Unlike every other AI action
   * this writes no `ai_jobs` row: the artefact is an `image_assets` row the
   * editor re-reads anyway, and the panel's own refresh is what shows the
   * result. A job row here would be a second record of the same thing, and the
   * poll route would be answering "is the picture different yet" — which the
   * picture answers.
   */
  return ok({ queued: true, creditsCost: cost }, 202)
}
