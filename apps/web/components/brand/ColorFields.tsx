'use client'

import * as React from 'react'
import { nanoid } from 'nanoid'
import { Plus, X } from 'lucide-react'
import type { BrandColor, BrandKit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ColorField } from '@/components/ui/color-field'
import { useBrandStore } from '@/stores/brand-store'
import { fromHex, isValidHex, whiteTextPasses, EXAMPLE_HEX, NEW_COLOR_HEX } from '@/lib/color'
import {
  MAX_PALETTE,
  MIN_PALETTE,
  canAdd,
  canRemove,
  nextColorName,
  resolvePalette,
} from '@/lib/brand-palette'

/**
 * The shop's palette. E4-02.
 *
 * **A definition, not a usage map.** This is the palette page of a brand
 * guideline: these are our colours, under our own names. It does not say where
 * each one goes — a block decides that, and the same colour is a hero ground in
 * one block and a price chip in another.
 *
 * It was three fixed rows labelled Primary, Secondary and Accent, with a legend
 * underneath explaining which was for headers and which for prices. That was two
 * limitations wearing one coat: a brand capped at three colours, and a product
 * telling an owner what their own colours are for. A shop with a fourth and a
 * fifth colour now simply has them, named whatever it calls them.
 *
 * Every change lands in the store immediately. Persisting is the caller's.
 */

/** The first slot holding something that is not a colour, or null. Pure, and
 *  exported, because the wizard's Continue and the screen's Save both run it. */
export function firstInvalidColorSlot(kit: BrandKit): { key: string; label: string } | null {
  const bad = resolvePalette(kit).find((color) => !isValidHex(color.hex))
  return bad ? { key: bad.id, label: bad.name } : null
}

export function ColorFields() {
  const { kit, setPalette } = useBrandStore()
  const palette = resolvePalette(kit)
  const [assigning, setAssigning] = React.useState(0)

  const suggested = kit.suggestedColors ?? []

  const update = (index: number, patch: Partial<BrandColor>) =>
    setPalette(palette.map((color, i) => (i === index ? { ...color, ...patch } : color)))

  return (
    <div className="flex flex-col gap-4">
      {suggested.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Colours from your logo">
            {suggested.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => update(assigning, { hex })}
                // The hex is the label — a swatch announced as "button" tells a
                // screen reader nothing about which colour it is.
                aria-label={`Use ${hex} for ${palette[assigning]?.name ?? 'this colour'}`}
                className="size-8 rounded-chip border border-border-strong transition-transform duration-fast ease-sq hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                // The value is the shop's own colour, not a design decision, so
                // it cannot come from a token. Same exemption usage-meter.tsx
                // relies on for its fill width.
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <p className="font-ui text-body-sm text-muted">
            Assigning to{' '}
            <span className="text-primary">{palette[assigning]?.name ?? 'the first colour'}</span>
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {palette.map((color, index) => (
          <PaletteRow
            key={color.id}
            color={color}
            canRemove={canRemove(palette)}
            onActivate={() => setAssigning(index)}
            onChange={(patch) => update(index, patch)}
            onRemove={() => setPalette(palette.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!canAdd(palette)}
          onClick={() =>
            setPalette([
              ...palette,
              { id: nanoid(8), name: nextColorName(palette), hex: NEW_COLOR_HEX },
            ])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a colour
        </Button>

        <p className="font-ui text-body-sm text-muted">
          <span data-figure>{palette.length}</span> of <span data-figure>{MAX_PALETTE}</span>
          {canRemove(palette) ? null : ` · ${MIN_PALETTE} is the minimum`}
        </p>
      </div>
    </div>
  )
}

function PaletteRow({
  color,
  canRemove: removable,
  onActivate,
  onChange,
  onRemove,
}: {
  color: BrandColor
  canRemove: boolean
  onActivate: () => void
  onChange: (patch: Partial<BrandColor>) => void
  onRemove: () => void
}) {
  const rgb = fromHex(color.hex)

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Input
          label="Name"
          value={color.name}
          onFocus={onActivate}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>

      <div className="min-w-0 flex-1">
        <ColorField
          label="Colour"
          value={color.hex}
          onActivate={onActivate}
          // Stored as typed, valid or not — rejecting mid-keystroke would fight
          // the person typing.
          onChange={(hex) => onChange({ hex })}
          error={isValidHex(color.hex) ? undefined : `Use a colour like ${EXAMPLE_HEX}.`}
          // Readability, stated as a fact about the colour rather than as a rule
          // about where it may be used. It is the shop's brand, and overruling
          // it is not ours to do.
          hint={rgb && !whiteTextPasses(rgb) ? 'White text on this is hard to read' : undefined}
        />
      </div>

      {/* Aligned by construction, not by an offset. Both fields are a label
          over a control, so the button gets an empty label of its own rather
          than a hand-tuned top margin that breaks the moment a label wraps. */}
      <div className="flex flex-col gap-1">
        <span aria-hidden="true" className="font-ui text-label font-medium">
          &nbsp;
        </span>
        <Button
          type="button"
          variant="ghost"
          iconOnly
          disabled={!removable}
          aria-label={`Remove ${color.name}`}
          onClick={onRemove}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
