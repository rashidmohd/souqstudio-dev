import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * InlineSelect. Owned by `references/component-inventory.md`.
 *
 * **A choice that reads as one row rather than as a form field** — a mark, the
 * current value and a chevron on a single line. `Select` is the right control
 * inside a form, where a label above a rectangle is what everything else looks
 * like; on a toolbar it is three stacked things among a row of flat ones, and
 * the label above it makes the toolbar twice as tall for a word.
 *
 * **A bare native `<select>`, laid transparently over our own markup.** This is
 * the arrangement `ShopSwitcher` already uses and the inventory already blessed,
 * for the same two reasons: the platform picker keeps its scroll physics, its
 * touch behaviour and its accessibility tree, and a row can carry a glyph that
 * no native `<option>` could. The visible markup is `aria-hidden`; the select
 * carries the accessible name, so the control is announced once.
 *
 * **`leading` shows the current value, not the list.** A native option list is
 * text and cannot be given icons — that is the one thing this pattern does not
 * buy, and the reason every option's `label` still has to stand on its own.
 *
 * Not a hand-rolled menu. A listbox built out of divs owes keyboard navigation,
 * focus return, type-ahead, scroll containment and a screen-reader contract, and
 * every one of those is a thing the platform already does correctly here.
 */
type InlineSelectProps<T extends string> = {
  /** The accessible name. Never drawn — the row shows the *value*. */
  label: string
  value: T
  options: { value: T; label: string }[]
  /** A mark for the current value, drawn at the start of the row. */
  leading?: React.ReactNode
  disabled?: boolean
  onChange: (value: T) => void
  className?: string
}

export function InlineSelect<T extends string>({
  label,
  value,
  options,
  leading,
  disabled = false,
  onChange,
  className,
}: InlineSelectProps<T>) {
  const current = options.find((option) => option.value === value)

  return (
    <div
      title={label}
      className={cn(
        'relative flex h-control items-center gap-2 rounded-control border border-border-strong bg-input ps-3 pe-2',
        // The select is transparent, so the ring has to come from the wrapper or
        // a keyboard user sees nothing at all. `ShopSwitcher`'s note, and the
        // same failure.
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus',
        disabled && 'opacity-disabled',
        className
      )}
    >
      {leading === undefined ? null : (
        <span aria-hidden="true" className="flex shrink-0 items-center text-secondary">
          {leading}
        </span>
      )}

      <span aria-hidden="true" className="truncate font-ui text-body-sm text-primary">
        {current?.label ?? ''}
      </span>

      <ChevronDown
        aria-hidden="true"
        className="ms-auto size-4 shrink-0 text-muted"
        strokeWidth={1.75}
      />

      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
