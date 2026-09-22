import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** `--sq-radius-card`, hairline border, no shadow. There is no elevation here. */
export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-card border border-border-subtle bg-surface p-4', className)}>
      {children}
    </div>
  )
}

/**
 * Icon chip, label, figure. souqstudio-design → Stat cards.
 *
 * The chip is decorative and says so: `aria-hidden` on the glyph, and the
 * adjacent text is the label. A chip is never the tap target.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string
  value: string | number
  // `LucideIcon` rather than a hand-written prop shape: lucide's own type
  // widens `strokeWidth` to string | number, which a narrower local type
  // rejects under exactOptionalPropertyTypes.
  icon: LucideIcon
  note?: string
}) {
  return (
    <Card className="flex flex-col gap-2">
      <span
        aria-hidden="true"
        className="inline-flex size-chip items-center justify-center rounded-chip bg-sand text-charcoal"
      >
        <Icon className="size-icon" strokeWidth={1.75} />
      </span>
      <span className="text-label font-medium text-secondary">{label}</span>
      <span data-figure="" dir="ltr" className="font-figure text-data-lg font-medium text-primary">
        {value}
      </span>
      {note === undefined ? null : <span className="text-body-sm text-muted">{note}</span>}
    </Card>
  )
}
