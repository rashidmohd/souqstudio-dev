import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { enqueueMagicBlock, prisma } from '@souqstudio/db'
import { MAGIC_CATEGORIES, type MagicCategory } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { LIBRARY_ASSET_PREFIX } from '@/lib/library-drafts'

/**
 * Read a picture of a block into a library draft. E13-04, the admin half of
 * the shop app's E8-07 magic block.
 *
 * **The same job, for no organization.** The worker's `magic-block` job reads
 * the picture, matches it to a structure the library already draws, and
 * creates a draft block; with `organizationId: null` that block is
 * SouqStudio's (a library draft) and nothing is charged. Everything the shop
 * route's comments say about the model, the kinds and the refusals applies.
 *
 * The picture is uploaded with the admin artwork presign, so it lives under
 * `library/blocks/`. It is not recorded as an asset, so it never appears in
 * anybody's artwork picker: it is a reference, not artwork.
 *
 * Only the start is audited here; the worker is not an admin and does not
 * write the audit log. The block it creates is a draft, so it reaches nobody.
 */

const schema = z.object({
  sourceKey: z.string().min(1).max(200),
  category: z
    // `z.enum` wants a non-empty tuple; MAGIC_CATEGORIES is a literal list.
    .enum(MAGIC_CATEGORIES as unknown as [MagicCategory, ...MagicCategory[]])
    .default('offer-card'),
})

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'Upload a picture of the block first.', 422)

  const { sourceKey, category } = parsed.data
  if (!sourceKey.startsWith(LIBRARY_ASSET_PREFIX) || sourceKey.includes('..')) {
    return fail('invalid_input', 'That upload is not one this panel made.', 422)
  }

  const job = await prisma.aiJob.create({
    data: { organizationId: null, type: 'block_gen', status: 'queued', creditsCost: 0 },
    select: { id: true },
  })

  try {
    await enqueueMagicBlock({ jobId: job.id, organizationId: null, sourceKey, category })
  } catch {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'The worker queue is not reachable. Try again in a moment.', 503)
  }

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.block.magic_started',
    entityType: 'library',
    entityId: job.id,
    after: { category, sourceKey },
  })

  return ok({ jobId: job.id }, 202)
}
