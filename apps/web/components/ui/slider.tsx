import * as React from 'react'
import { Figure } from '@/components/ui/figure'
import { cn } from '@/lib/utils'

/**
 * Slider. Owned by `references/component-inventory.md`.
 *
 * **For a bounded quantity an owner adjusts by eye** — opacity, and anything
 * else that runs 0 to 100 with no meaningful precision beyond a percent. Not for
 * a number that has to be exact: a price, a count, a corner radius in points.
 * Those stay `Input`, where a value can be typed rather than hunted for.
 *
 * The distinction is whether the *result* is the point or the number is. An
 * owner setting opacity is looking at the card and stops when it looks right,
 * and a field makes them convert that judgement into a number and back. An owner
 * setting a radius has a number in mind.
 *
 * **A native `<input type="range">`, styled**, for the same reason `ColorField`
 * wraps a native colour input and `Select` a native select: on the phone a shop
 * owner is actually holding, the platform control already has the drag
 * behaviour, the keyboard support and the accessibility tree, and every
 * hand-rolled version of this loses at least one of the three. The track and
 * thumb are vendor pseudo-elements that no utility class reaches, so they are
 * styled in `globals.css` under `.sq-slider` — the same arrangement, and the
 * same reasoning, as `.sq-swatch`.
 *
 * **The value is shown, not guessed at.** A slider with no readout is a control
 * an owner cannot report the state of — "about three quarters" is not something
 * you can say to support, or match on a second block.
 */
type SliderProps = {
  /** Required, as on every other control here. A bare track names nothing. */
  label: string
  hint?: string | undefined
  value: number
  min?: number | undefined
  max?: number | undefined
  step?: number | undefined
  /** Rendered after the value — `%`, `°`. Kept short; it sits in the label row. */
  unit?: string | undefined
  onValueChange: (value: number) => void
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'min' | 'max' | 'step' | 'onChange' | 'type'
>

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { label, hint, value, min = 0, max = 100, step = 1, unit, onValueChange, className, id, ...props },
  ref
) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`

  return (
    <div className="flex flex-col gap-1">
      {/* Label and readout on one line. A readout below the track would put the
          number further from the label that names it than from the next
          control's label, which is how a dense panel stops parsing. */}
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="font-ui text-label font-medium text-primary">
          {label}
        </label>
        <span className="font-ui text-body-sm text-secondary">
          <Figure value={value} size="data-sm" />
          {unit === undefined ? null : unit}
        </span>
      </div>

      <input
        ref={ref}
        id={inputId}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className={cn('sq-slider w-full', className)}
        {...props}
      />

      {hint === undefined ? null : (
        <p id={hintId} className="font-ui text-body-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
})
