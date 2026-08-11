'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, X } from 'lucide-react'
import type { ChecklistItem } from '@/lib/checklist'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The getting-started checklist. E1-05.
 *
 * Lives on the dashboard until every required item is done, and can be
 * dismissed once the first offer book is published — the point at which the
 * owner has seen the product work and the list turns into nagging.
 *
 * Items whose destination does not exist yet are not links. They say so instead
 * of pointing at a 404, which is the same call lib/oauth.ts makes about the
 * Google button. See lib/features.ts.
 */
type Props = {
  items: ChecklistItem[]
  dismissible: boolean
}

export function GettingStartedChecklist({ items, dismissible }: Props) {
  const router = useRouter()
  const [dismissing, setDismissing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const required = items.filter((item) => !item.optional)
  const doneCount = required.filter((item) => item.done).length

  async function dismiss() {
    setDismissing(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/onboarding/checklist', { method: 'DELETE' })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setDismissing(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-heading text-primary">Getting started</h2>
            <p className="font-ui text-body-sm text-secondary">
              <span data-figure>{doneCount}</span> of{' '}
              <span data-figure>{required.length}</span> done
            </p>
          </div>

          {dismissible ? (
            <Button
              type="button"
              variant="ghost"
              iconOnly
              aria-label="Hide the getting started checklist"
              loading={dismissing}
              onClick={() => void dismiss()}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {error}
          </p>
        ) : null}

        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="border-b-hairline border-border-subtle last:border-b-0">
              <ChecklistRow item={item} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const label = (
    <>
      <Marker done={item.done} />
      <span
        className={cn(
          'flex-1 font-ui text-body',
          item.done ? 'text-muted line-through' : 'text-primary'
        )}
      >
        {item.label}
        {item.optional ? <span className="text-muted"> (optional)</span> : null}
      </span>
    </>
  )

  // Done items are not links. There is nowhere useful to send someone for a
  // thing they have already finished, and a row that looks actionable but
  // repeats a completed step wastes the tap.
  if (item.done || !item.href) {
    return (
      <div className="flex min-h-row items-center gap-3 py-2">
        {label}
        {!item.done && item.unavailableReason ? (
          <span className="font-ui text-body-sm text-muted">{item.unavailableReason}</span>
        ) : null}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className="flex min-h-row items-center gap-3 rounded-control py-2 transition-colors duration-fast ease-sq hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      {label}
      <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
    </Link>
  )
}

function Marker({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full border',
        done ? 'border-positive-fg bg-positive-bg' : 'border-border-strong'
      )}
    >
      {done ? <Check className="size-3 text-positive-fg" /> : null}
    </span>
  )
}
