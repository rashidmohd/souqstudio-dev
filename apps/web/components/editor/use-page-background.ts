'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { PageBackground } from '@souqstudio/types'

/**
 * Writing the paper behind one page.
 *
 * **Debounced, unlike `usePageMerges`.** A merge is one deliberate press; a
 * colour is dragged. The native picker fires while it is open, a range input
 * fires per pixel and the gradient bar fires per pointermove — wired straight to
 * a write, one drag across a gradient was dozens of round trips, each rebuilding
 * and re-flowing the book. Same reasoning and the same interval as
 * `useGridPatch.patchSoon`, which does this for the book's own background.
 *
 * The caller paints the new value immediately from its own draft rather than
 * waiting for this; this only decides how far behind the screen the stored value
 * runs.
 */
const QUIET_MS = 500

export interface PageBackgroundWrite {
  /** `null` is the deliberate none — plain paper on this page alone. */
  background?: PageBackground | null
  /** Clears the override, so the page goes back to the book's background. */
  inherit?: true
}

export function usePageBackground(bookId: string) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback(
    async (pageIndex: number, body: PageBackgroundWrite): Promise<boolean> => {
      setError(null)
      try {
        const res = await fetch(
          `/api/v1/offer-books/${bookId}/pages/${pageIndex}/background`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        )
        const parsed = (await res.json()) as {
          data: unknown | null
          error: { message: string } | null
        }
        if (parsed.data === null) {
          setError(parsed.error?.message ?? 'That background could not be applied.')
          return false
        }
        router.refresh()
        return true
      } catch {
        setError('That background could not be applied. Check your connection.')
        return false
      }
    },
    [bookId, router]
  )

  const writeSoon = React.useCallback(
    (pageIndex: number, body: PageBackgroundWrite, onSettled?: (ok: boolean) => void) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void write(pageIndex, body).then((ok) => onSettled?.(ok))
      }, QUIET_MS)
    },
    [write]
  )

  // A pending write on an unmounting editor is a request whose `router.refresh`
  // lands on a page that is gone.
  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  return { write, writeSoon, error }
}
