import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'

/**
 * One library magic-block job, for the panel to poll. E13-04.
 *
 * Only jobs with no organization: an organization's job is that shop's, and the
 * panel has no business reading it.
 */
export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const job = await prisma.aiJob.findFirst({
    where: { id: params.jobId, organizationId: null, type: 'block_gen' },
    select: { id: true, status: true, errorMessage: true, result: true },
  })
  if (job === null) return fail('not_found', 'That job does not exist.', 404)

  return ok(job)
}
