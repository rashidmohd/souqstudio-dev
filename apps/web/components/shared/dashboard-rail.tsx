'use client'

import { usePathname } from 'next/navigation'
import {
  BookOpen,
  LayoutGrid,
  Palette,
  BarChart3,
  Building2,
  Store,
  Users,
  CreditCard,
  UserCog,
} from 'lucide-react'
import { NavItem } from '@/components/shared/nav-item'
import {
  ANALYTICS_BUILT,
  BRAND_KIT_BUILT,
  CATALOG_BUILT,
  TEAM_BUILT,
} from '@/lib/features'

/**
 * The left rail. Governed by the design skill → references/layout-map.md.
 *
 * **A client component that imports its own icons**, rather than a server
 * layout passing them down. `NavItem` takes `icon: LucideIcon` — a function —
 * and a function cannot cross the server/client boundary: React refuses to
 * serialize it and every page under the shell returns a 500. Keeping the icon
 * imports on this side of the line means nothing is passed across.
 *
 * It also has to be a client component anyway, to read the pathname for the
 * active state.
 *
 * Three scope zones: shop, org, then the user pinned to the foot.
 */
/**
 * **Destinations are gated on lib/features.ts, and an unbuilt one is omitted.**
 * Catalog and Analytics shipped as ordinary enabled items pointing at routes
 * that did not exist, so the rail 404'd twice — the exact failure the "never
 * link to a screen that does not exist yet" rule exists to prevent, in the one
 * component every signed-in screen renders.
 *
 * Omitted rather than disabled-with-a-reason. Both are sanctioned by that rule,
 * but the rail collapses to 64px of icons below 1024px, where there is nowhere
 * to put a reason — and the design system bars a reason that exists only in a
 * tooltip, because the product ships on tablets where hover does not happen.
 *
 * Flip the flag in the change that adds the route and the item comes back.
 */
const SHOP_SCOPE = [
  { icon: BookOpen, label: 'Offer books', href: '/', built: true },
  { icon: LayoutGrid, label: 'Catalog', href: '/catalog', built: CATALOG_BUILT },
  { icon: Palette, label: 'Brand kit', href: '/brand', built: BRAND_KIT_BUILT },
  { icon: BarChart3, label: 'Analytics', href: '/analytics', built: ANALYTICS_BUILT },
].filter((item) => item.built)

/**
 * `Organization` is a fourth item here, added by E2-01. layout-map.md's rail
 * diagram has been amended to match — the map is the specification, so adding
 * a destination means editing both or neither.
 *
 * `Billing` is last in the rail and now leads somewhere: E3 built
 * `/settings/billing`. The screen is owner-only and redirects everyone else, so
 * the item is still shown to a manager and still costs them a round trip —
 * see docs/E3-pending.md, which proposes filtering the rail by role rather than
 * having each screen turn people away at the door.
 */
const ORG_SCOPE = [
  { icon: Building2, label: 'Organization', href: '/settings/organization', built: true },
  { icon: Store, label: 'Shops', href: '/settings/shops', built: true },
  { icon: Users, label: 'Team', href: '/settings/team', built: TEAM_BUILT },
  { icon: CreditCard, label: 'Billing', href: '/settings/billing', built: true },
].filter((item) => item.built)

const USER_SCOPE = [{ icon: UserCog, label: 'Account', href: '/settings/account' }]

export function DashboardRail() {
  const pathname = usePathname()

  // Home is an exact match; everything else owns its subtree, so the editor
  // still highlights Offer books.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="flex w-16 shrink-0 flex-col gap-1 border-e-hairline border-border-subtle bg-surface p-2 lg:w-64 lg:p-3"
    >
      <div className="flex flex-col gap-1">
        {SHOP_SCOPE.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>

      <hr className="my-2 border-t-hairline border-border-subtle" />

      <div className="flex flex-col gap-1">
        {ORG_SCOPE.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        {USER_SCOPE.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  )
}
