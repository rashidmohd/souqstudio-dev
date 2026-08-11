import { cn } from '@/lib/utils'

/**
 * The SouqStudio wordmark, monochrome, taking its colour from `currentColor`.
 *
 * Set the colour with a text token on the element or its parent —
 * `text-primary` on light, `text-inverse` on dark. Do not add a colour here;
 * one mark that inherits beats two files that drift.
 *
 * `role="img"` with a label because a masked span has no accessible name of its
 * own, and the mark is the product's name, not decoration.
 */
export function Wordmark({ className }: { className?: string }) {
  return <span role="img" aria-label="SouqStudio" className={cn('sq-wordmark', className)} />
}
