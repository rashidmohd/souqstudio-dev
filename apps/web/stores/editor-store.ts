'use client'

import { create } from 'zustand'
import { clampOverride, isEmptyOverride } from '@souqstudio/engine'
import type { CellSpan } from '@souqstudio/engine'
import type { SlotOverride } from '@souqstudio/types'
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

/**
 * One step on the undo stack. E6-06.
 *
 * **Logical operations, not object diffs** — the epic is explicit, and the
 * reason survives the loss of Fabric: what an owner wants back is *the price I
 * just changed*, not a rectangle. Each step therefore carries the field, the
 * value it had and the value it has, and undoing is re-issuing the patch
 * backwards through the same route the edit went out on.
 *
 * `label` is what the header can name, so an owner is never asked to undo
 * something they cannot identify.
 */
export type EditorStep = {
  offerId: string
  label: string
  /** The API patch that puts it back. */
  undo: Record<string, unknown>
  /** The patch that re-applies it. */
  redo: Record<string, unknown>
  /** What the card draws, before and after — so the artboard moves with it. */
  before: Partial<ComposedOffer>
  after: Partial<ComposedOffer>
}

/** E6-06: "max 50 steps". */
const HISTORY_LIMIT = 50

type EditorState = {
  bookId: string
  offers: Record<string, ComposedOffer>
  /** Book order, so the panel can list offers the way the page flows them. */
  order: string[]
  selectedOfferId: string | null

  /**
   * The cell the selection started from, and the one it currently reaches, both
   * in body-card coordinates. Null is nothing selected.
   *
   * **Two spans rather than one**, because a selection is a gesture in progress
   * as often as it is a result: shift-clicking and dragging both grow the
   * selection *from its anchor*, so collapsing the two into the rectangle they
   * imply would lose the corner the next extension has to grow from.
   *
   * **Spans rather than cells**, because a merged region is one cell to the
   * owner and several to the grid. Anchoring on a merged hero and extending one
   * column has to cover the whole hero.
   *
   * **The rectangle they imply is derived where the merges are**, not here: it
   * has to expand to cover any merge it half-touches, and this store has no
   * business knowing the master's shape. `EditorShell` holds that.
   */
  cellAnchor: CellSpan | null
  cellFocus: CellSpan | null

  save: SaveState
  /** When the last successful save landed. E6-08 asks for "Saved [time]". */
  savedAt: number | null
  /** Offer ids whose last save failed, so the panel can mark them individually.
   *  A set rather than a single id: an owner editing eleven prices can have two
   *  fail, and reporting only the most recent hides the other. */
  failed: string[]

  past: EditorStep[]
  future: EditorStep[]

  /**
   * Bounded nudges, by page index. E6-04.
   *
   * Held here rather than read from the server payload per render, for the same
   * reason prices are: an owner tapping an arrow four times must see the card
   * move four times without waiting on four round trips.
   */
  overrides: Record<number, SlotOverride[]>
  /** Where each offer's card landed, so a nudge knows which page it is on. */
  placement: Record<string, { pageIndex: number; regionId: string }>

  hydrate: (input: {
    bookId: string
    offers: ComposedOffer[]
    overrides?: Record<number, SlotOverride[]>
    placement?: Record<string, { pageIndex: number; regionId: string }>
  }) => void
  select: (offerId: string | null) => void
  /**
   * Pick a cell, or extend the selection to it.
   *
   * `extend` on an empty selection anchors instead — a shift-click with nothing
   * selected has no corner to grow from, and refusing it would make the first
   * click of a drag do nothing.
   */
  selectCell: (cell: CellSpan, extend: boolean) => void
  clearCells: () => void
  /** Applies immediately. The caller persists and calls `settle`. */
  applyLocal: (offerId: string, patch: Partial<ComposedOffer>) => void
  /**
   * Which offers the fit ladder gave up on, from the page that drew them.
   *
   * Replaces the whole set rather than adding to it, because the answer changes
   * as the book changes: shortening a name or moving a card into a wider region
   * clears the flag, and a flag that only ever accumulates is one an owner
   * cannot act on.
   */
  markEscalated: (offerIds: readonly string[]) => void
  setSave: (state: SaveState) => void
  settle: (offerId: string, ok: boolean) => void

  /**
   * Nudge the selected card, or scale its image. Returns what to persist —
   * the page it is on and the merged, clamped delta — or null when the offer
   * has no placement yet.
   */
  nudge: (
    offerId: string,
    patch: { offsetX?: number; offsetY?: number; imageScale?: number }
  ) => { pageIndex: number; override: SlotOverride } | null
  /** "Reset to template", per card. Removes the entry rather than zeroing it. */
  resetOverride: (offerId: string) => { pageIndex: number; regionId: string } | null
  /** The delta on one card, for the panel's own controls. */
  overrideFor: (offerId: string) => SlotOverride | undefined

  /** Record a completed edit. Clears the redo branch, as every editor does. */
  push: (step: EditorStep) => void
  /** Take the next step to undo, applying its `before` locally. Null when empty. */
  takeUndo: () => EditorStep | null
  /** Take the next step to redo, applying its `after` locally. */
  takeRedo: () => EditorStep | null
}

