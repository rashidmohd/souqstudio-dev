import { cn } from '@/lib/utils'
import { initials } from '@/lib/initials'

/**
 * Avatar. Initials on a tint — there is no image to show.
 *
 * `users` has no avatar column and no upload path, so this is not a placeholder
 * awaiting a photo; it is the whole component until a schema change says
 * otherwise. Sand with charcoal on it is 10.22:1, the same pairing as an icon
 * chip, which is what keeps it inside the fill-only tier's one rule.
 *
 * `aria-hidden`, always. The avatar sits inside a control that already carries
 * an accessible name, and two letters read aloud as letters is noise, not
 * identity.
 */
export function Avatar({
  name,
  email,
  className,
}: {
  name: string | null
  email: string
  className?: string | undefined
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-chip w-chip shrink-0 items-center justify-center rounded-full',
        'bg-sand font-ui text-label font-medium text-charcoal',
        className
      )}
    >
      {initials(name, email)}
    </span>
  )
}
