import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Card. Governed by the design skill → Components → Cards, and by
 * references/component-inventory.md, which owns this signature.
 *
 * Separation is a hairline border and surface tone. There is no elevation in
 * this system — `boxShadow` in the Tailwind config resolves to `none` and
 * nothing else, so a shadow cannot be added here by accident.
 *
 * A card inside a card means the hierarchy is wrong. The type cannot express
 * that; it is a review catch.
 */
type CardProps = {
  /** 12px compact, 16px default. */
  padding?: 'compact' | 'default' | undefined
} & React.HTMLAttributes<HTMLDivElement>

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'default', className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card border-hairline border-border-subtle bg-surface',
        padding === 'compact' ? 'p-3' : 'p-4',
        className
      )}
      {...props}
    />
  )
})
