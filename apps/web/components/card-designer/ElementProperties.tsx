'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'
import type {
  BlockElement,
  BrandColor,
  TextOverflow,
  TokenRef,
  TypeLevel,
} from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColorControl } from '@/components/card-designer/ColorControl'
import { describe } from '@/components/card-designer/LayerList'

/**
 * The properties panel. E7.
 *
 * **What an element *is* is decided here; where it sits is decided on the
 * canvas.** The box fields exist for the case direct manipulation is bad at —
 * "make these two exactly the same width" — and they are the same numbers the
 * drag writes, in percent because a fraction with four decimal places is not a
 * number anyone can type.
 *
 * Two rules the panel used to enforce by refusal, and now enforces by *shape*:
 *
 * - **Colour is a swatch first and a hex second.** Every element could once name
 *   only one of six slots, which is right for a block we ship and wrong for one
 *   the shop designed. See `ColorControl`.
 * - **Type snaps to the brand scale until the owner says otherwise.** A level is
 *   still what the fit ladder steps down, so a hand-set size degrades rather
 *   than overflows.
 *
 * The one thing still closed: **the price mark's composition**. Its colour,
 * ground and frame are the shop's; the raised minor digits, the attached tab and
 * the three-decimal branch are not, and never will be. E6 §3.
 */

type Props = {
  element: BlockElement | null
  repeats: boolean
  disabled: boolean
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  onChange: (element: BlockElement) => void
}

const LEVEL_LABEL: Record<TypeLevel, string> = {
  h1: 'Largest (h1)',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'Body',
  caption: 'Caption',
}

export function ElementProperties({
  element,
  repeats,
  disabled,
  palette,
  token,
  onChange,
}: Props) {
  if (element === null) {
    return (
      <p className="font-ui text-body-sm text-muted">
        Select something on the card to change it.
      </p>
    )
  }

  const color = { palette, token, disabled }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-subhead text-primary">{describe(element)}</h2>
        <p className="font-ui text-body-sm text-muted">{purpose(element)}</p>
      </div>

      {element.kind === 'text' ? (
        <TextFields
          element={element}
          repeats={repeats}
          disabled={disabled}
          color={color}
          onChange={onChange}
        />
      ) : null}

      {element.kind === 'shape' ? (
        <>
          <Select
            label="Shape"
            disabled={disabled}
            value={element.variant ?? 'rect'}
            options={[
              { value: 'rect', label: 'Rectangle' },
              { value: 'ellipse', label: 'Circle' },
              { value: 'line', label: 'Line' },
            ]}
            onChange={(event) =>
              onChange({ ...element, variant: event.target.value as 'rect' | 'ellipse' | 'line' })
            }
          />
          <ColorControl
            label="Colour"
            value={element.fill}
            {...color}
            onChange={(fill) => onChange({ ...element, fill })}
          />
          {element.variant === 'line' ? null : (
            <Input
              label="Corner radius"
              type="number"
              min={0}
              max={64}
              step={1}
              figure
              disabled={disabled}
              value={element.radius}
              onChange={(event) =>
                onChange({ ...element, radius: clamp(Number(event.target.value), 0, 64) })
              }
            />
          )}
        </>
      ) : null}

      {element.kind === 'image' ? (
        <Select
          label="How it fills its box"
          disabled={disabled}
          value={element.fit ?? 'contain'}
          hint="A packshot fits inside. A background photo fills and crops."
          options={[
            { value: 'contain', label: 'Fit inside — nothing is cut off' },
            { value: 'cover', label: 'Fill the box — the edges crop' },
          ]}
          onChange={(event) =>
            onChange({ ...element, fit: event.target.value as 'contain' | 'cover' })
          }
        />
      ) : null}

      {element.kind === 'chip' ? (
        <>
          <Select
            label="Position"
            disabled={disabled}
            value={element.anchor}
            hint="A corner badge may overhang the card by design."
            options={[
              { value: 'TOP_START', label: 'Top, reading-order start' },
              { value: 'TOP_END', label: 'Top, reading-order end' },
              { value: 'INLINE', label: 'Inline, inside the card' },
            ]}
            onChange={(event) =>
              onChange({ ...element, anchor: event.target.value as typeof element.anchor })
            }
          />
          <ColorControl
            label="Badge colour"
            value={element.fill}
            fallback={token('accent')}
            hint="Left alone, it takes the promo tier's own colour."
            {...color}
            onChange={(fill) => onChange({ ...element, fill })}
          />
        </>
      ) : null}

      {element.kind === 'priceMark' ? (
        <PriceMarkFields element={element} disabled={disabled} color={color} onChange={onChange} />
      ) : null}

      <Appearance element={element} disabled={disabled} onChange={onChange} />
      <BoxFields element={element} disabled={disabled} onChange={onChange} />
    </div>
  )
}

