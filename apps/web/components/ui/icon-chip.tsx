import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * IconChip. Governed by the design skill → Components → Icon chips, and by
 * references/component-inventory.md, which owns this signature.
 *
 * A rounded square from the tint set holding one 16px stroked icon. Used at the
 * top of stat cards, beside list items, and inside tinted cards. It is the
 * cheapest way to stop a list of rows reading as a text dump, and it is where
 * most of the sand in this product is meant to live.
 *
 * **Decorative only — never the tap target.** There is no `onClick` and there
 * will not be one; the absent prop is the enforcement. If the icon must be
 * pressable it is a `Button` with `iconOnly`, which is circular so the two can
 * never be confused at a glance.
 *
 * The icon inherits `--sq-charcoal` through `currentColor`, so a chip works on
 * any tint in the set without a second colour decision. Sky is safe here even
 * though it cannot carry text: an icon is judged at the 3:1 non-text floor
 * (WCAG 1.4.11), which sky clears at 3.02:1.
 */
type IconChipProps = {
  /** The component itself, not a string name. */
  icon: LucideIcon
  tint?: 'sand' | 'sand-tint' | 'sky-tint' | undefined
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>

const TINT_CLASS = {
  sand: 'bg-sand',
  'sand-tint': 'bg-sand-tint',
  'sky-tint': 'bg-sky-tint',
} as const

export const IconChip = React.forwardRef<HTMLSpanElement, IconChipProps>(function IconChip(
  { icon: Icon, tint = 'sand', className, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      // Decoration. The adjacent text is the label, so a screen reader must not
      // announce this at all.
      aria-hidden="true"
      className={cn(
        'inline-flex size-chip shrink-0 items-center justify-center rounded-chip',
        'text-charcoal',
        TINT_CLASS[tint],
        className
      )}
      {...props}
    >
      {/* 1.75 rather than the default 2: at 16px a 2px stroke reads noticeably
          heavier than the same stroke at 20px. Optical compensation, per Icons. */}
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
})
