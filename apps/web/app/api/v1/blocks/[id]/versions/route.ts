import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { toArrangements } from '@/lib/block-document'
import { blockErrorMessage, blockErrors } from '@/lib/block-write'

/**
 * Version history for one block. E7-01.
 *
 * The schema has carried `block_versions` since the composition model landed and
 * nothing wrote to it. A save writes the *replaced* document here, so the list
 * is what the block used to be, newest first.
 *
 * **Restoring is a save, not a rewind.** It writes the old document forward,
 * which versions the current one on the way past — so an owner who restores by
 * mistake can restore back. A history that can be walked in only one direction
 * is a history that eats work.
 */

const restoreSchema = z.object({ versionId: z.string().min(1).max(64) })

/** Enough to choose between them; the document itself comes with the restore. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const block = await prisma.block.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (block === null) return fail('not_found', 'That block does not exist.', 404)

  const versions = await prisma.blockVersion.findMany({
    where: { blockId: block.id },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return ok(versions)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const body = await request.json().catch(() => null)
  const parsed = restoreSchema.safeParse(body)
  if (!parsed.success) return fail('invalid_request', 'Choose a version to restore.')

  const block = await prisma.block.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, repeats: true, arrangements: true },
  })
  if (block === null) {
    return fail('not_found', 'That block does not exist, or is not yours to change.', 404)
  }

  const version = await prisma.blockVersion.findFirst({
    where: { id: parsed.data.versionId, blockId: block.id },
    select: { id: true, arrangements: true },
  })
  if (version === null) return fail('not_found', 'That version is no longer available.', 404)

  // Validated on the way back in, not trusted because it was once saved. A
  // block's rules can change after a version was written — `repeats` can be
  // flipped, which is what decides whether a product binding is legal at all —
  // and restoring past that would write a document the composer cannot draw.
  const arrangements = toArrangements(version.arrangements)
  if (arrangements === null) {
    return fail('version_unreadable', 'That version cannot be read back.', 422)
  }

  const errors = blockErrors({ repeats: block.repeats, arrangements })
  if (errors.length > 0) return fail('block_invalid', blockErrorMessage(errors), 422)

  const [updated] = await prisma.$transaction([
    prisma.block.update({
      where: { id: block.id },
      data: { arrangements: arrangements as unknown as Prisma.InputJsonValue },
      select: { id: true, name: true, updatedAt: true },
    }),
    prisma.blockVersion.create({
      data: {
        blockId: block.id,
        arrangements: block.arrangements as Prisma.InputJsonValue,
      },
    }),
  ])

  return ok(updated)
}
