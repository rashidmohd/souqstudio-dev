import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { OCCASIONS } from '@souqstudio/engine'
import type { Occasion } from '@souqstudio/engine'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import {
  blockErrorMessage,
  blockErrors,
  blockUpdateSchema,
} from '@souqstudio/designer/lib/block-write'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { DRAFT_WHERE } from '@/lib/library-drafts'

/**
 * Save a library draft. E13-04. The admin designer's autosave.
 *
 * The same schema, the same validation and the same versioning as the shop
 * app's `PATCH /api/v1/blocks/[id]`, from the same module, so a draft that saves
 * here is a document the shop side would accept too.
 *
 * **Only a draft, and it stays one.** A published library row is the sync's
 * copy of what is in R2 and is rewritten by the next sync, so editing it would
 * be lost; the designer opens it read-only and offers a duplicate. And `status`
 * is dropped from the body: a platform row marked published here would reach
 * every shop without being published, then be pruned by the next sync.
 * Publishing is the publish panel's job.
 */

/**
 * One audit row per stretch of work, not per autosave.
 *
 * The designer saves two seconds after every change, so a row per request is a
 * few hundred rows for one session and a log nobody can read. The documents
 * themselves are in `block_versions`; the log's job is to say who worked on
 * which draft and when.
 */
const AUDIT_WINDOW_MS = 15 * 60 * 1000

/**
 * The shop route's schema plus the occasion, which only the library sets: a
 * shop's own block has no occasion to choose, and an imported seasonal block
 * carries its source's. Naming one makes the draft seasonal; `null` clears it.
 */
const draftUpdateSchema = blockUpdateSchema.extend({
  occasion: z
    // `z.enum` wants a non-empty tuple; OCCASIONS is a ten-entry literal.
    .enum(OCCASIONS.map((o) => o.value) as [Occasion, ...Occasion[]])
    .nullable()
    .optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const parsed = draftUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That change could not be applied to the block.')
  }

  const existing = await prisma.block.findFirst({
    where: { id: params.id, ...DRAFT_WHERE },
    select: { id: true, repeats: true, arrangements: true },
  })

  if (existing === null) {
    const any = await prisma.block.findUnique({ where: { id: params.id }, select: { id: true } })
    return any === null
      ? fail('not_found', 'That block does not exist.', 404)
      : fail(
          'not_a_draft',
          'Only a library draft can be edited here. Duplicate this block to make a draft.',
          403
        )
  }

  const repeats = parsed.data.repeats ?? existing.repeats
  const arrangements = parsed.data.arrangements ?? existing.arrangements

  const errors = blockErrors({ repeats, arrangements })
  if (errors.length > 0) {
    return fail('block_invalid', blockErrorMessage(errors), 422)
  }

  // The previous document is versioned, not the new one: the history is what
  // "restore a previous version" reads. Same as the shop route.
  const versioned = parsed.data.arrangements !== undefined

  const [block] = await prisma.$transaction([
    prisma.block.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
        ...(parsed.data.description === undefined
          ? {}
          : { description: parsed.data.description }),
        ...(parsed.data.repeats === undefined ? {} : { repeats: parsed.data.repeats }),
        ...(parsed.data.occasion === undefined
          ? {}
          : { occasion: parsed.data.occasion, isSeasonal: parsed.data.occasion !== null }),
        ...(parsed.data.arrangements === undefined
          ? {}
          : // An interface has no index signature, so `Arrangement[]` is not
            // assignable to Prisma's JSON input type. Same as the shop route.
            { arrangements: parsed.data.arrangements as unknown as Prisma.InputJsonValue }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        repeats: true,
        occasion: true,
        updatedAt: true,
      },
    }),
    ...(versioned
      ? [
          prisma.blockVersion.create({
            data: {
              blockId: existing.id,
              // Read from a non-nullable JSON column, so never the bare null
              // `JsonValue` admits and the input type does not.
              arrangements: existing.arrangements as Prisma.InputJsonValue,
            },
          }),
        ]
      : []),
  ])

  const recent = await prisma.adminAuditLog.findFirst({
    where: {
      adminUserId: gate.session.admin.id,
      action: 'library.block.edited',
      entityId: existing.id,
      createdAt: { gte: new Date(Date.now() - AUDIT_WINDOW_MS) },
    },
    select: { id: true },
  })
  // An occasion is a decision about when every shop sees the block, not an
  // autosave, so it is always logged.
  if (parsed.data.occasion !== undefined) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'library.block.occasion_set',
      entityType: 'block',
      entityId: existing.id,
      after: { occasion: parsed.data.occasion },
    })
  } else if (recent === null) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'library.block.edited',
      entityType: 'block',
      entityId: existing.id,
      after: { name: block.name },
    })
  }

  return ok(block)
}
