import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma, prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'

/**
 * The shop's characters, and adopting a generated one. E8-01.
 *
 * **`characters` is shop-scoped and has no `organizationId`**, which is how the
 * schema was written and is not changed here. Every query therefore scopes by
 * `shopId` taken from the active shop, which `getActiveShop` has already
 * resolved against the session — the organization never appears in a `where`
 * because the column does not exist. Worth knowing before adding a query: the
 * usual `organizationId: session.user.organizationId` guard does not apply and
 * its absence is not an oversight.
 *
 * **Nothing is charged on adoption.** The generation already was, on completion.
 * Choosing between four things the shop has paid for is not a second purchase —
 * the same reasoning `POST /brand/logo/generated` gives.
 */

const schema = z.object({
  jobId: z.string().min(1).max(64),
  /** Which variation, by position in the job's own list. */
  index: z.number().int().min(0).max(7),
})

interface Variation {
  url: string
  key: string
}

/** What the worker wrote. Read defensively — it crossed a queue and JSONB. */
function variationsOf(result: unknown): Variation[] {
  if (typeof result !== 'object' || result === null) return []
  const variations = (result as { variations?: unknown }).variations
  if (!Array.isArray(variations)) return []

  return variations.filter(
    (variation): variation is Variation =>
      typeof variation === 'object' &&
      variation !== null &&
      typeof (variation as Variation).url === 'string'
  )
}

function stringField(result: unknown, key: string, fallback: string): string {
  if (typeof result !== 'object' || result === null) return fallback
  const value = (result as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : fallback
}

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  const characters = await prisma.character.findMany({
    where: { shopId: shop.id },
    select: {
      id: true,
      baseImageUrl: true,
      style: true,
      gender: true,
      createdAt: true,
      poses: {
        select: { id: true, poseType: true, imageUrl: true, customLabel: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ characters })
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That request could not be read.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to make a character.', 403)
  }

  // Scoped by organization in the query, and by shop — the job belongs to both,
  // and a character belongs only to a shop.
  const job = await prisma.aiJob.findFirst({
    where: {
      id: parsed.data.jobId,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: 'character_gen',
    },
    select: { status: true, result: true },
  })

  if (job === null) return fail('not_found', 'That character does not exist.', 404)
  if (job.status !== 'complete') return fail('not_ready', 'That is not finished yet.', 409)

  const chosen = variationsOf(job.result)[parsed.data.index]
  if (chosen === undefined) return fail('not_found', 'That variation is not one of these.', 404)

  /**
   * **The discarded variations stay in the bucket, and that is deliberate.**
   * E8-01 says they are not saved, and they are not: no row is written for them
   * and nothing can reach them. Deleting the objects would be a second set of
   * R2 calls on the owner's click, for files nothing references and which a
   * lifecycle rule on the prefix removes far more cheaply. Recorded here so the
   * next person reads it as a decision rather than a leak.
   */
  const character = await prisma.character.create({
    data: {
      shopId: shop.id,
      baseImageUrl: chosen.url,
      style: stringField(job.result, 'style', 'cartoon'),
      nationality: stringField(job.result, 'look', 'unspecified'),
      gender: stringField(job.result, 'gender', 'male'),
      // The extracted uniform, kept so a later pose or a re-generation does not
      // need the original photograph again — which is the point: the photograph
      // is not stored, its description is.
      uniformDescription: uniformOf(job.result),
    },
    select: { id: true, baseImageUrl: true },
  })

  return ok({ character }, 201)
}

function uniformOf(result: unknown): Prisma.InputJsonValue {
  if (typeof result !== 'object' || result === null) return {}
  const uniform = (result as { uniform?: unknown }).uniform
  return typeof uniform === 'object' && uniform !== null
    ? (uniform as Prisma.InputJsonValue)
    : {}
}
