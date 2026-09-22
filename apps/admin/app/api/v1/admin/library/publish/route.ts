import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { BLOCK_CATEGORIES } from '@souqstudio/engine'
import type { BlockCategory } from '@souqstudio/engine'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { publishBlock } from '@/lib/library-client'

/**
 * Publish one block into the shared library. E13-04.
 *
 * **Super admin only, and that is not a formality.** Writing the library prefix
 * puts a design in front of *every shop on the platform*. A catalog manager
 * changing a product affects what one search returns; this changes what
 * everybody's picker contains. The two are not the same authority and the role
 * gate is where the difference lives.
 *
 * The publish itself is `apps/web`'s. See lib/library-client.ts for why there
 * is not a second implementation here.
 */

const schema = z.object({
  blockId: z.string().min(1),
  /**
   * The id it takes in the library. Optional only when the row already has one:
   * an owner's block has a cuid, which is a database key and not a name.
   */
  id: z
    .string()
    .regex(/^blk_[a-z0-9_]+$/, 'A library id looks like "blk_ramadan_band".')
    .optional(),
  category: z
    .enum(BLOCK_CATEGORIES as unknown as [BlockCategory, ...BlockCategory[]])
    .optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('super_admin')
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.errors[0]?.message ?? 'Say which block to publish.')
  }

  /*
   * Read here as well as in the web route, for the audit entry rather than for
   * the publish. The log has to record what was published by name: a row of
   * cuids is a log nobody can read six months later.
   */
  const row = await prisma.block.findUnique({
    where: { id: parsed.data.blockId },
    select: { id: true, name: true, category: true, organizationId: true, status: true },
  })
  if (row === null) return fail('not_found', 'That block does not exist.', 404)

  const result = await publishBlock(parsed.data)

  if (!result.ok) {
    /*
     * A refused publish is logged too. "Somebody tried to publish this and the
     * document did not parse" is exactly the thing worth finding later, and a
     * log that only records successes cannot answer it.
     */
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'library.block.publish_failed',
      entityType: 'block',
      entityId: row.id,
      after: { name: row.name, code: result.code, message: result.message },
    })
    return fail(result.code, result.message, result.status)
  }

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.block.published',
    entityType: 'block',
    entityId: row.id,
    before: { libraryId: null, name: row.name, category: row.category },
    after: {
      libraryId: result.data.id,
      name: parsed.data.name ?? row.name,
      category: parsed.data.category ?? row.category,
      version: result.data.version,
      count: result.data.count,
    },
  })

  return ok(result.data)
}
