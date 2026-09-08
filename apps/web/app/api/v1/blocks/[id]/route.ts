import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { blockErrorMessage, blockErrors, blockUpdateSchema } from '@/lib/block-write'
import { blockIsInUse, loadBlock } from '@/lib/blocks'

/**
 * One block: read it, save it, retire it. E7.
 *
 * **A seeded block is read-only through this route**, and the refusal is the
 * design rather than a missing feature. Every account composes with the same
 * four seeded blocks; letting one organization edit them in place would either
 * change everybody's library or fork it silently. Duplicating is the supported
 * move — `POST /api/v1/blocks` with `fromId` — and the copy is theirs.
 */

async function planIdFor(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true },
  })
  return organization?.planId ?? null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const block = await loadBlock(
    params.id,
    session.user.organizationId,
    await planIdFor(session.user.organizationId)
  )
  if (block === null) return fail('not_found', 'That block does not exist.', 404)

  return ok(block)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const body = await request.json().catch(() => null)
  const parsed = blockUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'That change could not be applied to the block.')
  }

  // Scoped to the organization in the `where`, not checked after the read: a
  // seeded block has a null `organizationId` and is therefore not matched here,
  // which is what makes the read-only rule structural rather than a branch
  // somebody can forget.
  const existing = await prisma.block.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, repeats: true, arrangements: true },
  })

  if (existing === null) {
    const seeded = await prisma.block.findFirst({
      where: { id: params.id, organizationId: null },
      select: { id: true },
    })
    return seeded === null
      ? fail('not_found', 'That block does not exist.', 404)
      : fail(
          'seeded_block',
          'This block comes with every account. Duplicate it to make your own version.',
          403
        )
  }

  const repeats = parsed.data.repeats ?? existing.repeats
  const arrangements = parsed.data.arrangements ?? existing.arrangements

  const errors = blockErrors({ repeats, arrangements })
  if (errors.length > 0) {
    return fail('block_invalid', blockErrorMessage(errors), 422)
  }

  // **The previous document is versioned, not the new one.** `block_versions`
  // is what "restore a previous version" reads, so the row written on save has
  // to be the state being replaced — writing the incoming document would make
  // the history a list of things the owner already has.
  const versioned = parsed.data.arrangements !== undefined

  const [block] = await prisma.$transaction([
    prisma.block.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
        ...(parsed.data.description === undefined
          ? {}
          : { description: parsed.data.description }),
        ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
        ...(parsed.data.repeats === undefined ? {} : { repeats: parsed.data.repeats }),
        ...(parsed.data.arrangements === undefined
          ? {}
          : { arrangements: parsed.data.arrangements as unknown as Prisma.InputJsonValue }),
      },
      select: { id: true, name: true, status: true, repeats: true, updatedAt: true },
    }),
    ...(versioned
      ? [
          prisma.blockVersion.create({
            data: {
              blockId: existing.id,
              arrangements: existing.arrangements as Prisma.InputJsonValue,
            },
          }),
        ]
      : []),
  ])

  return ok(block)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const existing = await prisma.block.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (existing === null) {
    return fail('not_found', 'That block does not exist, or is not yours to delete.', 404)
  }

  // **A block a book still draws is archived, never deleted.** There is no
  // foreign key to lean on — a page grid names its block by id inside JSON, on
  // purpose — so deleting one a live book uses would leave that book
  // unrenderable, with nothing in the schema to have stopped it.
  if (await blockIsInUse(existing.id, session.user.organizationId)) {
    const archived = await prisma.block.update({
      where: { id: existing.id },
      data: { status: 'archived' },
      select: { id: true, status: true },
    })
    return ok({ ...archived, archivedInstead: true })
  }

  await prisma.block.delete({ where: { id: existing.id } })
  return ok({ id: existing.id, status: 'deleted', archivedInstead: false })
}
