'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * CheckCards. Governed by the design skill → Components → Inputs, and by
 * `references/component-inventory.md`, which owns this signature.
 *
 * **The any-of counterpart to `RadioCards`, and a separate component rather than
 * a `multiple` flag on it.** That is the rule `Segmented` and `ToggleBar`
 * already established here and the reasoning is the same: the value type changes
 * from `T` to `T[]` and the callback shape changes with it, which is two
 * components wearing one name. The visual treatment is deliberately identical —
 * only the input type and the cap differ — so a form carrying both does not read
 * as two different kinds of control.
 *
 * `max` exists because the lists this is used for feed a generation prompt. A
 * shop claiming eight business segments has told a model nothing it can draw
 * from. At the cap, unselected options go disabled rather than silently
 * ignoring a click — an option that does nothing when pressed reads as broken.
 */

export type CheckCardOption<T extends string> = {
  value: T
  label: string
  /** One line under the label. What this choice actually means. */
  description?: string
  disabled?: boolean
}

type CheckCardsProps<T extends string> = {
  /** The group's own label. Rendered, never a placeholder. */
  label: string
  value: T[]
  options: CheckCardOption<T>[]
  onChange: (value: T[]) => void
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  /** How many may be chosen. Unselected options disable at the cap. */
  max?: number | undefined
  /** One column reads as a list, two as a grid. Two below `sm` is too tight. */
  columns?: 1 | 2 | undefined
  className?: string | undefined
}

export function CheckCards<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  disabled = false,
  max,
  columns = 2,
  className,
}: CheckCardsProps<T>) {
  const groupId = React.useId()
  const hintId = `${groupId}-hint`
  const errorId = `${groupId}-error`

  const full = max !== undefined && value.length >= max

  function toggle(option: T) {
    /**
     * **Selection order is kept, and it is not incidental.** The first segment
     * is what the shop leads with, and it reaches a prompt in that order — so
     * re-selecting one appends rather than restoring its original position.
     */
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option])
  }

  return (
    <fieldset
      className={cn('flex flex-col gap-2', className)}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={cn(hint && hintId, error && errorId) || undefined}
    >
      <legend className="font-ui text-label font-medium text-primary">
        {label}
        {required ? (
          <span className="text-critical-fg" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </legend>

      <div className={cn('grid gap-2', columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
        {options.map((option) => {
          const selected = value.includes(option.value)
          // At the cap, what is already chosen stays clickable so it can be
          // unchosen. Only the rest go inert.
          const inert = disabled || option.disabled || (full && !selected)

          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 rounded-block border p-3',
                'transition-colors duration-fast ease-sq',
                selected
                  ? 'border-border-focus bg-sand'
                  : 'border-border-strong hover:bg-stone-100',
                inert ? 'cursor-not-allowed opacity-disabled' : 'cursor-pointer',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus'
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={inert}
                onChange={() => toggle(option.value)}
                className="mt-1 size-4 shrink-0 accent-action-primary"
              />
              <span className="flex flex-col gap-1">
                <span className="font-ui text-label text-primary">{option.label}</span>
                {option.description === undefined ? null : (
                  <span className="font-ui text-body-sm text-secondary">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>

      {error ? (
        <p id={errorId} className="font-ui text-body-sm text-critical-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="font-ui text-body-sm text-muted">
          {hint}
          {max === undefined ? null : (
            <>
              {' '}
              <span data-figure>{value.length}</span> of <span data-figure>{max}</span>{' '}
              chosen.
            </>
          )}
        </p>
      ) : null}
    </fieldset>
  )
}
