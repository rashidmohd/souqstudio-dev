'use client'

import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { LogoPlate } from '@/components/brand/LogoField'
import { OfferPreview } from '@/components/brand/OfferPreview'
import { useBrandStore, previewColors } from '@/stores/brand-store'
import { COLOR_SLOTS } from '@/components/brand/ColorFields'

type GridOption = { id: string; name: string; config: GridConfig }
type TemplateOption = { id: string; name: string; config: TemplateConfig }

const NOT_SET = 'Not set yet'

/**
 * The whole kit at a glance — E4-05's "view brand kit".
 *
 * The epic calls this a dashboard card. There is no dashboard: home is the
 * offer books list, deliberately, so the card lives at the top of the screen
 * that owns the kit instead.
 *
 * **Labelled "Preview", not "Current".** It reads the store, so it shows
 * unsaved edits — which is the point, and which would make "current" a lie.
 *
 * Unset choices read "Not set yet" rather than borrowing `DEFAULT_COLORS`. The
 * preview underneath still paints with the defaults, because it needs three
 * colours to draw anything at all; naming them here would tell an owner they
 * had picked a colour they have not.
 */
export function BrandKitSummary({
  grids,
  templates,
}: {
  grids: GridOption[]
  templates: TemplateOption[]
}) {
  const { kit, logoUrl, shopName } = useBrandStore()

  const colors = previewColors(kit)
  const selectedGrid = grids.find((grid) => grid.id === kit.gridId) ?? grids[0]
  const selectedTemplate =
    templates.find((template) => template.id === kit.templateId) ?? templates[0]

  return (
    <Card className="flex flex-col gap-4 sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {logoUrl ? (
          <LogoPlate label="Your logo" background="bg-stone-0" src={logoUrl} />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex h-24 items-center justify-center rounded-control border-hairline border-border-subtle bg-sand">
              <span className="font-ui text-body-sm text-secondary">No logo yet</span>
            </div>
            <span className="font-ui text-body-sm text-muted">Your logo</span>
          </div>
        )}

        <dl className="flex flex-col gap-1">
          {COLOR_SLOTS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <dt className="font-ui text-body-sm text-secondary">{label}</dt>
              <dd className="flex items-center gap-2">
                {kit[key] ? (
                  <>
                    <Figure value={kit[key] as string} size="data-sm" />
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-chip border border-border-strong"
                      // The shop's own colour, not a design decision, so it
                      // cannot come from a token.
                      style={{ backgroundColor: kit[key] as string }}
                    />
                  </>
                ) : (
                  <span className="font-ui text-body-sm text-muted">{NOT_SET}</span>
                )}
              </dd>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-ui text-body-sm text-secondary">Grid</dt>
            <dd className="truncate font-ui text-body-sm text-primary">
              {kit.gridId ? (selectedGrid?.name ?? NOT_SET) : NOT_SET}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-ui text-body-sm text-secondary">Template</dt>
            <dd className="truncate font-ui text-body-sm text-primary">
              {kit.templateId ? (selectedTemplate?.name ?? NOT_SET) : NOT_SET}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-ui text-label font-medium text-secondary">Preview</span>
        {selectedGrid && selectedTemplate ? (
          <div className="overflow-hidden rounded-control border-hairline border-border-subtle">
            <OfferPreview
              grid={selectedGrid.config}
              template={selectedTemplate.config}
              colors={colors}
              shopName={shopName}
              className="block h-auto w-full"
            />
          </div>
        ) : (
          <p className="font-ui text-body-sm text-muted">
            A preview appears once grids and templates are available.
          </p>
        )}
      </div>
    </Card>
  )
}
