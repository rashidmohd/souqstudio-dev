import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { createBook, createBookFromImport } from '@/lib/offer-book'

/**
 * E6 — creating an offer book, and listing the ones a shop has.
 *
 * **The first write path in this epic.** `offer_books` has held zero rows since
 * the table was migrated and nothing in the product could put one there, so the
 * composition model has never been exercised against the schema built for it.
 *
 * Deliberately thin. It creates a book from catalog products, one single-item
 * offer each, at zero price — everything an owner actually decides (prices,
 * tiers, grouping two products under one offer) is the editor's job, E6-02 and
 * E6-03. This route exists so there is something for the editor to open.
 */

/**
 * Two ways to start a book, and they are a union rather than two optional
 * fields.
 *
 * `productIds` is the search-and-pick path and writes zero prices. `importId`
 * reads a committed spreadsheet and **carries its prices** — the half E5-06
 * stopped short of because there were no offer books to carry them into. A body
 * with both would be a client that has not decided, and a body with neither has
 * nothing to create.
 */
const baseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  // The formats `OfferBookFormat` names. Anything else has no page size and
  // would silently fall back to A4, which is a wrong flyer rather than an error.
  format: z.enum([
    'instagram_post',
    'story',
    'whatsapp',
    'leaflet',
    'catalog',
    'a3',
    'print',
  ]),
  language: z.enum(['en', 'ar']).default('en'),
  /** Cards across a page. More tracks is what density means now — E6 §5's
   *  density profiles are gone, see `docs/composition-model.md`. */
  perRow: z.number().int().min(1).max(6).optional(),
  bodyRows: z.number().int().min(1).max(8).optional(),
})

const createSchema = z.union([
  baseSchema.extend({
    /**
     * Catalog product ids, in the order they should appear — `offers.position`
     * is what the engine paginates from.
     *
     * Bounded at 200 because `plans.maxProductsPerBook` exists and this route
     * does not read it yet; an unbounded array is a request that can write for
     * minutes. The plan check belongs here once the editor can surface the limit.
     */
    productIds: z.array(z.string().min(1)).min(1).max(200),
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
    return fail('invalid_request', 'Check the title, format and products, then try again.')
  }

  // `organizationId` from the session, never from the body — and both creators
  // filter what they were handed against it rather than trusting it.
  const common = {
    shopId: shop.id,
    title: parsed.data.title,
    format: parsed.data.format,
    language: parsed.data.language,
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
