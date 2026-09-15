'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyStep } from '@/lib/editor-actions'
import { useEditorStore, type EditorStep } from '@/stores/editor-store'

/**
 * Undo and redo. E6-06.
 *
 * **Logical operations, not object diffs.** The epic said so when the editor was
 * expected to be a Fabric canvas, and the reason outlived Fabric: what an owner
 * wants back is *the price I just changed*, not a rectangle. A step carries the
 * patch that puts it back, and undoing re-issues it through the same route the
 * edit went out on — so the server ends up in the state the artboard is already
 * showing, rather than in a state only the client believes in.
 *
 * **The card is applied first and the request follows.** Same rule as every
 * other edit in this panel: an owner pressing Cmd+Z three times must not wait on
 * three round trips. A failure reverts that one step and says so.
 *
 * Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, plus the two buttons the epic asks for. The
 * shortcut is ignored while focus is in a text field, where the browser's own
 * undo is what the owner means.
 */
export function UndoRedo({ bookId }: { bookId: string }) {
  const past = useEditorStore((state) => state.past)
  const future = useEditorStore((state) => state.future)
  const takeUndo = useEditorStore((state) => state.takeUndo)
  const takeRedo = useEditorStore((state) => state.takeRedo)
  const setSave = useEditorStore((state) => state.setSave)
  const settle = useEditorStore((state) => state.settle)

  const router = useRouter()

  const apply = React.useCallback(
    async (step: EditorStep, direction: 'undo' | 'redo') => {
      setSave('saving')
      const ok = await applyStep(bookId, step, direction)
      setSave(ok ? 'saved' : 'error')
      settle(step.offerId, ok)
      // **A patch is the only step the client can draw the result of.**
      // Putting an offer back, or moving one, changes which cell every later
      // offer flows into, and that answer belongs to the engine on the server.
      // A price does not: the card has already redrawn from the store, which is
      // why this refresh is conditional rather than unconditional.
      if (ok && step.kind !== 'patch') router.refresh()
    },
    [bookId, router, setSave, settle]
  )

  const undo = React.useCallback(() => {
    const step = takeUndo()
    if (step !== null) void apply(step, 'undo')
  }, [apply, takeUndo])

  const redo = React.useCallback(() => {
    const step = takeRedo()
    if (step !== null) void apply(step, 'redo')
  }, [apply, takeRedo])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return

      // Inside a field the browser's own undo is what the keystroke means, and
      // taking it over would make a half-typed price impossible to correct.
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label={
          past.length === 0 ? 'Undo' : `Undo ${past[past.length - 1]?.label ?? 'the last change'}`
        }
        disabled={past.length === 0}
        onClick={undo}
      >
        <Undo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label={future.length === 0 ? 'Redo' : `Redo ${future[0]?.label ?? 'the last change'}`}
        disabled={future.length === 0}
        onClick={redo}
      >
        <Redo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  )
}
