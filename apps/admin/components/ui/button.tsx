import Link from 'next/link'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Every button is a full pill. souqstudio-design → Controls.
 *
 * The variant set is the design system's, minus `danger solid`: that one is
 * "the confirm inside a dialog", and this app has no dialogs yet. Adding it
 * when the first destructive dialog lands is a one-line change; shipping an
 * unused variant invites it to be used as a page-level button, which is the
 * thing it is not.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Readonly<Record<Variant, string>> = {
  primary:
    'bg-action-primary text-action-primary-fg hover:bg-action-primary-hover disabled:hover:bg-action-primary',
  secondary:
    'border border-border-strong text-primary hover:bg-surface-hover disabled:hover:bg-transparent',
  ghost: 'text-secondary hover:bg-surface-hover hover:text-primary disabled:hover:bg-transparent',
  danger:
    'border border-critical-fg text-action-danger hover:bg-critical-bg disabled:hover:bg-transparent',
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** Replaces the label with a spinner and holds the width. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', loading = false, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // A button that shrinks to a spinner moves everything beside it, so the
      // label stays in the DOM and is hidden rather than removed.
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex h-control min-w-control items-center justify-center gap-2 rounded-pill px-3',
        'text-body font-medium transition-colors duration-fast ease-sq',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-disabled',
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
      {loading ? (
        <span
          aria-hidden="true"
          className="absolute size-icon animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
    </button>
  )
})

/**
 * A link that looks like a button.
 *
 * Separate from `Button` rather than a `asChild` prop on it: a navigation and a
 * submission are different elements, and wrapping one in the other produces a
 * link inside a button, which is invalid and which keyboard users land on
 * twice. shadcn's `asChild` exists to avoid this and needs Radix's `Slot`;
 * this app has neither, and two exports are cheaper than the dependency.
 */
export function ButtonLink({
  href,
  variant = 'secondary',
  className,
  children,
}: {
  href: string
  variant?: Variant
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-control min-w-control items-center justify-center gap-2 rounded-pill px-3',
        'text-body font-medium transition-colors duration-fast ease-sq',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </Link>
  )
}
