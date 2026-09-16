import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The column a dashboard screen lives in.
 *
 * **One decision in one place, instead of sixteen copies of a class string.**
 * `mx-auto flex w-full max-w-3xl flex-col gap-6 p-6` was written out by hand in
 * thirteen files, which is why every screen in the product was 768px wide on a
 * 1900px display and why changing that meant finding all of them. A width
 * repeated is a width nobody owns.
 *
 * **`default` is the reading width and `wide` is for grids.** A form, a settings
 * list or a stack of cards has a comfortable measure and gets worse past it —
 * but 768px was well short of that, and it left two thirds of a laptop screen
 * empty while the brand kit's four tabs squeezed into a column. A gallery is the
 * opposite: `wide` exists because the block library is a grid of previews and
 * every extra column is a block an owner does not have to scroll to.
 *
 * `size` uses the same word as `Button` and `Input` deliberately — components
 * carrying `size` should not disagree about what it means.
 */
type PageContainerProps = {
  size?: 'default' | 'wide'
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export function PageContainer({
  size = 'default',
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-6 p-6',
        size === 'wide' ? 'max-w-7xl' : 'max-w-5xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
