'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@souqstudio/designer/components/ui/toast'
import { clearFill, markTold, useFillJobs } from '@souqstudio/designer/lib/fill-jobs'

/**
 * Says when a generative fill lands after the owner has left its designer.
 *
 * `CutoutWatch`'s sibling, for the same reason: the wait belongs to the product
 * rather than to the thing that started it. An owner can close the fill dialog
 * and then the designer while the worker is still writing, and leaving already
 * told them "we will tell you when your text is ready". This is that promise
 * kept, on any screen under the app shell.
 *
 * **Held back while a designer is open.** The designer fills the window, and a
 * toast behind it is neither visible nor clickable, so a toast raised then would
 * expire unseen. If the designer is on the fill's own block, its notice bar says
 * it instead and nothing is owed here. Otherwise it waits for the designer to
 * close. Whether a run was reported lives on the job, not here, because this
 * unmounts whenever the owner is on the designer's own route.
 *
 * **Review opens the block where the owner is.** Over the book editor that is
 * the designer window; anywhere else it is the designer's route.
 *
 * **A finished fill stays in the store after the toast.** It has been paid for,
 * so the designer keeps offering it on that block until it is reviewed. A
 * failure was not charged, and once said it is forgotten.
 *
 * Takes no props, so the dashboard layout, a server component, may render it.
 */
export function FillWatch() {
  const router = useRouter()
  const jobs = useFillJobs((state) => state.jobs)
  const showing = useFillJobs((state) => state.showing)

  React.useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (job.state === 'working' || job.told === true) continue

      if (showing === job.blockId) {
        markTold(job.blockId, job.run)
        continue
      }
      if (showing !== null) continue

      markTold(job.blockId, job.run)

      if (job.state === 'ready') {
        toast({
          message: `Your text for ${job.blockName} is ready`,
          tone: 'positive',
          action: {
            label: 'Review',
            onClick: () => {
              useFillJobs.setState({ reviewing: job.blockId })
              const opener = useFillJobs.getState().opener
              if (opener !== null) opener(job.blockId)
              else router.push(`/card-designer/${job.blockId}`)
            },
          },
        })
      } else {
        toast({ message: `Text for ${job.blockName}: ${job.error}`, tone: 'critical' })
        clearFill(job.blockId)
      }
    }
  }, [jobs, showing, router])

  return null
}
