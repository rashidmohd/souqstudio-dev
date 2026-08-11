import type { Metadata } from 'next'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { shopWhere } from '@/lib/authz'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { readChecklist } from '@/lib/checklist'
import { GettingStartedChecklist } from '@/components/shared/GettingStartedChecklist'
import { OfferBooksList } from '@/components/offer-book/OfferBooksList'

export const metadata: Metadata = { title: 'Offer books · SouqStudio' }

/**
 * Home. **The offer books list, not a dashboard** — see the design skill,
 * references/layout-map.md. Owners arrive with one job and arrive in a hurry.
 *
 * This route existing at all is the fix for a real defect: `/` had no page, so
 * finishing brand setup, finishing forced two-factor enrollment, and revisiting
 * a completed `/onboarding` all redirected to a 404.
 *
 * The list is empty for everyone today because E6's editor has not been built,
 * so nothing can create an offer book. That is a genuinely empty state rather
 * than a placeholder, and it is rendered as one.
 */
export default async function HomePage() {
  const session = await requireCompliantSession()
  // The active shop, not the organization's first — E2-02 makes those different
  // things, and this list is shop-scoped. The switcher is what changes it.
  const shop = await getActiveShop(session)

  const [offerBooks, user, shops] = await Promise.all([
    shop
      ? prisma.offerBook.findMany({
          where: { shopId: shop.id },
          select: { id: true, title: true, format: true, status: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          // Cursor pagination arrives with the list that needs it; this bound
          // is here so an unpaginated query can never become the problem.
          take: 50,
        })
      : [],
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { checklistDismissedAt: true },
    }),
    prisma.shop.findMany({ where: await shopWhere(session), select: { id: true } }),
  ])

  // The brand item asks about the shop being looked at; the offer-book item
  // asks about the organization. So the kit is the active shop's effective one
  // and the ids are every shop the session can reach.
  const brand = shop
    ? await readEffectiveBrand({
        organizationId: shop.organizationId,
        shopId: shop.id,
        brandOverride: shop.brandOverride,
      })
    : null

  const checklist = await readChecklist({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    shopIds: shops.map((s) => s.id),
    brandKit: brand?.brandKit ?? {},
    dismissedAt: user?.checklistDismissedAt ?? null,
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Offer books</h1>
        <p className="font-ui text-body text-secondary">
          {shop ? shop.name : 'Your shop'}
        </p>
      </div>

      {checklist.visible ? (
        <GettingStartedChecklist items={checklist.items} dismissible={checklist.dismissible} />
      ) : null}

      <OfferBooksList
        books={offerBooks.map((book) => ({
          ...book,
          updatedAt: book.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
