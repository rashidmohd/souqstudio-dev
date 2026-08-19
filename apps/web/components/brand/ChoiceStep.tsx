'use client'

import * as React from 'react'
import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { ChoiceGrid, type Choice } from '@/components/brand/ChoiceGrid'

export type { Choice }

type Props = {
  title: string
  description: string
  options: Choice[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  /** Resolves the preview inputs for one option. */
  previewFor: (id: string) => { grid: GridConfig; template: TemplateConfig }
  colors: { primary: string; secondary: string; accent: string }
  shopName: string
  onContinue: () => void
  onBack: () => void
}

/**
 * Steps 3 and 4 — pick a grid, then pick a template. E4-03 and E4-04.
 *
 * The grid of previews lives in `ChoiceGrid`, which E4-05's brand kit screen
 * shares. What is left here is the wizard's navigation and its "choose one"
 * guard — the settings screen needs neither, because nothing there advances.
 */
export function ChoiceStep({
  title,
  description,
  options,
  selectedId,
  onSelect,
  previewFor,
  colors,
  shopName,
  onContinue,
  onBack,
}: Props) {
  const [blocked, setBlocked] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">{title}</h2>
        <p className="font-ui text-body text-secondary">{description}</p>
      </div>

      {blocked ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {blocked}
        </p>
      ) : null}

      <ChoiceGrid
        label={title}
        options={options}
        selectedId={selectedId}
        onSelect={(id) => {
          setBlocked(null)
          onSelect(id)
        }}
        previewFor={previewFor}
        colors={colors}
        shopName={shopName}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => {
            if (!selectedId) {
              setBlocked('Choose one to continue.')
              return
            }
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
