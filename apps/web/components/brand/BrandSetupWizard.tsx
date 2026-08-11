'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { BrandKit, GridConfig, TemplateConfig } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { OfferPreview } from '@/components/brand/OfferPreview'
import { LogoStep } from '@/components/brand/LogoStep'
import { ColorsStep } from '@/components/brand/ColorsStep'
import { ChoiceStep } from '@/components/brand/ChoiceStep'
import { useBrandStore, previewColors } from '@/stores/brand-store'

type GridOption = { id: string; name: string; config: GridConfig; minProducts: number }
type TemplateOption = {
  id: string
  name: string
  description: string | null
  config: TemplateConfig
}

type Props = {
  shopName: string
  logoUrl: string | null
  brandKit: BrandKit
  grids: GridOption[]
  templates: TemplateOption[]
}

const TOTAL_STEPS = 5

/**
 * E1-04 — guided brand setup. Five steps, cannot be skipped, resumable.
 *
 * **Progress is saved on every step boundary**, so a refresh, a dropped
 * connection or a closed laptop resumes where it left off rather than starting
 * over. The step to resume at is stored server-side on the brand kit, not in
 * local storage — the owner may well come back on their phone.
 *
 * The preview panel is the point of the whole screen. It sits beside the steps
 * on desktop and below them on mobile, and it reads from the Zustand store, so
 * dragging a colour picker repaints it with no network in the loop.
 */
export function BrandSetupWizard({ shopName, logoUrl, brandKit, grids, templates }: Props) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { kit, hydrate, setGrid, setTemplate, saving, setSaving, saveError, setSaveError } =
    useBrandStore()

  // Resume where they got to. `useState` initialiser rather than an effect: an
  // effect would flash step 1 first.
  const [step, setStep] = React.useState(() =>
    Math.min(Math.max(brandKit.onboardingStep ?? 1, 1), TOTAL_STEPS)
  )
  const [direction, setDirection] = React.useState<1 | -1>(1)

  const hydrated = React.useRef(false)
  if (!hydrated.current) {
    // Seeded during render rather than in an effect, so the first paint already
    // has the kit and the preview never flashes default colours.
    useBrandStore.setState({ kit: brandKit, logoUrl, shopName })
    hydrated.current = true
  }

  React.useEffect(() => {
    hydrate({ kit: brandKit, logoUrl, shopName })
  }, [brandKit, logoUrl, shopName, hydrate])

  const colors = previewColors(kit)

  const selectedGrid = grids.find((grid) => grid.id === kit.gridId) ?? grids[0]
  const selectedTemplate =
    templates.find((template) => template.id === kit.templateId) ?? templates[0]

  /** Persist, then move. A failed save must not silently advance. */
  async function saveAndGo(patch: Partial<BrandKit> & { complete?: boolean }, next: number) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/v1/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, onboardingStep: Math.min(next, TOTAL_STEPS) }),
      })
      const result = await res.json()
      if (result.error) {
        setSaveError(result.error.message)
        return false
      }
      setDirection(1)
      setStep(next)
      return true
    } catch {
      setSaveError('Could not save. Check your connection and try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    setDirection(-1)
    setStep((current) => Math.max(1, current - 1))
  }

  async function finish() {
    const saved = await saveAndGo(
      {
        primaryColor: kit.primaryColor,
        secondaryColor: kit.secondaryColor,
        accentColor: kit.accentColor,
        gridId: kit.gridId,
        templateId: kit.templateId,
        complete: true,
      },
      TOTAL_STEPS
    )
    if (!saved) return
    router.push('/')
    router.refresh()
  }

  // Panels slide from the edge they came from. Opacity and transform only —
  // animating width or height stutters on the tablets these shops use.
  const variants = {
    enter: (dir: 1 | -1) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: 1 | -1) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -24 }),
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-title text-primary">Set up your brand</h1>
          <span className="font-ui text-body-sm text-muted">
            Step <span data-figure>{step}</span> of <span data-figure>{TOTAL_STEPS}</span>
          </span>
        </div>
        <ol className="flex gap-1" aria-label="Progress">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <li
              key={index}
              aria-current={index + 1 === step ? 'step' : undefined}
              className={`h-1 flex-1 rounded-pill ${
                index + 1 <= step ? 'bg-action-primary' : 'bg-stone-200'
              }`}
            />
          ))}
        </ol>
      </div>

      {saveError ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {saveError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduceMotion ? 0.001 : 0.2, ease: [0.2, 0, 0, 1] }}
            >
              {step === 1 ? (
                <LogoStep onContinue={() => void saveAndGo({}, 2)} />
              ) : null}

              {step === 2 ? (
                <ColorsStep
                  onBack={goBack}
                  onContinue={() =>
                    void saveAndGo(
                      {
                        primaryColor: kit.primaryColor,
                        secondaryColor: kit.secondaryColor,
                        accentColor: kit.accentColor,
                      },
                      3
                    )
                  }
                />
              ) : null}

              {step === 3 && selectedTemplate ? (
                <ChoiceStep
                  title="Choose a grid"
                  description="How products are laid out on the page. You can change it per offer book later."
                  options={grids}
                  selectedId={kit.gridId}
                  onSelect={setGrid}
                  previewFor={(id) => ({
                    grid: (grids.find((grid) => grid.id === id) ?? selectedGrid)?.config as GridConfig,
                    template: selectedTemplate.config,
                  })}
                  colors={colors}
                  shopName={shopName}
                  onBack={goBack}
                  onContinue={() => void saveAndGo({ gridId: kit.gridId }, 4)}
                />
              ) : null}

              {step === 4 && selectedGrid ? (
                <ChoiceStep
                  title="Choose a template"
                  description="The look of the page, in your colours. Also changeable per offer book."
                  options={templates}
                  selectedId={kit.templateId}
                  onSelect={setTemplate}
                  previewFor={(id) => ({
                    grid: selectedGrid.config,
                    template: (templates.find((template) => template.id === id) ?? selectedTemplate)
                      ?.config as TemplateConfig,
                  })}
                  colors={colors}
                  shopName={shopName}
                  onBack={goBack}
                  onContinue={() => void saveAndGo({ templateId: kit.templateId }, 5)}
                />
              ) : null}

              {step === 5 ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="font-display text-heading text-primary">Your brand is ready</h2>
                    <p className="font-ui text-body text-secondary">
                      Every offer book you make starts on-brand from here. You can
                      change any of it later from your brand kit.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      loading={saving}
                      onClick={() => void finish()}
                    >
                      Create your first offer book
                    </Button>
                    <Button type="button" variant="ghost" size="lg" onClick={goBack}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Live preview. Below the steps on mobile, beside them from lg. */}
        <aside className="flex flex-col gap-2">
          <span className="font-ui text-label font-medium text-secondary">Preview</span>
          {selectedGrid && selectedTemplate ? (
            <div className="overflow-hidden rounded-card border-hairline border-border-subtle">
              <OfferPreview
                grid={selectedGrid.config}
                template={selectedTemplate.config}
                colors={colors}
                shopName={shopName}
                className="block h-auto w-full"
              />
            </div>
          ) : null}
          <p className="font-ui text-body-sm text-muted">
            A sample page in your colours. Real products come next.
          </p>
        </aside>
      </div>
    </div>
  )
}
