import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { copyName, listBlocks, loadBlock, starterFor } from '@/lib/blocks'

/**
 * The block library. E7.
 *
 * **Owner-authored blocks are the asset that compounds** — a chain designs a
 * seasonal header once and every shop in it uses that header, which is what
 * makes month six cheaper than month one. This is the route that lets one exist.
 *
 * Creating is deliberately *duplication*, never a blank artboard. §3.6: an empty
 * canvas produces something worse than the default and the owner blames the
 * product. A new block therefore starts as a copy of a seeded one, or of another
 * block the organization already has.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /**
   * The block to start from — a seeded id, or one of the organization's own.
   * There is no "blank" branch, and that is the design rather than a gap.
   */
  fromId: z.string().min(1).max(64),
  description: z.string().trim().max(200).optional(),
})

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  return ok(await listBlocks(session.user.organizationId, organization?.planId ?? null))
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // Designing a block changes what every future book in the organization looks
  // like, which is the same bar `PATCH /api/v1/brand` puts on the brand kit: a
  // manager's decision, not an editor's.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Give the block a name and something to start from.')
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })
  const planId = organization?.planId ?? null

  // Two sources, one shape. A seeded block is read from the engine rather than
  // from the database so a copy is of the library that was checked, and an
  // organization's own is read through `loadBlock`, which filters by tenancy.
  const seeded = starterFor(parsed.data.fromId)
  const source =
    seeded === null ? await loadBlock(parsed.data.fromId, session.user.organizationId, planId) : seeded

  if (source === null) {
    return fail('source_not_found', 'That block is not one you can start from.', 404)
  }

  // A plan gate on the *source* and not on authoring: an owner may design as
  // many blocks as they like, and may not use a locked one as a shortcut into a
  // design their plan does not include.
  if ('locked' in source && source.locked) {
    return fail(
      'plan_required',
      'That block is part of a higher plan. Upgrade to start from it.',
      403
    )
  }

  const existing = await prisma.block.findMany({
    where: { organizationId: session.user.organizationId },
    select: { name: true },
  })

  const name =
    parsed.data.name === source.name
      ? copyName(source.name, existing.map((block) => block.name))
      : parsed.data.name

  const block = await prisma.block.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      description: parsed.data.description ?? source.description ?? null,
      repeats: source.repeats,
      // `Arrangement[]` is an interface, and an interface has no implicit index
      // signature, so it is not assignable to Prisma's JSON input type. Same
      // assertion as `lib/brand-kit.ts` and the seed.
      arrangements: source.arrangements as unknown as Prisma.InputJsonValue,
      // A copy starts published: it is already a design that works, and asking
      // an owner to publish something they have not changed yet is a step that
      // teaches nothing.
      status: 'published',
      planTier: 'starter',
    },
    select: { id: true, name: true, repeats: true },
  })

  return ok(block, 201)
}
