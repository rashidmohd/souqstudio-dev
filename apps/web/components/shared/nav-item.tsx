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
   * Force icon-only at every width. The rail already collapses on its own below
   * 1024px through CSS — a breakpoint cannot be expressed as a boolean without
   * measuring the viewport in JavaScript, which would flash the wrong state on
   * first paint. Use this only where something is deliberately narrow.
   */
  collapsed?: boolean | undefined
}

export function NavItem({ icon: Icon, label, href, active = false, collapsed = false }: NavItemProps) {
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
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {collapsed ? null : <span className="hidden truncate lg:inline">{label}</span>}
    </Link>
  )
}
