'use client'

import * as React from 'react'
import { Check, Palette, Plus, Trash2 } from 'lucide-react'
import type { BrandColor, ColorValue, FlatColor, GradientStop, TokenRef } from '@souqstudio/types'
import { resolveColor } from '@souqstudio/engine'
import { ColorField } from '@/components/ui/color-field'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { MAX_GRADIENT_STOPS } from '@/lib/block-document'
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
 *
 * **`allowGradient` is a prop rather than a permanent second control**, and it
 * is on exactly one field: a shape's fill. The props are a discriminated union
 * so that is not a convention anybody has to remember — a caller whose field is
 * a `FlatColor` cannot pass the flag, and a caller that passes it must accept a
 * `ColorValue` back. See `ColorValue` for why text and strokes stayed flat.
 */

type Base = {
  label: string
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  /** Rendered as the current colour when `value` is undefined — the automatic
   *  choice the element would make on its own. */
  fallback?: string | undefined
  hint?: string | undefined
  disabled?: boolean
}

type Props = Base &
  (
    | {
        allowGradient: true
        value: ColorValue | undefined
        onChange: (value: ColorValue) => void
      }
    | {
        allowGradient?: false | undefined
        value: FlatColor | undefined
        onChange: (value: FlatColor) => void
      }
  )

/** The three that are page mechanics rather than brand. */
const MECHANICS: { ref: TokenRef; label: string }[] = [
  { ref: 'surface', label: 'Card' },
  { ref: 'ink', label: 'Text' },
  { ref: 'inkMuted', label: 'Muted' },
]

/**
 * The gradient an owner gets when they switch a flat fill to one.
 *
 * **It starts from the colour that was already there** and runs to the brand's
 * accent, so the first thing they see is their own card with a run across it
 * rather than two colours they did not choose. A gradient that opens as
 * black-to-white is a control that has to be undone before it can be used.
 */
function seedGradient(from: FlatColor | undefined): Extract<ColorValue, { from: 'gradient' }> {
  return {
    from: 'gradient',
    // Top to bottom. The overwhelming majority of grounds an owner draws are
    // vertical, and 90 rather than 0 means the default reads as deliberate.
    angle: 90,
    stops: [
      { at: 0, color: from ?? { from: 'role', ref: 'primary' } },
      { at: 1, color: { from: 'role', ref: 'accent' } },
    ],
  }
}

export function ColorControl(props: Props) {
  const { label, palette, token, fallback, hint, disabled = false } = props
  const value = props.value

  // One cast, and the props union above is what makes it sound: `onChange` is
  // only ever handed a gradient from the branch that `allowGradient` gates, and
  // that branch cannot be reached unless the caller declared it accepts one.
  const emit = props.onChange as (next: ColorValue) => void

  const [custom, setCustom] = React.useState(false)
  const [activeStop, setActiveStop] = React.useState(0)

  const isGradient = value !== undefined && value.from === 'gradient'
  const flat = isGradient ? undefined : (value as FlatColor | undefined)
  const current = flat === undefined ? (fallback ?? token('ink')) : resolveColor(flat, token, palette)

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="font-ui text-label font-medium text-primary">{label}</legend>

      {props.allowGradient ? (
        <Segmented
          label={`${label} — solid or gradient`}
          value={isGradient ? 'gradient' : 'solid'}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          onChange={(next) => {
            if (next === 'gradient') {
              setActiveStop(0)
              emit(seedGradient(flat))
              return
            }
            // Back to the first stop, which is the colour the run started from
            // and therefore the one the owner last chose deliberately.
            emit(isGradient ? value.stops[0]!.color : (flat ?? { from: 'role', ref: 'primary' }))
          }}
        />
      ) : null}

      {isGradient ? (
        <GradientEditor
          value={value}
          palette={palette}
          token={token}
          activeStop={activeStop}
          onActiveStop={setActiveStop}
          onChange={emit}
        />
      ) : (
        <FlatPicker
          value={flat}
          current={current}
          palette={palette}
          token={token}
          custom={custom}
          onCustom={setCustom}
          onChange={emit}
        />
      )}

      {hint ? <p className="font-ui text-body-sm text-muted">{hint}</p> : null}
    </fieldset>
  )
}

/**
 * The three rows, extracted so a gradient stop is picked exactly the way a flat
 * fill is.
 *
 * A stop that offered a different set of colours from the control beside it
 * would be a second colour vocabulary in one panel, which is the thing
 * `references/component-inventory.md` exists to stop.
 */
