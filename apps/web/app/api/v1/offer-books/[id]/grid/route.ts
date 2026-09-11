import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { pageCountFor } from '@souqstudio/engine'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { loadBlock } from '@/lib/blocks'
import { pageSizeFor, toMasterGrid } from '@/lib/offer-book-compose'
import { gridForKind, readGridChoice } from '@/lib/offer-book-grid'
import { MAX_MARGIN } from '@/lib/offer-book-layout'

/**
 * The master grid — the cards across and down, the page margin, and the header
 * and footer bands. E6-07, the composition model §4.3, and
 * `docs/E6-create-flow.md` §5.1.
 *
 * **Density is not a setting.** It is the consequence of track count at a given
 * page size: a 2×2 page *is* showcase and a 5×6 page *is* dense, and two
 * controls that can disagree is one too many. So this changes the tracks and
 * the density follows, rather than the other way round.
 *
 * **One master, and every body page is an instance of it.** Changing it changes
 * every page at once, which is what anybody actually wants — nobody hand-merges
 * cells nine times. A band added here is therefore a *running* header or footer,
 * on every page. One that belongs to page one alone is a pin.
 *
 * **Every field is optional, and absent means unchanged.** The grid is rebuilt
 * from scratch on each edit, because hand-patching tracks and regions in place
 * is how a grid ends up internally inconsistent — but a rebuild that only knows
 * what this request said would discard everything the owner decided earlier.
 * `readGridChoice` reads the stored grid back into the choice that made it, this
 * applies the delta, and `gridForKind` rebuilds.
 *
 * That seam is not hypothetical. Until it existed this route called
 * `bookletGrid({ perRow, bodyRows })` and nothing else, so **changing the number
 * of cards across a page silently reset the offer card to `blk_offer_card` and
 * gave a square post a footer band it had never had.**
 *
 * **Region ids change with the track count, and the orphaned nudges are meant
 * to be orphaned.** A region is named for its position among the *cards*, so
 * going from three across to four gives different regions; a nudge made against
 * the old layout describes a card that no longer exists, and `findOverride`
 * simply does not match it. That is the failure mode the key was chosen for.
 * Adding or removing a band does *not* renumber anything — `offerRegions` takes
 * a row offset precisely so a masthead does not orphan every nudge in the book.
 */

/**
 * `null` is a real value here and means "remove this band", which is why these
 * are `.nullable().optional()` rather than merely optional. Absent is "leave it
 * as it is". Zod keeps the two apart and so does everything downstream.
 */
const schema = z.object({
  /** Cards across a page. More tracks is what density means now. */
  perRow: z.number().int().min(1).max(6).optional(),
  bodyRows: z.number().int().min(1).max(8).optional(),
  /** Fraction of the page's shorter edge. Zero is full bleed. */
  margin: z.number().min(0).max(MAX_MARGIN).optional(),
  /** A running band on every page. `null` removes it. */
  headerBlockId: z.string().min(1).max(64).nullable().optional(),
  footerBlockId: z.string().min(1).max(64).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Choose between 1 and 6 across, and up to 8 down.', 422)
  }

  const book = await prisma.offerBook.findFirst({
    where: { id: params.id, shop: { organizationId: session.user.organizationId } },
    select: {
      id: true,
      format: true,
      language: true,
      _count: { select: { offers: true } },
      grids: {
        where: { role: 'master' },
        // The whole document now, not just the id: rebuilding needs to know
        // what it is rebuilding *from*.
        select: { id: true, cols: true, rows: true, gap: true, margin: true, regions: true },
        take: 1,
      },
      pins: {
        select: {
          id: true,
          pageIndex: true,
          blockId: true,
          colStart: true,
          colEnd: true,
          rowStart: true,
          rowEnd: true,
        },
      },
    },
  })
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  const master = book.grids[0]
  if (master === undefined) {
    // A book with no master cannot be laid out at all, and creation writes one
    // in the same transaction — so this is a corrupt row rather than something
    // an owner can fix by choosing a different number.
    return fail('no_master_grid', 'This book has no layout to change.', 409)
  }

  /*
   * **A band's block id is resolved against the session before it can reach a
   * grid.** It arrives from a client and could name another organization's
   * block, one behind a higher plan, or a *repeating* card — and a repeating
   * block in a static band reads an offer it was never given and draws an empty
   * card across the top of every page. `gridForKind` has no session and no block
   * table to judge any of that with; it would write the id into
   * `page_grids.regions` and the problem would surface at render.
   */
  const bands = [parsed.data.headerBlockId, parsed.data.footerBlockId].filter(
    (id): id is string => typeof id === 'string'
  )

  if (bands.length > 0) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { planId: true },
    })
    const planId = organization?.planId ?? null

    for (const blockId of bands) {
      const block = await loadBlock(blockId, session.user.organizationId, planId)

      // A seeded block and another organization's are the same answer on
      // purpose. A different message for the second confirms the id exists.
      if (block === null) {
        return fail('block_not_found', 'That block is not one you can use.', 404)
      }
      if (block.locked) {
        return fail('plan_required', 'That block is part of a higher plan. Upgrade to use it.', 403)
      }
      if (block.repeats) {
        return fail(
          'block_repeats',
          'That block is an offer card, so it cannot be a header or a footer.',
          422
        )
      }
    }
  }

  const current = readGridChoice(book.format, toMasterGrid(master))

  const grid = gridForKind({
    ...current,
    // Absent leaves what was read. `null` on a band is a removal and must
    // survive the spread, which is why each is tested against `undefined`
    // rather than merged with `??`.
    ...(parsed.data.perRow === undefined ? {} : { perRow: parsed.data.perRow }),
    ...(parsed.data.bodyRows === undefined ? {} : { bodyRows: parsed.data.bodyRows }),
    ...(parsed.data.margin === undefined ? {} : { margin: parsed.data.margin }),
    ...(parsed.data.headerBlockId === undefined
      ? {}
      : { headerBlockId: parsed.data.headerBlockId }),
    ...(parsed.data.footerBlockId === undefined
      ? {}
      : { footerBlockId: parsed.data.footerBlockId }),
  })

  await prisma.pageGrid.update({
    where: { id: master.id },
    data: {
      cols: grid.cols,
      rows: grid.rows,
      gap: grid.gap,
      margin: grid.margin ?? 0,
      regions: grid.regions as unknown as object[],
    },
  })

  // The number the owner actually cares about, because it is the print bill.
  // Computed by the same function the flow uses, so what this promises and what
  // they get cannot differ.
  //
  // **Pins that no longer fit are dropped from the count, not from the book.**
  // `flowBook` reports them as invalid rather than silently discarding them,
  // and the editor is where an owner is told; a brand ad that vanishes is one
  // the shop believes it printed.
  const pages = pageCountFor({
    master: grid,
    offerIds: Array.from({ length: book._count.offers }, (_, index) => `off_${index}`),
    pins: book.pins,
    page: pageSizeFor(book.format),
    direction: book.language === 'ar' ? 'rtl' : 'ltr',
  })

  const applied = readGridChoice(book.format, grid)

  return ok({
    perRow: applied.perRow ?? grid.cols.length,
    bodyRows: applied.bodyRows ?? 1,
    margin: applied.margin ?? 0,
    headerBlockId: applied.headerBlockId ?? null,
    footerBlockId: applied.footerBlockId ?? null,
    pages,
  })
}
