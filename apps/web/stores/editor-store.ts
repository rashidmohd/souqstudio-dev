'use client'

import { create } from 'zustand'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * The offer book editor's logical state. E6-01.
 *
 * **Zustand, not Context, and not React state on the artboard.** The rule in
 * `apps/web/CLAUDE.md` is that Zustand holds the logical state and the canvas
 * holds the visual one; Context re-renders every consumer under the provider on
 * every change, which is wrong for a surface that updates per keystroke on a
 * price field.
 *
 * **This store is the artboard's source of truth, not the server's.** A price
 * edit lands here immediately and the card redraws with no network in the loop —
 * the design system asks for exactly that: *"An owner changing eleven prices
 * must never wait on a round trip per field."* The save follows, and a failure
 * reverts **that one field** and names it rather than discarding the batch.
 * `failed` is what carries the naming.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type EditorState = {
  bookId: string
  offers: Record<string, ComposedOffer>
  /** Book order, so the panel can list offers the way the page flows them. */
  order: string[]
  selectedOfferId: string | null

  save: SaveState
  /** Offer ids whose last save failed, so the panel can mark them individually.
   *  A set rather than a single id: an owner editing eleven prices can have two
   *  fail, and reporting only the most recent hides the other. */
  failed: string[]

  hydrate: (input: { bookId: string; offers: ComposedOffer[] }) => void
  select: (offerId: string | null) => void
  /** Applies immediately. The caller persists and calls `settle`. */
  applyLocal: (offerId: string, patch: Partial<ComposedOffer>) => void
  setSave: (state: SaveState) => void
  settle: (offerId: string, ok: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  bookId: '',
  offers: {},
  order: [],
  selectedOfferId: null,
  save: 'idle',
  failed: [],

  hydrate: ({ bookId, offers }) =>
    set({
      bookId,
      offers: Object.fromEntries(offers.map((offer) => [offer.id, offer])),
      order: offers.map((offer) => offer.id),
      selectedOfferId: null,
      save: 'idle',
      failed: [],
    }),

  select: (offerId) => set({ selectedOfferId: offerId }),

  applyLocal: (offerId, patch) =>
    set((state) => {
      const offer = state.offers[offerId]
      if (offer === undefined) return state
      return { offers: { ...state.offers, [offerId]: { ...offer, ...patch } } }
    }),

  setSave: (save) => set({ save }),

  settle: (offerId, succeeded) =>
    set((state) => ({
      failed: succeeded
        ? state.failed.filter((id) => id !== offerId)
        : state.failed.includes(offerId)
          ? state.failed
          : [...state.failed, offerId],
    })),
}))
