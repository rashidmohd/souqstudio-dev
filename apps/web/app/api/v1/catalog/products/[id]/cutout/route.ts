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
 * **A universal catalog product is not refused, it is contributed to.** Rows
 * with a null `organizationId` are the shared catalog every tenant reads, and
 * this route used to refuse them outright on the grounds that a new cutout
 * would change what every other shop's cards draw, paid for by whoever happened
 * to press the button. The premise was right and the conclusion was wrong: the
 * refusal was the only answer an owner ever got, because almost every product
 * in a book is a shared row — the button was offered on the one flag that has
 * a fix and then said no to nearly everyone who pressed it.
 *
 * The photo does not have to become everybody's for the flyer to be fixed.
 * `image_assets.contributedBy` already describes a photo that sits on a shared
 * product and belongs to one shop until a reviewer promotes it, and the worker
 * stamps this cutout with it — so the owner's book is right within seconds and
 * no other tenant inherits an unreviewed matte. Review decides promotion, not
 * availability: the rule `product_contributions` states and the one
 * `products/[id]/image` follows for a photo supplied to a product that has
 * none. This is the same bargain for a photo that has a background.
 *
 * **Another tenant's product is still refused**, by the same clause, and that
 * one is not softenable.
 *
 * **A matte a reviewer already rejected is refused too.** Rembg on the same
 * bytes returns the same cutout, so re-running it is a credit spent to reach a
 * verdict somebody has already reached.
 *
 * **Nothing is charged here.** The balance is checked so an owner who cannot pay
 * is refused before the work starts, and the worker deducts on success —
 * `background-jobs.md`, and the same ordering magic block uses. A cutout that
 * fails, or one that finds Rembg unavailable and keeps the original, costs
 * nothing.
 */

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  /**
   * **Wrapped, and the reason is what the client sees.** An unhandled throw in
   * a route handler is rendered by Next as an HTML error page, so the browser's
   * `response.json()` fails on an angle bracket and the actual error reaches
   * nobody — the same argument `products/[id]/image` makes, and the same
   * wrapper. Here it went further than an ugly message: the panel read a
   * missing `error` key as a queued job and told the owner their cutout was on
   * its way, every time, while nothing was ever enqueued.
   *
   * Prisma being unreachable and the credit read failing are both real ways to
   * get here. The envelope goes to the owner; the stack goes to the log.
   */
  try {
    return await removeBackgroundFor(params.id)
  } catch (problem) {
    console.error('[cutout] queueing a manual background removal failed', problem)
    return fail('unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }
}

async function removeBackgroundFor(productId: string) {
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
   * Visible to this organization: its own row or a universal one — the same
   * clause `products/[id]/image` uses, and the same one that still refuses
   * another tenant's row, since neither branch matches it.
   *
   * **Every non-THUMB image, not one, because two questions are asked of
   * them.** Which photo a cutout would be derived from is one; whether a matte
   * of that photo has already been rejected is the other, and the rejected row
   * is exactly what a `reviewState` filter in SQL would hide.
   */
  const product = await prisma.catalogProduct.findFirst({
    where: {
      id: productId,
      OR: [{ organizationId: session.user.organizationId }, { organizationId: null }],
    },
    select: {
      id: true,
      organizationId: true,
      images: {
        where: { kind: { not: 'THUMB' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          r2Key: true,
          contributedBy: true,
          reviewState: true,
          derivedFrom: true,
        },
      },
    },
  })

  if (product === null) {
    // Not found rather than forbidden: "forbidden" would confirm that a row
    // with this id exists in another tenant's catalog.
    return fail('not_found', 'That product does not exist.', 404)
  }

  /**
   * **The photo the card draws, by the card's own rule.** `pickImage` puts this
   * shop's own contribution ahead of the shared one, so a shop that supplied a
   * packshot for a universal product is looking at *their* photo — and a route
   * that re-matted the shared one instead would spend their credit fixing a
   * picture they are not being shown.
   */
  const originals = product.images.filter(
    (image) => image.kind === 'ORIGINAL' && image.reviewState !== 'REJECTED'
  )
  const original =
    originals.find((image) => image.contributedBy === session.user.organizationId) ?? originals[0]

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

  /**
   * **A verdict somebody already reached, not re-reached for a credit.** A
   * CUTOUT derived from this exact photo and rejected means a reviewer looked
   * at the matte and said no — and Rembg is deterministic enough on the same
   * bytes that pressing the button again buys the same halo. The way out is a
   * better photo, which is a different action on a different route, so the
   * message points at it rather than at a retry.
   *
   * Whose rejected attempt it was does not matter: the input decides the
   * output, not the payer.
   */
  const cutouts = product.images.filter(
    (image) => image.kind === 'CUTOUT' && image.derivedFrom === original.id
  )

  if (cutouts.some((image) => image.reviewState === 'REJECTED')) {
    return fail(
      'matte_rejected',
      'We have already tried this photo and the cut-out was not good enough to print. Add a clearer photo instead.',
      409
    )
  }

  /**
   * **Nor twice for the same picture.** A cutout of this photo that this
   * organization can already see is one they have already got — `pickImage`
   * draws it and the card carries no flag — so a second run buys a duplicate
   * row and a second credit. The button is not offered in that state, but the
   * route is what has to hold the line: it is reachable directly, and a
   * repeated press is exactly what an owner does when they think nothing
   * happened.
   *
   * Visibility is the test, not existence. An older cutout left `PENDING` with
   * no contributor is visible to nobody, which is the state a manual run used
   * to write and the one an owner has to be able to get out of — so it does not
   * count, and pressing again is how they recover.
   */
  const alreadyVisible = cutouts.some(
    (image) =>
      image.reviewState === 'APPROVED' ||
      (image.reviewState === 'PENDING' && image.contributedBy === session.user.organizationId)
  )
  if (alreadyVisible) {
    return fail(
      'already_cut_out',
      'That photo already has its background removed. Reopen the book to see it.',
      409
    )
  }

  /**
   * Whether the photo belongs to the shared catalog rather than to this shop.
   * The work is the same either way; what differs is what the owner is told —
   * a cutout of a shared photo reaches other shops once a reviewer accepts it,
   * and that is worth saying to somebody about to spend a credit on it.
   */
  const shared =
    product.organizationId !== session.user.organizationId &&
    original.contributedBy !== session.user.organizationId

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
  return ok({ queued: true, creditsCost: cost, shared }, 202)
}
