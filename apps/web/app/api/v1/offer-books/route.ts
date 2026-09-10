import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { BOOK_KINDS } from '@/lib/book-kind'
import { loadBlock } from '@/lib/blocks'
import { createBook, createBookFromImport, createBookFromRows } from '@/lib/offer-book'

/**
 * E6 — creating an offer book, and listing the ones a shop has.
 *
 * Deliberately thin. It creates a book and its offers; everything an owner
 * actually decides afterwards — prices, tiers, grouping two products under one
 * offer, the layout — is the editor's job.
 *
 * **Reshaped by `docs/E6-create-flow.md`.** Three things changed and all three
 * were the creation *screen* asking the wrong question:
 *
 * - **`kind` replaced `format`.** An owner was picking a page size out of seven
 *   values, three of which were the same A4 sheet. `lib/book-kind.ts`.
 * - **`title` became optional.** Nobody is asked to name a thing that does not
 *   exist yet; `autoTitle` supplies one and `PATCH` renames it.
 * - **`cardBlockId` is new**, and it is the one that mattered most. The grid
 *   builder closed over a single block id, so every book this product has ever
 *   made used `blk_offer_card` while twenty-four other seeded offer cards sat in
 *   a library nothing could reach.
 */

/**
 * Three ways to start, and they are a union rather than three optional fields.
 *
 * `productIds` is the search-and-pick path and writes zero prices. `rows` is the
 * inline price list: the owner uploaded a sheet in the creation flow, the names
 * were matched against the catalog they already have, and **the catalog is not
 * written to** — a flyer is not an inventory update. `importId` reads a
 * spreadsheet already committed through `/catalog/import`, which is the E5-06
 * path and does add products.
 *
 * A body with two of them is a client that has not decided, and one with none
 * has nothing to create.
 */
const baseSchema = z.object({
  kind: z.enum(BOOK_KINDS),
  language: z.enum(['en', 'ar']).default('en'),
  /**
   * Absent from the creation flow, which is the point. Accepted so a caller that
   * genuinely holds a name can pass one.
   */
  title: z.string().trim().min(1).max(160).optional(),
  /** The repeating offer card. Checked against the session below, never trusted. */
  cardBlockId: z.string().min(1).max(64).optional(),
  /** Cards across. More tracks is what density means now — `composition-model.md`. */
  perRow: z.number().int().min(1).max(6).optional(),
  bodyRows: z.number().int().min(1).max(8).optional(),
})

/**
 * A price as the sheet gave it, and it stays a string the whole way to Prisma's
 * Decimal. Parsing it to a float here is how 9.95 becomes 9.949999999999999 on a
 * printed flyer — the same care `parsePrice` takes reading it.
 *
 * Null is a row the sheet had no price for. It becomes an offer at zero carrying
 * the `no-price` flag, rather than being dropped: silently shortening a book the
 * owner assembled in a spreadsheet is worse than showing them the gap.
 */
const priceSchema = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, 'a decimal amount')
  .nullable()

/** `createBook` caps at 200 for the same reason: an unbounded array is a request
 *  that can write for minutes. The plan's `maxProductsPerBook` belongs here once
 *  the flow can surface it. */
const MAX_OFFERS = 200

const createSchema = z.union([
  baseSchema.extend({
    /** Catalog product ids, in the order they should appear — `offers.position`
     *  is what the engine paginates from. */
    productIds: z.array(z.string().min(1)).min(1).max(MAX_OFFERS),
  }),
  baseSchema.extend({
    rows: z
      .array(z.object({ catalogProductId: z.string().min(1), price: priceSchema }))
      .min(1)
      .max(MAX_OFFERS),
  }),
  baseSchema.extend({ importId: z.string().min(1) }),
])

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) {
    return fail('no_shop', 'Create a shop before making an offer book.', 400)
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', 'Check what you picked, then try again.')
  }

  /*
   * **The block id is resolved against the session before it can reach a grid.**
   * It arrives from a client and could name another organization's block or one
   * behind a higher plan, and `gridForKind` has no session to judge it with —
   * it would write the id into `page_grids.regions` and the tenancy leak would
   * only surface when the book was rendered. This is the same gate `POST
   * /api/v1/blocks` puts on `fromId`, for the same reason.
   */
  if (parsed.data.cardBlockId !== undefined) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { planId: true },
    })

    const block = await loadBlock(
      parsed.data.cardBlockId,
      session.user.organizationId,
      organization?.planId ?? null
    )

    // A seeded block and another organization's are the same answer on purpose.
    // A different message for the second confirms the id exists.
    if (block === null) {
      return fail('block_not_found', 'That design is not one you can use.', 404)
    }
    if (block.locked) {
      return fail('plan_required', 'That design is part of a higher plan. Upgrade to use it.', 403)
    }
  }

  // `organizationId` from the session, never from the body — and every creator
  // filters what it was handed against it rather than trusting it.
  const common = {
    shopId: shop.id,
    kind: parsed.data.kind,
    language: parsed.data.language,
    ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
    ...(parsed.data.cardBlockId === undefined ? {} : { cardBlockId: parsed.data.cardBlockId }),
    ...(parsed.data.perRow === undefined ? {} : { perRow: parsed.data.perRow }),
    ...(parsed.data.bodyRows === undefined ? {} : { bodyRows: parsed.data.bodyRows }),
  }

  if ('importId' in parsed.data) {
    const book = await createBookFromImport(
      { ...common, importId: parsed.data.importId },
      session.user.organizationId
    )
    if (book === null) {
      return fail(
        'import_unusable',
        'That import has no products that resolved to your catalog.',
        422
      )
    }
    return ok(book, 201)
  }

  if ('rows' in parsed.data) {
    const book = await createBookFromRows(
      { ...common, rows: parsed.data.rows },
      session.user.organizationId
    )
    if (book === null) {
      return fail(
        'rows_unusable',
        'None of those products are in your catalog. Try matching them again.',
        422
      )
    }
    return ok(book, 201)
  }

  const book = await createBook(
    { ...common, productIds: parsed.data.productIds },
    session.user.organizationId
  )

  if (book === null) {
    return fail('shop_not_found', 'That shop is not one of yours.', 404)
  }

  return ok(book, 201)
}

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return ok([])

  const books = await prisma.offerBook.findMany({
    where: { shopId: shop.id },
    select: {
      id: true,
      title: true,
      format: true,
      status: true,
      language: true,
      shortCode: true,
      updatedAt: true,
      _count: { select: { offers: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return ok(
    books.map(({ _count, ...book }) => ({ ...book, offerCount: _count.offers }))
  )
}
