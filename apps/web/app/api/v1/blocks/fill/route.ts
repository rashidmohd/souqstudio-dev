import type { NextRequest } from 'next/server'
import { enqueueCopyFill, getCreditSnapshot, prisma } from '@souqstudio/db'
import { fillRequestSchema } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { requireOrgRole } from '@/lib/authz'
import { env } from '@/lib/env'

/**
 * Generative fill: words for a block's free text, from a short brief and the
 * shop's profile.
 *
 * **This route starts a job and returns. It never calls a model**, for the
 * reason every AI route here gives: a model call can exceed a second, and
 * `background-jobs.md` does not let a route block on that. The row goes in
 * first so the client always has something to poll.
 *
 * **Nothing is written to the block, here or in the worker.** The reply sits on
 * the job and the designer shows it for the owner to accept. Accepting is an
 * ordinary edit that autosaves and undoes like any other, which is what keeps a
 * model's words off a printed page until a person has read them.
 *
 * **The price is the environment's**, `GENERATIVE_FILL_CREDITS`, recorded on the
 * job so the worker charges exactly what the dialog quoted.
 */

/** What a fill costs and what the organization has, for the dialog to quote. */
export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const snapshot = await getCreditSnapshot(session.user.organizationId)
  return ok({ creditsCost: env.GENERATIVE_FILL_CREDITS, balance: snapshot.total })
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // The bar every other block edit has: a block changes what every future book
  // in the organization looks like.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = fillRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_input', 'Select some text to fill, then try again.', 422)
  }

  const { organizationId } = session.user

  /**
   * **The block must be this organization's own.** The slots are only prompt
   * context and nothing is written from here, but a seeded or foreign block is
   * one the owner cannot edit, and charging for words that cannot be applied
   * is charging for nothing.
   */
  const block = await prisma.block.findFirst({
    where: { id: parsed.data.blockId, organizationId },
    select: { id: true },
  })
  if (block === null) {
    return fail('not_found', 'That block is not one of yours. Duplicate it to fill it.', 404)
  }

  // The words are written for a shop. An organization with none yet still gets
  // its own name, which the worker reads when no shop is sent.
  const shop = await getActiveShop(session)

  const cost = env.GENERATIVE_FILL_CREDITS
  if (cost > 0) {
    const snapshot = await getCreditSnapshot(organizationId)
    if (snapshot.total < cost) {
      return fail(
        'insufficient_credits',
        `A fill costs ${cost} ${cost === 1 ? 'credit' : 'credits'} and you have ${snapshot.total}. Top up to carry on.`,
        402
      )
    }
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId,
      ...(shop === null ? {} : { shopId: shop.id }),
      type: 'copy_fill',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueCopyFill({
      jobId: job.id,
      organizationId,
      ...(shop === null ? {} : { shopId: shop.id }),
      brief: parsed.data.brief,
      slots: parsed.data.slots,
    })
  } catch {
    // A dead queue is reported rather than swallowed: a row left at `queued`
    // is something the dialog polls until its own deadline.
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id, creditsCost: cost }, 202)
}
