import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * Poll one AI job. E8.
 *
 * Every AI operation follows the same shape — the route queues and returns a
 * job id, the client polls here, the worker moves the row through
 * `queued → processing → complete | failed`. `api-conventions.md` §Long-running
 * operations, and this is the read half of it.
 *
 * **One route for every AI job type rather than one per feature.** The client
 * branches on `type` and `result`; a poll endpoint per feature would be five
 * copies of the same tenancy check, and the one that gets copied wrong is the
 * one that leaks another organization's job.
 */

export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const job = await prisma.aiJob.findFirst({
    /**
     * Scoped by organization **in the query**, not checked after the read.
     *
     * A `findUnique` on the id followed by an `if` is the same thing until
     * somebody deletes the `if`; this cannot be got wrong that way. The org
     * comes from the session and never from the request.
     */
    where: { id: params.jobId, organizationId: session.user.organizationId },
    select: {
      id: true,
      type: true,
      status: true,
      result: true,
      errorMessage: true,
      creditsCost: true,
      createdAt: true,
      completedAt: true,
    },
  })

  // A job belonging to another organization is not found rather than forbidden.
  // "Forbidden" would confirm the id exists, which is a fact about somebody
  // else's account.
  if (job === null) return fail('not_found', 'That job does not exist.', 404)

  return ok(job)
}
