'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'
import type { BlockElement, TextOverflow, TypeLevel } from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
 * Two rules the panel enforces by what it does not offer:
 *
 * - **The price mark cannot be opened.** E6 §3, restated in the composition
 *   model §3.5 precisely because a block designer is the surface that would
 *   erode it. Raised minor digits, the tier tab, the three-decimal branch and
 *   LTR-in-Arabic are internal; the owner's one control is the tier, and it
 *   lives on the offer. Owners given text boxes for a price produce hundreds of
 *   inconsistent treatments inside a month.
 * - **No colour picker.** Every fill is a role the brand kit resolves, so this
 *   offers roles. A hex here is a block that stops looking like the shop that
 *   loaded it.
 */

type Props = {
  element: BlockElement | null
  repeats: boolean
  disabled: boolean
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

export function ElementProperties({ element, repeats, disabled, onChange }: Props) {
  if (element === null) {
    return (
      <p className="font-ui text-body-sm text-muted">
        Select something on the card to change it.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-subhead text-primary">{describe(element)}</h2>
        <p className="font-ui text-body-sm text-muted">{purpose(element)}</p>
      </div>

      {element.kind === 'text' ? (
        <TextFields element={element} repeats={repeats} disabled={disabled} onChange={onChange} />
      ) : null}

      {element.kind === 'shape' ? (
        <>
          <Select
            label="Colour"
            disabled={disabled}
            value={element.surface}
            hint="A role from your brand kit, not a fixed colour."
            options={[
              { value: 'surface', label: 'Card surface' },
              { value: 'primary', label: 'First brand colour' },
              { value: 'secondary', label: 'Second brand colour' },
              { value: 'accent', label: 'Third brand colour' },
              { value: 'ink', label: 'Text colour' },
              { value: 'inkMuted', label: 'Muted text colour' },
            ]}
            onChange={(event) =>
              onChange({ ...element, surface: event.target.value as typeof element.surface })
            }
          />
          <Input
            label="Corner radius"
            type="number"
            min={0}
            max={64}
            step={1}
            figure
            disabled={disabled}
            value={element.radius}
            hint="Artboard elements are 3, per the design system."
            onChange={(event) =>
              onChange({ ...element, radius: clamp(Number(event.target.value), 0, 64) })
            }
          />
        </>
      ) : null}

      {element.kind === 'chip' ? (
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
      ) : null}

      {element.kind === 'priceMark' ? (
        <p className="flex items-start gap-2 rounded-control bg-sand-tint p-3 font-ui text-body-sm text-secondary">
          <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            You place and size the price. What goes inside it — the raised
            fils, the badge, the currency — is decided for you, so every offer
            in every book reads the same way. The tier is set on the offer.
          </span>
        </p>
      ) : null}

      <BoxFields element={element} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function TextFields({
  element,
  repeats,
  disabled,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  repeats: boolean
  disabled: boolean
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

      <Select
        label="Size"
        disabled={disabled}
        value={element.level}
        hint="A step on your brand's type scale, never a pixel size."
        options={TYPE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
        onChange={(event) =>
          onChange({ ...element, level: event.target.value as TypeLevel })
        }
      />

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

      <OverflowField element={element} disabled={disabled} onChange={onChange} />
    </>
  )
}

/**
 * The overflow control. A **first-class** control, which is the design system's
 * word and not a preference: it is the setting that decides whether a block
 * survives contact with the catalog, and a shop that discovers the answer on a
 * printed flyer has discovered it too late.
 *
 * The default is not a fourth mode. It is the rule the product already applies
 * per field — a name is never cut, a spec may be — so leaving it alone is a
 * real answer rather than an absent one.
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
    onChange(next === undefined ? rest : { ...rest, overflow: next })
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
      return 'The packshot, or a reserved space where a product has none.'
    case 'priceMark':
      return 'The offer price, the was-price and the badge, as one piece.'
    case 'chip':
      return 'The promo tier — “Half price”, “2 for 1”. Set per offer.'
    case 'logo':
      return 'Your logo, from the brand kit.'
    case 'shape':
      return 'A ground or a panel behind everything else.'
  }
}
