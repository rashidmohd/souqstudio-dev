'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Six-digit code entry.
 *
 * **Six boxes, one input.** The boxes are presentational; a single transparent
 * input sits over them and holds the value. Six real inputs is the obvious
 * implementation and the wrong one — it has to reimplement focus shuffling,
 * backspace across boxes and paste-splitting, and it still tends to defeat iOS
 * and Android autofill, which target one field with `autocomplete="one-time-code"`.
 *
 * With one input, paste, autofill, password managers, and screen readers all
 * work as they normally would, and the six boxes are purely how it looks.
 */
type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  length?: number
  error?: boolean
  autoFocus?: boolean
  disabled?: boolean
}

export const OtpInput = React.forwardRef<HTMLInputElement, Props>(function OtpInput(
  { label, value, onChange, length = 6, error = false, autoFocus = false, disabled = false },
  forwardedRef
) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [focused, setFocused] = React.useState(false)
  const id = React.useId()

  // Both refs point at the one real input: the parent focuses it after a
  // rejected code, and the box row focuses it on tap.
  React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement)

  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  // The box that will receive the next digit — clamped so the last box stays
  // highlighted once the code is complete rather than pointing past the end.
  const activeIndex = Math.min(value.length, length - 1)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-ui text-label font-medium text-primary">
        {label}
      </label>

      <div
        className="relative"
        // Tapping anywhere on the row focuses the single real input.
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex justify-between gap-2" aria-hidden="true">
          {digits.map((digit, index) => {
            const isActive = focused && index === activeIndex
            return (
              <div
                key={index}
                className={cn(
                  'flex size-12 items-center justify-center rounded-control',
                  'border bg-input font-figure text-heading text-primary tabular-nums',
                  'transition-colors duration-fast ease-sq',
                  error
                    ? 'border-critical-fg'
                    : isActive
                      ? 'border-border-focus'
                      : 'border-border-strong',
                  // A second ring on the active box so the caret position is
                  // obvious without a real caret to look at.
                  isActive && 'outline outline-2 outline-offset-2 outline-border-focus'
                )}
              >
                {digit}
              </div>
            )
          })}
        </div>

        {/* The actual field. Transparent rather than hidden — it must stay
            focusable, and it is what autofill and password managers see. */}
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={length}
          aria-invalid={error || undefined}
          className="absolute inset-0 size-full cursor-default opacity-0 outline-none"
        />
      </div>
    </div>
  )
})