export const useEditorStore = create<EditorState>((set, get) => ({
  bookId: '',
  offers: {},
  order: [],
  selectedOfferId: null,
  cellAnchor: null,
  cellFocus: null,
  save: 'idle',
  savedAt: null,
  failed: [],
  past: [],
  future: [],
  overrides: {},
  placement: {},

  hydrate: ({ bookId, offers, overrides, placement }) =>
    set((state) => {
      const next = Object.fromEntries(offers.map((offer) => [offer.id, offer]))
      // **Selection survives a reload of the same book.** Adding, removing or
      // reordering re-renders the server component and re-hydrates this store;
      // clearing the selection each time would close the properties panel under
      // an owner who had just moved the card they were pricing. It clears only
      // when the selected offer is gone — removed, or a different book.
      const keep =
        state.bookId === bookId &&
        state.selectedOfferId !== null &&
        next[state.selectedOfferId] !== undefined

      return {
        bookId,
        offers: next,
        order: offers.map((offer) => offer.id),
        selectedOfferId: keep ? state.selectedOfferId : null,
        // **Cleared on a different book, kept on a re-render of the same one.**
        // The editor re-hydrates whenever the server component re-renders — after
        // a price edit, after a reorder — and dropping the selection there would
        // take the owner's cells away mid-gesture. A merge that changes the track
        // count is the one case that must clear it, and `EditorShell` does that
        // where it can see the counts.
        ...(state.bookId === bookId ? {} : { cellAnchor: null, cellFocus: null }),
        save: 'idle',
        savedAt: state.bookId === bookId ? state.savedAt : null,
        failed: state.bookId === bookId ? state.failed.filter((id) => next[id]) : [],
        // **The stack is cleared on navigation, not on a re-render.** E6-06 says
        // cleared on page navigation, and the editor re-hydrates whenever the
        // server component re-renders — after adding an offer, after a reorder.
        // Dropping the history there would take away the undo for the price the
        // owner typed thirty seconds ago.
        past: state.bookId === bookId ? state.past.filter((step) => next[step.offerId]) : [],
        future: state.bookId === bookId ? state.future.filter((step) => next[step.offerId]) : [],
        // The server's copy wins on every hydrate. A nudge is saved as it is
        // made, so anything local that the server does not have is a save that
        // failed — and a delta the database has never heard of is one that will
        // not be in the PDF either.
        overrides: overrides ?? (state.bookId === bookId ? state.overrides : {}),
        placement: placement ?? (state.bookId === bookId ? state.placement : {}),
      }
    }),

  select: (offerId) => set({ selectedOfferId: offerId }),

  selectCell: (cell, extend) =>
    set((state) =>
      extend && state.cellAnchor !== null
        ? { cellFocus: cell }
        : { cellAnchor: cell, cellFocus: cell }
    ),

  clearCells: () => set({ cellAnchor: null, cellFocus: null }),

  applyLocal: (offerId, patch) =>
    set((state) => {
      const offer = state.offers[offerId]
      if (offer === undefined) return state
      return { offers: { ...state.offers, [offerId]: { ...offer, ...patch } } }
    }),

  markEscalated: (offerIds) =>
    set((state) => {
      const escalated = new Set(offerIds)
      let changed = false

      const offers = Object.fromEntries(
        Object.entries(state.offers).map(([id, offer]) => {
          const has = offer.flags.includes('fit-escalated')
          const should = escalated.has(id)
          if (has === should) return [id, offer]
          changed = true
          return [
            id,
            {
              ...offer,
              flags: should
                ? [...offer.flags, 'fit-escalated' as const]
                : offer.flags.filter((flag) => flag !== 'fit-escalated'),
            },
          ]
        })
      )

      // A new object every render would re-render the tray and the panel on
      // every page paint, which is the one thing the store exists to avoid.
      return changed ? { offers } : state
    }),

  setSave: (save) =>
    set(save === 'saved' ? { save, savedAt: Date.now() } : { save }),

  overrideFor: (offerId) => {
    const state = get()
    const where = state.placement[offerId]
    if (where === undefined) return undefined
    return state.overrides[where.pageIndex]?.find(
      (entry) => entry.regionId === where.regionId && entry.offerId === offerId
    )
  },

  nudge: (offerId, patch) => {
    const state = get()
    const where = state.placement[offerId]
    if (where === undefined) return null

    const page = state.overrides[where.pageIndex] ?? []
    const current = page.find(
      (entry) => entry.regionId === where.regionId && entry.offerId === offerId
    )

    // Merged and clamped here as well as on the server: the card has to move by
    // the amount that will be saved, or the artboard shows a nudge the PDF will
    // not have.
    const override = clampOverride({
      regionId: where.regionId,
      offerId,
      ...current,
      ...patch,
    })

    const others = page.filter(
      (entry) => !(entry.regionId === where.regionId && entry.offerId === offerId)
    )

    set({
      overrides: {
        ...state.overrides,
        [where.pageIndex]: isEmptyOverride(override) ? others : [...others, override],
      },
    })

    return { pageIndex: where.pageIndex, override }
  },

  resetOverride: (offerId) => {
    const state = get()
    const where = state.placement[offerId]
    if (where === undefined) return null

    const page = state.overrides[where.pageIndex] ?? []
    set({
      overrides: {
        ...state.overrides,
        [where.pageIndex]: page.filter(
          (entry) => !(entry.regionId === where.regionId && entry.offerId === offerId)
        ),
      },
    })

    return where
  },

  push: (step) =>
    set((state) => ({
      past: [...state.past, step].slice(-HISTORY_LIMIT),
      // A new edit after undoing abandons the redo branch. Keeping it would let
      // an owner redo their way into a book that never existed.
      future: [],
    })),

  takeUndo: () => {
    const state = get()
    const step = state.past[state.past.length - 1]
    if (step === undefined) return null

    const offer = state.offers[step.offerId]
    set({
      past: state.past.slice(0, -1),
      future: [step, ...state.future].slice(0, HISTORY_LIMIT),
      // Selecting the card being undone is most of what makes undo legible:
      // the owner sees *which* card changed back rather than hunting the page.
      selectedOfferId: step.offerId,
      ...(offer === undefined
        ? {}
        : { offers: { ...state.offers, [step.offerId]: { ...offer, ...step.before } } }),
    })
    return step
  },

  takeRedo: () => {
    const state = get()
    const [step, ...rest] = state.future
    if (step === undefined) return null

    const offer = state.offers[step.offerId]
    set({
      past: [...state.past, step].slice(-HISTORY_LIMIT),
      future: rest,
      selectedOfferId: step.offerId,
      ...(offer === undefined
        ? {}
        : { offers: { ...state.offers, [step.offerId]: { ...offer, ...step.after } } }),
    })
    return step
  },

  settle: (offerId, succeeded) =>
    set((state) => ({
      failed: succeeded
        ? state.failed.filter((id) => id !== offerId)
        : state.failed.includes(offerId)
          ? state.failed
          : [...state.failed, offerId],
    })),
}))
