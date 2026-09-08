import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { toMasterGrid } from '@/lib/offer-book-compose'

/**
 * Pins — a static block parked at a position in the flow. Composition model §6.
 *
 * **A pin targets a position, not a card, and that is the entire point.** A
 * replacement targets a card, and next week that card holds a different product,
 * so the edit is meaningless or lost. With fifteen more products next week the
 * brand ad is still on page 2 in the same two cells.
 *
 * **Displace, never consume.** Pinning a message at post 5 of a ten-product
 * carousel produces eleven posts, not ten with a product dropped — silently
 * dropping a product from an offer book is the class of bug that reaches print.
 * `flowBook` already does this; the route only has to not undo it.
 *
 * **Only a block that does not repeat may be pinned.** A repeating block renders
 * once per offer and reads the offer it was given; pinned into a position that
 * carries no product, every product field on it would resolve to nothing and
 * the owner would get a blank card where they put a brand ad.
 */

/**
 * How much of the page the pin takes, rather than four coordinates.
 *
 * The composition model is explicit that an owner should not be asked for
 * columns and rows as numbers, and a pin form is exactly where that temptation
 * lands. Three shapes cover what anyone actually pins: a band across a row, half
 * a row, and the whole page — the last of which, in a 1×1 carousel grid, *is* a
 * cell pin. Same mechanic, no special case for social.
 */
const schema = z.object({
  pageIndex: z.number().int().min(0).max(199),
  blockId: z.string().min(1).max(64),
  span: z.enum(['row', 'half-row', 'page']),
  /** Which row the band sits on. Ignored for a whole-page pin. */
  row: z.number().int().min(0).max(7).default(0),
})

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const book = await prisma.offerBook.findFirst({
    where: { id: params.id, shop: { organizationId: session.user.organizationId } },
    select: {
      pins: {
        orderBy: [{ pageIndex: 'asc' }, { rowStart: 'asc' }],
        select: {
          id: true,
          pageIndex: true,
          colStart: true,
          colEnd: true,
          rowStart: true,
          rowEnd: true,
          block: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  return ok(book.pins)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', 'Choose a panel and where it goes.', 422)
  }

  const book = await prisma.offerBook.findFirst({
    where: { id: params.id, shop: { organizationId: session.user.organizationId } },
    select: {
      id: true,
      grids: {
        where: { role: 'master' },
        select: { cols: true, rows: true, gap: true, margin: true, regions: true },
        take: 1,
      },
    },
  })
  if (book === null) return fail('not_found', 'That offer book does not exist.', 404)

  const gridRow = book.grids[0]
  if (gridRow === undefined) return fail('no_master_grid', 'This book has no layout.', 409)
  const master = toMasterGrid(gridRow)

  // Seeded blocks and the organization's own are both pinnable — the nullable
  // column is what makes a block seeded — but another tenant's is not.
  const block = await prisma.block.findFirst({
    where: {
      id: parsed.data.blockId,
      OR: [{ organizationId: null }, { organizationId: session.user.organizationId }],
    },
    select: { id: true, repeats: true, name: true },
  })
  if (block === null) return fail('not_found', 'That block is not one you can use.', 404)

  if (block.repeats) {
    return fail(
      'block_repeats',
      'That block draws one product at a time, so it cannot be pinned. Pick a header, a footer or a message.',
      422
    )
  }

  const span = spanFor(parsed.data.span, parsed.data.row, master.cols.length, master.rows.length)

  const pin = await prisma.$transaction(async (tx) => {
    // Two pins over the same cells would fight for the position, and the engine
    // resolves that by whichever it walked first — an answer nobody chose.
    const clash = await tx.bookPin.findFirst({
      where: {
        bookId: book.id,
        pageIndex: parsed.data.pageIndex,
        colStart: { lte: span.colEnd },
        colEnd: { gte: span.colStart },
        rowStart: { lte: span.rowEnd },
        rowEnd: { gte: span.rowStart },
      },
      select: { id: true },
    })
    if (clash !== null) return null

    return tx.bookPin.create({
      data: { bookId: book.id, blockId: block.id, pageIndex: parsed.data.pageIndex, ...span },
      select: { id: true },
    })
  })

  if (pin === null) {
    return fail('pin_overlaps', 'Something is already pinned there.', 409)
  }

  return ok(pin, 201)
}

/**
 * The cells a shape takes, given the grid it lands in.
 *
 * Logical and inclusive, the same convention a region uses — `colStart` is the
 * reading-order start, so an Arabic edition mirrors the pin with the rest of the
 * page and there is no second layout to author.
 */
function spanFor(
  shape: 'row' | 'half-row' | 'page',
  row: number,
  cols: number,
  rows: number
): { colStart: number; colEnd: number; rowStart: number; rowEnd: number } {
  if (shape === 'page') {
    return { colStart: 0, colEnd: cols - 1, rowStart: 0, rowEnd: rows - 1 }
  }

  // The last row of a booklet grid is the footer band, so a body row is bounded
  // one short of it. A pin over the footer would displace nothing and cover the
  // shop's own details.
  const bodyRows = Math.max(1, rows - 1)
  const rowIndex = Math.min(Math.max(row, 0), bodyRows - 1)
  const half = Math.max(1, Math.ceil(cols / 2))

  return {
    colStart: 0,
    colEnd: shape === 'row' ? cols - 1 : half - 1,
    rowStart: rowIndex,
    rowEnd: rowIndex,
  }
}
