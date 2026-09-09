'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Segmented control, and its sibling the toggle bar.
 *
 * **Not in `references/component-inventory.md` until now, and it should have
 * been.** Three surfaces had already grown their own: the designer's language
 * switch, its canvas-shape picker, and the alignment buttons in the properties
 * panel — three shells, three sets of borders, three ideas of what "selected"
 * looks like. That is exactly what the inventory exists to prevent, so this is
 * the one, and the entry is written.
 *
 * **One bordered shell, flush segments inside it.** The failure it replaces was
 * a row of individually bordered squares: each one read as its own control, so
 * a pair of toggles looked like two unrelated buttons that happened to be near
 * each other rather than one group about one thing.
 *
 * Two components, because they answer different questions and conflating them
 * misleads:
 *
 *   Segmented   one of these — alignment, a shape, a language.
 *   ToggleBar   any of these, independently — italic, uppercase.
 *
 * A shared shell with a `multiple` flag would have been fewer lines and would
 * have hidden the difference that matters: in the first, choosing one *unchooses*
 * the others, and an owner reads that from the control before they touch it.
 */

export type Segment<T extends string> = {
  value: T
  /** The accessible name, and the tooltip. Never omitted — an icon alone is
   *  fast for people who know it and opaque for everyone else. */
  label: string
  icon?: LucideIcon
  /**
   * A typographic mark, where the convention *is* type rather than a picture:
   * `TT` for uppercase is what every design tool draws, and no icon set has it.
   */
  glyph?: string
  /** Mirrors in an Arabic interface. For glyphs that point somewhere. */
  mirror?: boolean
  /**
   * A mark this component cannot name — drawn by the caller.
   *
   * Added for the block designer's shape picker, where the honest mark for
   * "burst" is *the burst*, drawn by the same path function that draws it on the
   * card. No icon set has these, and one that did would still be a second
   * drawing of a shape the engine already knows how to draw — which is the exact
   * divergence `packages/engine` exists to prevent, arriving through an icon.
   */
  render?: () => React.ReactNode
}

const SHELL = 'flex w-fit items-center gap-1 rounded-pill border-hairline border-border-subtle p-1'

const SEGMENT = 'flex h-control items-center justify-center rounded-pill px-3 font-ui text-body-sm'

const ON = 'bg-selected-bg text-selected-fg'
const OFF = 'text-secondary hover:bg-stone-100'

export function Segmented<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
  className,
}: {
  label: string
  value: T
  options: Segment<T>[]
  disabled?: boolean
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn(SHELL, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            SEGMENT,
            value === option.value ? ON : OFF,
            'disabled:opacity-disabled'
          )}
        >
          <Face option={option} />
        </button>
      ))}
    </div>
  )
}

export function ToggleBar({
  label,
  options,
  disabled = false,
  onToggle,
  className,
}: {
  label: string
  options: (Segment<string> & { pressed: boolean })[]
  disabled?: boolean
  onToggle: (value: string, pressed: boolean) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn(SHELL, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={option.pressed}
          disabled={disabled}
          onClick={() => onToggle(option.value, !option.pressed)}
          className={cn(SEGMENT, option.pressed ? ON : OFF, 'disabled:opacity-disabled')}
        >
          <Face option={option} />
        </button>
      ))}
    </div>
  )
}

/**
 * What a segment shows: an icon, a typographic mark, or its own words.
 *
 * A glyph is set in the interface face rather than drawn, because `TT` and `Aa`
 * are *type* — an icon of letterforms drawn at 16px is a worse version of the
 * letterforms the interface already has.
 */
function Face({ option }: { option: Segment<string> }) {
  if (option.render !== undefined) return <>{option.render()}</>

  if (option.icon !== undefined) {
    const Icon = option.icon
    return (
      <Icon
        className={option.mirror === true ? 'size-4 rtl:-scale-x-100' : 'size-4'}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    )
  }

  if (option.glyph !== undefined) {
    return (
      <span aria-hidden="true" className="font-ui text-label font-medium tracking-tight">
        {option.glyph}
      </span>
    )
  }

  return <span>{option.label}</span>
}
