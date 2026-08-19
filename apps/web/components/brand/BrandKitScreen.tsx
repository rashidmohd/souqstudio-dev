'use client'

import * as React from 'react'
import Link from 'next/link'
import type { BrandKit, BrandOverride, GridConfig, TemplateConfig } from '@souqstudio/types'
import type { BrandFacet, BrandLevel } from '@/lib/brand-inheritance'
import { Button } from '@/components/ui/button'
import { LogoField } from '@/components/brand/LogoField'
import { ColorFields, COLOR_SLOTS, firstInvalidColorSlot } from '@/components/brand/ColorFields'
import { ChoiceGrid } from '@/components/brand/ChoiceGrid'
import { BrandKitSummary } from '@/components/brand/BrandKitSummary'
import { ResetBrandDialog } from '@/components/brand/ResetBrandDialog'
import { useBrandStore, previewColors } from '@/stores/brand-store'
import { EXAMPLE_HEX } from '@/lib/color'

type GridOption = { id: string; name: string; config: GridConfig; minProducts: number }
type TemplateOption = {
  id: string
  name: string
  description: string | null
  config: TemplateConfig
}

type Props = {
  shopId: string
  shopName: string
  logoUrl: string | null
  brandKit: BrandKit
  brandOverride: BrandOverride
  source: Record<BrandFacet, BrandLevel>
  canEdit: boolean
  isOwner: boolean
  grids: GridOption[]
  templates: TemplateOption[]
}

/** Which section a save or an error belongs to. */
type SaveSection = 'colors' | 'layout'

/**
 * The brand kit, editable. E4-05.
 *
 * **Three sections, because there are three facets.** Logo, colours and layout
 * are exactly the facets `lib/brand-inheritance.ts` moves between the
 * organization and the shop, so grid and template share one section and one
 * save — they cannot be inherited separately, and splitting them would imply
 * they could. (`progress`, the fourth facet, is the wizard's own state and
 * belongs to nobody's settings screen.)
 *
 * **Saves are per section, and mount only when that section is dirty**, so the
 * screen has at most one primary button visible in practice. E2-pending §1
 * flags the shop detail page for showing three at once; this is the same shape
 * with the dirty gate doing the work.
 *
 * The logo section has no save because it does not need one:
 * `POST /api/v1/brand/logo` has already written the logo through by the time
 * the upload returns.
 */
