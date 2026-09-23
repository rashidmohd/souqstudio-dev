import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { starterBlock } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { STARTER_KINDS } from '@/lib/library-drafts'

/**
 * Start a library draft. E13-04.
 *
 * Two ways in, the same as the shop app's `POST /api/v1/blocks`: a copy of a
 * block that already works, or the smallest block of a kind. The designer's
 * "Duplicate to edit" posts `{ fromId, name }` here and opens the `id` that
 * comes back, so the reply keeps the shop route's shape.
 *
 * **A copy only ever comes from SouqStudio's own blocks.** An organization's
 * block is that shop's design; copying it into the library would put one
 * customer's work in front of every other customer. The `where` below makes
 * that structural rather than a check somebody can forget.
 *
 * Every draft starts as `draft` whatever its source, including a copy of a
 * published library block. See `lib/library-drafts.ts`.
 */

const createSchema = z.union([
  z.object({
    name: z.string().trim().min(1).max(80),
    fromId: z.string().min(1).max(64),
    description: z.string().trim().max(200).optional(),
  }),
  z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(STARTER_KINDS),
    description: z.string().trim().max(200).optional(),
  }),
])

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Give the block a name and something to start from.')
  }

  let data: Prisma.BlockUncheckedCreateInput

  if ('kind' in parsed.data) {
    const starter = starterBlock(parsed.data.kind)
    data = {
      organizationId: null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      repeats: starter.repeats,
      // `Arrangement[]` is an interface, and an interface has no implicit index
      // signature, so it is not assignable to Prisma's JSON input type. Same
      // assertion as the shop route and the seed.
      arrangements: starter.arrangements as unknown as Prisma.InputJsonValue,
      status: 'draft',
      category: parsed.data.kind,
    }
  } else {
    const source = await prisma.block.findFirst({
      where: { id: parsed.data.fromId, organizationId: null },
      select: {
        name: true,
        description: true,
        repeats: true,
        arrangements: true,
        category: true,
        isSeasonal: true,
        occasion: true,
        planTier: true,
      },
    })
    if (source === null) {
      return fail('source_not_found', 'That block is not one the library can start from.', 404)
    }

    data = {
      organizationId: null,
      name: parsed.data.name,
      description: parsed.data.description ?? source.description,
      repeats: source.repeats,
      // A read JSON column is `JsonValue`, which admits a bare null the input
      // type does not; `arrangements` is non-nullable, so it never is one.
      arrangements: source.arrangements as Prisma.InputJsonValue,
      status: 'draft',
      category: source.category,
      isSeasonal: source.isSeasonal,
      occasion: source.occasion,
      planTier: source.planTier,
    }
  }

  const block = await prisma.block.create({ data, select: { id: true, name: true, repeats: true } })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.block.drafted',
    entityType: 'block',
    entityId: block.id,
    after: {
      name: block.name,
      from: 'fromId' in parsed.data ? parsed.data.fromId : `starter:${parsed.data.kind}`,
    },
  })

  return ok(block, 201)
}
