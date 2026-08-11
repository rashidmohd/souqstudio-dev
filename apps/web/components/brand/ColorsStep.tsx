'use client'

import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBrandStore, previewColors } from '@/stores/brand-store'
import { fromHex, isValidHex, whiteTextPasses, EXAMPLE_HEX } from '@/lib/color'

type Slot = 'primaryColor' | 'secondaryColor' | 'accentColor'

const SLOTS: Array<{ key: Slot; label: string; hint: string }> = [
  { key: 'primaryColor', label: 'Primary', hint: 'Headers and the page ground' },
  { key: 'secondaryColor', label: 'Secondary', hint: 'Supporting text and rules' },
  { key: 'accentColor', label: 'Accent', hint: 'Prices and offer badges' },
]

/**
 * Step 2 — confirm the colours pulled from the logo. E4-02.
 *
 * Every change lands in the store immediately, so the preview beside this
 * tracks the picker with no network in the loop. Persistence happens when the
 * step advances.
 *
 * The contrast warning is on the accent, because that is what prices are set
 * in and an unreadable price is the one failure that costs a sale. It warns and
 * does not block: it is the shop's brand, and overruling it is not ours to do.
 */
export function ColorsStep({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  const { kit, setColor } = useBrandStore()
  const [assigning, setAssigning] = React.useState<Slot>('primaryColor')
  const [blocked, setBlocked] = React.useState<string | null>(null)

  const suggested = kit.suggestedColors ?? []
  const colors = previewColors(kit)
  const accentRgb = fromHex(colors.accent)
  const accentFailsWhite = accentRgb ? !whiteTextPasses(accentRgb) : false

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Confirm your colours</h2>
        <p className="font-ui text-body text-secondary">
          {suggested.length > 0
            ? 'Taken from your logo. Tap a swatch to assign it, or set your own.'
            : 'Set the three colours your offer books will use.'}
        </p>
      </div>

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
        {SLOTS.map(({ key, label, hint }) => {
          const value = kit[key] ?? previewColors(kit)[key.replace('Color', '') as 'primary' | 'secondary' | 'accent']
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
                className="size-10 shrink-0 cursor-pointer rounded-control border border-border-strong bg-input"
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

      {blocked ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {blocked}
        </p>
      ) : null}

      <div className="flex gap-2">
        {/* Never disabled to enforce validation — the design system is explicit
            that a dead button with no explanation is a dead end. Let them press
            it, then say what is wrong. */}
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => {
            const bad = SLOTS.find(({ key }) => !isValidHex(kit[key] ?? ''))
            if (bad) {
              setBlocked(`${bad.label} is not a colour we can read. Use something like ${EXAMPLE_HEX}.`)
              return
            }
            setBlocked(null)
            onContinue()
          }}
        >
          Continue
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  )
}