type ColorProps = {
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled: boolean
}

/**
 * The price mark, opened as far as it goes.
 *
 * **Colour, ground and frame are the shop's brand. The composition is not.**
 * E6 §3 and composition model §3.5 stand: raised minor digits, the tier tab
 * overlapping the mark, the three-decimal KWD/OMR/BHD branch and LTR-in-Arabic
 * are internal, and the digits are never separate text boxes. Owners given text
 * boxes for a price produce hundreds of inconsistent treatments inside a month,
 * and the price is the one thing on a flyer a customer actually reads.
 *
 * What was over-locked was everything *around* those rules, which is why the
 * mark used to feel like somebody else's component sitting in the middle of the
 * owner's card.
 */
function PriceMarkFields({
  element,
  disabled,
  color,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'priceMark' }>
  disabled: boolean
  color: ColorProps
  onChange: (element: BlockElement) => void
}) {
  const style = element.style ?? {}
  const set = (patch: Partial<typeof style>) =>
    onChange({ ...element, style: { ...style, ...patch } })

  return (
    <>
      <Select
        label="Frame"
        disabled={disabled}
        value={style.frame ?? 'tag'}
        options={[
          { value: 'tag', label: 'On a tag' },
          { value: 'plain', label: 'Just the numbers' },
        ]}
        onChange={(event) => set({ frame: event.target.value as 'tag' | 'plain' })}
      />
      <Select
        label="Tier badge"
        disabled={disabled}
        value={style.tab ?? 'attached'}
        hint="The little tab reading “HALF PRICE”, attached to the mark."
        options={[
          { value: 'attached', label: 'Attached to the price' },
          { value: 'none', label: 'Hidden' },
        ]}
        onChange={(event) => set({ tab: event.target.value as 'attached' | 'none' })}
      />
      <ColorControl
        label="Tag and badge colour"
        value={style.tint}
        fallback={color.token('accent')}
        hint="Left alone, it takes the promo tier's colour."
        {...color}
        onChange={(tint) => set({ tint })}
      />
      <ColorControl
        label="Number colour"
        value={style.ink}
        fallback={color.token('ink')}
        {...color}
        onChange={(ink) => set({ ink })}
      />
      <ColorControl
        label="Behind the numbers"
        value={style.surface}
        fallback={color.token('surface')}
        {...color}
        onChange={(surface) => set({ surface })}
      />

      <p className="flex items-start gap-2 rounded-control bg-sand-tint p-3 font-ui text-body-sm text-secondary">
        <Lock className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>
          How the number itself is set — the raised fils, the currency, the way
          it reads in Arabic — stays ours, so every price in every book is read
          the same way. Everything else about it is yours.
        </span>
      </p>
    </>
  )
}

/** Rotation and opacity, which belong to the thing rather than to its kind. */
function Appearance({
  element,
  disabled,
  onChange,
}: {
  element: BlockElement
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Input
        label="Turn"
        type="number"
        min={-180}
        max={180}
        step={1}
        figure
        disabled={disabled}
        value={element.rotation ?? 0}
        hint="Degrees"
        onChange={(event) =>
          onChange({ ...element, rotation: clamp(Number(event.target.value), -180, 180) })
        }
      />
      <Input
        label="Opacity"
        type="number"
        min={0}
        max={100}
        step={5}
        figure
        disabled={disabled}
        value={Math.round((element.opacity ?? 1) * 100)}
        hint="Percent"
        onChange={(event) =>
          onChange({ ...element, opacity: clamp(Number(event.target.value), 0, 100) / 100 })
        }
      />
    </div>
  )
}

