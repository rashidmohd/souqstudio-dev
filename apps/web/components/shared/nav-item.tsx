'use client'

import * as React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * NavItem. Governed by the design skill → Components → Navigation items, and by
 * references/component-inventory.md, which owns this signature.
 *
 * The active background is --sq-blue-50, a pale tint — deliberately not the solid
 * --sq-blue the primary button carries, so an active nav item never reads as a CTA.
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
      className={cn(
        'flex min-h-control items-center gap-3 rounded-control',
        'font-ui text-body transition-colors duration-fast ease-sq',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        active ? 'bg-selected-bg text-selected-fg' : 'text-secondary hover:bg-stone-100',
        collapsed ? 'justify-center px-0' : 'justify-center px-0 lg:justify-start lg:px-3'
      )}
    >
      {/* Every row's leading element occupies the same 28px box, whatever it
          holds. A 20px glyph, a 28px avatar and the switcher's 28px chip
          otherwise start their labels in two different columns 8px apart, and
          centre on two different axes once the rail collapses. The box is the
          column; what sits in it is not. */}
      <span className="flex h-chip w-chip shrink-0 items-center justify-center">
        {leading ?? <Icon className="size-icon-lg" aria-hidden="true" />}
      </span>
      {collapsed ? null : <span className="hidden truncate lg:inline">{label}</span>}
    </Link>
  )
}
