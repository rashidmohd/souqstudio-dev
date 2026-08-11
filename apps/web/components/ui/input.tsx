'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Input. Governed by the design skill → Components → Inputs and → Forms, and by
 * references/component-inventory.md, which owns this signature.
 *
 * `label` is required in the type, not optional-with-a-warning. That is the
 * enforcement — placeholder-as-label disappears the moment someone types and
 * fails every accessibility check.
 */
/**
 * The `| undefined` on each optional prop is required by `exactOptionalPropertyTypes`
 * in the shared tsconfig: without it a caller may omit the prop but may not pass
 * a variable that happens to be undefined, which is exactly what a form's error
 * state is. Same signature as the inventory, spelled for the stricter flag.
 */
type InputProps = {
  label: string
  hint?: string | undefined
  /** Renders below the field and turns the border critical. Never colour alone. */
  error?: string | undefined
  required?: boolean | undefined
  /** Prices and quantities: mono, tabular, aligned to the inline end. */
  figure?: boolean | undefined
  /**
   * 32px default, 40px `lg` — 44/48 on coarse pointers, from the token file.
   * Same vocabulary as Button, deliberately: two components with `size` should
   * not disagree about what the values are called.
   *
   * `lg` is for single-purpose screens where a field is the whole task — login,
   * signup, code entry. Dense screens stay on the default.
   */
  size?: 'default' | 'lg' | undefined
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      required = false,
      figure = false,
      size = 'default',
      className,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    const hintId = `${inputId}-hint`
    const errorId = `${inputId}-error`

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="font-ui text-label font-medium text-primary">
          {label}
          {/* The asterisk follows the label. The form must also carry a visible
              "* Required" legend — an asterisk alone means nothing to a screen
              reader user, or to someone reading in their third language. */}
          {required ? (
            <span className="text-critical-fg" aria-hidden="true">
              {' *'}
            </span>
          ) : null}
        </label>

        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint && hintId, error && errorId) || undefined}
          data-figure={figure || undefined}
          className={cn(
            'w-full rounded-control bg-input px-3',
            size === 'lg' ? 'h-control-lg' : 'h-control',
            'font-ui text-body text-primary',
            'border border-border-strong',
            'placeholder:text-muted',
            'transition-colors duration-fast ease-sq',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
            'disabled:opacity-disabled',
            // Figures are mono and tabular so decimal points stack, and aligned
            // to the inline end rather than the right — this ships in Arabic.
            figure && 'font-figure text-end tabular-nums',
            error && 'border-critical-fg',
            className
          )}
          {...props}
        />

        {/* One message per field, below it, alongside the border colour. The
            error supersedes the hint rather than stacking with it. */}
        {error ? (
          <p id={errorId} className="font-ui text-body-sm text-critical-fg">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="font-ui text-body-sm text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
)

Input.displayName = 'Input'
