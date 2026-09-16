'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * RadioCards. Governed by the design skill → Components → Inputs, and by
 * `references/component-inventory.md`, which owns this signature.
 *
 * **One of several, where each option needs a sentence.** `Segmented` is the
 * one-of control for a handful of short labels in a single shell; it stops
 * working somewhere around five, and it has nowhere to put a description.
 * `Select` scales to any number and hides every option until it is opened, which
 * is right when the labels speak for themselves and wrong when the choice is one
 * a person makes once and needs to read to make.
 *
 * Built for the shop's business segment — ten trades, each of which changes what
 * the product generates — and kept general because that shape recurs.
 *
 * **Real radio inputs, not divs with roles.** The platform gives arrow-key
 * movement within the group, a single tab stop, the form association and the
 * accessibility tree for free. The same argument `Select` and `Dialog` already
 * make in this file's own notes.
 */

export type RadioCardOption<T extends string> = {
  value: T
  label: string
  /** One line under the label. What this choice actually means. */
  description?: string
  disabled?: boolean
}

type RadioCardsProps<T extends string> = {
  /** The group's own label. Rendered, never a placeholder. */
  label: string
  value: T | null
  options: RadioCardOption<T>[]
  onChange: (value: T) => void
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  /** One column reads as a list, two as a grid. Two below `md` is too tight. */
  columns?: 1 | 2 | undefined
  /** Shared `name`, so two groups on one page do not collide. */
  name?: string | undefined
  className?: string | undefined
}

export function RadioCards<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  disabled = false,
  columns = 2,
  name,
  className,
}: RadioCardsProps<T>) {
  const generatedName = React.useId()
  const groupName = name ?? generatedName
  const hintId = `${groupName}-hint`
  const errorId = `${groupName}-error`

  return (
    /**
     * A `fieldset` with a `legend`, which is what a group of radios is. The
     * legend is styled to match every other field label rather than the browser's
     * default, and `aria-describedby` on the fieldset means the hint is announced
     * once for the group rather than once per option.
     */
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
          const selected = option.value === value

          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-block border p-3',
                'transition-colors duration-fast ease-sq',
                selected
                  ? 'border-border-focus bg-sand'
                  : 'border-border-strong hover:bg-stone-100',
                (disabled || option.disabled) && 'cursor-not-allowed opacity-disabled',
                // The ring goes on the label, because the input itself is
                // visually hidden and a focus ring nobody can see is no ring.
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus'
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected}
                disabled={disabled || option.disabled}
                onChange={() => onChange(option.value)}
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
        </p>
      ) : null}
    </fieldset>
  )
}
