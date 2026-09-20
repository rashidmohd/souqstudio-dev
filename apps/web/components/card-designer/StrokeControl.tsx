'use client'

import type { BrandColor, FlatColor, Stroke, TokenRef } from '@souqstudio/types'
import { Input } from '@/components/ui/input'
import { ColorControl } from '@/components/card-designer/ColorControl'

/**
 * A border: its colour and how thick it is.
 *
 * **The controls for a field the model had all along.** `Stroke` has been on
 * shapes and images since E7 and on text since E14 §2.4, and the designer
 * offered no way to set any of it — so "a square with just a thin border", the
 * commonest piece of furniture on a printed ticket, could not be drawn at any
 * setting. E14 §2.4 made the *fill* optional for that case; this is the other
 * half, and without both the case is still impossible.
 *
 * **Width is a percent of the card, like the type size beside it.** The stored
 * value is a fraction of the block's geometric mean — never pixels — which is
 * what lets one block render at 1080 square for a post and at a third of an A4
 * column in a booklet with the border reading the same in both. Showing the
 * fraction would be showing an owner `0.004`.
 *
 * **Turning it off removes the whole stroke rather than zeroing the width.** A
 * zero-width border is a colour nobody can see attached to an element that
 * claims to have one, and it would survive into a published block as a lie the
 * next person has to work out.
 */
type Props = {
  label: string
  value: Stroke | undefined
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled?: boolean | undefined
  hint?: string | undefined
  onChange: (stroke: Stroke | undefined) => void
}

/** The width an owner gets when they switch a border on. A hairline reads. */
const DEFAULT_WIDTH = 0.004

/**
 * Percent of the card. Bounded well inside the schema's own 0–20%, because a
 * fifth of a card is not a border.
 */
const MIN_PERCENT = 0.1
const MAX_PERCENT = 5

/**
 * The typed value as a stored fraction.
 *
 * **`Number('')` is 0 and `Number('abc')` is `NaN`**, and a number input hands
 * over both — an emptied field and a partially typed one. `NaN` survives
 * `Math.min`/`Math.max` unchanged, so it would reach the document as a width
 * the schema refuses, and the owner would find out at save time about a
 * keystroke. An unreadable value is the minimum, which is a border they can see
 * and correct.
 */
export function readPercent(input: string): number {
  const percent = Number(input)
  if (!Number.isFinite(percent)) return MIN_PERCENT / 100
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent)) / 100
}

export function StrokeControl({
  label,
  value,
  palette,
  token,
  disabled = false,
  hint,
  onChange,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <ColorControl
        label={label}
        value={value?.color}
        palette={palette}
        token={token}
        disabled={disabled}
        {...(hint === undefined ? {} : { hint })}
        // "None" removes the border. Choosing a colour puts one back at a width
        // the owner can see — starting at zero would look like nothing happened.
        onClear={() => onChange(undefined)}
        onChange={(color: FlatColor) =>
          onChange({ color, width: value?.width ?? DEFAULT_WIDTH })
        }
      />

      {value === undefined ? null : (
        <Input
          label="Border width"
          type="number"
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={0.1}
          figure
          disabled={disabled}
          value={Math.round(value.width * 1000) / 10}
          hint="Percent of the card. Stays right at any page size."
          onChange={(event) => onChange({ ...value, width: readPercent(event.target.value) })}
        />
      )}
    </div>
  )
}
