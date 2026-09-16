import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'

/**
 * Keep one of the generated poses. E8-02 and E8-03.
 *
 * Nothing is charged: the generation already was. The chosen image's URL is read
 * off the job rather than taken from the request, for the reason every adopt
 * route in this epic gives — a client-supplied URL would become a stored
 * cross-origin reference rendered into the shop's offer books.
 */

const schema = z.object({
  jobId: z.string().min(1).max(64),
  index: z.number().int().min(0).max(7),
  /** E8-03 saves under a label the owner gives it. Absent for a listed pose. */
  customLabel: z.string().trim().min(1).max(40).optional(),
})

function variationUrl(result: unknown, index: number): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const variations = (result as { variations?: unknown }).variations
  if (!Array.isArray(variations)) return undefined

  const chosen: unknown = variations[index]
  if (typeof chosen !== 'object' || chosen === null) return undefined

  const url = (chosen as { url?: unknown }).url
  return typeof url === 'string' ? url : undefined
}

function poseType(result: unknown): string {
  if (typeof result !== 'object' || result === null) return 'custom'
  const pose = (result as { pose?: unknown }).pose
  return typeof pose === 'string' ? pose : 'custom'
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That request could not be read.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the character.', 403)
  }

  const character = await prisma.character.findFirst({
    where: { id: params.id, shopId: shop.id },
    select: { id: true },
  })
  if (character === null) return fail('not_found', 'That character does not exist.', 404)

  const job = await prisma.aiJob.findFirst({
    where: {
      id: parsed.data.jobId,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: { in: ['pose_gen', 'prompt_gen'] },
    },
    select: { status: true, result: true },
  })

  if (job === null) return fail('not_found', 'Those poses do not exist.', 404)
  if (job.status !== 'complete') return fail('not_ready', 'Those poses are not finished yet.', 409)

  const url = variationUrl(job.result, parsed.data.index)
  if (url === undefined) return fail('not_found', 'That pose is not one of these.', 404)

  const pose = await prisma.characterPose.create({
    data: {
      characterId: character.id,
      poseType: poseType(job.result),
      imageUrl: url,
      ...(parsed.data.customLabel === undefined ? {} : { customLabel: parsed.data.customLabel }),
    },
    select: { id: true, poseType: true, imageUrl: true, customLabel: true },
  })

  await prisma.aiJob.update({
    where: { id: parsed.data.jobId },
    data: { claimedAt: new Date() },
  })

  return ok({ pose }, 201)
}
