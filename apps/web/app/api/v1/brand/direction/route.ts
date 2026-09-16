import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { enqueueBrandDirection, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'

/**
 * Brand direction — propose a palette and a type mood. E8-08.
 *
 * The owner uploads a photograph of their shop, points at the logo they already
 * have, or types a sentence about what they sell, and a model proposes colours
 * and a type mood. What comes back is a **proposal**: nothing is written to the
 * brand kit until they accept it at `POST /api/v1/brand/direction/accept`.
 *
 * **This route starts a job and returns.** A model call is seconds at best and
 * `background-jobs.md` is unambiguous that no route blocks on work that can
 * exceed a second. The row goes in first so the client always has something to
 * poll at `GET /api/v1/ai/jobs/:jobId`.
 *
 * **Nothing is checked against the credit balance here, and nothing is charged.**
 * That is the deliberate difference from magic block: generating a direction is
 * free and *keeping* one costs three credits, because a palette is meant to be
 * re-rolled several times during setup and a per-roll charge prices a shop out
 * of the step every other feature depends on. The accept route is where the
 * balance is checked and spent. `docs/E8-ai-features.md` → E8-08.
 */

const schema = z
  .object({
    /**
     * The R2 object key of a storefront or signage photograph — the same
     * presigned upload the designer uses for artwork, which hands back the key
     * it wrote. A key rather than a URL, so this survives the bucket moving
     * behind a different public origin.
     */
    sourceKey: z.string().min(1).max(200).optional(),
    /**
     * What the owner typed about their shop, when they have no photograph worth
     * uploading. The cheapest of the three inputs and the only one a shop with
     * no logo and a dark storefront can always reach.
     */
    described: z.string().trim().min(10).max(400).optional(),
  })
  .refine(
    (value) => (value.sourceKey === undefined) !== (value.described === undefined),
    'Give either a picture or a description, not both and not neither.'
  )

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_input', 'Add a picture of your shop, or describe it in a sentence.', 422)
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // The same bar `PATCH /api/v1/brand` puts on changing the brand: an editor
  // makes offer books and does not decide what the shop looks like. E2-03.
  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the brand.', 403)
  }

  const { organizationId } = session.user

  /**
   * **The key must be this organization's, and that is checked rather than
   * assumed.** The presign route mints keys as `<organizationId>/…`, so a caller
   * who edits one character of the prefix is asking the worker to read another
   * tenant's object. Reading the org from the session is only half the rule.
   */
  if (parsed.data.sourceKey !== undefined) {
    const prefix = `${organizationId}/`
    if (!parsed.data.sourceKey.startsWith(prefix) || parsed.data.sourceKey.includes('..')) {
      return fail('invalid_input', 'That upload does not belong to this organization.', 422)
    }
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId,
      shopId: shop.id,
      type: 'brand_direction',
      status: 'queued',
      /**
       * What accepting will cost, recorded on the job although this route
       * charges nothing. The dialog shows the price before the owner decides,
       * and reading it off the job keeps one number in one place.
       */
      creditsCost: 0,
    },
    select: { id: true },
  })

  try {
    await enqueueBrandDirection({
      jobId: job.id,
      organizationId,
      shopId: shop.id,
      ...(parsed.data.sourceKey === undefined ? {} : { sourceKey: parsed.data.sourceKey }),
      ...(parsed.data.described === undefined ? {} : { described: parsed.data.described }),
    })
  } catch {
    // A dead queue is reported rather than swallowed: the job *is* the product
    // here, and a row left at `queued` is something the client polls forever.
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id }, 202)
}
