'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@souqstudio/designer/components/ui/toast'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Waits for a manual background removal and says when it lands. E8-05.
 *
 * **The wait belongs to the book, not to the button.** `RemoveBackground` sits
 * inside the selected offer's flag list, so selecting another card unmounts it
 * — and an owner who queues a cutout and carries on pricing is the ordinary
 * case. Holding the poll there meant the refresh stopped the moment they moved
 * on, and the cutout they had paid for appeared only when they next opened the
 * book. This mounts once beside the artboard and outlives every selection.
 *
 * **It refreshes rather than polling a status route.** `POST .../cutout`
 * deliberately writes no `ai_jobs` row, because the artefact is an
 * `image_assets` row the page already reads — a status endpoint here would be a
 * second record of the same thing, answering "is the picture different yet",
 * which the picture answers. A refresh re-renders the server component, which
 * re-hydrates the store; when the cutout has landed the offer no longer carries
 * `fallback-image`, and that absence is the completion signal.
 *
 * **Nothing is rendered.** A toast is how this reports, and `<Toaster />` is
 * already mounted in the dashboard layout.
 */
export function CutoutWatch() {
  const router = useRouter()
  const pending = useEditorStore((state) => state.cutoutPending)
  const offers = useEditorStore((state) => state.offers)
  const endCutout = useEditorStore((state) => state.endCutout)

  /**
   * Which products still have a card saying their photo has its background.
   * Read from the offers rather than from the flag list of one card, because
   * two cards in a book can be built from the same catalog row.
   */
  const flagged = React.useMemo(() => {
    const ids = new Set<string>()
    for (const offer of Object.values(offers)) {
      if (offer.fallbackImageProductId !== null) ids.add(offer.fallbackImageProductId)
    }
    return ids
  }, [offers])

  React.useEffect(() => {
    if (pending.length === 0) return

    for (const entry of pending) {
      if (!flagged.has(entry.productId)) {
        /*
         * **Positive, and it names the card.** By the time this fires the owner
         * may be three cards further on, so a toast that says only "Background
         * removed" is a toast about nothing they can place.
         *
         * The shared case earns its second clause — their book is right now,
         * and other shops get it after a review they did not ask for and should
         * not be surprised by. It is the same sentence the dialog promised, in
         * the past tense.
         */
        toast({
          message: entry.shared
            ? `Background removed from ${entry.name}. Other shops get it once we have checked it.`
            : `Background removed from ${entry.name}.`,
          tone: 'positive',
        })
        endCutout(entry.productId)
      }
    }
  }, [pending, flagged, endCutout])

  React.useEffect(() => {
    if (pending.length === 0) return

    /*
     * Three seconds, where `LogoField` polls at two: this re-renders the
     * editor's server component rather than reading one status field, and a
     * cutout takes long enough that the extra second costs nothing.
     */
    const timer = setInterval(() => {
      router.refresh()

      /*
       * **A minute each, and then it admits it.** Rembg being unavailable is
       * the ordinary way a cutout never lands: the job completes having
       * recorded that removal did not happen, so there is nothing further to
       * wait for and nothing to undo. The removal is dropped from the set,
       * which puts the button back where the flag is — the owner can press it
       * again, and nothing was charged for the attempt that did not work.
       */
      const now = Date.now()
      for (const entry of pending) {
        if (now - entry.startedAt < 60_000) continue
        toast({
          message: `We have not heard back about the background on ${entry.name}. Nothing is charged unless it works.`,
          tone: 'caution',
        })
        endCutout(entry.productId)
      }
    }, 3000)

    return () => clearInterval(timer)
  }, [pending, router, endCutout])

  return null
}
