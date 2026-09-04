'use client'

import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import type { BrandKit } from '@souqstudio/types'
import { ColorField } from '@/components/ui/color-field'
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
            <ColorField
              key={key}
              label={label}
              hint={hint}
              value={value}
              // Clicking or tabbing into the row makes this the slot a
              // suggested swatch fills.
              onActivate={() => setAssigning(key)}
              onChange={(hex) => {
                setAssigning(key)
                // Stored as typed, valid or not — a half-written hex simply
                // falls back, and rejecting mid-keystroke would fight the
                // person typing.
                setColor(key, hex)
              }}
              error={isValidHex(value) ? undefined : `Use a colour like ${EXAMPLE_HEX}.`}
            />
          )
        })}
      </div>

      <RoleLegend colors={colors} />

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

/**
 * What the three colours actually do, in the abstract.
 *
 * **Not a preview of a page.** A sample flyer sat here, and it was misleading in
 * a specific way: a brand kit holds no grid and no template, so a rendered page
 * implied the kit decided a layout it does not decide, and it said nothing about
 * what happens when the same colours land on a hero band or a header.
 *
 * This is a legend, not a mock-up. Each row shows one role doing its job at the
 * smallest scale that makes the job legible, and nothing here claims to be what
 * a book will look like.
 */
function RoleLegend({ colors }: { colors: { primary: string; secondary: string; accent: string } }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-ui text-label font-medium text-secondary">Where these are used</span>

      <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
        {/* Primary — a header, a hero band, a cover ground. */}
        <div
          className="flex items-center rounded-control px-3 py-2"
          // The shop's own colour, not a design decision, so it cannot come
          // from a token. Same exemption usage-meter.tsx relies on.
          style={{ backgroundColor: colors.primary }}
        >
          <span className="font-ui text-body-sm text-inverse">Headers, hero bands and covers</span>
        </div>

        {/* Secondary — supporting text and rules. */}
        <p className="font-ui text-body-sm" style={{ color: colors.secondary }}>
          Supporting text, rules and section labels
        </p>

        {/* Accent — the price mark and offer badges. */}
        <div className="flex items-center gap-2">
          <span
            className="rounded-chip px-3 py-1 font-ui text-body-sm text-inverse"
            style={{ backgroundColor: colors.accent }}
          >
            <span data-figure>24.50</span>
          </span>
          <span className="font-ui text-body-sm text-secondary">Prices and offer badges</span>
        </div>
      </div>
    </div>
  )
}
