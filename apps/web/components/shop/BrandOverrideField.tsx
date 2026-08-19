'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BRAND_OVERRIDES, type BrandOverride } from '@souqstudio/types'
import { Button } from '@/components/ui/button'

/**
 * E2-05 — how much of the organization's brand this shop replaces.
 *
 * The control surface the epic asks for: "override level is set per shop in
 * shop settings". The four levels are facet-shaped rather than field-shaped —
 * see lib/brand-inheritance.ts, which owns the rule this only presents.
 *
 * Owner-only, because moving a shop off `inherit` forks the organization's
 * brand. `PATCH /shops/:id` enforces that; this hides the control rather than
 * showing it disabled, since a manager has no route to it at all.
 */

const LEVELS: Record<BrandOverride, { label: string; description: string }> = {
  inherit: {
    label: 'Use the organization’s brand',
    description: 'Logo, colours and layout all come from your organization. Change them once and every shop follows.',
  },
  logo: {
    label: 'Its own logo',
    description: 'This shop uses its own logo. Colours and layout still come from your organization.',
  },
  colors: {
    label: 'Its own colours',
    description: 'This shop uses its own colours. The logo and layout still come from your organization.',
  },
  full: {
    label: 'Fully independent',
    description: 'This shop sets its own logo, colours and layout. Nothing is inherited.',
  },
}

/** Where each facet actually resolved from, for the summary line. */
const FACET_LABEL = {
  logo: 'Logo',
  colors: 'Colours',
  layout: 'Grid, template and fonts',
  progress: 'Setup progress',
} as const

export function BrandOverrideField({
  shopId,
  value,
  source,
}: {
  shopId: string
  value: BrandOverride
  source: Record<'logo' | 'colors' | 'layout' | 'progress', 'org' | 'shop'>
}) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<BrandOverride>(value)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const dirty = selected !== value

  async function save() {
    setError(null)
    setSaved(false)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/shops/${shopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandOverride: selected }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      {saved && !dirty ? (
        <p
          role="status"
          className="rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg"
        >
          Saved.
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Brand inheritance</legend>

        {/* Radio cards rather than a select: four options each needing a line
            of explanation is not a dropdown, and there is no radio group in the
            component inventory to reach for. Native inputs so the keyboard and
            screen-reader behaviour comes from the platform. */}
        {BRAND_OVERRIDES.map((level) => (
          <label
            key={level}
            className="flex cursor-pointer gap-3 rounded-card border-hairline border-border-subtle p-3 has-[:checked]:border-border-focus has-[:checked]:bg-selected-bg"
          >
            <input
              type="radio"
              name="brandOverride"
              value={level}
              checked={selected === level}
              onChange={() => {
                setSelected(level)
                setSaved(false)
              }}
              className="mt-1 size-4 shrink-0"
            />
            <span className="flex flex-col gap-1">
              <span className="font-ui text-body font-medium text-primary">
                {LEVELS[level].label}
              </span>
              <span className="font-ui text-body-sm text-secondary">
                {LEVELS[level].description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* What the shop is actually rendering with right now, facet by facet.
          Without this, "its own colours" is a claim the owner has to verify by
          opening the editor. */}
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

      {dirty ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={submitting}>
            Save brand setting
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSelected(value)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {/* Two different acts, and the difference is worth a sentence. This one
          is reversible: the shop's own kit stays in place and stops being read.
          E4-05's "reset to organization defaults", on the brand kit screen,
          deletes it. Naming the other one here is what stops an owner reaching
          for the destructive control when they wanted this one.

          No link across: the brand kit screen is scoped to the *active* shop,
          and this page can be showing any shop in the organization. A link
          would take them somewhere that edits a different brand. The rail's
          shop switcher — still unbuilt, E2-pending §2 — is what makes that
          link safe to add. */}
      {value !== 'inherit' ? (
        <p className="font-ui text-body-sm text-muted">
          Switching back to your organization’s brand keeps this shop’s own settings —
          they stop being used, and come back if you change your mind. To delete
          them for good, reset the brand kit from this shop’s brand kit screen.
        </p>
      ) : null}
    </div>
  )
}
