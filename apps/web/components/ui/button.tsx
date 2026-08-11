'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Button. Governed by the design skill → Components → Buttons, and by
 * references/component-inventory.md, which owns this signature.
 *
 * Buttons are pills; inputs are rectangles. The shape carries the affordance,
 * which is why --sq-radius-pill and --sq-radius-control are separate tokens.
 *
 * The default variant is `secondary`, not `primary`. A primary has to be chosen
 * deliberately — one per screen region.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-pill font-ui text-body font-medium',
    'transition-colors duration-fast ease-sq',
    // Never remove the outline without replacing it. 2px ring, 2px offset.
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
    // If a button is disabled, the reason must be visible on screen — never
    // tooltip-only, which is unreachable on tablet.
    'disabled:opacity-disabled disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-action-primary text-action-primary-fg hover:bg-action-primary-hover',
        secondary: 'bg-transparent text-primary border border-border-strong hover:bg-stone-100',
        ghost: 'bg-transparent text-secondary hover:bg-stone-100',
        danger: 'bg-transparent text-action-danger border border-critical-fg hover:bg-critical-bg',
        // Only ever the confirm inside a dialog. Lint cannot catch that; review must.
        'danger-solid': 'bg-critical-fg text-stone-0 hover:bg-critical-hover',
      },
      size: {
        default: 'h-control',
        lg: 'h-control-lg',
      },
      iconOnly: {
        // Circular at the full control height — a glyph padded to the target,
        // never a small tap area.
        true: 'aspect-square p-0',
        false: '',
      },
    },
    compoundVariants: [
      { iconOnly: false, size: 'default', class: 'px-3' },
      { iconOnly: false, size: 'lg', class: 'px-4' },
    ],
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
      iconOnly: false,
    },
  }
)

type ButtonBaseProps = Omit<VariantProps<typeof button>, 'iconOnly'> & {
  /** Replaces the label with a spinner and holds the button's width. */
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

/**
 * `iconOnly` demands an aria-label in the type itself. The inventory calls an
 * icon-only button without one a defect, so the compiler refuses it rather than
 * leaving it to review.
 */
type ButtonProps =
  | (ButtonBaseProps & { iconOnly: true; 'aria-label': string })
  | (ButtonBaseProps & { iconOnly?: false })

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, iconOnly, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      // A loading button is not pressable, but stays focusable so the reason
      // stays reachable by keyboard.
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(button({ variant, size, iconOnly: iconOnly ?? false }), 'relative', className)}
      {...props}
    >
      {/* The label stays in the DOM while loading, holding the width. A button
          that resizes mid-action moves everything beside it. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  )
)

Button.displayName = 'Button'
