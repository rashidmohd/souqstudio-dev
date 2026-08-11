import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Page, ShopSummary } from '@souqstudio/types'
import { shopWhere } from '@/lib/authz'
import { toBrandOverride } from '@/lib/brand-inheritance'
import type { VerifiedSession } from '@/lib/session'

/**
 * Reading shops. E2-02.
 *
 * One query layer that both the settings page and the API route call, so the
 * list a server component renders and the list a fetch returns cannot drift.
 * The page does not call its own API over HTTP to render itself — that would
 * be a round trip through the network to reach the database it already has.
 */

/** Cursor pages are capped so a client cannot ask for the whole table. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type ListShopsOptions = {
  cursor?: string | undefined
  limit?: number | undefined
  includeArchived?: boolean | undefined
}

export async function listShops(
  session: VerifiedSession,
  options: ListShopsOptions = {}
): Promise<Page<ShopSummary>> {
  const take = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

  const rows = await prisma.shop.findMany({
    where: await shopWhere(session, { includeArchived: options.includeArchived ?? false }),
    // Oldest first: the shop someone signed up with stays at the top rather
    // than sinking as branches are added. `id` breaks ties so the cursor is
    // total — two shops created in the same millisecond would otherwise be able
    // to straddle a page boundary and one would never be returned.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    // One more than asked for: its existence is what says there is a next page,
    // without a second count query.
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      location: true,
      phone: true,
      logoUrl: true,
      isActive: true,
      archivedAt: true,
      brandOverride: true,
      _count: { select: { userAccess: true } },
      offerBooks: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  })

  const page = rows.slice(0, take)

  return {
    items: page.map((shop) => ({
      id: shop.id,
      name: shop.name,
      location: shop.location,
      phone: shop.phone,
      logoUrl: shop.logoUrl,
      isActive: shop.isActive,
      archivedAt: shop.archivedAt?.toISOString() ?? null,
      brandOverride: toBrandOverride(shop.brandOverride),
      memberCount: shop._count.userAccess,
      lastOfferBookAt: shop.offerBooks[0]?.createdAt.toISOString() ?? null,
    })),
    nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null,
  }
}

/**
 * How many shops count against the plan, and how many are switched off.
 *
 * Archived shops are excluded from both: they are gone as far as the customer
 * is concerned, and counting them would make the limit unexplainable.
 */
export async function shopCounts(
  organizationId: string
): Promise<{ total: number; active: number; inactive: number }> {
  const [total, active] = await Promise.all([
    prisma.shop.count({ where: { organizationId, archivedAt: null } }),
    prisma.shop.count({ where: { organizationId, archivedAt: null, isActive: true } }),
  ])
  return { total, active, inactive: total - active }
}
