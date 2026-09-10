'use client'

import * as React from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { cn } from '@/lib/utils'

/**
 * One step of the creation flow, in one of its three states.
 *
 * **The screen accumulates rather than replaces**, which is the difference
 * between this and a wizard that pages. A step the owner has answered collapses
 * to its answer and stays on the screen, so at the Create button they can see
 * every decision they made without going back through them, and change one
 * without losing the rest. A four-page wizard makes them hold three answers in
 * their head and trust that the fourth screen still has them.
 *
 * The three states, and each looks different on purpose:
 *
 * - **done** — collapsed to a one-line summary of the answer, with Change.
 * - **current** — open, with its controls and its Continue.
 * - **ahead** — the number and the title, greyed. Present so the owner can see
 *   how much is left, which is the one thing a progress bar does that this
 *   would otherwise lose.
 */
type Props = {
  /** 1-based, and shown. An owner wants to know how many are left. */
  index: number
  title: string
  state: 'done' | 'current' | 'ahead'
  /** The answer, on a done step. One line. */
  summary?: React.ReactNode
  onChange?: () => void
  children?: React.ReactNode
}

export function WizardStep({ index, title, state, summary, onChange, children }: Props) {
  const done = state === 'done'
  const ahead = state === 'ahead'

  return (
    <section
      aria-current={state === 'current' ? 'step' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-card border-hairline p-4',
        state === 'current' ? 'border-border-strong bg-surface' : 'border-border-subtle',
        ahead && 'opacity-disabled'
      )}
    >
      <div className="flex min-h-row items-center justify-between gap-3">
        <h2 className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'flex h-chip w-chip shrink-0 items-center justify-center rounded-chip',
              done ? 'bg-positive-bg text-positive-fg' : 'bg-sand text-primary'
            )}
          >
            {done ? (
              <Check className="size-4" strokeWidth={2} />
            ) : (
              <Figure value={index} size="data-sm" />
            )}
          </span>
          <span className="font-ui text-subhead text-primary">{title}</span>
        </h2>

        {done && onChange ? (
          <Button type="button" variant="ghost" onClick={onChange}>
            <Pencil className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Change
          </Button>
        ) : null}
      </div>

      {done ? (
        <p className="font-ui text-body-sm text-secondary">{summary}</p>
      ) : ahead ? null : (
        children
      )}
    </section>
  )
}
