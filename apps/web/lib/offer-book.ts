import 'server-only'

import { prisma } from '@souqstudio/db'
import { bookletGrid, flowBook, validateGrid, type FlowPage } from '@souqstudio/engine'
import type { Block, Pin, SlotOverride } from '@souqstudio/types'
import {
  composeOffer,
  pageSizeFor,
  toMasterGrid,
  type ComposedOffer,
  type Edition,
} from '@/lib/offer-book-compose'
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
   * The master's track counts, which is what "density" now means — §4.3. The
   * last row is the footer band, so the body rows are one short of the total.
   */
  layout: { perRow: number; bodyRows: number }
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
      grids: {
        where: { role: 'master' },
        select: { cols: true, rows: true, gap: true, margin: true, regions: true },
        take: 1,
      },
      pages: { select: { index: true, slotOverrides: true } },
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
            select: { id: true, labelEn: true, labelAr: true, anchor: true },
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
                    // An approved CUTOUT first, then anything else. Same
                    // precedence as `IMAGE_PICK` in `lib/catalog.ts`, expressed
                    // through the client because there is no lateral here.
                    where: { reviewState: 'APPROVED' },
                    orderBy: { kind: 'asc' },
                    select: { kind: true, r2Key: true },
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
  const page = pageSizeFor(book.format)

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
          const image = item.product.images[0]
          return {
            id: item.id,
            position: item.position,
            connector: item.connector,
            nameOverrideEn: item.nameOverrideEn,
            nameOverrideAr: item.nameOverrideAr,
            specOverrideEn: item.specOverrideEn,
            specOverrideAr: item.specOverrideAr,
            product: {
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
      edition
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

  const flow = flowBook({
    master,
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
    blocks: await loadBlocks(master, pins),
    pages: flow.pages,
    pins,
    layout: { perRow: master.cols.length, bodyRows: Math.max(1, master.rows.length - 1) },
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
  pins: readonly Pin[]
): Promise<Record<string, Block>> {
  const ids = new Set<string>()
  for (const region of master.regions) ids.add(region.blockId)
  for (const pin of pins) ids.add(pin.blockId)
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


// ─── Creating a book ──────────────────────────────────────────────────────────

export interface CreateBookInput {
  shopId: string
  title: string
  /** One of `OfferBookFormat`. Decides the artboard rectangle, nothing else. */
  format: string
  language: 'en' | 'ar'
  /** Catalog products, in the order they should appear. One offer each. */
  productIds: string[]
  perRow?: number
  bodyRows?: number
}

/**
 * Create a book, its master grid and one offer per product, in one transaction.
 *
 * **The first write path in E6, and the thing every other part of it waits on.**
 * `offer_books` has held zero rows since the table was migrated, so the
 * composition model has only ever been checked against literals.
 *
 * **Every product becomes its own single-item offer.** Grouping two products
 * under one price is a deliberate authoring action — E6-02's connector — and
 * guessing it at creation would produce cards nobody asked for. The owner
 * combines them in the tray afterwards.
 *
 * **Prices start at zero and are flagged, not defaulted to something plausible.**
 * `offers.price` is NOT NULL and a catalog product carries no price, because a
 * price belongs to an offer. Zero is the only honest placeholder; `composeOffer`
 * raises `no-price` for it, and that flag is what has to block publishing. A
 * seeded "sensible" price would print a number nobody chose.
 */
export async function createBook(
  input: CreateBookInput,
  organizationId: string
): Promise<{ id: string } | null> {
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

  // Products are read before the transaction and filtered to what this
  // organization can actually see: its own rows plus the universal catalog.
  // Without it a caller could name another tenant's private product and have it
  // rendered into their book.
  const visible = await prisma.catalogProduct.findMany({
    where: {
      id: { in: input.productIds },
      archivedAt: null,
      OR: [{ organizationId: null }, { organizationId }],
    },
    select: { id: true },
  })
  const allowed = new Set(visible.map((product) => product.id))
  // The caller's order is the book's order — `offers.position` is what the
  // engine paginates from — so this filters the input rather than using the
  // query's own ordering.
  const ordered = input.productIds.filter((id) => allowed.has(id))

  const gridOptions = {
    ...(input.perRow === undefined ? {} : { perRow: input.perRow }),
    ...(input.bodyRows === undefined ? {} : { bodyRows: input.bodyRows }),
  }
  const master = bookletGrid(gridOptions)

  const book = await prisma.$transaction(async (tx) => {
    const created = await tx.offerBook.create({
      data: {
        shopId: shop.id,
        title: input.title,
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

    // **Two statements, not two per product.** The first version created one
    // offer at a time with its item nested, and it did not survive contact with
    // eleven products: a round trip per offer against a hosted database took
    // 5,174ms and the interactive transaction closes at 5,000. A real book is
    // hundreds of offers. This is the third time the same lesson has been
    // learned in this codebase — the spreadsheet import fans out over `unnest`
    // and the Open Food Facts importer resolves brands three queries per batch,
    // both for exactly this reason.
    //
    // `createManyAndReturn` is what makes it two rather than one-plus-N:
    // `createMany` alone cannot give back the ids the items need.
    const offers = await tx.offer.createManyAndReturn({
      data: ordered.map((_, position) => ({
        bookId: created.id,
        position,
        price: 0,
        currency: 'AED',
        promoTierId: tier.id,
      })),
      select: { id: true, position: true },
    })

    // Keyed by position rather than trusting the returned order. Postgres does
    // return them in insertion order today; relying on it would make the item
    // that belongs to one product silently attach to another if that ever
    // changed, and a mispaired offer prints the wrong price against the wrong
    // product — the same class of silent failure the CSV parser's paired arrays
    // guard against.
    const byPosition = new Map(offers.map((offer) => [offer.position, offer.id]))

    await tx.offerItem.createMany({
      data: ordered.flatMap((productId, position) => {
        const offerId = byPosition.get(position)
        return offerId === undefined ? [] : [{ offerId, catalogProductId: productId, position: 0 }]
      }),
    })

    return created
  })

  return book
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
  input: {
    shopId: string
    title: string
    format: string
    language: 'en' | 'ar'
    importId: string
    perRow?: number
    bodyRows?: number
  },
  organizationId: string
): Promise<{ id: string; offers: number } | null> {
  const shop = await prisma.shop.findFirst({
    where: { id: input.shopId, organizationId },
    select: { id: true },
  })
  if (shop === null) return null

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

  const tier = await prisma.promoTier.findFirst({
    where: { organizationId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  if (tier === null) {
    throw new Error(`createBookFromImport: organization "${organizationId}" has no promo tiers`)
  }

  const gridOptions = {
    ...(input.perRow === undefined ? {} : { perRow: input.perRow }),
    ...(input.bodyRows === undefined ? {} : { bodyRows: input.bodyRows }),
  }
  const master = bookletGrid(gridOptions)

  const rows = source.rows.filter(
    (row): row is { catalogProductId: string; price: typeof row.price } =>
      row.catalogProductId !== null
  )

  const book = await prisma.$transaction(async (tx) => {
    const created = await tx.offerBook.create({
      data: {
        shopId: shop.id,
        title: input.title,
        format: input.format,
        language: input.language,
        shortCode: await uniqueShortCode(tx),
        grids: {
          create: {
            role: 'master',
            cols: master.cols,
            rows: master.rows,
            gap: master.gap,
            margin: master.margin ?? 0,
            regions: master.regions as unknown as object[],
          },
        },
      },
      select: { id: true },
    })

    // Two statements, not two per row — the same reason `createBook` fans out.
    const offers = await tx.offer.createManyAndReturn({
      data: rows.map((row, position) => ({
        bookId: created.id,
        position,
        // The sheet's price, as text. Prisma's Decimal takes a string and never
        // sees a float — the same care the import took reading it.
        price: row.price === null ? 0 : row.price.toString(),
        currency: 'AED',
        promoTierId: tier.id,
      })),
      select: { id: true, position: true },
    })

    const byPosition = new Map(offers.map((offer) => [offer.position, offer.id]))
    await tx.offerItem.createMany({
      data: rows.flatMap((row, position) => {
        const offerId = byPosition.get(position)
        return offerId === undefined
          ? []
          : [{ offerId, catalogProductId: row.catalogProductId, position: 0 }]
      }),
    })

    return created
  })

  return { id: book.id, offers: rows.length }
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
 * their `slotOverrides`, and every offer with its items, chips, footnotes, legal
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
      pages: { select: { index: true, slotOverrides: true } },
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
