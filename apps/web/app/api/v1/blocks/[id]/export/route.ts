import type { NextRequest } from 'next/server'
import { BLOCK_CATEGORIES, usesOnlyRoles, type BlockCategory } from '@souqstudio/engine'
import { prisma } from '@souqstudio/db'
import { fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { arrangementsSchema } from '@/lib/block-document'
import { loadBlock } from '@/lib/blocks'

/**
 * One block, as a document the library can load. E7 —
 * `docs/block-library-from-r2.md` §8 step 3.
 *
 * **What this closes is a gap between two halves of one job.** The designer at
 * `/card-designer/[blockId]` is where a design is drawn. `packages/engine/blocks`
 * is where a design that everybody should get is kept. Until this route there
 * was no way from the first to the second except reading JSONB out of the
 * database by hand and reshaping it, which is the kind of step that means a
 * design good enough to ship stays in one shop's library instead.
 *
 * Draw it in the designer, export it, drop the file in the folder, deploy. That
 * is one workflow. It is also the workflow that keeps working if the folder ever
 * becomes a bucket — the bytes this returns are the loader's input either way,
 * which is why this step is worth taking before any decision about R2 rather
 * than after one.
 *
 * **The response is the file, not the envelope**, and that is a deliberate
 * exception to the `{ data, error }` convention every other route follows. The
 * point of this route is bytes that can be saved straight into the library; a
 * wrapped document would have to be unwrapped by hand first, which is exactly
 * the friction being removed. Failures still use the envelope — a failure is
 * not a file.
 */

/**
 * Validated on the way *out*.
 *
 * A row got into `blocks` through `PATCH`, which validates, so this should
 * never refuse. It refuses anyway, because the seeded library has two rules an
 * owner's own block is deliberately not held to, and an owner exporting their
 * design is asking for it to become a seeded block:
 *
 * - **Every colour a role.** The designer lets an owner pick a hex or a palette
 *   entry — their block, their shop, their call. A block in the library has not
 *   met the shop that will load it, so a literal there is a design that stops
 *   looking like whichever account gets it.
 * - **A public id.** An owner's block is a cuid. An id in the library is
 *   permanent: the seed upserts on it and a live book names it inside its page
 *   grid as plain JSON. Handing over the cuid would make a meaningless string
 *   permanent.
 *
 * Refusing here, with the reason, is what turns both into something the person
 * who drew the block can fix. Discovering them at load time means a deploy fails
 * instead.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  // Tenancy and the plan gate both come from here — the same read the copy
  // routes make. A seeded block and another organization's are the same answer.
  const block = await loadBlock(params.id, session.user.organizationId, organization?.planId ?? null)
  if (block === null) return fail('not_found', 'That block does not exist.', 404)

  if (block.locked) {
    return fail('plan_required', 'That block is part of a higher plan.', 403)
  }

  const arrangements = arrangementsSchema.safeParse(block.arrangements)
  if (!arrangements.success) {
    // The row is corrupt rather than the request wrong: nothing that validates
    // on the way in can fail here.
    return fail(
      'block_invalid',
      'This block cannot be exported as it is. Open it in the designer and save it again.',
      422
    )
  }

  if (!usesOnlyRoles(arrangements.data)) {
    return fail(
      'colors_not_roles',
      'This block names a colour directly. A block in the shared library is drawn in whichever shop loads it, so every colour has to be a role from the brand kit — swap the fixed colours for roles and export again.',
      422
    )
  }

  const category = categoryFrom(request, block.category, block.repeats)
  if (category === null) {
    return fail(
      'invalid_request',
      `Say which group this belongs to: ${BLOCK_CATEGORIES.join(', ')}.`
    )
  }

  const id = publicId(block.id, block.name)
  if (id === null) {
    return fail(
      'invalid_request',
      'Give the block a name with some letters in it before exporting — the name becomes its permanent id in the library.'
    )
  }

  const document = {
    id,
    name: block.name,
    description: block.description ?? '',
    repeats: block.repeats,
    category,
    // No dates travel with it. Ramadan and both Eids move about eleven days a
    // year against the Gregorian calendar, so the window is computed from the
    // occasion rather than frozen onto the document. `src/seasonal.ts`.
    isSeasonal: block.isSeasonal,
    arrangements: arrangements.data,
  }

  return new Response(`${JSON.stringify(document, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}.json"`,
      // A document is a snapshot of a row that is still being edited.
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Which group it goes in.
 *
 * A seeded block already knows. A block the shop authored does not and needs
 * not — theirs are listed separately — so exporting one is the moment somebody
 * has to say. `?category=` is that, and the fallback reads `repeats`, which is
 * the one distinction the schema actually makes: a block rendered once per
 * offer is an offer card, and a block placed once is a panel until told
 * otherwise.
 */
function categoryFrom(
  request: NextRequest,
  known: BlockCategory | null,
  repeats: boolean
): BlockCategory | null {
  const asked = request.nextUrl.searchParams.get('category')
  if (asked !== null) {
    return (BLOCK_CATEGORIES as readonly string[]).includes(asked) ? (asked as BlockCategory) : null
  }
  if (known !== null) return known
  return repeats ? 'offer-card' : 'panel'
}

/**
 * The id the document will carry for ever.
 *
 * A seeded block already has one and keeps it — exporting one is how a shipped
 * design gets edited, and changing the id would make the result a second block
 * rather than a correction of the first.
 *
 * An owner's block has a cuid, which is a database key and not a name. The name
 * they gave it is, so it becomes `blk_` plus that, in the shape the loader
 * accepts. Whoever adds the file can still rename it before they commit; what
 * matters is that the export never hands over a string that means nothing.
 */
function publicId(id: string, name: string): string | null {
  if (/^blk_[a-z0-9_]+$/.test(id)) return id

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return slug === '' ? null : `blk_${slug}`
}
