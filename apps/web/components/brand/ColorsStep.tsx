'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ColorFields, firstInvalidColorSlot } from '@/components/brand/ColorFields'
import { useBrandStore } from '@/stores/brand-store'
import { EXAMPLE_HEX } from '@/lib/color'

/**
 * Step 2 — confirm the colours pulled from the logo. E4-02.
 *
 * The three pickers, the suggested swatches and the contrast warning live in
 * `ColorFields`, which E4-05's brand kit screen shares. What is left here is
 * the wizard's navigation and the guard on it — both callers run the same
 * `firstInvalidColorSlot`, so neither can advance on a half-written hex.
 */
export function ColorsStep({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  const { kit } = useBrandStore()
  const [blocked, setBlocked] = React.useState<string | null>(null)

  const suggested = kit.suggestedColors ?? []

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

      <ColorFields />

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
            const bad = firstInvalidColorSlot(kit)
            if (bad) {
              setBlocked(
                `${bad.label} is not a colour we can read. Use something like ${EXAMPLE_HEX}.`
              )
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
