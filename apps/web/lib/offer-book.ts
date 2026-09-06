import 'server-only'

import { prisma } from '@souqstudio/db'
import { flowBook, validateGrid, type FlowPage } from '@souqstudio/engine'
import type { Block, Pin } from '@souqstudio/types'
import {
  composeOffer,
  toMasterGrid,
  type ComposedOffer,
  type Edition,
} from '@/lib/offer-book-compose'
import { publicUrl } from '@/lib/r2'

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
