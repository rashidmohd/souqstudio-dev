import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueuePoseGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import { POSES, type Pose } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { env } from '@/lib/env'

/**
 * Generate a pose of an existing character. E8-02, or E8-03 when described.
 *
 * **One route for both, because they are one job.** Picking from the list of
 * seven costs 3 credits and returns two; describing the pose costs 5 and is the
 * power-user path. The difference is which field is set, and the price follows
 * from that rather than from a separate endpoint.
 */

const schema = z
  .object({
    pose: z.enum(POSES as unknown as [Pose, ...Pose[]]).optional(),
    /** "holding a watermelon, smiling, looking left" — E8-03's own example. */
    described: z.string().trim().min(3).max(200).optional(),
  })
  .refine(
    (value) => (value.pose === undefined) !== (value.described === undefined),
    'Pick a pose or describe one, not both and not neither.'
  )

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  if (env.IMAGE_PROVIDER === undefined) {
    return fail('image_generation_off', 'Pose generation is not switched on yet.', 503)
  }

  const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {})
  if (!parsed.success) return fail('invalid_input', 'Pick a pose, or describe one.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the character.', 403)
  }

  // A character belongs to a shop and has no organization column — see the note
  // on `/api/v1/characters`. The shop is the scope, and it came from the session.
  const character = await prisma.character.findFirst({
    where: { id: params.id, shopId: shop.id },
    select: { id: true },
  })
  if (character === null) return fail('not_found', 'That character does not exist.', 404)

  const action = parsed.data.described === undefined ? 'pose_gen' : 'prompt_gen'
  const cost = CREDIT_COSTS[action]

  const snapshot = await getCreditSnapshot(session.user.organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `That costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: action,
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueuePoseGen({
      jobId: job.id,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      characterId: character.id,
      ...(parsed.data.pose === undefined ? {} : { pose: parsed.data.pose }),
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
