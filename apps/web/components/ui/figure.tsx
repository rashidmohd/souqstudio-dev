import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Figure. Governed by the design skill → Typography → Figures, and by
 * references/component-inventory.md, which owns this signature.
 *
 * Every number in the chrome goes through here or through a bare
 * `[data-figure]`: prices, counts, percentages, invoice amounts, dates.
 *
 * `data-figure` is not decoration. The token file uses it to apply Plex Mono
 * with tabular figures **and bidi isolation**, which is what stops a number
 * visually reordering when it sits inside an Arabic sentence. "3 shops" beside
 * Arabic text without it can render with the 3 in the wrong place — a defect
 * invisible to anyone testing in English only.
 */
type FigureProps = {
  value: string | number
  /** Currency code, rendered before the value: `AED 1,842.00`. Always Latin. */
  currency?: string | undefined
  size?: 'data-sm' | 'data' | 'data-lg' | undefined
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>

/**
 * Written out rather than interpolated. Tailwind scans source text for class
 * names, so `text-${size}` produces no CSS at all — it compiles, it renders,
 * and it is silently unstyled.
 */
const SIZE_CLASS = {
  'data-sm': 'text-data-sm',
  data: 'text-data',
  'data-lg': 'text-data-lg',
} as const

export const Figure = React.forwardRef<HTMLSpanElement, FigureProps>(function Figure(
  { value, currency, size = 'data', className, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      data-figure=""
      className={cn('font-figure', SIZE_CLASS[size], className)}
      {...props}
    >
      {/* Thin space between code and amount, per the currency rule:
          `AED 12.90`. Written as the \u2009 escape rather than typed literally —
          a literal one is invisible in review, indistinguishable from an
          ordinary space, and eslint's no-irregular-whitespace refuses it. */}
      {currency ? `${currency}\u2009` : ''}
      {value}
    </span>
  )
})
