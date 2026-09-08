'use client'

import * as React from 'react'
import { Check, Palette } from 'lucide-react'
import type { BrandColor, ColorValue, TokenRef } from '@souqstudio/types'
import { resolveColor } from '@souqstudio/engine'
import { ColorField } from '@/components/ui/color-field'
import { NEW_COLOR_HEX } from '@/lib/color'

/**
 * Picking a colour in the block designer.
 *
 * **Swatches first, a hex box second, and both are real.** The shop's own
 * palette is what most cards should be built from — it is why a palette exists,
 * and a block that references a colour by id follows that colour when the shop
 * changes it. But "pick from these six" was the single loudest thing that made
 * the designer feel like somebody else's form: an owner with a Ramadan gold in
 * their hand and no way to type it is an owner who leaves.
 *
 * So three rows, in order of how tied each is to the brand:
 *
 *   the shop's palette   a `BrandColor.id`. Follows the brand.
 *   page mechanics       `surface`, `ink`, `inkMuted` — the ground and what is
 *                        readable on it. Not brand colours and not the shop's
 *                        to choose, which is exactly why they are offered
 *                        separately rather than mixed into the palette.
 *   any colour           a literal. Does not follow the brand, and says so.
 *
 * A **seeded** block may only use the middle row and the role forms of the
 * first; `usesOnlyRoles` in `lib/block-document.ts` is what enforces that, and
 * this control is only ever shown for a block the shop owns.
 */

type Props = {
  label: string
  value: ColorValue | undefined
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  onChange: (value: ColorValue) => void
  /** Rendered as the current colour when `value` is undefined — the automatic
   *  choice the element would make on its own. */
  fallback?: string | undefined
  hint?: string | undefined
  disabled?: boolean
}

/** The three that are page mechanics rather than brand. */
const MECHANICS: { ref: TokenRef; label: string }[] = [
  { ref: 'surface', label: 'Card' },
  { ref: 'ink', label: 'Text' },
  { ref: 'inkMuted', label: 'Muted' },
]

export function ColorControl({
  label,
  value,
  palette,
  token,
  onChange,
  fallback,
  hint,
  disabled = false,
}: Props) {
  const [custom, setCustom] = React.useState(false)
  const current = value === undefined ? (fallback ?? token('ink')) : resolveColor(value, token, palette)

  const isPalette = (id: string) => value?.from === 'palette' && value.id === id
  const isRole = (ref: TokenRef) => value?.from === 'role' && value.ref === ref

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="font-ui text-label font-medium text-primary">{label}</legend>

      <div className="flex flex-wrap items-center gap-1">
        {palette.map((color) => (
          <Swatch
            key={color.id}
            hex={color.hex}
            label={color.name}
            selected={isPalette(color.id)}
            onSelect={() => onChange({ from: 'palette', id: color.id })}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {MECHANICS.map((entry) => (
          <Swatch
            key={entry.ref}
            hex={token(entry.ref)}
            label={entry.label}
            selected={isRole(entry.ref)}
            onSelect={() => onChange({ from: 'role', ref: entry.ref })}
          />
        ))}

        <button
          type="button"
          onClick={() => setCustom((open) => !open)}
          aria-expanded={custom}
          aria-label="Any colour"
          className={
            value?.from === 'hex'
              ? 'flex size-7 items-center justify-center rounded-control border-2 border-border-focus'
              : 'flex size-7 items-center justify-center rounded-control border-hairline border-border-strong hover:bg-stone-100'
          }
        >
          <Palette className="size-4 text-secondary" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {custom || value?.from === 'hex' ? (
        <ColorField
          label="Any colour"
          value={value?.from === 'hex' ? value.hex : (current ?? NEW_COLOR_HEX)}
          hint="Typed in, so it stays this colour if the brand changes."
          onChange={(hex) => onChange({ from: 'hex', hex })}
        />
      ) : null}

      {hint ? <p className="font-ui text-body-sm text-muted">{hint}</p> : null}
    </fieldset>
  )
}

/**
 * One swatch.
 *
 * **The selected one carries a tick, not only a ring.** A ring around a colour
 * is a colour with a ring around it — on a palette of eight, an owner scanning
 * for "which one is on" should not have to compare border widths, and a mark
 * inside the swatch is the difference. Its colour flips against the swatch so it
 * survives both a pale sand and a navy.
 */
function Swatch({
  hex,
  label,
  selected,
  onSelect,
}: {
  hex: string
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      // The swatch *is* the shop's colour, so it is set as a style rather than
      // as a class: it is data, not a design decision, and there is no token
      // for a colour the owner invented.
      style={{ backgroundColor: hex }}
      className={
        selected
          ? 'flex size-7 items-center justify-center rounded-control border-2 border-border-focus'
          : 'flex size-7 items-center justify-center rounded-control border-hairline border-border-subtle'
      }
    >
      {selected ? (
        <Check
          className="size-3.5 mix-blend-difference text-stone-0"
          strokeWidth={3}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
