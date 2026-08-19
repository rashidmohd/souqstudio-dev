'use client'

import { Check } from 'lucide-react'
import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { OfferPreview } from '@/components/brand/OfferPreview'
import { cn } from '@/lib/utils'

export type Choice = {
  id: string
  name: string
  description?: string | null
}

type Props = {
  /** Names the group for a screen reader. The visible heading is the caller's. */
  label: string
  options: Choice[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  /** Resolves the preview inputs for one option. */
  previewFor: (id: string) => { grid: GridConfig; template: TemplateConfig }
  colors: { primary: string; secondary: string; accent: string }
  shopName: string
}

/**
 * One choice from a set of five, each previewed in the shop's own colours.
 * E4-03 and E4-04.
 *
 * **Extracted from `ChoiceStep` so E4-05's brand kit screen can reuse it.** The
 * step ends in a Continue/Back footer and holds the "Choose one to continue"
 * guard inside it; a settings screen has neither, and adding a `mode` prop
 * would have put wizard navigation inside a component whose whole job is the
 * choice. `ChoiceStep` is now a heading, this, and that footer.
 *
 * One component for grid and template because the decision is identical in
 * shape. Two near-identical components would drift the moment one got a fix.
 *
 * Every option renders through the same `OfferPreview` the other choice uses,
 * so picking a grid shows it under the currently selected template and vice
 * versa — which is the only way to see what you are actually going to get.
 */
export function ChoiceGrid({
  label,
  options,
  selectedId,
  onSelect,
  previewFor,
  colors,
  shopName,
}: Props) {
  return (
    // A radio group, not a row of buttons: this is one choice from a set, and
    // arrow-key navigation comes free with the right role.
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((option) => {
        const selected = option.id === selectedId
        const preview = previewFor(option.id)

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(option.id)}
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
  )
}
