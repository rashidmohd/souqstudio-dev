import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { keyFromPublicUrl, publicUrl } from '@/lib/r2'

/**
 * The shop's kept covers. E8-04.
 *
 * **A cover is a brand asset.** It was a page background made inside one book,
 * which meant it could never be reused — the same shop paying five credits again
 * next week for the same Ramadan cover. It is made once on `/brand` now and
 * picked from there, exactly as a character is.
 *
 * Shop-scoped, with no organization guard, because `covers` has no
 * `organizationId` — the same deliberate shape `characters` has. Every query
 * here takes its `shopId` from the active shop and never from the request.
 */

const schema = z.object({
  jobId: z.string().min(1).max(64),
  /**
   * Which of the generated options to keep. Absent means all of them.
   *
   * **The worker keeps every option now**, so nothing in the product sends this
   * any more — a cover is an asset from the moment it is drawn, and the ticking
   * step is gone. What is left here is the recovery path for a job drawn before
   * that was true: a generation that completed, wrote no rows, and whose images
   * are still sitting in the bucket with nothing pointing at them.
   */
  indexes: z.array(z.number().int().min(0).max(9)).min(1).max(3).optional(),
})

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  const rows = await prisma.cover.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
  })

  // Keys are stored; URLs are what a thumbnail needs. The column survives the
  // bucket moving behind a different origin and this is where that is undone.
  return ok({
    covers: rows.map((row) => ({
      id: row.id,
      url: publicUrl(row.r2Key),
      key: row.r2Key,
      campaign: row.campaign,
      style: row.style,
      shape: row.shape,
    })),
  })
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That request could not be read.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to keep a cover.', 403)
  }

  // Scoped by organization *and* shop in the query: the job belongs to both, a
  // cover belongs only to a shop. The same predicate `POST /characters` uses.
  const job = await prisma.aiJob.findFirst({
    where: {
      id: parsed.data.jobId,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: 'cover_gen',
    },
    select: { status: true, result: true },
  })

  if (job === null) return fail('not_found', 'That cover does not exist.', 404)
  if (job.status !== 'complete') return fail('not_ready', 'That is not finished yet.', 409)

  const options = optionsOf(job.result)

  // Deduplicated: the same position twice means one cover, not two identical
  // rows pointing at one object.
  const wanted = [...new Set(parsed.data.indexes ?? options.map((_, index) => index))]
  const chosen = wanted.map((index) => options[index])

  if (chosen.length === 0 || chosen.some((option) => option === undefined)) {
    return fail('not_found', 'One of those is not an option of this generation.', 404)
  }

  const common = {
    shopId: shop.id,
    campaign: stringField(job.result, 'promptSlug', 'custom'),
    style: stringField(job.result, 'style', 'flat-graphic'),
    shape: stringField(job.result, 'shape', 'portrait'),
  }

  /**
   * **The options not kept stay in the bucket**, exactly as a character's
   * discarded variations do. No row references them and nothing can reach them;
   * a lifecycle rule on the prefix is what removes the objects, far more cheaply
   * than a second set of R2 calls on the owner's click. Written down so the next
   * person reads it as a decision rather than as a leak.
   */
  const keys = chosen.map((option) => keyOf(option as { url: string; key?: string }))

  /**
   * **Written once per object, however often this is called.**
   *
   * The worker writes these rows itself the moment it has drawn them, so an
   * owner arriving here through the bell on a job that already delivered would
   * otherwise get a second library full of the same three pictures. The key is
   * what identifies an object, so the key is what is checked — there is no job
   * column on `covers` to check instead, and adding one to carry a transitional
   * guard would be the wrong shape for good.
   */
  const already = await prisma.cover.findMany({
    where: { shopId: shop.id, r2Key: { in: keys } },
    select: { id: true, r2Key: true },
  })
  const missing = keys.filter((key) => !already.some((row) => row.r2Key === key))

  const written = await prisma.$transaction(
    missing.map((r2Key) =>
      prisma.cover.create({
        data: { ...common, r2Key },
        select: { id: true, r2Key: true },
      })
    )
  )

  const covers = [...already, ...written]

  // Written after the rows exist: a job marked claimed with no cover behind it
  // is a generation the owner paid for and can no longer reach.
  await prisma.aiJob.update({
    where: { id: parsed.data.jobId },
    data: { claimedAt: new Date() },
  })

  return ok(
    { covers: covers.map((cover) => ({ id: cover.id, url: publicUrl(cover.r2Key) })) },
    201
  )
}

/**
 * The key for one option.
 *
 * The worker writes both `key` and `url`, and the key is what is stored. The URL
 * fallback is for a job written before that was true — `keyFromPublicUrl` is the
 * same seam the worker uses in the other direction.
 */
function keyOf(option: { url: string; key?: string }): string {
  if (typeof option.key === 'string' && option.key !== '') return option.key
  const derived = keyFromPublicUrl(option.url)
  if (derived === null) throw new Error('covers: that option is not an R2 object')
  return derived
}

function optionsOf(result: unknown): Array<{ url: string; key?: string }> {
  if (typeof result !== 'object' || result === null) return []
  const options = (result as Record<string, unknown>).options
  if (!Array.isArray(options)) return []
  return options.filter(
    (option): option is { url: string; key?: string } =>
      typeof option === 'object' &&
      option !== null &&
      typeof (option as Record<string, unknown>).url === 'string'
  )
}

function stringField(result: unknown, key: string, fallback: string): string {
  if (typeof result !== 'object' || result === null) return fallback
  const value = (result as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : fallback
}
