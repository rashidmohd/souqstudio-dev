'use client'

import { create } from 'zustand'

/**
 * Waiting for a saved block's PNG, after the owner has left the designer.
 *
 * Leaving says "we will let you know when the preview is ready", because the
 * worker draws the PNG a few seconds after the save (`lib/block-thumbnail.ts`).
 * This keeps that promise: it polls the host's status route until the PNG is
 * there, and the dashboard's `ThumbnailWatch` raises the toast and refreshes
 * the page so the list shows it.
 *
 * Module-level like `fill-jobs`, for the same reason: the designer that started
 * the wait has unmounted by the time it ends.
 */

export type ThumbnailWait = {
  blockId: string
  blockName: string
  state: 'waiting' | 'ready'
  /** Whether the owner has been told it is ready. */
  told?: boolean
}

export const useThumbnailWatch = create<{ waits: Record<string, ThumbnailWait> }>(() => ({
  waits: {},
}))

/** Every three seconds for two minutes; past that the list's live preview is the answer. */
const POLL_MS = 3000
const GIVE_UP_MS = 2 * 60 * 1000

export function watchThumbnail(input: { statusUrl: string; blockId: string; blockName: string }) {
  const { blockId, blockName } = input
  // A second save of the same block restarts the wait rather than adding one.
  const already = useThumbnailWatch.getState().waits[blockId]?.state === 'waiting'
  put({ blockId, blockName, state: 'waiting' })
  if (already) return

  void (async () => {
    const deadline = Date.now() + GIVE_UP_MS
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      try {
        const response = await fetch(input.statusUrl)
        const body = (await response.json()) as { data: { url: string | null } | null }
        if (body.data?.url) {
          const current = useThumbnailWatch.getState().waits[blockId]
          put({ blockId, blockName: current?.blockName ?? blockName, state: 'ready' })
          return
        }
      } catch {
        // A blip; the next poll asks again.
      }
    }
    forget(blockId)
  })()
}

export function markThumbnailTold(blockId: string) {
  const wait = useThumbnailWatch.getState().waits[blockId]
  if (wait === undefined) return
  put({ ...wait, told: true })
}

export function forget(blockId: string) {
  useThumbnailWatch.setState((state) => {
    const { [blockId]: _gone, ...rest } = state.waits
    return { waits: rest }
  })
}

function put(wait: ThumbnailWait) {
  useThumbnailWatch.setState((state) => ({ waits: { ...state.waits, [wait.blockId]: wait } }))
}

/**
 * Whether this block's new PNG is still being drawn after the owner saved it.
 *
 * True only for a block somebody just changed and left, so a card can say its
 * picture is on its way. A block that simply has no PNG yet, which is every
 * seeded block the first time a shop browses it, answers false: its live
 * drawing is already correct, and a label on sixty cards would read as broken.
 */
export function useThumbnailPending(blockId: string): boolean {
  return useThumbnailWatch((state) => state.waits[blockId]?.state === 'waiting')
}
