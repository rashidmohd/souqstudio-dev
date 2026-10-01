'use client'

import * as React from 'react'
import { toast } from '@souqstudio/designer/components/ui/toast'
import { clearFill, useFillJobs } from '@souqstudio/designer/lib/fill-jobs'

/**
 * Says when a generative fill lands after its designer window has closed.
 *
 * `CutoutWatch`'s sibling, for the same reason: the wait belongs to the book
 * rather than to the thing that started it. An owner can close the fill dialog
 * and then the window while the worker is still writing, and the window's own
 * close already told them "we will tell you when your text is ready". This is
 * that promise kept.
 *
 * **Held back while any designer window is open.** The window is a modal
 * `<dialog>` in the top layer, and a toast behind it is neither visible nor
 * clickable, so a toast raised then would expire unseen. If the window is on
 * the fill's own block, the designer's notice bar says it instead and nothing
 * is owed here. Otherwise it waits for the window to close.
 *
 * **A finished fill stays in the store after the toast.** It has been paid for,
 * so the designer keeps offering it on that block until it is reviewed. A
 * failure was not charged, and once said it is forgotten.
 */
export function FillWatch({
  editingBlock,
  onReview,
}: {
  /** The block open in the designer window, or null when none is. */
  editingBlock: string | null
  /** Open the designer window on this block. */
  onReview: (blockId: string) => void
}) {
  const jobs = useFillJobs((state) => state.jobs)
  /** Runs already reported, by block and run, so a re-render does not repeat one. */
  const told = React.useRef(new Set<string>())

  React.useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (job.state === 'working') continue

      const key = `${job.blockId}:${job.run}`
      if (told.current.has(key)) continue

      if (editingBlock === job.blockId) {
        told.current.add(key)
        continue
      }
      if (editingBlock !== null) continue

      told.current.add(key)

      if (job.state === 'ready') {
        toast({
          message: `Your text for ${job.blockName} is ready`,
          tone: 'positive',
          action: {
            label: 'Review',
            onClick: () => {
              useFillJobs.setState({ reviewing: job.blockId })
              onReview(job.blockId)
            },
          },
        })
      } else {
        toast({ message: `Text for ${job.blockName}: ${job.error}`, tone: 'critical' })
        clearFill(job.blockId)
      }
    }
  }, [jobs, editingBlock, onReview])

  return null
}
