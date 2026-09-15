'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { removeOffer } from '@/lib/editor-actions'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Delete and Backspace remove the selected card.
 *
 * **The accelerator people reach for before they reach for a menu**, and the
 * only reason it was not built with the panel's Remove button is that removal
 * was not reversible until 13 September. A keystroke that destroys work an
 * owner cannot get back is a different proposition from one they can undo; the
 * snapshot and `POST .../restore` are what make this safe, and the toast is what
 * tells them so.
 *
 * **It acts on the selection, not on what has focus.** Clicking a cell selects
 * its offer and moves focus to that cell's hit target, but clicking the card in
 * the tray selects the same offer and leaves focus in the tray — and an owner
 * who has just pointed at a card means that card either way. The properties
 * panel is showing it, which is the visible answer to "what will this delete".
 *
 * Three things it stands off:
 *
 * - **Text fields**, where Backspace is how you correct a price. Same guard as
 *   `UndoRedo`, and for the same reason.
 * - **A modifier**, so Cmd+Backspace and friends keep whatever the platform
 *   means by them.
 * - **An open dialog.** `Dialog` is the native `<dialog>`, which contains focus
 *   but does not stop a window-level listener — so a Backspace typed into the
 *   block picker would quietly delete the card behind it.
 */
export function useRemoveKey({ bookId }: { bookId: string }) {
  const router = useRouter()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (document.querySelector('dialog[open]') !== null) return

      const state = useEditorStore.getState()
      const offerId = state.selectedOfferId
      if (offerId === null) return
      const offer = state.offers[offerId]
      if (offer === undefined) return

      event.preventDefault()
      // Cleared before the request, as the panel's own button does: what the
      // panel is describing is about to leave the book, and undo re-selects the
      // card it puts back.
      state.select(null)
      void removeOffer({
        bookId,
        offerId,
        name: offer.name,
        refresh: () => router.refresh(),
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bookId, router])
}
