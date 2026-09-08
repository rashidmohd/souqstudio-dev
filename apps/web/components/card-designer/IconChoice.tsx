'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * A segmented control of icons, and an icon toggle. E7.
 *
 * **The properties panel was a column of dropdowns**, which is correct and reads
 * as a settings screen. Alignment, case and italics have had the same three
 * glyphs in every design tool for thirty years, and a `<select>` for something
 * an owner can recognise at a glance is a click and a read where a button would
 * be neither.
 *
 * Only for choices that *have* a convention. A binding — "what does this text
 * show" — is a list of names with no icon anybody has seen, and dressing it up
 * as glyphs would be inventing a vocabulary rather than borrowing one. Those
 * stay as selects.
 *
 * Every button carries its name in `title` and `aria-label`: an icon is fast for
 * someone who knows it and opaque for someone who does not, and that difference
 * is the whole cost of the pattern.
 */

export type IconOption<T extends string> = {
  value: T
  label: string
  icon: LucideIcon
  /** Mirrors in an Arabic interface — an alignment glyph points somewhere. */
  mirror?: boolean
}

export function IconChoice<T extends string>({
  label,
  value,
  options,
  disabled = false,
  hint,
  onChange,
}: {
  label: string
  value: T
  options: IconOption<T>[]
  disabled?: boolean
  hint?: string | undefined
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-label font-medium text-primary">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex w-fit items-center gap-1 rounded-control border-hairline border-border-subtle p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={[
              'flex size-control items-center justify-center rounded-control',
              value === option.value
                ? 'bg-selected-bg text-selected-fg'
                : 'text-secondary hover:bg-stone-100',
              'disabled:opacity-disabled',
            ].join(' ')}
          >
            <option.icon
              className={option.mirror === true ? 'size-4 rtl:-scale-x-100' : 'size-4'}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {hint ? <p className="font-ui text-body-sm text-muted">{hint}</p> : null}
    </div>
  )
}

/** One icon that is either on or off — italics, uppercase. */
export function IconToggle({
  label,
  icon: Icon,
  pressed,
  disabled = false,
  onChange,
}: {
  label: string
  icon: LucideIcon
  pressed: boolean
  disabled?: boolean
  onChange: (pressed: boolean) => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      className={[
        'flex size-control items-center justify-center rounded-control border-hairline',
        pressed
          ? 'border-border-focus bg-selected-bg text-selected-fg'
          : 'border-border-subtle text-secondary hover:bg-stone-100',
        'disabled:opacity-disabled',
      ].join(' ')}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
