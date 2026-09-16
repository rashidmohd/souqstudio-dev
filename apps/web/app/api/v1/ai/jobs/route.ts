import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * This organization's recent AI work, and what of it is unfinished. E8.
 *
 * **The route that should have existed before any of these features shipped.**
 * Every generation flow held its `jobId` in a React state and nothing else in
 * the product listed them, so closing a tab mid-generation spent the credits,
 * left four images in R2 and left no route back to them. `claimedAt` and this
 * route are the two halves of the fix; the bell in the rail is what makes it
 * visible.
 *
 * **Not a notification system.** E12 is the notification epic and it is
 * unstarted — this is one query over one table, and what it can answer is "what
 * did I start, and what still needs me". A real hub has read state, delivery
 * across devices, and things to say that are not AI jobs. When E12 lands this
 * becomes one of its sources rather than its shape.
 */

/**
 * Which job types leave something to collect.
 *
 * **Magic block is deliberately absent.** It writes a draft block directly, so
 * by the time it is complete the artefact exists and is in the owner's library —
 * there is nothing to come back for. `background_removal` is the same: it writes
 * an `image_assets` row. Listing them as unfinished would be telling an owner
 * they owe something to a job that already delivered.
 */
const CLAIMABLE = ['character_gen', 'pose_gen', 'prompt_gen', 'cover_gen', 'logo_gen'] as const

/** How far back the bell looks. Older than this is history, not a to-do. */
const WINDOW_DAYS = 7

export async function GET(request: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const unclaimedOnly = request.nextUrl.searchParams.get('unclaimed') === '1'
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const jobs = await prisma.aiJob.findMany({
    /**
     * Scoped by organization **in the query**, and the org comes from the
     * session — the same rule the single-job route states, and for the same
     * reason: a `findMany` filtered afterwards is one deleted `if` from being a
     * list of somebody else's work.
     */
    where: {
      organizationId: session.user.organizationId,
      createdAt: { gte: since },
      ...(unclaimedOnly
        ? { status: 'complete', claimedAt: null, type: { in: [...CLAIMABLE] } }
        : {}),
    },
    select: {
      id: true,
      type: true,
      status: true,
      creditsCost: true,
      claimedAt: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    // Enough to be a list and not enough to be a page. An organization with more
    // than this outstanding has a problem the bell cannot solve.
    take: 20,
  })

  /**
   * **The result payloads are not returned.** They carry R2 URLs for every
   * variation, including the three an owner will discard, and this route is
   * polled. The single-job route is where a picker gets them, once it knows
   * which job it is resuming.
   */
  return ok({ jobs })
}
