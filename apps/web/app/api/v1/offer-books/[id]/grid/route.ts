import type { NextRequest } from 'next/server'
import type { PageBackground } from '@souqstudio/types'
import { Prisma, prisma } from '@souqstudio/db'
import { pageCountFor } from '@souqstudio/engine'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { loadBlock } from '@/lib/blocks'
import { pageSizeFor, toMasterGrid } from '@souqstudio/designer/lib/offer-book-compose'
import { gridForKind, readGridChoice } from '@/lib/offer-book-grid'
import { backgroundSchema } from '@/lib/offer-book-background'
import {
  MAX_BAND_HEIGHT,
  MAX_GAP,
  MAX_MARGIN,
  MIN_BAND_HEIGHT,
  MIN_BAND_WIDTH,
} from '@/lib/offer-book-layout'

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
 * **One master, and every body page is an instance of it.** Changing anything
 * here changes every page at once: the track counts, the margin, the paper and
 * the bands are the book's, not a page's. A band added here is therefore a
 * *running* header or footer, on every page. One that belongs to page one alone
 * is a pin.
 *
 * **Merging is the exception, and it is not on this route.** A merge belongs to
 * the page an owner made it on — merging the first two cells of page one must
 * leave page two alone — so it is stored on `offer_book_pages` and written by
 * `PATCH .../pages/:index/merges`. This route rebuilds the grid every page
 * starts from; that one says what a single page does with it.
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

