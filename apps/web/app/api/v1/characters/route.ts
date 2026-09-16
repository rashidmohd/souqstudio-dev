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
 * **Nothing is charged on adoption, and keeping four costs no more than keeping
 * one.** The generation was charged on completion; choosing between things the
 * shop has already paid for is not a second purchase, and neither is choosing
 * all of them. The same reasoning `POST /brand/logo/generated` gives.
 */

const schema = z.object({
  jobId: z.string().min(1).max(64),
  /**
   * Which variations to keep, by position in the job's own list.
   *
   * **A list rather than an index, so keeping one and keeping all are the same
   * request.** They were one shape and a `keepAll` flag for about ten minutes,
   * which is two ways of saying one thing and the sort of API that ends up with
   * both paths behaving differently. The set is already paid for: E8-01 says
   * discarded variations are not saved, and it says nothing about there being
   * only one worth saving. A shop that wants a man and a woman on the shelf
   * wanted both all along.
   */
  indexes: z.array(z.number().int().min(0).max(7)).min(1).max(8),
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

  const variations = variationsOf(job.result)

  // Deduplicated, because a client that sends the same position twice means one
  // character and not two identical rows.
  const wanted = [...new Set(parsed.data.indexes)]
  const chosen = wanted.map((index) => variations[index])

  if (chosen.some((variation) => variation === undefined)) {
    return fail('not_found', 'One of those is not a variation of this generation.', 404)
  }

  /**
   * **The discarded variations stay in the bucket, and that is deliberate.**
   * E8-01 says they are not saved, and they are not: no row is written for them
   * and nothing can reach them. Deleting the objects would be a second set of
   * R2 calls on the owner's click, for files nothing references and which a
   * lifecycle rule on the prefix removes far more cheaply. Recorded here so the
   * next person reads it as a decision rather than a leak.
   */
  const common = {
    shopId: shop.id,
    style: stringField(job.result, 'style', 'cartoon'),
    nationality: stringField(job.result, 'look', 'unspecified'),
    gender: stringField(job.result, 'gender', 'male'),
    // The extracted uniform, kept so a later pose or a re-generation does not
    // need the original photograph again — which is the point: the photograph
    // is not stored, its description is.
    uniformDescription: uniformOf(job.result),
  }

  /**
   * **One transaction, so keeping four is four characters or none.** A partial
   * failure halfway through a loop leaves an owner with two of the four they
   * asked for and a job marked claimed, which is the one outcome here that
   * cannot be retried into a correct state.
   */
  const characters = await prisma.$transaction(
    chosen.map((variation) =>
      prisma.character.create({
        data: { ...common, baseImageUrl: (variation as { url: string }).url },
        select: { id: true, baseImageUrl: true },
      })
    )
  )

  // The job has now been collected, so it stops being unfinished work. Written
  // after the row exists: a job marked claimed with no character behind it is a
  // generation an owner paid for and can no longer reach.
  await prisma.aiJob.update({
    where: { id: parsed.data.jobId },
    data: { claimedAt: new Date() },
  })

  return ok({ characters }, 201)
}

function uniformOf(result: unknown): Prisma.InputJsonValue {
  if (typeof result !== 'object' || result === null) return {}
  const uniform = (result as { uniform?: unknown }).uniform
  return typeof uniform === 'object' && uniform !== null
    ? (uniform as Prisma.InputJsonValue)
    : {}
}
