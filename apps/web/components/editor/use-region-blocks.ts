'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

/**
 * Writing what the cells of one page draw.
 *
 * **Not debounced, unlike the background.** Picking a design is one deliberate
 * choice from a list, not a value dragged through a hundred intermediate ones.
 * The caller shows a pending state instead, because the page cannot move until
 * the flow has re-run: putting a brand block in a cell moves every product after
 * it, which is a re-flow of the whole book rather than a repaint.
 *
 * **The whole map for that page, never one cell**, for the reason the merges
 * writer states: two tabs assigning designs against different starting states
 * would interleave into a page neither owner laid out.
 */
export function useRegionBlocks(bookId: string) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)

  const write = React.useCallback(
    async (pageIndex: number, blocks: Record<string, string>): Promise<boolean> => {
      setError(null)
      try {
        const res = await fetch(
          `/api/v1/offer-books/${bookId}/pages/${pageIndex}/region-blocks`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ blocks }),
          }
        )
        const parsed = (await res.json()) as {
          data: unknown | null
          error: { message: string } | null
        }
        if (parsed.data === null) {
          setError(parsed.error?.message ?? 'That design could not be applied.')
          return false
        }
        router.refresh()
        return true
      } catch {
        setError('That design could not be applied. Check your connection.')
        return false
      }
    },
    [bookId, router]
  )

  return { write, error }
}
