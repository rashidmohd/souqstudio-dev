'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { CellSpan } from '@souqstudio/engine'

/**
 * Writing the cells one page draws as one.
 *
 * **Its own hook rather than a field on `useGridPatch`**, because it writes a
 * different resource. The grid route rebuilds the master every page is an
 * instance of; this writes a row belonging to one page. Folding them together
 * would mean a merge on page three going out on a request whose other fields
 * describe the whole book.
 *
 * **The whole set for that page, never one merge.** Two tabs merging against
 * different starting states would interleave into a layout neither owner chose;
 * the offer tray's reorder sends the whole order for the same reason.
 */
export function usePageMerges(bookId: string) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)

  const write = React.useCallback(
    async (pageIndex: number, merges: readonly CellSpan[]): Promise<boolean> => {
      setError(null)
      try {
        const res = await fetch(
          `/api/v1/offer-books/${bookId}/pages/${pageIndex}/merges`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ merges }),
          }
        )
        const body = (await res.json()) as {
          data: { merges: CellSpan[] } | null
          error: { message: string } | null
        }
        if (body.data === null) {
          setError(body.error?.message ?? 'That layout could not be applied.')
          return false
        }
        // The artboard is engine output: every rectangle on it comes from the
        // flow running over the stored grid, so the page cannot move until the
        // server has re-run it. Painting a merge before then would mean a second
        // layout engine in the browser, which is how the PDF stops matching the
        // screen.
        router.refresh()
        return true
      } catch {
        setError('That layout could not be applied. Check your connection.')
        return false
      }
    },
    [bookId, router]
  )

  return { write, error }
}