function TextFields({
  element,
  repeats,
  disabled,
  color,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  repeats: boolean
  disabled: boolean
  color: ColorProps
  onChange: (element: BlockElement) => void
}) {
  const source = element.source

  return (
    <>
      <Select
        label="Shows"
        disabled={disabled}
        value={sourceKey(source)}
        // A repeating block offers product fields because it renders once per
        // offer and knows which one. A static block does not get them at all.
        options={[
          ...(repeats
            ? [
                { value: 'product:name', label: 'Product name' },
                { value: 'product:spec', label: 'Size or spec' },
                { value: 'product:brand', label: 'Brand' },
                { value: 'product:origin', label: 'Country of origin' },
                { value: 'product:packSize', label: 'Pack size' },
              ]
            : []),
          { value: 'shop:name', label: 'Shop name' },
          { value: 'shop:phone', label: 'Shop phone' },
          { value: 'shop:address', label: 'Shop address' },
          { value: 'static', label: 'Text you type' },
        ]}
        onChange={(event) => onChange({ ...element, source: parseSource(event.target.value, source) })}
      />

      {source.from === 'static' ? (
        <>
          <Input
            label="Text"
            disabled={disabled}
            value={source.textEn}
            onChange={(event) =>
              onChange({ ...element, source: { ...source, textEn: event.target.value } })
            }
          />
          {/* Both languages, always. A line with no Arabic is a hole in the
              Arabic edition, and the owner who typed it will never see that
              edition. */}
          <Input
            label="Arabic text"
            dir="rtl"
            disabled={disabled}
            value={source.textAr}
            hint="Shown in Arabic editions of a book."
            onChange={(event) =>
              onChange({ ...element, source: { ...source, textAr: event.target.value } })
            }
          />
        </>
      ) : null}

      <SizeFields element={element} disabled={disabled} onChange={onChange} />

      <Select
        label="Alignment"
        disabled={disabled}
        value={element.align}
        hint="Start and end follow the language, so Arabic mirrors on its own."
        options={[
          { value: 'start', label: 'Reading-order start' },
          { value: 'center', label: 'Centre' },
          { value: 'end', label: 'Reading-order end' },
        ]}
        onChange={(event) =>
          onChange({ ...element, align: event.target.value as typeof element.align })
        }
      />

      <ColorControl
        label="Text colour"
        value={element.color}
        {...color}
        onChange={(next) => onChange({ ...element, color: next })}
      />

      <OverflowField element={element} disabled={disabled} onChange={onChange} />
    </>
  )
}

/**
 * Size, weight and case.
 *
 * **Snap to the brand scale is the default, not the law.** A level keeps the
 * hierarchy consistent across every block a shop owns and is what the fit ladder
 * steps down when a name is long — so it stays, and it stays the thing a size
 * falls back to. An owner sizing a headline by eye against their own artwork is
 * doing design rather than breaking a system, so the second control exists.
 */
