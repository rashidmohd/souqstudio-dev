'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { OfferPreview } from '@/components/brand/OfferPreview'
import { cn } from '@/lib/utils'

/**
 * Steps 3 and 4 — pick a grid, then pick a template. E4-03 and E4-04.
 *
 * One component for both because the decision is identical in shape: five
 * options, each previewed in the shop's own colours, one selected. Two
 * near-identical components would drift the moment one got a fix.
 *
 * Every option renders through the same `OfferPreview` the other step uses, so
 * choosing a grid shows it under the currently selected template and vice
 * versa — which is the only way to see what you are actually going to get.
 */
export type Choice = {
  id: string
  name: string
  description?: string | null
}

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

      {/* A radio group, not a row of buttons: this is one choice from a set, and
          arrow-key navigation comes free with the right role. */}
      <div
        role="radiogroup"
        aria-label={title}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {options.map((option) => {
          const selected = option.id === selectedId
          const preview = previewFor(option.id)

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setBlocked(null)
                onSelect(option.id)
              }}
              className={cn(
                'flex flex-col gap-2 rounded-card border p-2 text-start',
                'transition-colors duration-fast ease-sq',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                selected
                  ? 'border-border-focus bg-selected-bg/[0.06]'
                  : 'border-border-subtle hover:bg-stone-100'
              )}
            >
              <div className="relative overflow-hidden rounded-control border-hairline border-border-subtle">
                <OfferPreview
                  grid={preview.grid}
                  template={preview.template}
                  colors={colors}
                  shopName={shopName}
                  className="block h-auto w-full"
                />
                {selected ? (
                  <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-selected-bg">
                    <Check className="size-3 text-selected-fg" aria-hidden="true" />
                  </span>
                ) : null}
              </div>

              <span className="font-ui text-body-sm font-medium text-primary">{option.name}</span>
              {option.description ? (
                <span className="font-ui text-body-sm text-muted">{option.description}</span>
              ) : null}
            </button>
          )
        })}
      </div>

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
