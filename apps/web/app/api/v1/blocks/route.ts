import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { BLOCK_OCCASION } from '@souqstudio/engine'
import { MAX_IMPORT, copyName, importName, listBlocks, loadBlock } from '@/lib/blocks'

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

/**
 * Two ways in, and they mean different things.
 *
 * `fromId` **duplicates**: one block, the caller names it, and the response is
 * the block so the client can open it in the designer. That is the action on a
 * block the shop already has.
 *
 * `fromIds` **imports**: several blocks from the seeded library at once, each
 * keeping its own name, and the response is the list. Made a second branch
 * rather than a `fromIds: [one]` call because the naming differs — an imported
 * block is not a copy of anything the owner can see, so it is "Ramadan band"
 * and not "Ramadan band copy". `importName` in `lib/blocks.ts`.
 *
 * There is no "blank" branch in either, and that is the design rather than a
 * gap: an empty artboard produces something worse than the default. §3.6.
 */
const createSchema = z.union([
  z.object({
    name: z.string().trim().min(1).max(80),
    fromId: z.string().min(1).max(64),
    description: z.string().trim().max(200).optional(),
  }),
  z.object({
    fromIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_IMPORT),
  }),
])


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

  if ('fromIds' in parsed.data) {
    return importBlocks(parsed.data.fromIds, session.user.organizationId, planId)
  }

  // **One source, and that is the change.** A seeded block used to be read from
  // the engine — `starterFor` — and an organization's own through `loadBlock`,
  // which meant two shapes reaching this line. A `SeedBlock` has no `locked`
  // field, so the gate below was unreachable on exactly the blocks it exists to
  // gate. `loadBlock` filters by tenancy *and* computes `locked` from the row's
  // plan tier, so both facts now come from one place. See `lib/blocks.ts`.
  const source = await loadBlock(parsed.data.fromId, session.user.organizationId, planId)

  if (source === null) {
    return fail('source_not_found', 'That block is not one you can start from.', 404)
  }

  // A plan gate on the *source* and not on authoring: an owner may design as
  // many blocks as they like, and may not use a locked one as a shortcut into a
  // design their plan does not include.
  if (source.locked) {
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

/**
 * Several blocks from the library, in one request.
 *
 * **Sequential, and the loop is the reason.** Each block's name is decided
 * against the names that already exist *including the ones this import has just
 * added*, so importing two blocks that would land on the same name gives the
 * second one a number rather than a duplicate. Firing them in parallel — or as
 * one `createMany` — would have every name decided against the same stale
 * snapshot, which is how an owner ends up with two rows they cannot tell apart.
 *
 * A source that has gone missing or that the plan does not reach is **skipped
 * and reported**, not fatal. An import of eight blocks failing whole because one
 * of them is plan-gated is a worse answer than seven blocks and a sentence
 * saying which one did not come.
 */
/**
 * The occasion a copy inherits.
 *
 * A seeded source knows its own by id; a shop's own block — one owner copying
 * another of their blocks — carries it on the row already.
 */
function occasionOf(source: { occasion?: string | null | undefined }, fromId: string): string | null {
  return source.occasion ?? BLOCK_OCCASION[fromId] ?? null
}

async function importBlocks(fromIds: readonly string[], organizationId: string, planId: string | null) {
  const existing = await prisma.block.findMany({
    where: { organizationId },
    select: { name: true },
  })
  const names = existing.map((block) => block.name)

  const created: { id: string; name: string }[] = []
  const skipped: string[] = []

  // Duplicates in one request would create two identical blocks from one click.
  for (const fromId of new Set(fromIds)) {
    const source = await loadBlock(fromId, organizationId, planId)

    if (source === null || source.locked) {
      skipped.push(fromId)
      continue
    }

    const name = importName(source.name, names)
    names.push(name)

    const block = await prisma.block.create({
      data: {
        organizationId,
        name,
        description: source.description ?? null,
        repeats: source.repeats,
        // `Arrangement[]` is an interface with no implicit index signature, so
        // it is not assignable to Prisma's JSON input type. Same assertion as
        // `lib/brand-kit.ts` and the seed.
        arrangements: source.arrangements as unknown as Prisma.InputJsonValue,
        // A copy starts published: it is already a design that works.
        status: 'published',
        planTier: 'starter',
        // **Carried, not dropped.** The copy gets a new cuid, so the id → occasion
        // map in the engine cannot recognise it — without these two fields an
        // imported Ramadan band is an ordinary block, and the composer has
        // nothing to promote in the week it matters.
        isSeasonal: 'isSeasonal' in source ? (source.isSeasonal ?? false) : false,
        occasion: occasionOf('occasion' in source ? source : {}, fromId),
      },
      select: { id: true, name: true },
    })
    created.push(block)
  }

  if (created.length === 0) {
    return fail('source_not_found', 'None of those blocks could be added.', 404)
  }

  return ok({ created, skipped }, 201)
}
