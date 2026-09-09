'use client'

import * as React from 'react'
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  Palette,
  Trash2,
} from 'lucide-react'
import type { BrandColor, ColorValue, FlatColor, GradientStop, TokenRef } from '@souqstudio/types'
import { resolveColor } from '@souqstudio/engine'
import { ColorField } from '@/components/ui/color-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { MAX_GRADIENT_STOPS } from '@/lib/block-document'
import { NEW_COLOR_HEX, fromHex } from '@/lib/color'

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
 * The eight runs on offer, as directions on the card rather than as degrees.
 *
 * These are physical and do **not** mirror in an Arabic edition: the angle is
 * measured against the artboard and an owner who pointed a gradient at the
 * bottom-right corner meant that corner. Naming them "down and right" rather
 * than "down and end" is the honest version of that.
 */
const DIRECTIONS = [
  { angle: 0, label: 'Right', icon: ArrowRight },
  { angle: 45, label: 'Down and right', icon: ArrowDownRight },
  { angle: 90, label: 'Down', icon: ArrowDown },
  { angle: 135, label: 'Down and left', icon: ArrowDownLeft },
  { angle: 180, label: 'Left', icon: ArrowLeft },
  { angle: 225, label: 'Up and left', icon: ArrowUpLeft },
  { angle: 270, label: 'Up', icon: ArrowUp },
  { angle: 315, label: 'Up and right', icon: ArrowUpRight },
] as const

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
 * A gradient, edited on the run itself.
 *
 * **The first version of this was a form and the owner was right to reject it**
 * — a row of swatches disconnected from the preview, a percentage typed into a
 * number field, and an angle typed into another. Every design tool draws the
 * stops *on* the ramp and lets you drag them, for the good reason that the
 * position of a stop is a spatial fact and a spatial fact should not be typed.
 *
 * So: handles on the bar, dragged to move; click the bar to add one; the
 * selected handle's colour and opacity underneath. Arrow keys move a handle too,
 * because a control that only answers to a pointer is a control half the people
 * using it cannot reach.
 *
 * **The stops are kept in document order here, not sorted.** Sorting on every
 * write would renumber them mid-drag — drag one stop past its neighbour and the
 * index the pointer is holding would suddenly address a different stop, which
 * reads as the handle jumping out from under the cursor. `resolvePaint` sorts
 * when it paints, which is the only place order actually matters.
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
  const bar = React.useRef<HTMLDivElement | null>(null)
  const dragging = React.useRef<number | null>(null)

  // **A gradient with no stops cannot be stored** — the schema's floor is two —
  // so this is only reachable from a document written by something else. It
  // repairs rather than throws, for the reason a deleted palette entry falls
  // back to the ink: a panel that crashes is harder to recover from than a
  // colour that came out wrong, and the owner is one click from fixing it.
  const stops = value.stops.length === 0 ? seedGradient(undefined).stops : value.stops
  const index = Math.max(0, Math.min(activeStop, stops.length - 1))
  const active = stops[index]!

  const css = (stop: GradientStop) => resolveColor(stop.color, token, palette)
  const write = (next: Partial<{ angle: number; stops: GradientStop[] }>) =>
    onChange({ ...value, ...next })
  const setStop = (position: number, patch: Partial<GradientStop>) =>
    write({ stops: stops.map((stop, at) => (at === position ? { ...stop, ...patch } : stop)) })

  /**
   * Where along the bar a pointer is, 0 to 1.
   *
   * Physical left-to-right even in an Arabic interface. The bar is a picture of
   * the run rather than a piece of prose, the angle it is showing is measured
   * against the *card* and does not mirror — see `ColorValue` — so a bar that
   * flipped with the panel would disagree with the artboard beside it.
   */
  const atFrom = (clientX: number): number => {
    const rect = bar.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const ramp = [...stops]
    .sort((a, b) => a.at - b.at)
    .map((stop) => `${withAlpha(css(stop), stop.opacity ?? 1)} ${Math.round(stop.at * 100)}%`)
    .join(', ')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {/*
          The checkerboard, so a stop fading to nothing looks like nothing rather
          than like white. Built from two stone tokens in an inline style for the
          same reason the swatch sets its own background: it is showing a value,
          and there is no utility for "absence of colour".
        */}
        <div
          ref={bar}
          onPointerDown={(event) => {
            // A click on the bar itself adds a stop where it landed, taking the
            // colour already there so the ramp does not change shape — the owner
            // asked for a handle, not a new colour.
            if (stops.length >= MAX_GRADIENT_STOPS) return
            const at = atFrom(event.clientX)
            const nearest = stops.reduce((best, stop) =>
              Math.abs(stop.at - at) < Math.abs(best.at - at) ? stop : best
            )
            write({ stops: [...stops, { ...nearest, at }] })
            onActiveStop(stops.length)
          }}
          className="relative h-12 cursor-copy overflow-hidden rounded-control border-hairline border-border-subtle"
          style={{
            backgroundImage:
              'repeating-conic-gradient(var(--sq-stone-200) 0% 25%, var(--sq-stone-0) 0% 50%)',
            backgroundSize: '12px 12px',
          }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(${value.angle + 90}deg, ${ramp})` }}
          />

          {stops.map((stop, position) => (
            <button
              key={position}
              type="button"
              aria-label={`Stop ${position + 1}, ${Math.round(stop.at * 100)} percent along`}
              aria-pressed={position === index}
              title={`${Math.round(stop.at * 100)}%`}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                dragging.current = position
                onActiveStop(position)
              }}
              onPointerMove={(event) => {
                if (dragging.current !== position) return
                setStop(position, { at: atFrom(event.clientX) })
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId)
                dragging.current = null
              }}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.1 : 0.01
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  const delta = event.key === 'ArrowLeft' ? -step : step
                  setStop(position, { at: Math.min(1, Math.max(0, stop.at + delta)) })
                }
              }}
              // Positioned as a physical percentage for the reason in `atFrom`.
              // Centred on the bar by transform rather than by a spacing step:
              // the handle is 28px on a 48px bar, and no step on the scale is
              // 10px. A value that has to be exact is not a token.
              style={{
                left: `${stop.at * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: css(stop),
              }}
              className={
                position === index
                  ? 'absolute size-swatch cursor-grab rounded-control border-2 border-border-focus'
                  : 'absolute size-swatch cursor-grab rounded-control border-hairline border-stone-0'
              }
            />
          ))}
        </div>

        <p className="font-ui text-body-sm text-muted">
          Drag a handle to move it. Click the bar to add one, arrow keys to nudge.
        </p>
      </div>

      {/*
        Eight directions rather than a number field. An angle typed in degrees is
        a number an owner has to imagine; the run they want is almost always one
        of these, and the bar above shows the answer immediately. The document
        stores any angle 0–360, so a value set elsewhere survives a round trip
        even though this offers eight of them.
      */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          label="Direction"
          value={String(value.angle)}
          options={DIRECTIONS.map((direction) => ({
            value: String(direction.angle),
            label: direction.label,
            icon: direction.icon,
          }))}
          onChange={(next) => write({ angle: Number(next) })}
        />
      </div>

      <FlatPicker
        value={active.color}
        current={css(active)}
        palette={palette}
        token={token}
        custom={custom}
        onCustom={setCustom}
        onChange={(color) => setStop(index, { color })}
      />

      <div className="grid grid-cols-2 items-end gap-3">
        <Input
          label="Opacity"
          type="number"
          min={0}
          max={100}
          step={5}
          figure
          hint="Percent"
          value={Math.round((active.opacity ?? 1) * 100)}
          onChange={(event) =>
            setStop(index, {
              opacity: Math.min(100, Math.max(0, Number(event.target.value))) / 100,
            })
          }
        />

        <Button
          type="button"
          variant="ghost"
          // Two is the floor the schema enforces: one stop is a flat colour
          // written the expensive way, and the way back to one is the Solid
          // segment above rather than deleting until it collapses.
          disabled={stops.length <= 2}
          onClick={() => {
            onActiveStop(Math.max(0, index - 1))
            write({ stops: stops.filter((_, position) => position !== index) })
          }}
        >
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Remove stop
        </Button>
      </div>
    </div>
  )
}

/**
 * A resolved hex at a given alpha, for the CSS preview only.
 *
 * The artboard does not go through this — SVG carries `stop-opacity` as its own
 * attribute and never needs the colour and the alpha combined. This is here
 * because a CSS gradient has nowhere to put an alpha except inside the colour.
 */
function withAlpha(hex: string, opacity: number): string {
  const rgb = fromHex(hex)
  if (rgb === null) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
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
