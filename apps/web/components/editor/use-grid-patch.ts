'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { PageBackground } from '@souqstudio/types'

/**
 * Writing one field of the master grid.
 *
 * **Extracted when the layout controls were split across tabs.** The fetch,
 * the busy flag, the error string and the page-count echo all lived inside
 * `LayoutPanel` because every control was inside `LayoutPanel`. Splitting
 * Background into its own tab would have meant a second copy of the same
 * request — and the two would have disagreed the first time the route's error
 * shape changed.
 *
 * **Only what changed is sent.** `PATCH .../grid` reads the stored grid back
 * into the choice that made it and applies a delta, so a caller may send one
 * field without knowing any of the others. That seam is what stops the margin
 * control from resetting the offer card, and it is the reason this signature is
 * all-optional rather than a whole grid.
 *
 * Colocated with its consumers, the same way `useCanvasDrawer` sits in
 * `components/shared/canvas-drawer.tsx`.
 */
export interface GridPatch {
  perRow?: number
  bodyRows?: number
  margin?: number
  /** `null` removes the band. Absent leaves it. */
  headerBlockId?: string | null
  footerBlockId?: string | null
  /** `null` clears the page back to `--sq-tpl-paper`. */
  background?: PageBackground | null
}

export function useGridPatch(bookId: string, pageCount: number) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState(pageCount)

  // The server recomposes on every change, so the count from props is the truth
  // as soon as it lands; this holds the answer the route gave in the meantime.
  React.useEffect(() => setPages(pageCount), [pageCount])

  const patch = React.useCallback(
    async (next: GridPatch) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/offer-books/${bookId}/grid`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        })
        const body = (await res.json()) as {
          data: { pages: number } | null
          error: { message: string } | null
        }
        if (body.data === null) {
          setError(body.error?.message ?? 'That layout could not be applied.')
          return
        }
        setPages(body.data.pages)
        router.refresh()
      } catch {
        setError('That layout could not be applied. Check your connection.')
      } finally {
        setBusy(false)
      }
    },
    [bookId, router]
  )

  return { patch, busy, error, pages }
}
