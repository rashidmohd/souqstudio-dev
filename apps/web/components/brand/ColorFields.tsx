'use client'

import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import type { BrandKit } from '@souqstudio/types'
import { Input } from '@/components/ui/input'
import { useBrandStore, previewColors } from '@/stores/brand-store'
import { fromHex, isValidHex, whiteTextPasses, EXAMPLE_HEX } from '@/lib/color'

export type ColorSlot = 'primaryColor' | 'secondaryColor' | 'accentColor'

export const COLOR_SLOTS: Array<{ key: ColorSlot; label: string; hint: string }> = [
  { key: 'primaryColor', label: 'Primary', hint: 'Headers and the page ground' },
  { key: 'secondaryColor', label: 'Secondary', hint: 'Supporting text and rules' },
  { key: 'accentColor', label: 'Accent', hint: 'Prices and offer badges' },
]

/**
 * The first slot holding something that is not a colour, or null.
 *
 * Pure, and exported, because two callers now submit these three fields — the
 * wizard's Continue button and the brand kit screen's Save. A second copy of
 * the check would drift, and the one that drifted would be the one that let a
 * malformed hex through to the artboard.
 */
export function firstInvalidColorSlot(kit: BrandKit): { key: ColorSlot; label: string } | null {
  const bad = COLOR_SLOTS.find(({ key }) => !isValidHex(kit[key] ?? ''))
  return bad ? { key: bad.key, label: bad.label } : null
}

/**
 * Choosing the three brand colours. E4-02.
 *
 * **Extracted from `ColorsStep` so E4-05's brand kit screen can reuse it.** The
 * step baked in a Continue/Back footer and held its validation inside that
 * footer's handler; a screen that saves rather than continues could not reuse
 * either. The validation left as `firstInvalidColorSlot` above, and the
 * navigation stayed in `ColorsStep`.
 *
 * Every change lands in the store immediately, so any preview beside this
 * tracks the picker with no network in the loop. Persistence is the caller's.
 *
 * The contrast warning is on the accent, because that is what prices are set
 * in and an unreadable price is the one failure that costs a sale. It warns and
 * does not block: it is the shop's brand, and overruling it is not ours to do.
 */
export function ColorFields() {
  const { kit, setColor } = useBrandStore()
  const [assigning, setAssigning] = React.useState<ColorSlot>('primaryColor')

  const suggested = kit.suggestedColors ?? []
  const colors = previewColors(kit)
  const accentRgb = fromHex(colors.accent)
  const accentFailsWhite = accentRgb ? !whiteTextPasses(accentRgb) : false

  return (
    <div className="flex flex-col gap-4">
      {suggested.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Colours from your logo">
            {suggested.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(assigning, hex)}
                // The hex is the label — a swatch announced as "button" tells a
                // screen reader nothing about which colour it is.
                aria-label={`Use ${hex} as ${assigning.replace('Color', '')}`}
                className="size-8 rounded-chip border border-border-strong transition-transform duration-fast ease-sq hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                // The value is the shop's own colour, not a design decision, so
                // it cannot come from a token. Same exemption usage-meter.tsx
                // relies on for its fill width.
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <p className="font-ui text-body-sm text-muted">
            Assigning to <span className="text-primary">{assigning.replace('Color', '')}</span>
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {COLOR_SLOTS.map(({ key, label, hint }) => {
          const value =
            kit[key] ??
            previewColors(kit)[key.replace('Color', '') as 'primary' | 'secondary' | 'accent']
          return (
            <div
              key={key}
              className="flex items-end gap-2"
              // Clicking anywhere in the row makes this the slot a swatch fills.
              onFocusCapture={() => setAssigning(key)}
            >
              <input
                type="color"
                value={value}
                onChange={(event) => setColor(key, event.target.value)}
                aria-label={`${label} colour picker`}
                className="size-control-lg shrink-0 cursor-pointer rounded-control border border-border-strong bg-input"
              />
              <div className="min-w-0 flex-1">
                <Input
                  label={label}
                  hint={hint}
                  value={value}
                  figure
                  onChange={(event) => {
                    setAssigning(key)
                    // Stored as typed, valid or not — the preview simply falls
                    // back while a hex is half-written, and rejecting
                    // mid-keystroke would fight the person typing.
                    setColor(key, event.target.value)
                  }}
                  error={isValidHex(value) ? undefined : `Use a colour like ${EXAMPLE_HEX}.`}
                />
              </div>
            </div>
          )
        })}
      </div>

      {accentFailsWhite ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          White prices on your accent colour will be hard to read. It still
          works — darken the accent if you want prices to stand out more.
        </p>
      ) : null}
    </div>
  )
}
