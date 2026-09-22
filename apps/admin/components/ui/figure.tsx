import { cn } from '@/lib/utils'

/**
 * Every figure in the chrome. Mono, tabular, bidi-isolated.
 * souqstudio-design → Typography.
 *
 * `[data-figure]` is the attribute the token file styles and the rule the
 * consistency checklist looks for. The isolation is the part that is not
 * cosmetic: an unisolated number inside Arabic text visually reorders, so a
 * barcode or a price reads wrong rather than merely looking wrong.
 */
export function Figure({
  children,
  className,
  size = 'data',
}: {
  children: React.ReactNode
  className?: string
  size?: 'data' | 'data-sm' | 'data-lg'
}) {
  const sizes = {
    data: 'text-data',
    'data-sm': 'text-data-sm',
    'data-lg': 'text-data-lg font-medium',
  } as const

  return (
    <span data-figure="" dir="ltr" className={cn('font-figure', sizes[size], className)}>
      {children}
    </span>
  )
}
