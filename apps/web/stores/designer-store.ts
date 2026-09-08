'use client'

import { create } from 'zustand'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { newElementId, reidentify } from '@/lib/block-elements'

/**
 * The block designer's logical state. E7.
 *
 * Zustand for the same reason the editor uses it: the canvas updates on every
 * pointer move of a drag, and Context re-renders every consumer under the
 * provider on every change. `apps/web/CLAUDE.md`.
 *
 * **This store is the artboard's source of truth, not the server's.** Every edit
 * lands here immediately and the canvas redraws with no network in the loop; the
 * save follows, debounced.
 *
 * **Undo is a stack of documents, not a log of inverse operations.** A block is
 * a few kilobytes of plain data, so keeping the whole thing per step costs
 * nothing and removes the entire class of bug where an inverse is wrong — a
 * resize that clamped, a delete that also cleared the selection.
 *
 * **A drag is one undo step, not sixty.** `commit: false` mutates without
 * pushing history, which is what a pointer-move stream does; the pointer-down
 * pushes the state the drag *started* from.
 *
 * **Selection is by id, and it is a set.** It was a single index until the
 * designer could select more than one thing at a time, at which point an index
 * stops identifying anything — two elements swap places and the selection points
 * at the wrong one.
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
  /** Element ids, in selection order. Empty means the block itself. */
  selectedIds: string[]
  /** Cut from the document, waiting to be pasted. Survives switching layouts. */
  clipboard: BlockElement[]
  /** 1 is fit-to-pane. The canvas scales around its own centre. */
  zoom: number

  /**
   * The direction the *artboard* draws in, never the interface's. An owner
   * working in an Arabic UI who is designing an English card must see an
   * English card.
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

  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  selectArrangement: (index: number) => void
  setDirection: (direction: 'ltr' | 'rtl') => void
  setName: (name: string) => void
  setSave: (save: SaveState) => void
  setZoom: (zoom: number) => void

  /** Replace the current arrangement's elements. `commit` pushes an undo step. */
  setElements: (elements: BlockElement[], commit?: boolean) => void
  /** Replace one element, by id, in the current arrangement. */
  setElement: (id: string, element: BlockElement, commit?: boolean) => void
  /** Push the current document onto the undo stack without changing it. */
  checkpoint: () => void

  /** Everything the selection touches, in paint order. */
  selection: () => BlockElement[]
  removeSelected: () => void
  duplicateSelected: () => void
  copySelected: () => void
  paste: () => void
  groupSelected: () => void
  ungroupSelected: () => void

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
  selectedIds: [],
  clipboard: [],
  zoom: 1,
  direction: 'ltr',
  past: [],
  future: [],
  save: 'idle',

  hydrate: ({ blockId, name, repeats, status, editable, arrangements }) =>
    set((state) => {
      // Re-hydrating the block already open keeps the arrangement: the server
      // component re-renders on a rename, and dropping the owner back to
      // arrangement one mid-edit would throw away their place for no reason
      // they can see.
      const same = state.blockId === blockId
      return {
        blockId,
        name,
        repeats,
        status,
        editable,
        arrangements,
        arrangementIndex: same ? Math.min(state.arrangementIndex, arrangements.length - 1) : 0,
        selectedIds: [],
        past: same ? state.past : [],
        future: same ? state.future : [],
        save: 'idle',
      }
    }),

  select: (selectedIds) => set({ selectedIds }),

  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((entry) => entry !== id)
        : [...state.selectedIds, id],
    })),

  selectArrangement: (arrangementIndex) =>
    set((state) => ({
      arrangementIndex: Math.max(0, Math.min(arrangementIndex, state.arrangements.length - 1)),
      // A selection is a set of ids in *this* arrangement, and the same design
      // in another shape is a different element list.
      selectedIds: [],
    })),

  setDirection: (direction) => set({ direction }),
  setName: (name) => set({ name, save: 'dirty' }),
  setSave: (save) => set({ save }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),

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

  setElement: (id, element, commit = true) => {
    const state = get()
    state.setElements(
      elementsOf(state).map((entry) => (entry.id === id ? element : entry)),
      commit
    )
  },

  checkpoint: () =>
    set((state) => ({ past: pushed(state.past, state.arrangements), future: [] })),

  selection: () => {
    const state = get()
    return elementsOf(state).filter((element) => state.selectedIds.includes(element.id))
  },

  removeSelected: () => {
    const state = get()
    if (state.selectedIds.length === 0) return
    state.setElements(
      elementsOf(state).filter((element) => !state.selectedIds.includes(element.id))
    )
    set({ selectedIds: [] })
  },

  copySelected: () => {
    const state = get()
    const picked = state.selection()
    if (picked.length > 0) set({ clipboard: picked })
  },

  /**
   * Paste, offset so the copy is visible rather than exactly under the original.
   *
   * Group membership is preserved *within* the paste — four elements pasted as a
   * group stay a group — while getting a new group id, so pasting into the same
   * block does not silently merge the copy into the original.
   */
  paste: () => {
    const state = get()
    if (state.clipboard.length === 0 || !state.editable) return

    const groups = new Map<string, string>()
    const pasted = state.clipboard.map((element) => {
      const existing = element.groupId
      if (existing === undefined) return offset(reidentify(element))
      if (!groups.has(existing)) groups.set(existing, newElementId())
      return offset(reidentify(element, groups.get(existing)))
    })

    state.setElements([...elementsOf(state), ...pasted])
    set({ selectedIds: pasted.map((element) => element.id) })
  },

  duplicateSelected: () => {
    const state = get()
    state.copySelected()
    get().paste()
  },

  /**
   * Grouping is a shared id, not a tree.
   *
   * A group in an offer card means "these move together", never a nested
   * coordinate space — and a tree would make every rectangle depend on its
   * ancestors' transforms for no expressive gain, in a renderer that has to
   * agree with a PDF worker.
   */
  groupSelected: () => {
    const state = get()
    if (state.selectedIds.length < 2) return
    const groupId = newElementId()
    state.setElements(
      elementsOf(state).map((element) =>
        state.selectedIds.includes(element.id) ? { ...element, groupId } : element
      )
    )
  },

  ungroupSelected: () => {
    const state = get()
    if (state.selectedIds.length === 0) return
    state.setElements(
      elementsOf(state).map((element) => {
        if (!state.selectedIds.includes(element.id)) return element
        const { groupId: _dropped, ...rest } = element
        return rest as BlockElement
      })
    )
  },

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (previous === undefined) return state
      return {
        arrangements: previous,
        past: state.past.slice(0, -1),
        future: [state.arrangements, ...state.future].slice(0, HISTORY_LIMIT),
        // The elements that were selected may not exist in the restored
        // document, and a selection pointing at nothing is worse than none.
        selectedIds: [],
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
        selectedIds: [],
        save: 'dirty',
      }
    }),
}))

/** Far enough to see, near enough to still be the thing you copied. */
const offset = (element: BlockElement): BlockElement => ({
  ...element,
  box: {
    ...element.box,
    start: Math.min(1 - element.box.width, element.box.start + 0.02),
    top: Math.min(1 - element.box.height, element.box.top + 0.02),
  },
})

/** The elements of the arrangement currently open. */
export function useElements(): BlockElement[] {
  return useDesignerStore((state) => state.arrangements[state.arrangementIndex]?.elements ?? [])
}

/** The one selected element, or null when none or several are. */
export function useSelectedElement(): BlockElement | null {
  return useDesignerStore((state) => {
    if (state.selectedIds.length !== 1) return null
    const [id] = state.selectedIds
    return state.arrangements[state.arrangementIndex]?.elements.find((e) => e.id === id) ?? null
  })
}