const schema = z.object({
  /** Cards across a page. More tracks is what density means now. */
  perRow: z.number().int().min(1).max(6).optional(),
  bodyRows: z.number().int().min(1).max(8).optional(),
  /** Fraction of the page's shorter edge. Zero is full bleed. */
  margin: z.number().min(0).max(MAX_MARGIN).optional(),
  /**
   * The gutter between cards, same units. Zero makes them touch.
   *
   * **Bounded because `resolveTracks` throws rather than clamps.** Gaps that do
   * not fit the page are an exception at render, not a squashed layout, so the
   * ceiling is arithmetic rather than taste — `MAX_GAP` shows the working.
   */
  gap: z.number().min(0).max(MAX_GAP).optional(),
  /**
   * The repeating card every cell draws.
   *
   * **Not nullable, unlike the bands.** A book with no header is a book with no
   * header; a book with no offer card is a book that cannot draw a product.
   * Removing it is not an answer, so "none" is not on the wire.
   */
  cardBlockId: z.string().min(1).max(64).optional(),
  /**
   * How big each band is: height as a fraction of one body row, width as a
   * fraction of the page.
   *
   * **Bounded here as well as clamped in the engine**, and the two are different
   * jobs. These are the bounds the owner's sliders offer, so a value outside
   * them is a request nobody's editor made and is refused; the engine's clamp is
   * what a *stored* oddity renders as, because a book that cannot open is worse
   * than a book with a strange header.
   *
   * Ignored when the band is absent, which needs no guard: `composeGrid` writes
   * no track and no region for a band that does not exist, so a height for one
   * has nothing to land on.
   */
  headerHeight: z.number().min(MIN_BAND_HEIGHT).max(MAX_BAND_HEIGHT).optional(),
  footerHeight: z.number().min(MIN_BAND_HEIGHT).max(MAX_BAND_HEIGHT).optional(),
  headerWidth: z.number().min(MIN_BAND_WIDTH).max(1).optional(),
  footerWidth: z.number().min(MIN_BAND_WIDTH).max(1).optional(),
  /** A running band on every page. `null` removes it. */
  headerBlockId: z.string().min(1).max(64).nullable().optional(),
  footerBlockId: z.string().min(1).max(64).nullable().optional(),
  /** The paper. `null` clears it back to `--sq-tpl-paper`. */
  background: backgroundSchema.nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    // Still named for the track counts: they are what an owner actually chooses
    // in the panel, and a malformed merge is a bug in our own artboard rather
    // than something they can act on.
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
        select: {
          id: true,
          cols: true,
          rows: true,
          gap: true,
          margin: true,
          background: true,
          regions: true,
        },
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
  const card = parsed.data.cardBlockId

  if (bands.length > 0 || card !== undefined) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { planId: true },
    })
    const planId = organization?.planId ?? null

    /*
     * **The same three checks, and the third one inverts.** Tenancy and the
     * plan gate are identical whatever the block is for. What differs is the
     * shape: a band must not repeat, and the offer card must.
     *
     * The card's half of that is not a tidiness rule. A region's fill is
     * decided at load time from the block's own `repeats` — see
     * `pages/[index]/region-blocks/route.ts` — so a panel as the book-wide card
     * turns *every* flowing cell static, and a book whose cells all refuse
     * products places none of them. One cell may hold a panel and that is a
     * feature; every cell holding one is a book with no offers in it.
     */
    for (const [blockId, wants] of [
      ...bands.map((id) => [id, 'band'] as const),
      ...(card === undefined ? [] : [[card, 'card'] as const]),
    ]) {
      const block = await loadBlock(blockId, session.user.organizationId, planId)

      // A seeded block and another organization's are the same answer on
      // purpose. A different message for the second confirms the id exists.
      if (block === null) {
        return fail('block_not_found', 'That block is not one you can use.', 404)
      }
      if (block.locked) {
        return fail('plan_required', 'That block is part of a higher plan. Upgrade to use it.', 403)
      }
      if (wants === 'band' && block.repeats) {
        return fail(
          'block_repeats',
          'That block is an offer card, so it cannot be a header or a footer.',
          422
        )
      }
      if (wants === 'card' && !block.repeats) {
        return fail(
          'block_static',
          'That block shows no product, so it cannot be the card every cell draws.',
          422
        )
      }
    }
  }

  /*
   * **An asset id is an R2 object key, and the key is org-scoped by
   * construction** — `${organizationId}/blocks/${random}`, written by
   * `POST /api/v1/blocks/artwork`. So the tenancy check is a prefix test, and it
   * is the only thing standing between a crafted request and another shop's
   * artwork printed across this book's pages.
   *
   * A prefix test rather than a lookup because there is no table to look in:
   * block artwork has no row of its own, which `lib/block-assets.ts` documents
   * as a deliberate simplification with a note in `docs/E7-pending.md`. The day
   * that table exists this becomes a query, and the check is already in one
   * place to change.
   */
  const background: PageBackground | null | undefined = parsed.data.background
  if (background !== undefined && background !== null && background.from === 'asset') {
    // Both keys: `blur.from` is the unblurred original the editor re-renders
    // from, and it is as much a handle on an object as `assetId` is.
    const keys = [background.assetId, ...(background.blur ? [background.blur.from] : [])]
    if (keys.some((key) => !key.startsWith(`${session.user.organizationId}/`))) {
      return fail('asset_not_found', 'That image is not one of yours.', 404)
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
    ...(parsed.data.gap === undefined ? {} : { gap: parsed.data.gap }),
    ...(card === undefined ? {} : { cardBlockId: card }),
    ...(parsed.data.headerBlockId === undefined
      ? {}
      : { headerBlockId: parsed.data.headerBlockId }),
    ...(parsed.data.footerBlockId === undefined
      ? {}
      : { footerBlockId: parsed.data.footerBlockId }),
    ...(parsed.data.headerHeight === undefined ? {} : { headerHeight: parsed.data.headerHeight }),
    ...(parsed.data.footerHeight === undefined ? {} : { footerHeight: parsed.data.footerHeight }),
    ...(parsed.data.headerWidth === undefined ? {} : { headerWidth: parsed.data.headerWidth }),
    ...(parsed.data.footerWidth === undefined ? {} : { footerWidth: parsed.data.footerWidth }),
    ...(background === undefined ? {} : { background }),
  })

  await prisma.pageGrid.update({
    where: { id: master.id },
    data: {
      cols: grid.cols,
      rows: grid.rows,
      gap: grid.gap,
      margin: grid.margin ?? 0,
      /*
       * **`Prisma.DbNull`, not `null`.** On a `Json?` column Prisma makes you say
       * which null you mean: `JsonNull` stores the JSON value `null` *in* the
       * column, `DbNull` makes the column itself NULL. Only the second is what
       * "this book has no background" means — `readBackground` would read a
       * stored JSON null as an object with no `from` and fall back to paper, so
       * the two would look identical until something queried `IS NULL`.
       *
       * This whole write is a rebuild, so an absent background here is a
       * background the owner cleared and the column has to be cleared with it.
       */
      background:
        grid.background === undefined
          ? Prisma.DbNull
          : (grid.background as unknown as object),
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
    gap: applied.gap ?? grid.gap,
    cardBlockId: applied.cardBlockId ?? null,
    headerBlockId: applied.headerBlockId ?? null,
    footerBlockId: applied.footerBlockId ?? null,
    background: applied.background ?? null,
    pages,
  })
}
