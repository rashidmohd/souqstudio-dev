import 'server-only'

import { prisma } from '@souqstudio/db'
import { bookletGrid, flowBook, validateGrid, type FlowPage } from '@souqstudio/engine'
import type { Block, Pin } from '@souqstudio/types'
import {
  composeOffer,
  toMasterGrid,
  type ComposedOffer,
  type Edition,
} from '@/lib/offer-book-compose'
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

/** Page sizes, in px at 150dpi. A book's format decides its artboard, and the
 *  engine takes a rectangle rather than a paper name. */
const PAGE_SIZE: Record<string, { width: number; height: number }> = {
  leaflet: { width: 1240, height: 1754 },
  catalog: { width: 1240, height: 1754 },
  print: { width: 1240, height: 1754 },
  a3: { width: 1754, height: 2480 },
  instagram_post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  whatsapp: { width: 1080, height: 1080 },
}

const DEFAULT_PAGE = { width: 1240, height: 1754 }

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
          promoTier: {
            select: { id: true, labelEn: true, labelAr: true, tokenRef: true },
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
  const page = PAGE_SIZE[book.format] ?? DEFAULT_PAGE

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