function FlatPicker({
  value,
  current,
  palette,
  token,
  custom,
  onCustom,
  onChange,
}: {
  value: FlatColor | undefined
  current: string
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  custom: boolean
  onCustom: (open: boolean) => void
  onChange: (next: FlatColor) => void
}) {
  const isPalette = (id: string) => value?.from === 'palette' && value.id === id
  const isRole = (ref: TokenRef) => value?.from === 'role' && value.ref === ref

  return (
    <>
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
          onClick={() => onCustom(!custom)}
          aria-expanded={custom}
          aria-label="Any colour"
          className={
            value?.from === 'hex'
              ? 'flex size-swatch items-center justify-center rounded-control border-2 border-border-focus'
              : 'flex size-swatch items-center justify-center rounded-control border-hairline border-border-strong hover:bg-stone-100'
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
    </>
  )
}

/**
 * A gradient, edited one stop at a time.
 *
 * **Select a stop, then change it** — the pattern every design tool uses, and
 * the reason is the panel: a full colour picker inlined per stop is three rows
 * of swatches times up to eight stops, which buries the rest of the element's
 * properties under one control. The strip is the selection, the picker below is
 * the edit.
 *
 * The stops are shown **in the order they run**, sorted here as the renderer
 * sorts them, so dragging one past another does not leave the strip disagreeing
 * with the card. Positions are typed as percentages because that is how a
 * person says where a colour lands; the document stores the fraction.
 */
function GradientEditor({
  value,
  palette,
  token,
  activeStop,
  onActiveStop,
  onChange,
}: {
  value: Extract<ColorValue, { from: 'gradient' }>
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  activeStop: number
  onActiveStop: (index: number) => void
  onChange: (next: ColorValue) => void
}) {
  const [custom, setCustom] = React.useState(false)

  const stops = [...value.stops].sort((a, b) => a.at - b.at)
  const index = Math.min(activeStop, stops.length - 1)
  const active = stops[index]!
  const css = (stop: GradientStop) => resolveColor(stop.color, token, palette)

  const write = (next: Partial<{ angle: number; stops: GradientStop[] }>) =>
    onChange({ ...value, ...next })

  return (
    <div className="flex flex-col gap-2">
      {/*
        The run itself. An inline style rather than a class for the same reason
        the swatch uses one: it is the owner's data, not a design decision, and
        no token describes a colour they invented. CSS measures its angle from
        "up" and the document measures from "along the start edge", so the two
        differ by a quarter turn — `gradientVector` in the engine is what the
        card is actually painted from, and this only has to agree with it.
      */}
      <div
        aria-hidden="true"
        className="h-8 rounded-control border-hairline border-border-subtle"
        style={{
          backgroundImage: `linear-gradient(${value.angle + 90}deg, ${stops
            .map((stop) => `${css(stop)} ${Math.round(stop.at * 100)}%`)
            .join(', ')})`,
        }}
      />

      <div className="flex flex-wrap items-center gap-1">
        {stops.map((stop, position) => (
          <Swatch
            key={position}
            hex={css(stop)}
            label={`Stop ${position + 1}, at ${Math.round(stop.at * 100)}%`}
            selected={position === index}
            onSelect={() => onActiveStop(position)}
          />
        ))}

        <button
          type="button"
          disabled={stops.length >= MAX_GRADIENT_STOPS}
          aria-label="Add a stop"
          title="Add a stop"
          onClick={() => {
            // Halfway between the selected stop and the one after it, which is
            // where an owner clicking "add" is looking. At the end, halfway
            // between it and the end of the run.
            const after = stops[index + 1]
            const at = after === undefined ? Math.min(1, (active.at + 1) / 2) : (active.at + after.at) / 2
            const next = [...stops, { at, color: active.color }].sort((a, b) => a.at - b.at)
            onActiveStop(next.findIndex((stop) => stop.at === at))
            write({ stops: next })
          }}
          className="flex size-swatch items-center justify-center rounded-control border-hairline border-border-strong hover:bg-stone-100 disabled:opacity-disabled"
        >
          <Plus className="size-4 text-secondary" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          // Two is the floor the schema enforces. One stop is a flat colour
          // written the expensive way, and the way back to a flat colour is the
          // Solid segment above rather than deleting until it collapses.
          disabled={stops.length <= 2}
          aria-label="Remove this stop"
          title="Remove this stop"
          onClick={() => {
            const next = stops.filter((_, position) => position !== index)
            onActiveStop(Math.max(0, index - 1))
            write({ stops: next })
          }}
          className="flex size-swatch items-center justify-center rounded-control border-hairline border-border-strong hover:bg-stone-100 disabled:opacity-disabled"
        >
          <Trash2 className="size-4 text-secondary" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <Input
        label="Position"
        type="number"
        min={0}
        max={100}
        step={1}
        figure
        hint="Where this colour lands along the run, as a percentage."
        value={Math.round(active.at * 100)}
        onChange={(event) => {
          const at = Math.min(1, Math.max(0, Number(event.target.value) / 100))
          const next = stops.map((stop, position) => (position === index ? { ...stop, at } : stop))
          write({ stops: next })
        }}
      />

      <FlatPicker
        value={active.color}
        current={css(active)}
        palette={palette}
        token={token}
        custom={custom}
        onCustom={setCustom}
        onChange={(color) =>
          write({
            stops: stops.map((stop, position) => (position === index ? { ...stop, color } : stop)),
          })
        }
      />

      <Input
        label="Angle"
        type="number"
        min={0}
        max={360}
        step={15}
        figure
        hint="Degrees. 0 runs along the card, 90 runs down it."
        value={value.angle}
        onChange={(event) => write({ angle: Math.min(360, Math.max(0, Number(event.target.value))) })}
      />
    </div>
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
          ? 'flex size-swatch items-center justify-center rounded-control border-2 border-border-focus'
          : 'flex size-swatch items-center justify-center rounded-control border-hairline border-border-subtle'
      }
    >
      {selected ? (
        <Check
          className="size-4 mix-blend-difference text-stone-0"
          strokeWidth={3}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
