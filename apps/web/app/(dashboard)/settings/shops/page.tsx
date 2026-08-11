import type { Metadata } from 'next'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { assertShopLimit } from '@/lib/billing'
import { listShops } from '@/lib/shops'
import { ShopList } from '@/components/shop/ShopList'

export const metadata: Metadata = { title: 'Shops · SouqStudio' }

/**
 * E2-02 — shop management.
 *
 * A plain member of layout family 1. There is no settings sub-nav and no second
 * sidebar: the left rail *is* the sidebar the epic asks for, per the design
 * skill's references/layout-map.md, and settings/account already works this way.
 *
 * Read directly through lib/shops.ts rather than through the API route. This is
 * a server component that already has the organization; fetching its own
 * endpoint would be a network round trip to reach a database it is holding.
 */
export default async function ShopsSettingsPage() {
  const session = await requireCompliantSession()

  const [page, active, limit] = await Promise.all([
    listShops(session),
    getActiveShop(session),
    assertShopLimit(session.user.organizationId),
  ])

  const isOwner = session.user.role === 'owner'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Shops</h1>
        <p className="font-ui text-body text-secondary">
          Every branch you run. Each one makes its own offer books.
        </p>
      </div>

      {/* The limit is stated before it is hit, not only when it refuses. A
          disabled control whose reason appears only on press is the thing the
          design system's disabled rule exists to prevent. */}
      {isOwner && !limit.ok ? (
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          You are using all <span data-figure>{limit.current}</span> shops your plan
          covers. Upgrade to add another.
        </p>
      ) : null}

      <ShopList
        shops={page.items}
        canManage={isOwner}
        activeShopId={active?.id ?? null}
      />
    </div>
  )
}
