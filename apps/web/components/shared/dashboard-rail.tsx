'use client'

import * as React from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  Palette,
  BarChart3,
  Building2,
  Store,
  Users,
  CreditCard,
  UserCog,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ShopSwitcher } from '@/components/shop/ShopSwitcher'
import { NavItem } from '@/components/shared/nav-item'
import { cn } from '@/lib/utils'
import { railCookie, type RailState } from '@/lib/rail-preference'
import type { ShopOption } from '@/lib/shops'
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
 *
 * **Two collapses, and only one of them is the owner's.** Below 1024px the rail
 * is 64px of icons through CSS alone, because a breakpoint cannot be a boolean
 * without measuring the viewport and flashing the wrong state — see
 * `NavItem.collapsed`. At and above 1024px the owner decides, and the choice is
 * remembered in `sq_rail` and read by the server layout, so the rail is born at
 * the right width rather than correcting itself after hydration.
 *
 * The toggle is therefore hidden below 1024px. Offering it there would promise
 * an expansion the breakpoint immediately overrules.
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

export function DashboardRail({
  initialState,
  userName,
  userEmail,
  shops,
  activeShopId,
  organizationName,
}: {
  initialState: RailState
  userName: string | null
  userEmail: string
  shops: ShopOption[]
  activeShopId: string | null
  organizationName: string | null
}) {
  const pathname = usePathname()
  const [state, setState] = React.useState<RailState>(initialState)
  const collapsed = state === 'collapsed'

  function toggle() {
    const next: RailState = collapsed ? 'expanded' : 'collapsed'
    setState(next)
    document.cookie = railCookie(next, window.location.protocol === 'https:')
  }

  // Home is an exact match; everything else owns its subtree, so the editor
  // still highlights Offer books.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      id="dashboard-rail"
      aria-label="Main"
      className={cn(
        'flex w-rail-collapsed shrink-0 flex-col gap-1 border-e-hairline border-border-subtle bg-surface p-2',
        // Sticky, and the three classes are one mechanism, not three choices.
        // A flex child stretches to the container's full height by default,
        // which leaves `sticky` nothing to travel within and silently does
        // nothing: `self-start` stops the stretch, `h-dvh` then gives the rail
        // the viewport's height, and `top-0` pins it there. `h-dvh` rather than
        // `h-screen` because 100vh overshoots under a mobile browser's
        // retracting toolbar.
        //
        // `overflow-y-auto` is the short-viewport case. The rail is the one
        // component every signed-in screen renders, and a laptop in a video
        // call is not tall — without it, Account drops off the bottom with no
        // way to reach it.
        'sticky top-0 h-dvh self-start overflow-y-auto',
        // No width transition. The design system permits opacity and transform
        // only — animating width forces layout on every frame and stutters on
        // the mid-range tablets these shops actually use.
        collapsed ? 'lg:w-rail-collapsed lg:p-2' : 'lg:w-rail lg:p-3'
      )}
    >
      {/* The mark, per references/brand-assets.md: the wordmark where there is
          room for it, the square icon where there is not. Deliberately not a
          link — `Offer books` sits directly below and already goes home, and two
          controls to one destination is one too many.

          Which mark shows is not the same question as which state the owner
          chose. Below 1024px the rail is 64px wide however they left it, and a
          148px wordmark does not fit, so the icon carries every narrow case and
          the wordmark appears only when the rail is both wide and expanded. */}
      <div
        className={cn(
          // 24px below the mark against 4px between nav rows: the mark is a
          // header, not the first item, and at 8px it read as neither. The
          // nav's own `gap-1` adds 4px on top of this.
          'mb-6 flex items-center gap-2',
          // `ps-3`, not `ps-2`. Nav rows pad themselves 12px inside the rail's
          // 12px, so a label starts 24px from the edge; the mark has to start
          // there too or the rail has two left edges.
          collapsed ? 'flex-col' : 'flex-col lg:flex-row lg:justify-between lg:gap-2 lg:ps-3'
        )}
      >
        <Image
          src="/brand/icon.svg"
          alt="SouqStudio"
          width={24}
          height={24}
          // `unoptimized` for the same reason as the illustrations in
          // empty-state: the optimizer has nothing to do to a local SVG.
          unoptimized
          priority
          className={cn('size-6', collapsed ? undefined : 'lg:hidden')}
        />
        {collapsed ? null : (
          <Image
            src="/brand/logo.svg"
            alt="SouqStudio"
            width={138}
            height={24}
            unoptimized
            priority
            className="hidden h-6 w-auto lg:block"
          />
        )}

        {/* The icons point at the rail, so they mirror when the rail moves to
            the other edge in Arabic. -scale-x is a transform, not a physical
            class. */}
        <Button
          variant="ghost"
          iconOnly
          // Hidden below 1024px, where the breakpoint has already decided the
          // width and an expand control would promise what CSS overrules.
          className="hidden lg:inline-flex"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="dashboard-rail"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-icon-lg rtl:-scale-x-100" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-icon-lg rtl:-scale-x-100" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Each zone is headed by what it is scoped to, which is the whole point
          of the divider below. Without these the rail is one column of nine
          destinations and nothing says that `Brand kit` belongs to a branch
          while `Shops` belongs to the business. */}
      <ShopSwitcher shops={shops} activeShopId={activeShopId} collapsed={collapsed} />

      <div className="flex flex-col gap-1">
        {SHOP_SCOPE.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>

      <hr className="my-3 border-t-hairline border-border-subtle" />

      {/* The eyebrow role is 11px mono, and the scale calls it caps — but this
          is a proper name, and the system's own casing rule keeps those in
          their own casing. So: the eyebrow's size and colour, the name's
          capitals. Hidden wherever the rail is narrow; 64px cannot hold a
          business name and truncating one to three letters says nothing. */}
      {organizationName && !collapsed ? (
        <p className="mb-1 hidden truncate px-3 font-figure text-eyebrow text-muted lg:block">
          {organizationName}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        {ORG_SCOPE.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>

      {/* The user zone. `leading` carries an avatar rather than the glyph: this
          row is a person, which is the whole reason it is pinned down here away
          from the org's own settings. The label stays `Account` — the
          destination is what the row promises, and the avatar is what says
          whose it is. */}
      <div className="mt-auto flex flex-col gap-1">
        {USER_SCOPE.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            collapsed={collapsed}
            leading={<Avatar name={userName} email={userEmail} />}
          />
        ))}
      </div>
    </nav>
  )
}
