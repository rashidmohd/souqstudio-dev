import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Inputs are rectangles at `--sq-radius-control`, where buttons are pills. The
 * shape carries the affordance. souqstudio-design → Controls.
 */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-control w-full rounded-control border border-border-strong bg-input px-3',
          'text-body text-primary placeholder:text-muted',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'disabled:cursor-not-allowed disabled:opacity-disabled',
          className
        )}
        {...props}
      />
    )
  }
)

/**
 * A numeric input. Mono, tabular and aligned to the inline-end so decimal
 * points stack. souqstudio-design → Inputs.
 */
export const NumberInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function NumberInput({ className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        inputMode="decimal"
        data-figure=""
        className={cn('text-end font-figure text-data', className)}
        {...props}
      />
    )
  }
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-control border border-border-strong bg-input px-3 py-2',
        'text-body text-primary placeholder:text-muted',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-disabled',
        className
      )}
      {...props}
    />
  )
})

/**
 * Native `<select>`, per the platform-primitives rule in CLAUDE.md: the
 * platform does the mobile picker better than a reimplementation.
 */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-control w-full rounded-control border border-border-strong bg-input px-3',
          'text-body text-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'disabled:cursor-not-allowed disabled:opacity-disabled',
          className
        )}
        {...props}
      >
        {children}
      </select>
    )
  }
)
