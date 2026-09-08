import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { bookletGrid, pageCountFor } from '@souqstudio/engine'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { pageSizeFor } from '@/lib/offer-book-compose'

/**
 * The master grid — how many cards across, how many down. E6-07, and the
 * composition model §4.3.
 *
 * **Density is not a setting.** It is the consequence of track count at a given
 * page size: a 2×2 page *is* showcase and a 5×6 page *is* dense, and two
 * controls that can disagree is one too many. So this changes the tracks and
 * the density follows, rather than the other way round.
 *
 * **One master, and every body page is an instance of it.** Changing it changes
 * every page at once, which is what anybody actually wants — nobody hand-merges
 * cells nine times.
 *
 * **Region ids change with the track count, and the orphaned nudges are meant
 * to be orphaned.** `bookletGrid` names a region for its position, so going
 * from three across to four gives different regions; a nudge made against the
 * old layout describes a card that no longer exists, and `findOverride` simply
 * does not match it. That is the failure mode the key was chosen for.
 */

const schema = z.object({
  /** Cards across a page. More tracks is what density means now. */
  perRow: z.number().int().min(1).max(6),
  bodyRows: z.number().int().min(1).max(8),
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
      grids: { where: { role: 'master' }, select: { id: true }, take: 1 },
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

  const grid = bookletGrid({ perRow: parsed.data.perRow, bodyRows: parsed.data.bodyRows })

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

  return ok({ perRow: parsed.data.perRow, bodyRows: parsed.data.bodyRows, pages })
}
