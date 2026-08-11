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
const SHOP_SCOPE = [
  { icon: BookOpen, label: 'Offer books', href: '/' },
  { icon: LayoutGrid, label: 'Catalog', href: '/catalog' },
  { icon: Palette, label: 'Brand kit', href: '/brand' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
]

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
  { icon: Building2, label: 'Organization', href: '/settings/organization' },
  { icon: Store, label: 'Shops', href: '/settings/shops' },
  { icon: Users, label: 'Team', href: '/settings/team' },
  { icon: CreditCard, label: 'Billing', href: '/settings/billing' },
]

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