function SizeFields({
  element,
  disabled,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const free = element.size !== undefined

  return (
    <div className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
      <Select
        label="Size"
        disabled={disabled}
        value={free ? 'custom' : element.level}
        hint="A step on your brand's scale keeps every block consistent."
        options={[
          ...TYPE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] })),
          { value: 'custom', label: 'Set it myself' },
        ]}
        onChange={(event) => {
          const value = event.target.value
          if (value !== 'custom') {
            const { size: _dropped, ...rest } = element
            onChange({ ...rest, level: value as TypeLevel } as BlockElement)
            return
          }
          // Seeded from the level it was on, so switching to a custom size
          // starts where the eye already is rather than at some default.
          onChange({ ...element, size: 0.06 })
        }}
      />

      {free ? (
        <Input
          label="Size"
          type="number"
          min={0.5}
          max={40}
          step={0.5}
          figure
          disabled={disabled}
          value={Math.round((element.size ?? 0) * 1000) / 10}
          hint="Percent of the card. Stays right at any page size."
          onChange={(event) =>
            onChange({ ...element, size: clamp(Number(event.target.value), 0.5, 40) / 100 })
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Weight"
          disabled={disabled}
          value={String(element.weight ?? 0)}
          options={[
            { value: '0', label: 'From the style' },
            { value: '400', label: 'Regular' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Bold' },
            { value: '800', label: 'Heavy' },
          ]}
          onChange={(event) => {
            const weight = Number(event.target.value)
            if (weight === 0) {
              const { weight: _dropped, ...rest } = element
              onChange(rest as BlockElement)
              return
            }
            onChange({ ...element, weight })
          }}
        />
        <Select
          label="Case"
          disabled={disabled}
          value={element.transform ?? 'none'}
          options={[
            { value: 'none', label: 'As written' },
            { value: 'uppercase', label: 'UPPERCASE' },
          ]}
          onChange={(event) =>
            onChange({ ...element, transform: event.target.value as 'none' | 'uppercase' })
          }
        />
      </div>

      {/* Offered and warned about, never blocked — it is the shop's brand. Most
          Arabic-capable families ship no true italic, and Arabic has no italic
          convention to synthesise toward. */}
      <label className="flex items-center gap-2 font-ui text-label text-primary">
        <input
          type="checkbox"
          disabled={disabled}
          checked={element.italic ?? false}
          onChange={(event) => onChange({ ...element, italic: event.target.checked })}
          className="size-4 rounded-control border-hairline border-border-strong"
        />
        Italic
      </label>
    </div>
  )
}

/**
 * The overflow control. A **first-class** control, which is the design system's
 * word and not a preference: it is the setting that decides whether a block
 * survives contact with the catalog, and a shop that discovers the answer on a
 * printed flyer has discovered it too late.
 */
function OverflowField({
  element,
  disabled,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const overflow = element.overflow
  const mode = overflow?.mode ?? 'default'

  function set(next: TextOverflow | undefined) {
    const { overflow: _dropped, ...rest } = element
    onChange(next === undefined ? (rest as BlockElement) : { ...rest, overflow: next })
  }

  return (
    <div className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
      <Select
        label="When the text is too long"
        disabled={disabled}
        value={mode}
        hint="Arabic runs longer than English, so this happens more than you would think."
        options={[
          { value: 'default', label: 'Decide for me' },
          { value: 'shrink', label: 'Shrink, down to a floor' },
          { value: 'clamp', label: 'Wrap to a set number of lines' },
          { value: 'truncate', label: 'One line, cut with an ellipsis' },
        ]}
        onChange={(event) => {
          const value = event.target.value
          if (value === 'default') return set(undefined)
          if (value === 'truncate') return set({ mode: 'truncate' })
          if (value === 'clamp') return set({ mode: 'clamp', lines: 2 })
          return set({ mode: 'shrink', floor: 'h5' })
        }}
      />

      {overflow?.mode === 'shrink' ? (
        <Select
          label="Never smaller than"
          disabled={disabled}
          value={overflow.floor}
          hint="Below the floor the card is flagged instead of shrinking further."
          options={TYPE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
          onChange={(event) => set({ mode: 'shrink', floor: event.target.value as TypeLevel })}
        />
      ) : null}

      {overflow?.mode === 'clamp' ? (
        <Input
          label="Lines"
          type="number"
          min={1}
          max={6}
          step={1}
          figure
          disabled={disabled}
          value={overflow.lines}
          onChange={(event) =>
            set({ mode: 'clamp', lines: clamp(Math.round(Number(event.target.value)), 1, 6) })
          }
        />
      ) : null}
    </div>
  )
}

/**
 * Position and size, in percent of the block.
 *
 * Percent rather than millimetres or pixels because the block has no size: the
 * same design is 1080 square in a carousel post and a third of a column in a
 * booklet. `start` rather than `left`, so the field means the same thing in both
 * directions.
 */
function BoxFields({
  element,
  disabled,
  onChange,
}: {
  element: BlockElement
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const set = (patch: Partial<typeof element.box>) =>
    onChange({ ...element, box: { ...element.box, ...patch } } as BlockElement)

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
        Position and size
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <PercentField
          label="From the start"
          value={element.box.start}
          disabled={disabled}
          onChange={(start) => set({ start })}
        />
        <PercentField
          label="From the top"
          value={element.box.top}
          disabled={disabled}
          onChange={(top) => set({ top })}
        />
        <PercentField
          label="Width"
          value={element.box.width}
          disabled={disabled}
          onChange={(width) => set({ width })}
        />
        <PercentField
          label="Height"
          value={element.box.height}
          disabled={disabled}
          onChange={(height) => set({ height })}
        />
      </div>
    </fieldset>
  )
}

function PercentField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Input
      label={label}
      type="number"
      min={-50}
      max={150}
      step={0.5}
      figure
      disabled={disabled}
      value={Math.round(value * 1000) / 10}
      onChange={(event) => onChange(clamp(Number(event.target.value), -50, 150) / 100)}
    />
  )
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min

function sourceKey(source: Extract<BlockElement, { kind: 'text' }>['source']): string {
  return source.from === 'static' ? 'static' : `${source.from}:${source.field}`
}

/**
 * Changing what a text element shows.
 *
 * Switching *to* static keeps whatever the owner had typed before, if anything,
 * rather than starting blank each time they change their mind — the previous
 * strings are the thing they would otherwise have to retype.
 */
function parseSource(
  value: string,
  current: Extract<BlockElement, { kind: 'text' }>['source']
): Extract<BlockElement, { kind: 'text' }>['source'] {
  if (value === 'static') {
    return current.from === 'static' ? current : { from: 'static', textEn: 'Your text', textAr: 'النص' }
  }

  const [from, field] = value.split(':')
  if (from === 'product' && field !== undefined) {
    return { from: 'product', field: field as 'name' | 'spec' | 'brand' | 'origin' | 'packSize' }
  }
  if (from === 'shop' && field !== undefined) {
    return { from: 'shop', field: field as 'name' | 'phone' | 'address' }
  }
  return current
}

/** One line on what this element is for, in the owner's terms. */
function purpose(element: BlockElement): string {
  switch (element.kind) {
    case 'text':
      return element.source.from === 'product'
        ? 'Follows the catalog. It changes with every product.'
        : element.source.from === 'shop'
          ? 'Comes from the shop this book belongs to.'
          : 'The same on every card.'
    case 'image':
      return element.source.from === 'product'
        ? 'The packshot, or a reserved space where a product has none.'
        : 'Artwork you uploaded.'
    case 'priceMark':
      return 'The offer price, the was-price and the badge, as one piece.'
    case 'chip':
      return 'The promo tier — “Half price”, “2 for 1”. Set per offer.'
    case 'logo':
      return 'Your logo, from the brand kit.'
    case 'shape':
      return 'A ground, a panel or a rule.'
  }
}
