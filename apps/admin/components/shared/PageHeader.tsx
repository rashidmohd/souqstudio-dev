/**
 * One page title per screen, with at most one primary action beside it.
 *
 * Host Grotesk appears twice a screen at most, and this is one of the two
 * places the design system permits: the page title. The other is an empty
 * state.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  // `| undefined` is explicit for exactOptionalPropertyTypes: callers derive
  // these from nullable columns, so they pass undefined rather than omitting.
  description?: string | undefined
  action?: React.ReactNode | undefined
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">{title}</h1>
        {description === undefined ? null : (
          <p className="max-w-full text-body text-secondary">{description}</p>
        )}
      </div>
      {action}
    </header>
  )
}
