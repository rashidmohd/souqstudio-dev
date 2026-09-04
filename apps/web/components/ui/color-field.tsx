'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ColorField. Governed by the design skill → Components → Inputs, and by
 * references/component-inventory.md, which owns this signature.
 *
 * One control, not two: a swatch fused to a hex field inside a single bordered
 * shell. The swatch was a separate square beside a separate input, which read as
 * two unrelated widgets and left the shop's colour rattling around inside a form
 * field it did not fill.
 *
 * **A native `<input type="color">`, not a popover picker.** shadcn/ui ships no
 * colour picker; the community ones are built on Popover and Slider, neither of
 * which exists here, and both arrive with shadows this system does not have.
 * Native gives the platform picker on the phone a shop owner is actually
 * holding, with its own accessibility tree — the same trade `Select` makes for
 * the same reason. `.sq-swatch` in globals.css is what makes it look like ours.
 *
 * The hex field accepts what is typed, valid or not. Rejecting mid-keystroke
 * fights the person typing; `error` is the caller's to pass once they have
 * stopped.
 *
 * **`size` uses `Input`'s vocabulary and defaults to the same value**, so a
 * colour field beside a text field lines up without anyone hand-tuning an
 * offset. The inventory raised this against `Select` — "without it a select
 * beside a `size="lg"` input will not line up" — and it is the same bug here.
 * Two controls with a `size` prop must not disagree about what the values mean.
 */
type ColorFieldProps = {
  label: string
  value: string
  onChange: (hex: string) => void
  hint?: string | undefined
  /** Shown below and turns the shell critical. Never colour alone. */
  error?: string | undefined
  /** Fired on focus anywhere in the row. Lets a caller track the active slot. */
  onActivate?: (() => void) | undefined
  /** 32px default, 40px `lg` — the same vocabulary as `Input` and `Button`. */
  size?: 'default' | 'lg' | undefined
  id?: string | undefined
}

export function ColorField({
  label,
  value,
  onChange,
  hint,
  error,
  onActivate,
  size = 'default',
  id,
}: ColorFieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  return (
    <div className="flex flex-col gap-1" onFocusCapture={onActivate}>
      <label htmlFor={fieldId} className="font-ui text-label font-medium text-primary">
        {label}
      </label>

      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-control',
          size === 'lg' ? 'h-control-lg' : 'h-control',
          'border-hairline bg-input',
          error ? 'border-border-critical' : 'border-border-strong'
        )}
      >
        {/* Fills its tile edge to edge — see `.sq-swatch`. The label is on the
            hex field beside it, so this must not announce itself twice. */}
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour picker`}
          className={cn(
            'sq-swatch h-full shrink-0 border-e-hairline border-border-strong',
            size === 'lg' ? 'w-12' : 'w-8'
          )}
        />

        <input
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          data-figure
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint && hintId, error && errorId) || undefined}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3 font-figure text-body text-primary',
            'outline-none placeholder:text-muted'
          )}
        />
      </div>

      {error ? (
        <p id={errorId} className="font-ui text-body-sm text-critical-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="font-ui text-body-sm text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
