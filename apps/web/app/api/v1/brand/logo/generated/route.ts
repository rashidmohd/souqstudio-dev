import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { patchBrandAtLevel } from '@/lib/brand-kit'

/**
 * Adopt one of the generated logo marks. E8-09.
 *
 * **Nothing is charged here** — the generation already was, on completion, the
 * same ordering magic block uses. This is a choice between four things the shop
 * has already paid for, and charging for picking one would be charging twice for
 * the same call.
 *
 * **The chosen mark's URL is read off the job, never taken from the request.**
 * The client has all four on screen and posting one back would be simpler; it
 * would also let a caller set `logoUrl` to any URL they liked, which is a stored
 * cross-origin reference rendered into every offer book the shop prints. The job
 * row is the record and it is scoped to the organization in the query.
 *
 * **`logoStatus` is `ready` and there is no background removal.** A generated
 * mark has a transparent ground by construction — it is an SVG we assembled —
 * so the Rembg round trip E4-01 needs would be a queue hop to remove a
 * background that was never there. `logoOriginalUrl` stays empty for the same
 * reason: there was no upload to keep a copy of.
 */

const schema = z.object({
  jobId: z.string().min(1).max(64),
  /** Which of the marks, by position in the job's own list. */
  index: z.number().int().min(0).max(7),
})

/** What the worker wrote. Read defensively — it crossed a queue and JSONB. */
interface StoredMark {
  structure: string
  setAs: string
  why: string
  url: string
}

function marksOf(result: unknown): StoredMark[] {
  if (typeof result !== 'object' || result === null) return []
  const marks = (result as { marks?: unknown }).marks
  if (!Array.isArray(marks)) return []

  return marks.filter(
    (mark): mark is StoredMark =>
      typeof mark === 'object' &&
      mark !== null &&
      typeof (mark as StoredMark).url === 'string' &&
      typeof (mark as StoredMark).structure === 'string'
  )
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'That request could not be read.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the logo.', 403)
  }

  const job = await prisma.aiJob.findFirst({
    where: {
      id: parsed.data.jobId,
      organizationId: session.user.organizationId,
      type: 'logo_gen',
    },
    select: { status: true, result: true },
  })

  if (job === null) return fail('not_found', 'Those marks do not exist.', 404)
  if (job.status !== 'complete') return fail('not_ready', 'Those marks are not finished yet.', 409)

  const mark = marksOf(job.result)[parsed.data.index]
  if (mark === undefined) return fail('not_found', 'That mark is not one of these.', 404)

  /**
   * `patchBrandAtLevel` routes the logo to whichever level owns it — E2-05. For
   * an inheriting shop, which is every shop until somebody changes it, adopting
   * a mark sets the *organization's* logo, because that is the logo the shop is
   * actually showing.
   */
  const brand = await patchBrandAtLevel(
    {
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    },
    { logoStatus: 'ready', logoOriginalUrl: undefined },
    mark.url
  )

  await prisma.aiJob.update({
    where: { id: parsed.data.jobId },
    data: { claimedAt: new Date() },
  })

  return ok({
    logoUrl: brand.logoUrl,
    brandKit: brand.brandKit,
    source: brand.source,
  })
}