export function BrandKitScreen({
  shopId,
  shopName,
  logoUrl,
  brandKit,
  brandOverride,
  source,
  canEdit,
  isOwner,
  grids,
  templates,
}: Props) {
  const { kit, hydrate } = useBrandStore()

  // What the server has. Saves advance it; the dirty gates compare against it.
  const [baseline, setBaseline] = React.useState<BrandKit>(brandKit)
  const [saving, setSaving] = React.useState<SaveSection | null>(null)
  const [feedback, setFeedback] = React.useState<{
    section: SaveSection
    kind: 'error' | 'saved'
    message: string
  } | null>(null)

  // Seeded during render rather than in an effect, so the first paint already
  // has the kit. The store is module-global and survives client-side
  // navigation, so without this a previous visit's colours paint for a frame.
  const hydrated = React.useRef(false)
  if (!hydrated.current) {
    useBrandStore.setState({ kit: brandKit, logoUrl, shopName })
    hydrated.current = true
  }

  React.useEffect(() => {
    hydrate({ kit: brandKit, logoUrl, shopName })
    setBaseline(brandKit)
  }, [brandKit, logoUrl, shopName, hydrate])

  const colors = previewColors(kit)

  const colorsDirty =
    kit.primaryColor !== baseline.primaryColor ||
    kit.secondaryColor !== baseline.secondaryColor ||
    kit.accentColor !== baseline.accentColor

  const layoutDirty = kit.gridId !== baseline.gridId || kit.templateId !== baseline.templateId

  const selectedGrid = grids.find((grid) => grid.id === kit.gridId) ?? grids[0]
  const selectedTemplate =
    templates.find((template) => template.id === kit.templateId) ?? templates[0]

  async function save(section: SaveSection, patch: Partial<BrandKit>) {
    setSaving(section)
    setFeedback(null)
    try {
      const res = await fetch('/api/v1/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const result = await res.json()
      if (result.error) {
        setFeedback({ section, kind: 'error', message: result.error.message })
        return
      }
      setBaseline((previous) => ({ ...previous, ...patch }))
      setFeedback({ section, kind: 'saved', message: 'Saved.' })
    } catch {
      setFeedback({
        section,
        kind: 'error',
        message: 'Could not reach the server. Check your connection and try again.',
      })
    } finally {
      setSaving(null)
    }
  }

  function saveColors() {
    // Cleared and typed wrong are different mistakes and get different
    // sentences. A kit always arrives here complete — the page redirects an
    // unfinished one to the wizard — so an empty slot means the owner emptied
    // the field, and "Primary is not a colour we can read" would be an odd
    // thing to say about a box they just cleared.
    const missing = COLOR_SLOTS.find(({ key }) => !kit[key])
    if (missing) {
      setFeedback({
        section: 'colors',
        kind: 'error',
        message: `Pick a ${missing.label.toLowerCase()} colour before saving.`,
      })
      return
    }

    // The same guard the wizard's Continue button runs, from the same function.
    const bad = firstInvalidColorSlot(kit)
    if (bad) {
      setFeedback({
        section: 'colors',
        kind: 'error',
        message: `${bad.label} is not a colour we can read. Use something like ${EXAMPLE_HEX}.`,
      })
      return
    }
    void save('colors', {
      primaryColor: kit.primaryColor,
      secondaryColor: kit.secondaryColor,
      accentColor: kit.accentColor,
    })
  }

  function saveLayout() {
    if (!kit.gridId || !kit.templateId) {
      setFeedback({
        section: 'layout',
        kind: 'error',
        message: 'Choose both a grid and a template.',
      })
      return
    }
    void save('layout', { gridId: kit.gridId, templateId: kit.templateId })
  }

  return (
    <div className="flex flex-col gap-6">
      {brandOverride === 'inherit' ? (
        // The one thing about this screen that genuinely surprises people:
        // `patchBrandAtLevel` routes an inheriting shop's edits to the
        // *organization's* kit, which is the kit it is showing. Correct, and
        // not something to discover after the fact.
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          This shop uses your organization’s brand. Anything you change here
          changes it for every shop that follows it.
        </p>
      ) : null}

      <BrandKitSummary grids={grids} templates={templates} />

      {!canEdit ? (
        <p className="font-ui text-body-sm text-muted">
          You need to be a manager of this shop to change its brand.
        </p>
      ) : (
        <>
          <Section
            title="Logo"
            description="Used on the header, the footer and the cover of every offer book."
            note={brandOverride === 'inherit' ? null : sourceNote(source.logo)}
          >
            <LogoField variant="secondary" />
          </Section>

          <Section
            title="Colours"
            description="Primary and secondary set the page. Accent is what prices and badges are drawn in."
            note={brandOverride === 'inherit' ? null : sourceNote(source.colors)}
            feedback={feedback?.section === 'colors' ? feedback : null}
          >
            <ColorFields />
            {colorsDirty ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  loading={saving === 'colors'}
                  onClick={saveColors}
                >
                  Save colours
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    useBrandStore.getState().setColors({
                      primaryColor: baseline.primaryColor,
                      secondaryColor: baseline.secondaryColor,
                      accentColor: baseline.accentColor,
                    })
                    setFeedback(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </Section>

          <Section
            title="Layout"
            description="How products sit on the page, and the look of the page they sit on. Both can be changed per offer book later."
            note={brandOverride === 'inherit' ? null : sourceNote(source.layout)}
            feedback={feedback?.section === 'layout' ? feedback : null}
          >
            {grids.length === 0 || templates.length === 0 ? (
              // Seeds not run. An empty radiogroup would read as "you have no
              // choices" rather than "this account is not set up".
              <p className="font-ui text-body-sm text-muted">
                No grids or templates are published yet, so there is nothing to
                choose from.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <h3 className="font-ui text-subhead text-primary">Grid</h3>
                  {selectedTemplate ? (
                    <ChoiceGrid
                      label="Grid"
                      options={grids}
                      selectedId={kit.gridId}
                      onSelect={useBrandStore.getState().setGrid}
                      previewFor={(id) => ({
                        grid: (grids.find((grid) => grid.id === id) ?? selectedGrid)
                          ?.config as GridConfig,
                        template: selectedTemplate.config,
                      })}
                      colors={colors}
                      shopName={shopName}
                    />
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-ui text-subhead text-primary">Template</h3>
                  {selectedGrid ? (
                    <ChoiceGrid
                      label="Template"
                      options={templates}
                      selectedId={kit.templateId}
                      onSelect={useBrandStore.getState().setTemplate}
                      previewFor={(id) => ({
                        grid: selectedGrid.config,
                        template: (
                          templates.find((template) => template.id === id) ?? selectedTemplate
                        )?.config as TemplateConfig,
                      })}
                      colors={colors}
                      shopName={shopName}
                    />
                  ) : null}
                </div>

                {layoutDirty ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      loading={saving === 'layout'}
                      onClick={saveLayout}
                    >
                      Save layout
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const store = useBrandStore.getState()
                        if (baseline.gridId) store.setGrid(baseline.gridId)
                        if (baseline.templateId) store.setTemplate(baseline.templateId)
                        setFeedback(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Section>
        </>
      )}

      <InheritanceSection
        shopId={shopId}
        shopName={shopName}
        brandOverride={brandOverride}
        source={source}
        isOwner={isOwner}
      />
    </div>
  )
}

function sourceNote(level: BrandLevel): string {
  return level === 'org'
    ? 'From your organization — changing it changes every shop that inherits it.'
    : 'Set on this shop.'
}

function Section({
  title,
  description,
  note,
  feedback,
  children,
}: {
  title: string
  description: string
  note?: string | null
  feedback?: { kind: 'error' | 'saved'; message: string } | null
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">{title}</h2>
        <p className="font-ui text-body-sm text-secondary">{description}</p>
        {note ? <p className="font-ui text-body-sm text-muted">{note}</p> : null}
      </div>

      {/* Inline banners rather than toasts: `Toast` has a signature in the
          component inventory and no mounting mechanism — no provider, portal or
          store — and building one here would invent a second API. */}
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={
            feedback.kind === 'error'
              ? 'rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg'
              : 'rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg'
          }
        >
          {feedback.message}
        </p>
      ) : null}

      {children}
    </section>
  )
}

const FACET_LABEL = {
  logo: 'Logo',
  colors: 'Colours',
  layout: 'Grid and template',
} as const

const LEVEL_SENTENCE: Record<BrandOverride, string> = {
  inherit: 'This shop uses your organization’s brand for everything.',
  logo: 'This shop has its own logo. Its colours and layout come from your organization.',
  colors: 'This shop has its own colours. Its logo and layout come from your organization.',
  full: 'This shop sets its own logo, colours and layout. Nothing is inherited.',
}

/**
 * Where the brand comes from, and the way out of it.
 *
 * **Read-only about inheritance, on purpose.** `brandOverride` has exactly one
 * editing surface — `BrandOverrideField` on shop settings — and putting a
 * second set of radio cards here would be two controls for one column. This
 * states the answer and links to the control.
 *
 * The reset below it is the other half: shop settings can switch a shop back to
 * `inherit` reversibly, and this deletes the kit it was leaving behind.
 */
function InheritanceSection({
  shopId,
  shopName,
  brandOverride,
  source,
  isOwner,
}: {
  shopId: string
  shopName: string
  brandOverride: BrandOverride
  source: Record<BrandFacet, BrandLevel>
  isOwner: boolean
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Where this brand comes from</h2>
        <p className="font-ui text-body-sm text-secondary">{LEVEL_SENTENCE[brandOverride]}</p>
      </div>

      <dl className="flex flex-col gap-1">
        {(['logo', 'colors', 'layout'] as const).map((facet) => (
          <div key={facet} className="flex items-baseline justify-between gap-3">
            <dt className="font-ui text-body-sm text-secondary">{FACET_LABEL[facet]}</dt>
            <dd className="font-ui text-body-sm text-primary">
              {source[facet] === 'org' ? 'From your organization' : 'Set on this shop'}
            </dd>
          </div>
        ))}
      </dl>

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/settings/shops/${shopId}`}
            className="font-ui text-body-sm text-link underline-offset-2 hover:underline"
          >
            Change what this shop inherits
          </Link>

          {brandOverride === 'inherit' ? null : (
            <ResetBrandDialog shopName={shopName} />
          )}
        </div>
      ) : null}
    </section>
  )
}
