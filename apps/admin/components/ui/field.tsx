import { cn } from '@/lib/utils'

/**
 * Label above the field, always. Error below it, alongside the border colour,
 * never colour alone. souqstudio-design → Forms.
 *
 * The asterisk needs the legend beside it to mean anything, so `FieldLegend`
 * ships in the same file as the thing that produces asterisks. A form with
 * required fields and no legend is the defect the design system calls out.
 */
export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string | undefined
  className?: string
  children: React.ReactNode
}) {
  const hintId = hint === undefined ? undefined : `${htmlFor}-hint`
  const errorId = error === undefined ? undefined : `${htmlFor}-error`

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-label font-medium text-primary">
        {label}
        {required ? (
          <span className="text-critical-fg" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>
      {hint === undefined ? null : (
        <p id={hintId} className="text-body-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-body-sm text-critical-fg">
          {error}
        </p>
      )}
    </div>
  )
}

export function FieldLegend() {
  return (
    <p className="text-body-sm text-muted">
      <span className="text-critical-fg" aria-hidden="true">
        *
      </span>{' '}
      Required
    </p>
  )
}
