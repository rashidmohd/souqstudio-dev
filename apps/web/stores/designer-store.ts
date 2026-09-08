'use client'

import { create } from 'zustand'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { replaceElement } from '@souqstudio/engine'

/**
 * The block designer's logical state. E7.
 *
 * Zustand for the same reason the editor uses it: the canvas updates on every
 * pointer move of a drag, and Context re-renders every consumer under the
 * provider on every change. `apps/web/CLAUDE.md`.
 *
 * **Undo is a stack of documents, not a log of inverse operations.** A block is
 * a few kilobytes of plain data, so keeping the whole thing per step costs
 * nothing and removes the entire class of bug where an inverse is wrong — a
 * resize that clamped, a delete that also cleared the selection. `block-edit.ts`
 * in the engine returns new arrays for exactly this.
 *
 * **A drag is one undo step, not sixty.** `commit: false` mutates without
 * pushing history, which is what a pointer-move stream does; the pointer-up
 * pushes the state the drag *started* from. Without that, undo after dragging a
 * card across the block walks back pixel by pixel.
 */

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** Deep enough for a working session, shallow enough not to hold a book open. */
const HISTORY_LIMIT = 50

type DesignerState = {
  blockId: string
  name: string
  repeats: boolean
  status: string
  /** Seeded blocks are read-only; the designer opens them as a preview. */
  editable: boolean

  arrangements: Arrangement[]
  arrangementIndex: number
  /** Index into the current arrangement's elements. Array order is paint order. */
  selected: number | null

  /**
   * The direction the *artboard* draws in, never the interface's. An owner
   * working in an Arabic UI who is designing an English card must see an
   * English card — the design system is explicit, and it is why this is a
   * segmented control in the chrome rather than inherited from `dir`.
   */
  direction: 'ltr' | 'rtl'

  past: Arrangement[][]
  future: Arrangement[][]
  save: SaveState

  hydrate: (input: {
    blockId: string
    name: string
    repeats: boolean
    status: string
    editable: boolean
    arrangements: Arrangement[]
  }) => void

  select: (index: number | null) => void
  selectArrangement: (index: number) => void
  setDirection: (direction: 'ltr' | 'rtl') => void
  setName: (name: string) => void
  setSave: (save: SaveState) => void

  /** Replace the current arrangement's elements. `commit` pushes an undo step. */
  setElements: (elements: BlockElement[], commit?: boolean) => void
  /** Replace one element, by index, in the current arrangement. */
  setElement: (index: number, element: BlockElement, commit?: boolean) => void
  /** Push the current document onto the undo stack without changing it. */
  checkpoint: () => void

  undo: () => void
  redo: () => void
}

const elementsOf = (state: DesignerState): BlockElement[] =>
  state.arrangements[state.arrangementIndex]?.elements ?? []

const withElements = (
  arrangements: Arrangement[],
  index: number,
  elements: BlockElement[]
): Arrangement[] =>
  arrangements.map((arrangement, i) => (i === index ? { ...arrangement, elements } : arrangement))

const pushed = (past: Arrangement[][], document: Arrangement[]) =>
  [...past, document].slice(-HISTORY_LIMIT)

export const useDesignerStore = create<DesignerState>((set, get) => ({
  blockId: '',
  name: '',
  repeats: true,
  status: 'draft',
  editable: false,
  arrangements: [],
  arrangementIndex: 0,
  selected: null,
  direction: 'ltr',
  past: [],
  future: [],
  save: 'idle',

  hydrate: ({ blockId, name, repeats, status, editable, arrangements }) =>
    set((state) => {
      // Re-hydrating the block already open keeps the arrangement and the
      // selection: the server component re-renders on a rename, and dropping the
      // owner back to arrangement one mid-edit would be the screen throwing away
      // their place for no reason they can see.
      const same = state.blockId === blockId
      return {
        blockId,
        name,
        repeats,
        status,
        editable,
        arrangements,
        arrangementIndex: same ? Math.min(state.arrangementIndex, arrangements.length - 1) : 0,
        selected: null,
        past: same ? state.past : [],
        future: same ? state.future : [],
        save: 'idle',
      }
    }),

  select: (selected) => set({ selected }),

  selectArrangement: (arrangementIndex) =>
    set((state) => ({
      arrangementIndex: Math.max(0, Math.min(arrangementIndex, state.arrangements.length - 1)),
      // A selection is an index into *this* arrangement's elements, so it
      // cannot survive the switch — index 4 in the tall layout is a different
      // element in the wide one.
      selected: null,
    })),

  setDirection: (direction) => set({ direction }),
  setName: (name) => set({ name, save: 'dirty' }),
  setSave: (save) => set({ save }),

  setElements: (elements, commit = true) =>
    set((state) => {
      if (!state.editable) return state
      return {
        arrangements: withElements(state.arrangements, state.arrangementIndex, elements),
        past: commit ? pushed(state.past, state.arrangements) : state.past,
        future: commit ? [] : state.future,
        save: 'dirty',
      }
    }),

  setElement: (index, element, commit = true) => {
    const state = get()
    state.setElements(replaceElement(elementsOf(state), index, element), commit)
  },

  checkpoint: () =>
    set((state) => ({ past: pushed(state.past, state.arrangements), future: [] })),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (previous === undefined) return state
      return {
        arrangements: previous,
        past: state.past.slice(0, -1),
        future: [state.arrangements, ...state.future].slice(0, HISTORY_LIMIT),
        // The element that was selected may not exist in the restored document.
        selected: null,
        save: 'dirty',
      }
    }),

  redo: () =>
    set((state) => {
      const [next, ...rest] = state.future
      if (next === undefined) return state
      return {
        arrangements: next,
        past: pushed(state.past, state.arrangements),
        future: rest,
        selected: null,
        save: 'dirty',
      }
    }),
}))

/** The elements of the arrangement currently open. */
export function useElements(): BlockElement[] {
  return useDesignerStore((state) => state.arrangements[state.arrangementIndex]?.elements ?? [])
}

export function useSelectedElement(): BlockElement | null {
  return useDesignerStore((state) => {
    if (state.selected === null) return null
    return state.arrangements[state.arrangementIndex]?.elements[state.selected] ?? null
  })
}
