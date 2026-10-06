'use client'

import { useThumbnailPending } from '@souqstudio/designer/lib/thumbnail-watch'
import { cn } from '@souqstudio/designer/lib/utils'

/**
 * "Updating preview", on the card of a block the owner just changed, while the
 * worker draws its new PNG. `lib/thumbnail-watch.ts`.
 *
 * **Over the live drawing, never instead of it.** The card already shows the
 * block as it is now; what the chip adds is that the stored picture is catching
 * up, so the owner does not wonder whether their change was kept. It goes when
 * the PNG lands, which is also when the list swaps to it, and after two minutes
 * if it never does, leaving the live drawing as the answer.
 *
 * Absent for every block nobody has just saved, which is nearly all of them.
 * The caller positions it; the parent must be `relative`.
 */
export function PreviewUpdating({ blockId, className }: { blockId: string; className?: string }) {
  const pending = useThumbnailPending(blockId)
  if (!pending) return null

  return (
    <span
      role="status"
      className={cn(
        'absolute rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary',
        className ?? 'start-1 top-1'
      )}
    >
      Updating preview
    </span>
  )
}
