'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { CellSpan } from '@souqstudio/engine'
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
  /**
   * The cells the owner has merged, in body-card coordinates.
   *
   * **The whole set, never one merge.** Every other field here is a value; this
   * is a collection, and sending a delta into a collection is how two tabs
   * merging against different starting states interleave into a grid neither
   * owner chose. The offer tray's reorder makes the same choice for the same
   * reason.
   */
  merges?: readonly CellSpan[]
  /** `null` removes the band. Absent leaves it. */
  headerBlockId?: string | null
  footerBlockId?: string | null
  /** `null` clears the page back to `--sq-tpl-paper`. */
  background?: PageBackground | null
}

/**
 * How long a continuous control may go quiet before its value is sent.
 *
 * **The editor's autosave is 2 seconds and this is not that.** That interval is
 * for text an owner is still typing. A colour is *seen* rather than read, the
 * artboard updates optimistically the moment it changes, and this only decides
 * how long the stored value lags the screen — so it is short enough that
 * releasing a slider and looking away saves, and long enough that a drag across
 * a gradient bar is one request rather than sixty.
 */
const QUIET_MS = 500

export function useGridPatch(bookId: string, pageCount: number) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState(pageCount)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // The server recomposes on every change, so the count from props is the truth
  // as soon as it lands; this holds the answer the route gave in the meantime.
  React.useEffect(() => setPages(pageCount), [pageCount])

  const patch = React.useCallback(
    async (next: GridPatch): Promise<boolean> => {
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
          return false
        }
        setPages(body.data.pages)
        router.refresh()
        return true
      } catch {
        setError('That layout could not be applied. Check your connection.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [bookId, router]
  )

  /**
   * The same write, once the owner stops moving.
   *
   * **For controls that emit continuously**, which is every colour control in
   * this product: `<input type="color">` fires while the native picker is being
   * dragged, `<input type="range">` fires per pixel, and the gradient bar fires
   * per pointermove. Wired straight to `patch`, a single drag across a gradient
   * was dozens of round trips, each one rebuilding the grid, writing Postgres
   * and re-running the whole flow engine through `router.refresh()`.
   *
   * The caller is expected to show the new value immediately from its own state
   * rather than waiting for this. That is the documented pattern for exactly
   * this case: "price edits and product add or remove apply immediately and
   * reconcile in the background".
   */
  const patchSoon = React.useCallback(
    (next: GridPatch, onSettled?: (ok: boolean) => void) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void patch(next).then((ok) => onSettled?.(ok))
      }, QUIET_MS)
    },
    [patch]
  )

  // A pending write on an unmounting editor is a request whose `router.refresh`
  // lands on a page that is gone.
  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  return { patch, patchSoon, busy, error, pages }
}
