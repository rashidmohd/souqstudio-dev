import * as React from 'react'
import { cn } from '@/lib/utils'
import { Figure } from '@/components/ui/figure'

/**
 * UsageMeter. Governed by the design skill → Components → Usage meters, and by
 * references/component-inventory.md, which owns this signature.
 *
 * The numbers are the point and the bar is the summary — never the other way
 * round. "180 of 200" is what a shop owner can act on; a bar at 90% makes them
 * work out how many are left.
 *
 * Thresholds live here rather than in a prop so two screens cannot disagree
 * about when someone should start worrying.
 */

const CAUTION_AT = 0.8

type UsageMeterProps = {
  label: string
  used: number
  /** Null is unlimited — a real state, not a missing value. No bar is drawn. */
  limit: number | null
  /** For the screen reader sentence: "3 of 10 shops". */
  unit?: string | undefined
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>

export function UsageMeter({ label, used, limit, unit, className, ...props }: UsageMeterProps) {
  const fraction = limit && limit > 0 ? used / limit : 0
  const full = limit !== null && used >= limit

  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-ui text-label text-secondary">{label}</span>
        <span className="text-primary">
          <Figure value={used} size="data-sm" />
          {limit === null ? (
            <span className="font-ui text-body-sm text-secondary"> of unlimited</span>
          ) : (
            <>
              <span className="font-ui text-body-sm text-secondary"> of </span>
              <Figure value={limit} size="data-sm" />
            </>
          )}
        </span>
      </div>

      {limit === null ? null : (
        <div
          // The native progress semantics, without the native widget: no
          // browser's default rendering of <progress> can be brought onto the
          // token scale, and this element carries the same information.
          role="progressbar"
          aria-label={`${label}: ${used} of ${limit}${unit ? ` ${unit}` : ''}`}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          className="h-1 w-full overflow-hidden rounded-pill bg-stone-100"
        >
          <div
            className={cn(
              'h-full rounded-pill',
              full ? 'bg-critical-fg' : fraction >= CAUTION_AT ? 'bg-caution-fg' : 'bg-charcoal'
            )}
            // The one inline style in the system, and the deviation is recorded
            // in the component inventory: this is a *data* value — the fraction
            // consumed — not a design value. Every colour and radius above
            // still comes from a token.
            style={{ inlineSize: `${Math.min(Math.max(fraction, 0), 1) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
