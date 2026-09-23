'use client'

import * as React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@souqstudio/designer/lib/utils'

/**
 * NavItem. Governed by the design skill → Components → Navigation items, and by
 * references/component-inventory.md, which owns this signature.
 *
 * The active background is --sq-olive-50, a pale tint — deliberately not the solid
 * --sq-olive the primary button carries, so an active nav item never reads as a CTA.
 */
type NavItemProps = {
  icon: LucideIcon
  label: string
  href: string
  active?: boolean | undefined
  /**
   * Icon-only at every width. This is the *owner's* collapse, carried down from
   * the rail's toggle and remembered in `sq_rail`.
   *
   * It is not how the responsive collapse works, and it never can be: a
   * breakpoint cannot be expressed as a boolean without measuring the viewport
   * in JavaScript, which would flash the wrong state on first paint. Below
   * 1024px the label is hidden by `hidden lg:inline` instead, so the two
   * mechanisms compose — collapsed by choice, collapsed by width, or both.
   */
  collapsed?: boolean | undefined
  /**
   * Replaces the icon. The account row is a person rather than a destination,
   * so it passes an `Avatar`.
   *
   * `icon` stays required rather than going optional alongside this. Every row
   * still has to name a glyph, so a row with neither is not expressible and the
   * rail keeps one shape for its items instead of two.
   */
  leading?: React.ReactNode
}

/**
 * **The row's shape, exported, because one row in the rail is not a link.**
 *
 * `UnfinishedWork` opens a panel rather than going anywhere — E12 has not built
 * a notifications screen, and the rail's own rule bars linking to one that does
 * not exist — but it is still one of the rail's items and has to be built from
 * the same measurements, not from a copy of them that drifts. It renders a
 * `<button>` with these classes; everything else here renders a `<Link>`.
 *
 * `active` is the pale-tint selected state, which that button borrows to show
 * its panel is open.
 */
export function navRowClass(options: { active?: boolean; collapsed?: boolean } = {}): string {
  const { active = false, collapsed = false } = options

  return cn(
    'flex min-h-control items-center gap-3 rounded-control',
    'font-ui text-body transition-colors duration-fast ease-sq',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
    active ? 'bg-selected-bg text-selected-fg' : 'text-secondary hover:bg-stone-100',
    collapsed ? 'justify-center px-0' : 'justify-center px-0 lg:justify-start lg:px-3'
  )
}

/**
 * **The leading box, exported for the same reason.** Every row's glyph sits in
 * the same 28px column. A 20px glyph, a 28px avatar and the switcher's 28px
 * chip otherwise start their labels in two different columns 8px apart, and
 * centre on two different axes once the rail collapses. The box is the column;
 * what sits in it is not.
 */
export const NAV_ROW_LEADING = 'flex h-chip w-chip shrink-0 items-center justify-center'

/**
 * **The label, exported for the same reason.** Hidden below 1024px by CSS
 * rather than by the `collapsed` boolean — see that prop.
 */
export const NAV_ROW_LABEL = 'hidden truncate lg:inline'

export function NavItem({
  icon: Icon,
  label,
  href,
  active = false,
  collapsed = false,
  leading,
}: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // Always set, at every width. The label is hidden visually when the rail
      // is narrow, never semantically — a rail of unlabelled glyphs is
      // unusable with a screen reader, and `title` alone is unreachable on a
      // tablet.
      aria-label={label}
      title={label}
      className={navRowClass({ active, collapsed })}
    >
      <span className={NAV_ROW_LEADING}>
        {leading ?? <Icon className="size-icon-lg" aria-hidden="true" />}
      </span>
      {collapsed ? null : <span className={NAV_ROW_LABEL}>{label}</span>}
    </Link>
  )
}
