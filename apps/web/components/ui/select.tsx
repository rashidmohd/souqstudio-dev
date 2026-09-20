'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Select. **Not yet in references/component-inventory.md** — see the note at
 * the foot of this file.
 *
 * A native `<select>` under a styled shell, deliberately, rather than a
 * listbox built out of divs. On the phone a shop owner is actually holding,
 * native gives the platform picker, the platform's scroll physics and the
 * platform's accessibility tree for free; a custom one gives a scrolling div
 * that fights the keyboard. Nothing in E2 needs multi-select, option groups
 * with icons, or type-ahead over hundreds of rows — the day something does,
 * that is a different component and a different conversation.
 *
 * Matches `Input`: label above the field always, 8px rectangle rather than a
 * pill (a rectangle says "choose", a pill says "press"), error supersedes hint,
 * `aria-invalid` and `aria-describedby` wired.
 */
export type SelectOption = {
  value: string
  label: string
  disabled?: boolean | undefined
  /**
   * A heading this option sits under.
   *
   * **`optgroup`, which is why this is a string on the option rather than a
   * nested shape.** Consecutive options naming the same group are rendered
   * inside one — so a caller builds a flat list in the order it wants and the
   * grouping falls out, and a caller that names no group gets exactly the
   * markup it got before.
   *
   * It exists because a list can be long enough that "everything, alphabetical"
   * stops being a list anyone reads: the currency picker carries every ISO 4217
   * code, and the six a shop in this market actually wants should not be found
   * by scrolling past a hundred and fifty others.
   */
  group?: string | undefined
}

type SelectProps = {
  label: string
  options: SelectOption[]
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  /** Shown as a non-selectable first option when the value is empty. */
  placeholder?: string | undefined
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'>

/**
 * Consecutive options sharing a group, in the order they were given.
 *
 * Runs rather than a map keyed by group name: the caller decides the order, and
 * collecting by name would silently reorder a list to match whichever group
 * appeared first.
 */
function groupRuns(
  options: SelectOption[]
): { key: string; group: string | undefined; options: SelectOption[] }[] {
  const runs: { key: string; group: string | undefined; options: SelectOption[] }[] = []

  for (const option of options) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.group === option.group) {
      last.options.push(option)
      continue
    }
    runs.push({ key: `${option.group ?? ''}:${option.value}`, group: option.group, options: [option] })
  }

  return runs
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, required, placeholder, className, id, ...props },
  ref
) {
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  const messageId = `${selectId}-message`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="font-ui text-label font-medium text-primary">
        {label}
        {required ? (
          <span className="text-critical-fg" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            'h-control w-full appearance-none rounded-control border bg-input',
            // Trailing padding leaves room for the chevron. Logical, so the
            // chevron and the gap swap sides together in Arabic.
            'ps-3 pe-8 font-ui text-body text-primary',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
            'disabled:opacity-disabled',
            error ? 'border-critical-fg' : 'border-border-strong',
            className
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {groupRuns(options).map((run) =>
            run.group === undefined ? (
              run.options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))
            ) : (
              <optgroup key={run.key} label={run.group}>
                {run.options.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            )
          )}
        </select>

        <ChevronDown
          aria-hidden="true"
          // `end-3` rather than `right-3`: the chevron follows the text
          // direction. Not mirrored — a chevron down means down in both.
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>

      {/* One message, below the field, alongside the border colour. Error
          supersedes hint — showing both is two answers to one question. */}
      {error || hint ? (
        <p
          id={messageId}
          className={cn('font-ui text-body-sm', error ? 'text-critical-fg' : 'text-muted')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
})

/**
 * RAISE IT — this component is not in the inventory.
 *
 * The inventory's own rule is that a component added without going through that
 * file is one the next session builds differently, and it lists no select,
 * dropdown or combobox at all. E2 needs one in four places (role picker,
 * country, timezone, and the shop switcher in E2's Phase 5), so it is built
 * here to unblock rather than left as a gap.
 *
 * Before anything else depends on it, add a row to
 * `.claude/skills/souqstudio-design/references/component-inventory.md` with the
 * signature above, and settle two questions the inventory would have forced:
 *   1. Does the switcher use this, or is a shop switcher its own component with
 *      its own affordance? A native select in the rail will look like a form
 *      field in a navigation column.
 *   2. `size` — Input carries `'default' | 'lg'` and this does not. If a select
 *      ever sits beside a `size="lg"` input they will not line up.
 */
