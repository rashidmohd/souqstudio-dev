import type { NextRequest } from 'next/server'
import { Prisma, prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { loadBlock } from '@/lib/blocks'

/**
 * What one cell of one page draws.
 *
 * **Every flowing cell drew the book's offer card until now.** Merging changed a
 * cell's *shape* and the card re-laid itself out through `pickArrangement`,
 * which is not the same as putting something different in it — an owner wants a
 * brand block in the top-left cell, and a hero that is a different design rather
 * than the same design stretched.
 *
 * **The engine needed nothing.** `Region.blockId` has been per region since the
 * composition model was written and `flowBook` renders whatever a region names.
 * What was missing was somewhere to author it that a grid rebuild would not
 * flatten — `PATCH .../grid` rebuilds the master from scratch, and
 * `readGridChoice` reads the card off the first flowing region precisely because
 * it assumes they all agree. So this lives on the page.
 *
 * **A cell holding a block that does not repeat stops taking a product**, and
 * the products route around it: the offer that was there moves to the next cell,
 * and the book grows by a page rather than losing it. That is the rule pins have
 * followed since they were built, reached by a different gesture. The `fill` is
 * decided at *load* time from the block's own `repeats`, not stored here, so a
 * block cannot be contradicted by a stale copy of what it was.
 *
 * **The whole map for that page, never one cell.** Two tabs assigning blocks
 * against different starting states would interleave into a page neither owner
 * laid out — the same reasoning the offer tray's reorder and this page's merges
 * both use.
 */

const schema = z.object({
  /** Region id → block id. An absent id means the cell draws the book's card. */
  blocks: z.record(
    z.string().min(1).max(64),
    z.string().min(1).max(64)
  ),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; index: string } }
) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const pageIndex = Number(params.index)
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 999) {
    return fail('invalid_page', 'That page is not part of this book.', 422)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'That design could not be applied.', 422)
  }

  const entries = Object.entries(parsed.data.blocks)
  // Forty-eight is the largest grid the layout route allows, so nothing can name
  // more cells than the page has.
  if (entries.length > 48) {
    return fail('invalid_request', 'That is more cells than a page has.', 422)
  }

  const book = await prisma.offerBook.findFirst({
    where: { id: params.id, shop: { organizationId: session.user.organizationId } },
    select: { id: true },
  })
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  /*
   * **Every block id is resolved against the session before it can reach a
   * page.** It arrives from a client and could name another organization's
   * block or one behind a higher plan. The grid route makes exactly this check
   * for a band, and for the same reason: nothing downstream has a session to
   * judge it with, so the id would be written and the problem would surface at
   * render — as another shop's design printed in this book.
   *
   * Unlike a band, a *repeating* block is allowed here. A cell is where a
   * repeating card belongs; it is the non-repeating ones that change what the
   * cell does, and that is a feature rather than a refusal.
   */
  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })
  const planId = organization?.planId ?? null

  for (const [, blockId] of entries) {
    const block = await loadBlock(blockId, session.user.organizationId, planId)

    // A seeded block and another organization's are the same answer on purpose.
    // A different message for the second confirms the id exists.
    if (block === null) {
      return fail('block_not_found', 'That block is not one you can use.', 404)
    }
    if (block.locked) {
      return fail('plan_required', 'That block is part of a higher plan. Upgrade to use it.', 403)
    }
  }

  const blocks = Object.fromEntries(entries)

  await prisma.offerBookPage.upsert({
    where: { bookId_index: { bookId: book.id, index: pageIndex } },
    create: {
      bookId: book.id,
      index: pageIndex,
      regionBlocks: blocks as unknown as Prisma.InputJsonValue,
    },
    update: { regionBlocks: blocks as unknown as Prisma.InputJsonValue },
  })

  return ok({ pageIndex, blocks })
}
