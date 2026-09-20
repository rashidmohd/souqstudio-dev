import { OFFER_TYPE_CHIP_KIND } from '@/lib/offer-types'
import 'server-only'

import { adoptRowsIntoCatalog } from '@/lib/catalog'
import type { BookCover } from '@/lib/offer-book-compose'
import { prisma } from '@souqstudio/db'
import {
  arrangementCovers,
  flowBook,
  validateGrid,
  type CellSpan,
  type FlowPage,
  type RegionBlock,
} from '@souqstudio/engine'
import type { Block, PageBackground, PageGrid, Pin, SlotOverride } from '@souqstudio/types'
import { KIND_SPEC, type BookKind } from '@/lib/book-kind'
import { autoTitle } from '@/lib/book-title'
import {
  composeOffer,
  type CurrencyPresentation,
  pageSizeFor,
  toMasterGrid,
  type ComposedOffer,
  type Edition,
} from '@/lib/offer-book-compose'
import { readPageBackground } from '@/lib/offer-book-background'
import { gridForKind, readGridChoice } from '@/lib/offer-book-grid'
import { readOverrides } from '@/lib/offer-book-overrides'
import { publicUrl } from '@/lib/r2'
import { randomBytes } from 'node:crypto'

/**
 * Reading an offer book and composing its pages. E6.
 *
 * **The first thing in the product that runs the layout engine over database
 * rows.** Everything the engine composes today comes from literals — the
 * harness's `dummy.ts`, its exported catalog snapshot, or `PREVIEW_PRODUCT` on
 * `/brand`. `offer_books` has held zero rows since it was created and nothing
 * could put one there, so the composition model has never been checked against
 * the schema that was migrated for it.
 *
 * One query layer that the editor screen and the API route both call, the same
 * way `lib/catalog.ts` serves `/catalog`: a server component holding the
 * organization should not fetch its own endpoint over HTTP to reach a database
 * it is already connected to.
 *
 * `server-only`, and the pure half lives in `lib/offer-book-compose.ts` — see
 * the note there.
 */

export interface ComposedBook {
  id: string
  title: string
  format: string
  status: string
  edition: Edition
  page: { width: number; height: number }
  offers: ComposedOffer[]
  /** Keyed by id, because a placement names its block and the renderer resolves
   *  it — the same seam `page_grids` uses by not carrying a relation. */
  blocks: Record<string, Block>
  pages: FlowPage[]
  /** The pinned panels, as the engine received them. Composition model §6. */
  pins: Pin[]
  /**
   * The master grid as a set of choices, which is what the layout panel edits.
   *
   * **Track counts are what "density" now means** — §4.3 — and the bands are
   * what the owner can add, swap or take away. `bodyRows` counts rows of *cards*
   * and excludes either band, so it is not simply `rows.length`.
   *
   * `readGridChoice` derives all of it from the stored regions rather than from
   * a second copy kept on the book: a `page_grids` row already says which block
   * each region draws, and the copy nothing renders from is the one that goes
   * stale.
   */
  layout: {
    perRow: number
    bodyRows: number
    /** Fraction of the page's shorter edge. Zero is full bleed. */
    margin: number
    /** The gutter between cards, same units. Zero makes them touch. */
    gap: number
    /** The running band at the top of every page, or null for none. */
    headerBlockId: string | null
    footerBlockId: string | null
    /** The paper behind every card. Null is `--sq-tpl-paper`, which is what
     *  every book drew before this existed. */
    background: PageBackground | null
    /**
     * Whether the offer card actually has a design for the shape this layout
     * gives its cells.
     *
     * **False means the page renders and renders wrong.** `pickArrangement`
     * falls back to the nearest range rather than failing, so a card designed
     * tall is stretched into a square cell with no error anywhere. The seeded
     * cards carry `TALL` and `WIDE` and nothing between, and an owner reaches
     * the gap from the layout panel — adding a header band to a story costs the
     * body a row's worth of height and lands it at 0.914.
     *
     * Reported so the panel can say so while the owner is changing it. Nothing
     * refuses to draw. `docs/E6-create-flow.md` §7.
     */
    cardFits: boolean
    /** The aspect that was judged, for a message that can be specific. */
    cellAspect: number | null
    /** The repeating card every cell draws unless an owner changed that cell. */
    cardBlockId: string | null
  }
  /**
   * The pages that carry their own paper, by page index.
   *
   * **An absent key and a `null` value are different answers.** Absent is "this
   * page draws the book's background"; `null` is "this page is plain paper,
   * whatever the book says". Without the second an owner could set a background
   * on a book and never take it off one page.
   */
  pageBackgrounds: Record<number, PageBackground | null>
  /**
   * The bounded nudges an owner has made, by page index. E6-04.
   *
   * Read here rather than applied here: the engine's output is what the export
   * worker and the editor both start from, and a book whose stored geometry
   * already had the deltas baked in could never have them reset.
   */
  overrides: Record<number, SlotOverride[]>
  /** Authoring problems in the master grid. Never thrown: an overlapping region
   *  is something an owner can see and fix, and refusing to open the book would
   *  leave them no way to. */
  gridProblems: ReturnType<typeof validateGrid>
}

/**
 * Load a book and flow it into pages.
 *
 * **`organizationId` is a filter, not a check after the fact.** The shop is
 * joined through to its organization in the same query, so a book belonging to
 * another tenant returns null rather than returning rows that are then
 * compared — the rule the root `CLAUDE.md` states as never trusting a
 * client-sent organization id, applied at the query rather than at the caller.
 */
