import { cn } from '@/lib/utils'

/**
 * Empty, zero results and error are three different screens, and collapsing
 * them is the most common mistake the design system names. They are three
 * components here for that reason.
 *
 * **No illustrations in this app at all** — see apps/admin/CLAUDE.md. That also
 * settles the one rule that separates `EmptyState` from `ZeroResults`
 * visually: illustrations are permitted on empty and forbidden on zero results,
 * and neither gets one here, so what distinguishes them is what they say.
 */

/** Never created one. An invitation, with the action that creates the first. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border-subtle bg-surface px-6 py-12 text-center">
      <h2 className="font-display text-title text-primary">{title}</h2>
      <p className="max-w-full text-body text-secondary">{body}</p>
      {action}
    </div>
  )
}

/**
 * A search or filter matched nothing. Names what was searched and offers a way
 * to widen it. Not an invitation, because the thing already exists.
 */
export function ZeroResults({ query, onReset }: { query: string; onReset: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-border-subtle bg-surface px-6 py-8 text-center">
      <p className="text-body text-primary">
        Nothing matches{' '}
        <span className="font-medium">
          {query === '' ? 'these filters' : `"${query}"`}
        </span>
        .
      </p>
      <p className="text-body-sm text-secondary">Widen the filters or search for something else.</p>
      {onReset}
    </div>
  )
}

/** Something failed. What happened, and what to do. */
export function ErrorState({
  title = 'That did not load',
  body,
  action,
  className,
}: {
  title?: string
  body: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 rounded-card border border-critical-fg bg-critical-bg p-4',
        className
      )}
    >
      <p className="text-body font-medium text-critical-fg">{title}</p>
      <p className="text-body text-primary">{body}</p>
      {action}
    </div>
  )
}

/**
 * Skeletons mirror the shape of the incoming content. A generic grey block that
 * resolves into a table is worse than nothing, because the layout jumps.
 */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-px" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex min-h-row items-center gap-3 px-3">
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              className={cn(
                'h-4 animate-pulse rounded-chip bg-stone-100',
                column === 0 ? 'flex-1' : 'w-skeleton-chip'
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
