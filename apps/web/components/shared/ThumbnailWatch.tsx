'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@souqstudio/designer/components/ui/toast'
import { useFillJobs } from '@souqstudio/designer/lib/fill-jobs'
import { forget, markThumbnailTold, useThumbnailWatch } from '@souqstudio/designer/lib/thumbnail-watch'

/**
 * Says when a saved block's preview PNG has been drawn, and shows it.
 *
 * Leaving the designer after a change says "we will let you know when the
 * preview is ready", and `lib/thumbnail-watch.ts` polls for it. This is the
 * other half: a toast naming the block, and a refresh, so the library or the
 * picker underneath swaps its live drawing for the PNG without the owner
 * reloading anything.
 *
 * Held back while a designer is open, for the reason `FillWatch` gives: a toast
 * behind a full-screen designer is never seen. Takes no props, so the
 * dashboard layout, a server component, may render it.
 */
export function ThumbnailWatch() {
  const router = useRouter()
  const waits = useThumbnailWatch((state) => state.waits)
  const showing = useFillJobs((state) => state.showing)

  React.useEffect(() => {
    for (const wait of Object.values(waits)) {
      if (wait.state !== 'ready' || wait.told === true || showing !== null) continue

      markThumbnailTold(wait.blockId)
      toast({ message: `The preview of ${wait.blockName} is ready`, tone: 'positive' })
      forget(wait.blockId)
      router.refresh()
    }
  }, [waits, showing, router])

  return null
}
