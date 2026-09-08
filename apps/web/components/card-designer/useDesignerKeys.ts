'use client'

import * as React from 'react'
import { SNAP, moveBox } from '@souqstudio/engine'
import { useDesignerStore } from '@/stores/designer-store'

/**
 * The keyboard, in a design tool. E7.
 *
 * Every shortcut here is one an owner already has in their fingers from
 * somewhere else, which is the whole argument for having them: arrows nudge,
 * shift-arrows nudge further, delete deletes, and the clipboard verbs are the
 * clipboard verbs.
 *
 * **Ignored while focus is in a field.** The properties panel is full of text
 * boxes, and an owner typing a headline that contains the letter "g" must not
 * find their elements grouped. This is the same rule the editor's undo follows,
 * and it is the one thing that makes a global key handler safe at all.
 *
 * **A nudge is its own undo step, but a held arrow is not sixty of them.** The
 * checkpoint is taken on the first key of a run and not again until the keys
 * stop, for the same reason a drag pushes one step rather than one per pointer
 * move.
 */
export function useDesignerKeys(editable: boolean) {
  const store = useDesignerStore
  const nudging = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!editable) return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      const state = store.getState()
      const selected = state.selectedIds
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'c') {
        state.copySelected()
        return
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        state.paste()
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        state.duplicateSelected()
        return
      }
      if (meta && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (event.shiftKey) state.ungroupSelected()
        else state.groupSelected()
        return
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        state.select(
          (state.arrangements[state.arrangementIndex]?.elements ?? []).map((e) => e.id)
        )
        return
      }

      if (event.key === 'Escape') {
        state.select([])
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
        event.preventDefault()
        state.removeSelected()
        return
      }

      const step = arrowStep(event.key)
      if (step === null || selected.length === 0) return

      event.preventDefault()

      // One undo step per run of arrow presses. The timer restarts on every
      // key, so a held arrow is one step and a pause of a quarter second starts
      // a new one — which is about where an owner stops thinking of it as the
      // same adjustment.
      if (nudging.current === null) state.checkpoint()
      if (nudging.current !== null) window.clearTimeout(nudging.current)
      nudging.current = window.setTimeout(() => {
        nudging.current = null
      }, 250)

      // Shift moves by four steps rather than by a pixel count: everything in
      // this designer is a fraction of the block, so "further" has to be a
      // multiple of the same lattice or the two disagree at different sizes.
      const distance = event.shiftKey ? SNAP * 4 : SNAP
      const elements = state.arrangements[state.arrangementIndex]?.elements ?? []

      state.setElements(
        elements.map((element) =>
          selected.includes(element.id)
            ? {
                ...element,
                box: moveBox(element.box, step.x * distance, step.y * distance, SNAP),
              }
            : element
        ),
        false
      )
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editable, store])
}

/**
 * Which way an arrow moves a box.
 *
 * **Not mirrored for Arabic.** The left arrow moves an element left on the
 * screen, whichever direction the artboard reads in — a key that moved things
 * the other way in an Arabic layout would be the interface arguing with the
 * owner's hand. The *stored* value is logical, and the artboard's own mirroring
 * is what reconciles the two.
 */
function arrowStep(key: string): { x: number; y: number } | null {
  if (key === 'ArrowLeft') return { x: -1, y: 0 }
  if (key === 'ArrowRight') return { x: 1, y: 0 }
  if (key === 'ArrowUp') return { x: 0, y: -1 }
  if (key === 'ArrowDown') return { x: 0, y: 1 }
  return null
}