export async function loadBook(
  bookId: string,
  organizationId: string
): Promise<ComposedBook | null> {
  const book = await prisma.offerBook.findFirst({
    where: { id: bookId, shop: { organizationId } },
    select: {
      id: true,
      title: true,
      format: true,
      status: true,
      language: true,
      // How this shop writes its currency. The *code* is on each offer, frozen
      // with the book; whether a card prints that code or a symbol is a shop
      // setting and is read live, because it is presentation rather than price.
      shop: { select: { currencyDisplay: true, currencySymbol: true } },
      grids: {
        where: { role: 'master' },
        select: { cols: true, rows: true, gap: true, margin: true, background: true, regions: true },
        take: 1,
      },
      pages: {
        select: {
          index: true,
          slotOverrides: true,
          merges: true,
          background: true,
          regionBlocks: true,
        },
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
      offers: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          price: true,
          comparePrice: true,
          currency: true,
          promoTierId: true,
          unitPriceMode: true,
          unitPriceValue: true,
          unitPriceUnit: true,
          legalLines: true,
          promoTier: {
            select: { id: true, labelEn: true, labelAr: true, tokenRef: true },
          },
          chips: {
            orderBy: { id: 'asc' },
            // `kind` travels so the panel can tell the offer's mechanic from a
            // note beside it — one control, one value, a replace-not-append
            // write. `lib/offer-types.ts`.
            select: { id: true, labelEn: true, labelAr: true, anchor: true, kind: true },
          },
          footnotes: {
            orderBy: { id: 'asc' },
            select: { id: true, textEn: true, textAr: true, scope: true },
          },
          items: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              position: true,
              connector: true,
              nameOverrideEn: true,
              nameOverrideAr: true,
              specOverrideEn: true,
              specOverrideAr: true,
              product: {
                select: {
                  // E8-05's manual cutout acts on this row, so the panel needs
                  // to be able to name it.
                  id: true,
                  nameEn: true,
                  nameAr: true,
                  specEn: true,
                  specAr: true,
                  brandEn: true,
                  brandAr: true,
                  // The three pack columns, for the derived unit price. E5 §4.
                  packSize: true,
                  packUnit: true,
                  packCount: true,
                  images: {
                    /**
                     * Every candidate; `pickImage` decides. Same precedence as
                     * `IMAGE_PICK` in `lib/catalog.ts` — an approved CUTOUT
                     * first, then the newest of anything else.
                     *
                     * **It used to be `orderBy: { kind: 'asc' }` and that was
                     * backwards.** `kind` is a Postgres enum, and Postgres sorts
                     * an enum column by its *declaration* order — which is
                     * ORIGINAL, CUTOUT, THUMB. So ascending put the ORIGINAL
                     * first and a product with a perfectly good cutout was drawn
                     * with its background still on, and flagged `fallback-image`
                     * in the panel, with no way for the owner to clear it.
                     * Nothing in a test could see it: the composer is pure and
                     * takes the row it is handed.
                     *
                     * Picked in code rather than re-ordered, because the fix
                     * `desc` would be depends on that same declaration order —
                     * one reordered enum away from breaking the same way again.
                     */
                    /*
                     * **Approved, or this shop's own contribution.** A photo a
                     * shop supplied for a universal product sits PENDING until
                     * a reviewer promotes it, and `APPROVED` alone would mean
                     * the owner uploads a packshot, sees the flag clear in the
                     * catalog, opens their book and finds the placeholder
                     * still there. `imageVisibility` in `lib/catalog.ts` makes
                     * the same allowance in SQL; this is its Prisma half.
                     */
                    where: {
                      kind: { not: 'THUMB' },
                      OR: [
                        { reviewState: 'APPROVED' },
                        { contributedBy: organizationId, reviewState: 'PENDING' },
                      ],
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { kind: true, r2Key: true, contributedBy: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (book === null) return null

  const gridRow = book.grids[0]
  if (gridRow === undefined) {
    // A book with no master grid cannot be laid out at all. This is a corrupt
    // row rather than an authoring mistake — creation writes the grid in the
    // same transaction as the book.
    throw new Error(`loadBook: book "${bookId}" has no master grid`)
  }

  const edition: Edition = book.language === 'ar' ? 'ar' : 'en'
  const master = toMasterGrid(gridRow)
  // What the owner chose, read back off the regions. The layout panel edits
  // this, and `PATCH .../grid` reads the same thing so an edit changes one field
  // and preserves the rest. `lib/offer-book-grid.ts`.
  const choice = readGridChoice(book.format, master)
  const page = pageSizeFor(book.format)

  const currency: CurrencyPresentation = {
    display: book.shop.currencyDisplay === 'SYMBOL' ? 'SYMBOL' : 'CODE',
    symbol: book.shop.currencySymbol,
  }

  const offers = book.offers.map((offer) =>
    composeOffer(
      {
        id: offer.id,
        position: offer.position,
        // Prisma returns Decimal; the price mark splits a string, and going
        // through a float to display money is the one place a rounding error
        // could enter. Same reasoning as `formatPackSize`.
        price: offer.price.toString(),
        comparePrice: offer.comparePrice === null ? null : offer.comparePrice.toString(),
        currency: offer.currency,
        promoTierId: offer.promoTierId,
        unitPriceMode: offer.unitPriceMode,
        // Decimal(10,3) arrives as a Decimal; the rate stays text the whole way
        // to the card, exactly as the price does.
        unitPriceValue: offer.unitPriceValue === null ? null : offer.unitPriceValue.toString(),
        unitPriceUnit: offer.unitPriceUnit,
        legalLines: offer.legalLines,
        chips: offer.chips,
        footnotes: offer.footnotes,
        items: offer.items.map((item) => {
          const image = pickImage(item.product.images, organizationId)
          return {
            id: item.id,
            position: item.position,
            connector: item.connector,
            nameOverrideEn: item.nameOverrideEn,
            nameOverrideAr: item.nameOverrideAr,
            specOverrideEn: item.specOverrideEn,
            specOverrideAr: item.specOverrideAr,
            product: {
              id: item.product.id,
              nameEn: item.product.nameEn,
              nameAr: item.product.nameAr,
              specEn: item.product.specEn,
              specAr: item.product.specAr,
              brandEn: item.product.brandEn,
              brandAr: item.product.brandAr,
              packSize: item.product.packSize === null ? null : item.product.packSize.toString(),
              packUnit: item.product.packUnit,
              packCount: item.product.packCount,
              imageUrl: image ? publicUrl(image.r2Key) : null,
              imageIsFallback: image !== undefined && image.kind !== 'CUTOUT',
            },
          }
        }),
      },
      offer.promoTier,
      edition,
      currency
    )
  )

  const pins: Pin[] = book.pins.map((pin) => ({
    id: pin.id,
    pageIndex: pin.pageIndex,
    blockId: pin.blockId,
    colStart: pin.colStart,
    colEnd: pin.colEnd,
    rowStart: pin.rowStart,
    rowEnd: pin.rowEnd,
  }))

  /**
   * What each page does with the master, by page index.
   *
   * **Read here and applied by the engine**, never baked into the stored grid:
   * the master is one region per cell and stays that way, so a page with no row
   * of its own simply draws it. That is what lets page one hold a hero and page
   * two not.
   */
  const merges: Record<number, CellSpan[]> = {}
  /**
   * The pages that have said something about their own paper.
   *
   * **Only the ones that have.** A page with no entry draws the book's
   * background, and a page whose entry is `null` draws plain paper although the
   * book has a ground — three answers, which is why the column is wrapped and
   * why this map distinguishes an absent key from a null value.
   */
  const pageBackgrounds: Record<number, PageBackground | null> = {}

  /** Blocks an owner put in particular cells, by page index and region id. */
  const chosenBlocks: Record<number, Record<string, string>> = {}

  for (const row of book.pages) {
    const spans = readMerges(row.merges)
    if (spans.length > 0) merges[row.index] = spans

    const own = readPageBackground(row.background)
    if (own !== undefined) pageBackgrounds[row.index] = own

    const chosen = readRegionBlocks(row.regionBlocks)
    if (Object.keys(chosen).length > 0) chosenBlocks[row.index] = chosen
  }

  /*
   * **Loaded before the flow, not after, and that ordering is load-bearing.**
   * Whether a cell still takes a product depends on whether the block an owner
   * put in it repeats, and `repeats` is a column on the block. The flow cannot
   * decide `fill` without it, so the blocks have to be resolved first — this
   * used to run after `flowBook` because nothing it produced fed back in.
   */
  const blocks = await loadBlocks(
    master,
    pins,
    Object.values(chosenBlocks).flatMap((page) => Object.values(page))
  )

  /**
   * The per-cell blocks, with each one's fill resolved.
   *
   * **A block that does not repeat makes its cell static**, and the products
   * route around it — the offer that was there moves to the next cell rather
   * than being dropped, which is the rule pins have followed since they existed.
   *
   * **Decided here rather than stored.** `repeats` belongs to the block, and a
   * copy kept on the page would be a second answer that goes stale the day
   * somebody edits the block.
   *
   * An id that resolved to nothing is skipped rather than drawn as an empty
   * region: the cell goes back to the book's offer card, which is a layout, and
   * a hole is not.
   */
  const regionBlocks: Record<number, Record<string, RegionBlock>> = {}
  for (const [index, chosen] of Object.entries(chosenBlocks)) {
    const forPage: Record<string, RegionBlock> = {}
    for (const [regionId, blockId] of Object.entries(chosen)) {
      const block = blocks[blockId]
      if (block === undefined) continue
      forPage[regionId] = { blockId, fill: block.repeats ? 'flow' : 'static' }
    }
    if (Object.keys(forPage).length > 0) regionBlocks[Number(index)] = forPage
  }

  const flow = flowBook({
    master,
    merges,
    regionBlocks,
    offerIds: offers.map((offer) => offer.id),
    pins,
    page,
    // The artboard follows the *book's* language, never the interface's. An
    // owner working in an Arabic UI who is producing an English flyer must see
    // an English flyer — the rule `BlockPreview` already states.
    direction: edition === 'ar' ? 'rtl' : 'ltr',
  })

  return {
    id: book.id,
    title: book.title,
    format: book.format,
    status: book.status,
    edition,
    page,
    offers,
    blocks,
    pages: flow.pages,
    pins,
    layout: {
      perRow: choice.perRow ?? master.cols.length,
      bodyRows: choice.bodyRows ?? 1,
      margin: choice.margin ?? 0,
      gap: choice.gap ?? master.gap,
      headerBlockId: choice.headerBlockId ?? null,
      footerBlockId: choice.footerBlockId ?? null,
      background: choice.background ?? null,
      cardBlockId: choice.cardBlockId ?? null,
      ...cardFit(flow.pages, blocks),
    },
    pageBackgrounds,
    overrides: Object.fromEntries(
      book.pages.map((page) => [page.index, readOverrides(page.slotOverrides)])
    ),
    gridProblems: validateGrid(master),
  }
}

/**
 * The blocks a book's regions and pins name.
 *
 * **Read by id, and deliberately not filtered by `status`.** A book that names a
 * block which has since been archived must still render: it is already in print,
 * and a reprint that silently drops a region is worse than one drawn from a
 * block nobody would pick today. Availability in the *designer* is what `status`
 * governs.
 *
 * **From `blocks.arrangements`, not from `block_versions`.** That table is
 * history — blockId, arrangements, createdAt, no version number and no
 * published flag — and the live document is the column on the block itself. A
 * book pinning a specific historical version is not something the schema can
 * express yet, and inventing it here would be a second answer to a question
 * nothing has asked.
 *
 * Seeded blocks (`organizationId: null`) and the shop's own are both reachable —
 * the nullable column is what makes a block seeded.
 */
async function loadBlocks(
  master: ReturnType<typeof toMasterGrid>,
  pins: readonly Pin[],
  /** Blocks an owner put in individual cells. Named nowhere in the grid. */
  chosen: readonly string[] = []
): Promise<Record<string, Block>> {
  const ids = new Set<string>()
  for (const region of master.regions) ids.add(region.blockId)
  for (const pin of pins) ids.add(pin.blockId)
  for (const blockId of chosen) ids.add(blockId)
  if (ids.size === 0) return {}

  const rows = await prisma.block.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      organizationId: true,
      name: true,
      repeats: true,
      arrangements: true,
      thumbnailUrl: true,
    },
  })

  const blocks: Record<string, Block> = {}
  for (const row of rows) {
    // A block whose `arrangements` is not a list cannot be resolved at all, and
    // `pickArrangement` throws on an empty one. Skipping it draws an empty
    // region and still produces the page — the same choice made above for a
    // grid problem, and for the same reason: a missing card on a flyer is worse
    // than a cramped one, but a thrown page is worse than either.
    if (!Array.isArray(row.arrangements) || row.arrangements.length === 0) continue

    blocks[row.id] = {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      repeats: row.repeats,
      // Through `unknown`: Prisma types a Json column as its own union, which
      // does not overlap `Arrangement[]` structurally. The array check above is
      // what makes this safe to the depth anything here can check — the shape
      // of an individual arrangement is the block designer's contract, and
      // validating it per render would cost a parse on every page.
      arrangements: row.arrangements as unknown as Block['arrangements'],
      thumbnailUrl: row.thumbnailUrl,
    }
  }
  return blocks
}


/**
 * Whether the offer card has a design for the shape this page gives its cells.
 *
 * **The check is on the flowing card and nothing else.** A static band is
 * placed once at whatever shape the grid gives it and its blocks declare wide,
 * open ranges for exactly that reason; the repeating card is the one drawn
 * nine times per page, and the one whose stretch an owner will notice.
 *
 * **Every flowing placement in the book, not the first one on page one.** This
 * checked a single placement for as long as every flowing region was the same
 * rectangle — true until cells could be merged. A 2×2 hero and the cards beside
 * it are one block at two shapes, and the seeded cards carry `TALL` and `WIDE`
 * with nothing between them; reading only the first would report on whichever
 * came first in reading order and stay silent about nine stretched cards below.
 *
 * It spans every page rather than the first because merges are a *page's*
 * decision now: page one can hold a hero that page two does not, so page one's
 * shapes say nothing about page two's.
 *
 * A book fits when every shape in it fits, and the aspect reported is the first
 * one that does not. The panel's message names a fix rather than a number, so
 * the worst offender is the useful one to carry back.
 *
 * A book with no offers has no placement to measure and returns `cardFits: true`
 * — there is nothing being drawn wrong, and warning about an empty book is a
 * warning an owner cannot act on.
 */
function cardFit(
  pages: readonly FlowPage[],
  blocks: Record<string, Block>
): { cardFits: boolean; cellAspect: number | null } {
  const placements = pages
    .flatMap((page) => page.placements)
    .filter((candidate) => candidate.kind === 'flow' && candidate.offerId !== null)
  if (placements.length === 0) return { cardFits: true, cellAspect: null }

  let first: number | null = null

  for (const placement of placements) {
    const block = blocks[placement.blockId]
    // A block that could not be resolved is already drawn as an empty region by
    // `loadBlocks`, which is a louder problem than a stretched one.
    if (block === undefined) continue

    const aspect = placement.rect.width / placement.rect.height
    if (first === null) first = aspect
    if (!arrangementCovers(block.arrangements, aspect)) {
      return { cardFits: false, cellAspect: aspect }
    }
  }

  return { cardFits: true, cellAspect: first }
}

// ─── Creating a book ──────────────────────────────────────────────────────────

export interface CreateBookInput {
  shopId: string
  /**
   * What the owner said they were making. Decides the format that is stored,
   * the page rectangle and the grid. `lib/book-kind.ts`.
   *
   * **This replaced a `format` field**, which was a page size an owner was being
   * asked to pick out of seven values, three of which were the same sheet.
   * `docs/E6-create-flow.md` §2.1.
   */
  kind: BookKind
  language: 'en' | 'ar'
  /**
   * Absent for every call from the creation flow, which is the point: nobody is
   * asked to name a thing that does not exist yet. `autoTitle` supplies one and
   * the editor renames it. `lib/book-title.ts`, and §6 of the flow doc.
   *
   * Present only where a caller genuinely has a name to give — `duplicateBook`
   * has the original's.
   */
  title?: string
  /**
   * The repeating offer card the grid is built from.
   *
   * **Resolved against the session before it reaches the grid**, never trusted:
   * it arrives from a client and could name another organization's block or one
   * behind a higher plan. Undefined means the engine's own default, which is the
   * card every book created before this existed used.
   */
  cardBlockId?: string
  perRow?: number
  bodyRows?: number
}

export interface CreateFromCatalogInput extends CreateBookInput {
  /** Catalog products, in the order they should appear. One offer each. */
  productIds: string[]
}

export interface CreateFromRowsInput extends CreateBookInput {
  /**
   * Every row of the price list, matched or not, with the promotion the sheet
   * gave for each. Order is the sheet's order.
   */
  rows: Array<Omit<PendingOffer, 'catalogProductId'> & SheetRow>
}

/**
 * How a price-list row names its product: by a catalog row, or by the words on
 * the sheet.
 *
 * **Not matching is not a failure and does not drop the row.** The catalog is
 * how an offer finds its *photograph*; a shop's own lines are in nobody's
 * universal catalog and are still the products they are promoting.
 */
interface SheetRow {
  catalogProductId: string | null
  name: string
  barcode?: string | undefined
}

/** One offer to write: a product, what it costs, and what the sheet called it. */
interface PendingOffer {
  catalogProductId: string
  /** A decimal string, or null for "the owner has not said yet". */
  price: string | null
  /**
   * The strikethrough, where the sheet gave a higher price to strike through.
   *
   * **Resolved before it gets here**, by `resolvePrices` in `lib/offer-import.ts`
   * — including the inversion, because a till calls the shelf price "price" and
   * an offer calls the promotion `price`. Nothing downstream should be deciding
   * which of two numbers is the bigger one.
   */
  comparePrice?: string | null | undefined
  /**
   * A promotion the prices do not express — buy-one-get-one and its relatives,
   * or whatever the owner wrote in that column.
   *
   * Becomes an `OfferChip`, not a promo tier: a tier is org-level visual
   * emphasis configured once, and one per mechanic would turn the tier list into
   * a list of this week's promotions.
   */
  chip?: { labelEn: string; labelAr: string | null } | undefined
}

/**
 * Everything the three creators need before they can open a transaction.
 *
 * **Extracted because there were two copies of it and there were about to be
 * three.** `createBook` and `createBookFromImport` each resolved the shop,
 * found the promo tier, built the grid and wrote the same six columns, and the
 * two had already drifted: only one of them checked the block id, because only
 * one of them had ever been given one.
 */
async function prepareBook(
  input: CreateBookInput,
  organizationId: string
): Promise<{ shopId: string; tierId: string; title: string; master: PageGrid } | null> {
  const shop = await prisma.shop.findFirst({
    where: { id: input.shopId, organizationId },
    select: { id: true },
  })
  // Same rule as `loadBook`: the tenant is a filter, never a comparison made
  // after the rows are already in hand.
  if (shop === null) return null

  // `offers.promoTierId` is NOT NULL, and an organization with no tiers cannot
  // hold an offer at all — the defect `seedPromoTiers` was written to close.
  // Failing here with a sentence beats a foreign-key violation.
  const tier = await prisma.promoTier.findFirst({
    where: { organizationId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  if (tier === null) {
    throw new Error(
      `createBook: organization "${organizationId}" has no promo tiers — run \`pnpm db:seed\``
    )
  }

  return {
    shopId: shop.id,
    tierId: tier.id,
    title: input.title ?? (await nextTitle(input.kind, shop.id)),
    master: gridForKind({
      kind: input.kind,
      ...(input.cardBlockId === undefined ? {} : { cardBlockId: input.cardBlockId }),
      ...(input.perRow === undefined ? {} : { perRow: input.perRow }),
      ...(input.bodyRows === undefined ? {} : { bodyRows: input.bodyRows }),
    }),
  }
}

/**
 * A generated name clear of the ones this shop already has.
 *
 * **Scoped to the shop rather than the organization**, because that is the list
 * the name has to be distinguishable in: `/` shows one shop's books, and two
 * branches both running a week 37 promotion is normal rather than a collision.
 */
async function nextTitle(kind: BookKind, shopId: string): Promise<string> {
  const existing = await prisma.offerBook.findMany({
    where: { shopId },
    select: { title: true },
    // A generated name is always the current week or the current day, so a
    // collision can only be with something recent. Reading every title a shop
    // has ever made to discover that is a query that grows forever.
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return autoTitle(kind, existing.map((book) => book.title), new Date())
}

/**
 * Write the book, its master grid and one offer per pending product.
 *
 * **Two statements for the offers, not two per offer.** The first version of
 * this created one offer at a time with its item nested, and it did not survive
 * contact with eleven products: a round trip per offer against a hosted database
 * took 5,174ms and the interactive transaction closes at 5,000. A real book is
 * hundreds of offers. This is the third time the same lesson has been learned in
 * this codebase — the spreadsheet import fans out over `unnest` and the Open
 * Food Facts importer resolves brands three queries per batch, both for exactly
 * this reason.
 *
 * `createManyAndReturn` is what makes it two rather than one-plus-N:
 * `createMany` alone cannot give back the ids the items need.
 */
async function insertBook(
  prepared: { shopId: string; tierId: string; title: string; master: PageGrid },
  input: { format: string; language: 'en' | 'ar' },
  offers: readonly PendingOffer[]
): Promise<{ id: string }> {
  const { master } = prepared

  return prisma.$transaction(async (tx) => {
    const created = await tx.offerBook.create({
      data: {
        shopId: prepared.shopId,
        title: prepared.title,
        format: input.format,
        language: input.language,
        shortCode: await uniqueShortCode(tx),
        grids: {
          create: {
            role: 'master',
            cols: master.cols,
            rows: master.rows,
            gap: master.gap,
            // Optional on the engine's PageGrid — a social post is full bleed —
            // and NOT NULL with a default in the column. Zero is the right
            // reading of "unset": full bleed, which is what the type means.
            margin: master.margin ?? 0,
            // `Region[]` as written by the engine. The column is Json and
            // Prisma cannot type it, which is the same seam `page_grids`
            // documents by carrying no relation to `blocks`.
            regions: master.regions as unknown as object[],
          },
        },
      },
      select: { id: true },
    })

    const written = await tx.offer.createManyAndReturn({
      data: offers.map((offer, position) => ({
        bookId: created.id,
        position,
        // **Prices start at zero and are flagged, never defaulted to something
        // plausible.** `offers.price` is NOT NULL and a catalog product carries
        // no price, because a price belongs to an offer. Zero is the only honest
        // placeholder; `composeOffer` raises `no-price` for it, and that flag is
        // what blocks publishing. A seeded "sensible" price prints a number
        // nobody chose.
        //
        // A price from a sheet arrives as a string and stays one the whole way
        // to Prisma's Decimal — going through a float to store money is how 9.95
        // becomes 9.949999999999999.
        price: offer.price ?? 0,
        // Null and absent are the same thing for a was-price and neither is
        // zero — `comparePrice` is nullable precisely so that "no was-price" is
        // sayable, where `price` is NOT NULL and has to use zero plus a flag.
        comparePrice: offer.comparePrice ?? null,
        currency: 'AED',
        promoTierId: prepared.tierId,
      })),
      select: { id: true, position: true },
    })

    // Keyed by position rather than trusting the returned order. Postgres does
    // return them in insertion order today; relying on it would make the item
    // that belongs to one product silently attach to another if that ever
    // changed, and a mispaired offer prints the wrong price against the wrong
    // product — the same class of silent failure the CSV parser's paired arrays
    // guard against.
    const byPosition = new Map(written.map((offer) => [offer.position, offer.id]))

    await tx.offerItem.createMany({
      data: offers.flatMap((offer, position) => {
        const offerId = byPosition.get(position)
        return offerId === undefined
          ? []
          : [{ offerId, catalogProductId: offer.catalogProductId, position: 0 }]
      }),
    })

    /*
     * The promotions the prices cannot say. **`CUSTOM` and `TOP_START`**: the
     * other chip kinds mean specific things — `ORIGIN` is a country, `SCALE` is
     * a quantity, `LOYALTY` an amount — and a buy-one-get-one is none of them.
     * The anchor is logical, so it lands on the correct corner in an Arabic
     * edition with no second rule.
     *
     * Written unconditionally rather than behind a length check on purpose: the
     * flatMap is the condition, and a sheet where nobody named a promotion
     * produces an empty array and one no-op call.
     */
    await tx.offerChip.createMany({
      data: offers.flatMap((offer, position) => {
        const offerId = byPosition.get(position)
        if (offerId === undefined || offer.chip === undefined) return []
        return [
          {
            offerId,
            // **The offer-type kind, not `CUSTOM`.** This chip is the sheet's
            // promotion column, and writing it as a free-text chip made it
            // indistinguishable from a note the owner typed — so the editor
            // could not show it as the offer's mechanic, and changing the
            // mechanic would have stacked a second one beside it.
            // `lib/offer-types.ts` explains why `SCALE` is the marker.
            kind: OFFER_TYPE_CHIP_KIND,
            labelEn: offer.chip.labelEn,
            labelAr: offer.chip.labelAr,
            anchor: 'TOP_START' as const,
          },
        ]
      }),
    })

    return created
  })
}

/**
 * Catalog products this organization may actually put in a book: its own rows
 * plus the universal catalog, and nothing archived.
 *
 * Without it a caller could name another tenant's private product and have it
 * rendered into their book.
 */
async function visibleProductIds(
  ids: readonly string[],
  organizationId: string
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  const visible = await prisma.catalogProduct.findMany({
    where: {
      id: { in: [...ids] },
      archivedAt: null,
      OR: [{ organizationId: null }, { organizationId }],
    },
    select: { id: true },
  })

  return new Set(visible.map((product) => product.id))
}

/**
 * Create a book from catalog products, one single-item offer each, at zero
 * price.
 *
 * **Every product becomes its own single-item offer.** Grouping two products
 * under one price is a deliberate authoring action — E6-02's connector — and
 * guessing it at creation would produce cards nobody asked for. The owner
 * combines them in the tray afterwards.
 */
export async function createBook(
  input: CreateFromCatalogInput,
  organizationId: string
): Promise<{ id: string } | null> {
  const prepared = await prepareBook(input, organizationId)
  if (prepared === null) return null

  const allowed = await visibleProductIds(input.productIds, organizationId)
  // The caller's order is the book's order — `offers.position` is what the
  // engine paginates from — so this filters the input rather than using the
  // query's own ordering.
  const offers = input.productIds
    .filter((id) => allowed.has(id))
    .map((catalogProductId): PendingOffer => ({ catalogProductId, price: null }))

  return insertBook(prepared, { format: KIND_SPEC[input.kind].format, language: input.language }, offers)
}

/**
 * Create a book from a price list the owner matched against the catalog.
 * E6 — `docs/E6-create-flow.md` §2.3.
 *
 * **A book made this way arrives priced**, which is the whole point: the
 * search-and-pick path writes zero and flags every offer, because a catalog
 * product has no price. A sheet has one per row.
 *
 * **It writes nothing to the catalog**, and that is the difference from
 * `createBookFromImport`. This is the inline path in the creation flow: the
 * owner uploaded a sheet to make a flyer, `matchImportRows` found each name in
 * the catalog they already have, and no `catalog_imports` row is created. A
 * flyer is not an inventory update.
 *
 * Rows with no price still become offers at zero and carry the flag. Dropping
 * them would silently shorten a book the owner assembled in a spreadsheet, and
 * a missing price is exactly what the flag exists to surface.
 */
export async function createBookFromRows(
  input: CreateFromRowsInput,
  organizationId: string
): Promise<{ id: string; offers: number } | null> {
  const prepared = await prepareBook(input, organizationId)
  if (prepared === null) return null

  // The client sent these product ids, so they get the same filter the
  // search-and-pick path gets. A matched row is still a client-supplied id.
  const claimed = input.rows.flatMap((row) =>
    row.catalogProductId === null ? [] : [row.catalogProductId]
  )
  const allowed = await visibleProductIds(claimed, organizationId)

  /*
   * **Rows the catalog does not have become products, here, as the book is
   * made.** Not in a step of their own and not behind a button: an owner
   * importing their price list is telling us what they sell, and asking them to
   * confirm that their own bakery counter may be written down is a question
   * with one answer.
   *
   * **At creation rather than at matching**, so an owner who uploads the wrong
   * file and walks away leaves nothing behind. Nothing is written until they
   * commit to the book.
   *
   * A row whose id was dropped by `visibleProductIds` is adopted too — it named
   * a product of somebody else's, so as far as this organization is concerned
   * the catalog has never heard of it, which is the same case.
   */
  const orphans = input.rows.flatMap((row, index) =>
    row.catalogProductId !== null && allowed.has(row.catalogProductId)
      ? []
      : [{ index, nameEn: row.name, ...(row.barcode === undefined ? {} : { barcode: row.barcode }) }]
  )
  const adopted = new Map(
    (await adoptRowsIntoCatalog(organizationId, orphans)).map((row) => [row.index, row.catalogProductId])
  )

  const offers = input.rows.flatMap((row, index) => {
    const catalogProductId =
      row.catalogProductId !== null && allowed.has(row.catalogProductId)
        ? row.catalogProductId
        : adopted.get(index) ?? null
    // Only if adopting it failed, which `adoptRowsIntoCatalog` does not do
    // quietly — but a row with no product is an offer with nothing to draw.
    return catalogProductId === null ? [] : [{ ...row, catalogProductId }]
  })
  if (offers.length === 0) return null

  const book = await insertBook(
    prepared,
    { format: KIND_SPEC[input.kind].format, language: input.language },
    offers
  )

  return { id: book.id, offers: offers.length }
}

/**
 * A public short code, checked for collision rather than assumed unique.
 *
 * `offer_books.shortCode` is the public viewer's whole address — `/o/:code` —
 * so it is guessing-resistant rather than sequential, and it is read by people
 * typing it off a printed flyer. Base32 without the characters that get
 * misread: no `0`/`O`, no `1`/`I`/`L`, no `U` (which people hear as `V`).
 *
 * Eight characters over a 27-character alphabet is ~10^11 codes. The retry loop
 * is not about exhausting that; it is that a unique index will reject a
 * duplicate and a shop owner should never see it.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

async function uniqueShortCode(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = randomBytes(8)
    let code = ''
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]

    const taken = await tx.offerBook.findUnique({
      where: { shortCode: code },
      select: { id: true },
    })
    if (taken === null) return code
  }
  throw new Error('createBook: could not allocate a unique short code')
}

// ─── Starting a book from a spreadsheet ───────────────────────────────────────

export interface ImportSummary {
  id: string
  filename: string
  /** Rows that resolved to a catalog product and can become offers. */
  usableRows: number
  /** How many of those carry a price from the sheet. */
  pricedRows: number
  createdAt: Date
}

/**
 * Committed imports this organization could start a book from.
 *
 * **`ImportRowStatus.MATCHED` and `CREATED` only.** An `AMBIGUOUS` row is one the
 * owner never resolved and `UNMATCHED` never found a product at all — neither
 * has a `catalogProductId`, so neither can become an offer. `SKIPPED` is the
 * owner saying no. Counting them here would promise offers the book cannot
 * contain.
 *
 * **No caller as of `docs/E6-create-flow.md`.** The creation screen used to read
 * this to decide whether to offer "from a spreadsheet" at all, and that choice
 * is gone: the flow now takes a price list inline through
 * `POST /api/v1/offer-books/match`, which needs no committed import and writes
 * nothing to the catalog. Kept because the natural caller is E5-06's own commit
 * screen offering "make a book from this" at the end of an import, which is the
 * one place an owner has a committed import in hand. `createBookFromImport` is
 * still reachable through the `importId` branch of the create route.
 */
export async function listImportsForBook(organizationId: string): Promise<ImportSummary[]> {
  const imports = await prisma.catalogImport.findMany({
    where: { organizationId, status: 'COMMITTED' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      filename: true,
      createdAt: true,
      rows: {
        where: { status: { in: ['MATCHED', 'CREATED'] }, catalogProductId: { not: null } },
        select: { price: true },
      },
    },
  })

  return imports
    .map((row) => ({
      id: row.id,
      filename: row.filename,
      usableRows: row.rows.length,
      pricedRows: row.rows.filter((r) => r.price !== null).length,
      createdAt: row.createdAt,
    }))
    .filter((summary) => summary.usableRows > 0)
}

/**
 * Create a book from a committed spreadsheet import.
 *
 * **This is the half E5-06 deliberately left open.** That epic ends at "offers
 * created in the book, prices carried from the sheet", and it stopped short
 * because there were no offer books and nothing could make one — so the prices
 * stayed on `catalog_import_rows.price`, which is where the schema already puts
 * them. `CatalogImport.committedAt` is documented as *"set when the owner
 * commits the reviewed import into an offer book"*. This is that read.
 *
 * **A book made this way arrives priced**, which is the whole point: the
 * search-and-pick path writes zero and flags every offer, because a catalog
 * product has no price. A sheet has one per row.
 *
 * Rows with no price still become offers at zero and carry the flag. Dropping
 * them would silently shorten a book the owner assembled in a spreadsheet, and
 * a missing price is exactly what the flag exists to surface.
 */
export async function createBookFromImport(
  input: CreateBookInput & { importId: string },
  organizationId: string
): Promise<{ id: string; offers: number } | null> {
  // The import is scoped to the organization in the same predicate, so another
  // tenant's sheet cannot be read into this book.
  const source = await prisma.catalogImport.findFirst({
    where: { id: input.importId, organizationId, status: 'COMMITTED' },
    select: {
      id: true,
      rows: {
        where: { status: { in: ['MATCHED', 'CREATED'] }, catalogProductId: { not: null } },
        // Sheet order is the book's order. An owner who arranged their
        // spreadsheet by aisle expects the flyer to follow it.
        orderBy: { rowIndex: 'asc' },
        select: { catalogProductId: true, price: true },
      },
    },
  })
  if (source === null || source.rows.length === 0) return null

  return createBookFromRows(
    {
      ...input,
      rows: source.rows.flatMap((row) =>
        row.catalogProductId === null
          ? []
          : [
              {
                catalogProductId: row.catalogProductId,
                // **Never read, and empty rather than invented.** A committed
                // E5-06 import has already written its products into the
                // catalog, and the `flatMap` above drops any row that did not —
                // so every row reaching here carries an id, and `name` is only
                // ever consulted when the id is null.
                name: '',
                // Prisma returns Decimal; it stays a string the whole way back
                // to Prisma, exactly as the import took care to read it.
                price: row.price === null ? null : row.price.toString(),
              },
            ]
      ),
    },
    organizationId
  )
}

// ─── Renaming and discarding ──────────────────────────────────────────────────

/**
 * Rename a book. E6 — `docs/E6-create-flow.md` §4.
 *
 * **This is what makes the auto-generated name defensible**, and it is why it
 * shipped in the same change. A book arriving called "Week 37 offers" is fine
 * only if the owner can call it something else once they have seen it; without
 * this, every book a shop owns has the same name forever and the list they pick
 * from is unusable. The screen it used to be asked on is gone.
 *
 * The tenant is a filter in the query, not a check after the fact — `updateMany`
 * rather than `update`, because `update` takes a unique `where` and cannot carry
 * the shop join that scopes it.
 */
export async function renameBook(
  bookId: string,
  organizationId: string,
  title: string
): Promise<{ id: string; title: string } | null> {
  const changed = await prisma.offerBook.updateMany({
    where: { id: bookId, shop: { organizationId } },
    data: { title },
  })

  return changed.count === 0 ? null : { id: bookId, title }
}

/**
 * Discard a draft. E6 — `docs/E6-create-flow.md` §2.4.
 *
 * **Draft only, and that bound is the whole safety argument.** A published book
 * has a short code that is on a printed flyer and possibly on a shop door, an
 * export job, view counts and a share link; deleting one is E10's problem and
 * needs a dialog that names it. A draft the owner rejected at the preview two
 * seconds after creating it has none of that hanging off it.
 *
 * It is a hard delete rather than an archive because `offer_books` has no
 * archive column and inventing one for this would mean every list in the product
 * grows a filter. The alternative — leaving it — is a home screen that fills
 * with abandoned attempts and teaches the owner to ignore the list.
 *
 * Returns false rather than throwing when the book is not theirs, is already
 * gone, or is published. All four are the same answer to the caller: nothing was
 * deleted.
 */
export async function deleteDraftBook(
  bookId: string,
  organizationId: string
): Promise<boolean> {
  const deleted = await prisma.offerBook.deleteMany({
    where: { id: bookId, status: 'draft', shop: { organizationId } },
  })

  return deleted.count > 0
}

// ─── Duplicating a book ───────────────────────────────────────────────────────

/**
 * Copy a book, everything on it, and nothing about its reach.
 *
 * **This is the weekly reissue**, and it is the control the design skill expects
 * to be the most-used in the product. It is cheap precisely because of the flow
 * model: a region binds to a *position* in the product list, so the copy's
 * merges, footers and pins already fit whatever the owner swaps in.
 *
 * What is copied: the grids (master, cover, back), the pins, the page rows with
 * their `slotOverrides`, merges, own backgrounds and per-cell blocks, and every
 * offer with its items, chips, footnotes, legal
 * lines and unit-price settings.
 *
 * **What is deliberately not copied is everything that makes a book public.**
 * `shortCode` is allocated fresh — two books at one public address is a defect
 * that ends with the wrong flyer behind a QR code on a shop door — and
 * `shareableLink`, `passwordHash`, `expiresAt` and `linkActive` all reset,
 * along with the status, which returns to `draft`. Views, clicks, export jobs
 * and social posts belong to the book that earned them.
 *
 * Ids are not preserved and cannot be: `slotOverrides` keys by `regionId` +
 * `offerId`, and the region ids live inside the grid document, which *is*
 * copied verbatim — so a nudge survives only where its region does. Offer ids
 * change, which is the honest outcome: the copy's offers are different offers,
 * and next week's price belongs to them.
 */
export async function duplicateBook(
  bookId: string,
  organizationId: string,
  options: { title?: string } = {}
): Promise<{ id: string; title: string; offers: number } | null> {
  const source = await prisma.offerBook.findFirst({
    where: { id: bookId, shop: { organizationId } },
    select: {
      id: true,
      shopId: true,
      title: true,
      format: true,
      language: true,
      grids: {
        select: {
          role: true,
          cols: true,
          rows: true,
          gap: true,
          margin: true,
          background: true,
          regions: true,
        },
      },
      pins: {
        select: {
          pageIndex: true,
          blockId: true,
          colStart: true,
          colEnd: true,
          rowStart: true,
          rowEnd: true,
          content: true,
        },
      },
      pages: {
        select: {
          index: true,
          slotOverrides: true,
          merges: true,
          background: true,
          regionBlocks: true,
        },
      },
      offers: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          price: true,
          priceMode: true,
          comparePrice: true,
          currency: true,
          promoTierId: true,
          unitPriceMode: true,
          unitPriceValue: true,
          unitPriceUnit: true,
          legalLines: true,
          items: {
            orderBy: { position: 'asc' },
            select: {
              catalogProductId: true,
              position: true,
              connector: true,
              nameOverrideEn: true,
              nameOverrideAr: true,
              specOverrideEn: true,
              specOverrideAr: true,
              imageAssetId: true,
            },
          },
          chips: {
            select: { kind: true, labelEn: true, labelAr: true, value: true, anchor: true },
          },
          footnotes: { select: { textEn: true, textAr: true, scope: true } },
        },
      },
    },
  })

  if (source === null) return null

  const title = options.title ?? `${source.title} copy`

  const created = await prisma.$transaction(async (tx) => {
    const book = await tx.offerBook.create({
      data: {
        shopId: source.shopId,
        title,
        format: source.format,
        language: source.language,
        // A copy is always a draft, whatever the original's status. Duplicating
        // a published book must not publish anything.
        status: 'draft',
        shortCode: await uniqueShortCode(tx),
        grids: {
          create: source.grids.map((grid) => ({
            role: grid.role,
            cols: grid.cols,
            rows: grid.rows,
            gap: grid.gap,
            margin: grid.margin,
            // Copied like every other part of the layout. The weekly reissue is
            // the same book with next week's prices; it is not the same book in
            // a different colour.
            ...(grid.background === null ? {} : { background: grid.background as object }),
            regions: grid.regions as unknown as object[],
          })),
        },
        pins: {
          create: source.pins.map((pin) => ({
            pageIndex: pin.pageIndex,
            blockId: pin.blockId,
            colStart: pin.colStart,
            colEnd: pin.colEnd,
            rowStart: pin.rowStart,
            rowEnd: pin.rowEnd,
            ...(pin.content === null ? {} : { content: pin.content as object }),
          })),
        },
        pages: {
          create: source.pages.map((page) => ({
            index: page.index,
            ...(page.slotOverrides === null
              ? {}
              : { slotOverrides: page.slotOverrides as object }),
            // **The layout copies with the book, which is the whole point of
            // duplicating one.** A page's merges and its own paper are decisions
            // the owner made about last week's book and expects to find in this
            // week's — dropping them would make "duplicate" mean "duplicate the
            // products", and re-laying out nine pages is the work the button
            // exists to avoid.
            ...(page.merges === null ? {} : { merges: page.merges as object }),
            ...(page.background === null ? {} : { background: page.background as object }),
            ...(page.regionBlocks === null
              ? {}
              : { regionBlocks: page.regionBlocks as object }),
          })),
        },
      },
      select: { id: true },
    })

    // Two statements for the offers, then two more for what hangs off them —
    // never one round trip per offer. `createBook` learned this by blowing the
    // 5s interactive transaction limit at eleven products, and a book being
    // duplicated is a book that already has a hundred.
    const offers = await tx.offer.createManyAndReturn({
      data: source.offers.map((offer) => ({
        bookId: book.id,
        position: offer.position,
        price: offer.price,
        priceMode: offer.priceMode,
        comparePrice: offer.comparePrice,
        currency: offer.currency,
        promoTierId: offer.promoTierId,
        unitPriceMode: offer.unitPriceMode,
        unitPriceValue: offer.unitPriceValue,
        unitPriceUnit: offer.unitPriceUnit,
        legalLines: offer.legalLines,
      })),
      select: { id: true, position: true },
    })

    // Keyed by position rather than trusting the returned order — the same
    // guard `createBook` states, and the failure it prevents is worse here:
    // a mispaired item would attach one product's name to another's price in a
    // book the owner believes is last week's, checked once and printed.
    const byPosition = new Map(offers.map((offer) => [offer.position, offer.id]))

    await tx.offerItem.createMany({
      data: source.offers.flatMap((offer) => {
        const offerId = byPosition.get(offer.position)
        return offerId === undefined
          ? []
          : offer.items.map((item) => ({ ...item, offerId }))
      }),
    })

    const chips = source.offers.flatMap((offer) => {
      const offerId = byPosition.get(offer.position)
      return offerId === undefined
        ? []
        : offer.chips.map((chip) => ({
            offerId,
            kind: chip.kind,
            labelEn: chip.labelEn,
            labelAr: chip.labelAr,
            // Spread rather than passed as possibly-undefined: Prisma's JSON
            // input type has no `undefined` member under
            // exactOptionalPropertyTypes, and a null `value` means the chip
            // kind carries no payload.
            ...(chip.value === null ? {} : { value: chip.value as object }),
            anchor: chip.anchor,
          }))
    })
    if (chips.length > 0) await tx.offerChip.createMany({ data: chips })

    const footnotes = source.offers.flatMap((offer) => {
      const offerId = byPosition.get(offer.position)
      return offerId === undefined
        ? []
        : offer.footnotes.map((note) => ({ offerId, ...note }))
    })
    if (footnotes.length > 0) await tx.offerFootnote.createMany({ data: footnotes })

    return book
  })

  return { id: created.id, title, offers: source.offers.length }
}

/**
 * A page's stored merges, narrowed enough to hand to the engine.
 *
 * `offer_book_pages.merges` is a Json column, so it arrives as `unknown`.
 * **Unlike a malformed grid this never throws**: a page whose merges cannot be
 * read is a page that draws the master, which is a layout, not a crash. The
 * engine normalises again on the way in — dropping anything the track count
 * cannot hold — so this only has to establish the shape.
 */
function readMerges(value: unknown): CellSpan[] {
  if (!Array.isArray(value)) return []

  const out: CellSpan[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const span = entry as Record<string, unknown>
    if (
      typeof span.colStart !== 'number' ||
      typeof span.colEnd !== 'number' ||
      typeof span.rowStart !== 'number' ||
      typeof span.rowEnd !== 'number'
    ) {
      continue
    }
    out.push({
      colStart: span.colStart,
      colEnd: span.colEnd,
      rowStart: span.rowStart,
      rowEnd: span.rowEnd,
    })
  }
  return out
}

/**
 * A page's per-cell blocks, narrowed enough to look up.
 *
 * A Json column, so it arrives as `unknown`. **Never throws**: a page whose
 * choices cannot be read is a page drawing the book's offer card everywhere,
 * which is a layout rather than a crash — the same call `readMerges` makes.
 */
function readRegionBlocks(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}

  const out: Record<string, string> = {}
  for (const [regionId, blockId] of Object.entries(value)) {
    if (typeof blockId === 'string' && blockId.length > 0) out[regionId] = blockId
  }
  return out
}


/**
 * A book's first page, ready to draw at thumbnail size.
 * `docs/E6-create-flow.md` §22.
 *
 * **`loadBook` rather than a narrower reader.** There is one path that composes
 * a book, and adding a second so a cheaper caller could exist is two paths that
 * have to agree forever — the one nobody looks at being the one that drifts. A
 * thumbnail that disagrees with its own book is that failure on the first screen
 * an owner sees.
 *
 * So a cover is not cheap, and **that is what bounds how many are drawn at
 * once**: six on the home screen, a page at a time inside the dialog.
 *
 * Null for a book that does not exist, is not theirs, or has no first page —
 * the caller shows a tile without a picture rather than no tile, because a book
 * that will not compose still opens.
 */
export async function composeCover(
  bookId: string,
  organizationId: string
): Promise<BookCover | null> {
  const composed = await loadBook(bookId, organizationId)
  const page = composed?.pages[0]
  if (composed === null || composed === undefined || page === undefined) return null

  // Only the offers this page draws. The rest are on pages nobody is looking
  // at, and a screen carrying nine pages of composed offers per book is a
  // payload measured in megabytes.
  const drawn = new Set(
    page.placements.flatMap((placement) => (placement.offerId === null ? [] : [placement.offerId]))
  )

  return {
    page,
    size: composed.page,
    offers: Object.fromEntries(
      composed.offers.filter((offer) => drawn.has(offer.id)).map((offer) => [offer.id, offer])
    ),
    blocks: composed.blocks,
    direction: composed.edition === 'ar' ? 'rtl' : 'ltr',
    background: composed.pageBackgrounds[0] ?? composed.layout.background,
  }
}

/**
 * Which of a product's images a card draws. E5 §3.
 *
 * An approved CUTOUT wins; otherwise the newest of what is left, which the
 * query already ordered. THUMB is excluded by the query — it is a list
 * thumbnail and never something a printed card is drawn from.
 *
 * The rows arrive newest-first, so the `find` is the whole precedence rule.
 */
export function pickImage<
  T extends { kind: 'ORIGINAL' | 'CUTOUT' | 'THUMB'; contributedBy?: string | null },
>(images: readonly T[], organizationId?: string): T | undefined {
  /*
   * **This shop's own photo outranks the shared one, cutout or not.** A shop
   * that supplied a packshot for a universal product with none — or with a bad
   * one — has said which picture belongs on their flyer, and a reviewer
   * agreeing later is not a precondition for their own book using it. Matches
   * the first `ORDER BY` term in `imagePick`.
   */
  if (organizationId !== undefined) {
    const own = images.filter((image) => image.contributedBy === organizationId)
    if (own.length > 0) return own.find((image) => image.kind === 'CUTOUT') ?? own[0]
  }

  return images.find((image) => image.kind === 'CUTOUT') ?? images[0]
}
