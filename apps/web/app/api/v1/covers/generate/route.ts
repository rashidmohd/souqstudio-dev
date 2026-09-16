import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueueCoverGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import {
  CAMPAIGNS,
  COVER_SHAPES,
  type Campaign,
  type CoverShape,
} from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { env } from '@/lib/env'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { resolvePalette } from '@/lib/brand-palette'

/**
 * Generate a cover background, three options. E8-04.
 *
 * **What comes back is a background.** The shop's name, logo and character are
 * composited on top afterwards, by E9's export — a model asked to render a
 * shop's name produces misspelled text in a typeface nobody chose. The seam
 * between the two is an R2 key, exactly as uploaded block artwork already works.
 *
 * **The palette is read here rather than sent.** The cover is drawn in the
 * shop's colours, and which colours those are is a fact in the brand kit.
 */

const schema = z
  .object({
    campaign: z.enum(CAMPAIGNS as unknown as [Campaign, ...Campaign[]]),
    shape: z
      .enum(COVER_SHAPES as unknown as [CoverShape, ...CoverShape[]])
      .default('portrait'),
    /** Required when the campaign is `custom`, ignored otherwise. */
    described: z.string().trim().min(3).max(200).optional(),
  })
  .refine(
    (value) => value.campaign !== 'custom' || value.described !== undefined,
    'Describe the campaign you want.'
  )

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  if (env.IMAGE_PROVIDER === undefined) {
    return fail('image_generation_off', 'Cover generation is not switched on yet.', 503)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'Choose a campaign, then try again.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to make a cover.', 403)
  }

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })
  const palette = resolvePalette(brand.brandKit).map((color) => color.hex)

  const cost = CREDIT_COSTS.cover_gen
  const snapshot = await getCreditSnapshot(session.user.organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `A cover costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: 'cover_gen',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueCoverGen({
      jobId: job.id,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      campaign: parsed.data.campaign,
      shape: parsed.data.shape,
      palette,
      ...(parsed.data.described === undefined ? {} : { described: parsed.data.described }),
    })
  } catch {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id, creditsCost: cost }, 202)
}
