import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, consumeCredits, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { isBrandSetupComplete, patchBrandAtLevel, readEffectiveBrand } from '@/lib/brand-kit'
import { isProposal, patchFromProposal } from '@/lib/brand-direction'
import type { BrandOverride } from '@/lib/brand-inheritance'

/**
 * Accept a proposed brand direction. E8-08.
 *
 * **This is where the feature costs anything.** Generating a direction is free
 * and keeping one costs three credits — the one place E8-07's charge-on-success
 * ordering is deliberately not copied, because a palette is *meant* to be
 * re-rolled during setup and charging per roll prices a shop out of the step
 * every other feature depends on. A direction nobody accepts leaves no trace and
 * no charge.
 *
 * **The proposal is re-read from the job rather than taken from the request.**
 * The client has it on screen already and posting it back would be simpler; it
 * would also mean a caller could accept a palette nothing ever proposed, at
 * three credits for whatever they liked. The job row is the record, it is scoped
 * to the organization in the query, and this route reads it.
 *
 * **Which level is patched is not decided here.** `patchBrandAtLevel` routes
 * each facet to the level that owns it, so for an inheriting shop — which is
 * every shop until somebody changes it — accepting a palette edits the
 * organization's kit. That is E2-05's intended behaviour and it is the kit the
 * shop is actually showing.
 */

const schema = z.object({ jobId: z.string().min(1).max(64) })

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That request could not be read.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the brand.', 403)
  }

  // Scoped by organization in the query rather than checked after the read —
  // the poll route makes the same argument, and for the same reason.
  const job = await prisma.aiJob.findFirst({
    where: {
      id: parsed.data.jobId,
      organizationId: session.user.organizationId,
      type: 'brand_direction',
    },
    select: { id: true, status: true, result: true, creditsCost: true },
  })

  if (job === null) return fail('not_found', 'That proposal does not exist.', 404)
  if (job.status !== 'complete') {
    return fail('not_ready', 'That proposal is not finished yet.', 409)
  }

  /**
   * **A result this version cannot read is refused, not coerced.**
   *
   * `ai_jobs.result` is JSONB written by whichever worker deploy ran, and the
   * two apps deploy separately. A proposal from an older shape reaching
   * `patchFromProposal` would write a half-formed palette into a brand kit,
   * which is the one failure here that is not recoverable by trying again.
   */
  if (!isProposal(job.result)) {
    return fail('stale_proposal', 'That proposal is too old to apply. Generate a new one.', 409)
  }

  /**
   * **Already accepted is not an error and is not charged twice.**
   *
   * `creditsCost` on the row is 0 until acceptance and the cost afterwards, so
   * it is also the record of whether this proposal has been applied. A double
   * click, a retried request or a back button lands here, and the honest answer
   * to "accept this again" is the kit as it stands.
   */
  if (job.creditsCost > 0) {
    const current = await readEffectiveBrand(target(shop))
    return ok({
      brandKit: current.brandKit,
      charged: 0,
      complete: isBrandSetupComplete(current.brandKit),
    })
  }

  const cost = CREDIT_COSTS.brand_direction
  const spend = await consumeCredits({
    organizationId: session.user.organizationId,
    shopId: shop.id,
    action: 'brand_direction',
    cost,
  })

  /**
   * **Charged before the kit is written, which is the opposite of the worker's
   * ordering, and deliberately.** The worker charges last because the work was
   * already done and paid for upstream — refusing there would mean deleting a
   * finished artefact over an accounting question. Here the work is a database
   * write that has not happened yet, so an owner who cannot pay is refused
   * before their kit changes rather than after.
   */
  if (!spend.ok) {
    return fail(
      'insufficient_credits',
      `Keeping this palette costs ${cost} credits and you have ${spend.available}. Top up to carry on.`,
      402
    )
  }

  const brand = await patchBrandAtLevel(target(shop), patchFromProposal(job.result))

  await prisma.aiJob.update({
    where: { id: job.id },
    data: { creditsCost: spend.charged },
  })

  return ok({
    brandKit: brand.brandKit,
    brandOverride: brand.override,
    source: brand.source,
    charged: spend.charged,
    complete: isBrandSetupComplete(brand.brandKit),
  })
}

/** The three fields every brand read and write is scoped by. E2-05. */
function target(shop: { organizationId: string; id: string; brandOverride: BrandOverride }) {
  return {
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  }
}
