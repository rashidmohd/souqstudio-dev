import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Skeleton. Governed by the design skill → Motion → Loading, and by
 * references/component-inventory.md, which owns this signature.
 *
 * The loading rule is a ladder, and skeletons are its top rung: nothing under
 * 400ms, an inline spinner on the pressed control from 400ms to a second, and
 * skeletons only above that on a first load. A skeleton for a fast query is
 * worse than no skeleton — it makes an instant screen look slow.
 *
 * Shapes mirror the real content so the page does not reflow when it arrives.
 * `row` in particular matches `min-h-row`, the 44px tappable table row.
 */
type SkeletonProps = {
  shape: 'text' | 'card' | 'row' | 'chip'
  /** How many to render. Rows and text lines usually want several. */
  count?: number | undefined
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>

const SHAPE_CLASS = {
  text: 'h-4 w-full rounded-control',
  card: 'h-32 w-full rounded-card',
  row: 'min-h-row w-full rounded-control',
  chip: 'h-6 w-16 rounded-chip',
} as const

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { shape, count = 1, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      // One live region for the whole group, not one per bar. A screen reader
      // announcing "loading" once per skeleton row is unusable.
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="flex w-full flex-col gap-2"
      {...props}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn('animate-pulse bg-stone-100', SHAPE_CLASS[shape], className)}
        />
      ))}
    </div>
  )
})
