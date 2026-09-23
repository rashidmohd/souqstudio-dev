import { toast } from '@souqstudio/designer/components/ui/toast'
import { useEditorStore, type EditorStep } from '@/stores/editor-store'
import { offerSnapshotSchema } from '@/lib/offer-snapshot'

/**
 * The editor's book-level mutations: removing an offer, moving one, and
 * re-issuing a step through the API. E6-02 and E6-06.
 *
 * **Here rather than in `UndoRedo.tsx` because there are now three callers.**
 * The two buttons and the keyboard shortcut were one; a toast's Undo action is
 * the second, and the removal that raises the toast is the third. Leaving the
 * fetch inside the component would have meant a second copy of "what does
 * undoing a removal send", which is exactly the drift the undo stack cannot
 * afford — a patch that reverses nothing looks like a save that worked.
 */

/**
 * Re-issue one step through the API, in the given direction.
 *
 * Returns whether the server took it. Never throws: a dead connection and a 500
 * are the same answer to the caller, which is *the book did not change, tell the
 * owner*.
 */
export async function applyStep(
  bookId: string,
  step: EditorStep,
  direction: 'undo' | 'redo'
): Promise<boolean> {
  try {
    if (step.kind === 'patch') {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${step.offerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(direction === 'undo' ? step.undo : step.redo),
      })
      return res.ok
    }

    if (step.kind === 'reorder') {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offerIds: direction === 'undo' ? step.fromOrder : step.toOrder,
        }),
      })
      return res.ok
    }

    // Undoing a removal puts the offer back under its own id; redoing one takes
    // it out again. The snapshot does not change between the two, so a step can
    // be walked back and forth without ever going stale.
    if (direction === 'undo') {
      const res = await fetch(
        `/api/v1/offer-books/${bookId}/offers/${step.offerId}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(step.snapshot),
        }
      )
      return res.ok
    }

    const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${step.offerId}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Remove an offer from the book, reversibly.
 *
 * **One function, because removal happens in two places and must not be two
 * behaviours.** The tray has had an X since E6-02 and the properties panel now
 * has one too; an owner who removes a card from the artboard's panel and an
 * owner who removes it from the list are doing the same thing and must get the
 * same offer to undo it.
 *
 * **The toast is the confirmation.** The design skill → Destructive actions
 * names this exact case: *"A toast with an Undo action beats a confirmation
 * dialog for anything reversible — archiving a book, removing a product,
 * clearing a cell."* So there is no dialog in front of this, deliberately. What
 * makes that safe is that the undo is real: the step goes on the stack as well,
 * so Cmd+Z still reaches it after the toast has gone.
 *
 * **The snapshot is validated on the way in, not only on the way back out.** If
 * this response ever stops carrying one — an older deployment behind a load
 * balancer, a route that changed shape — the honest outcome is a removal with
 * no undo *that says so*, rather than an Undo button that fails at the moment
 * an owner is relying on it.
 */
export async function removeOffer({
  bookId,
  offerId,
  name,
  refresh,
}: {
  bookId: string
  offerId: string
  /** The offer's name, for the message and for the step's label. */
  name: string
  /** Re-read the server component; the book's flow has changed. */
  refresh: () => void
}): Promise<boolean> {
  let body: unknown = null
  try {
    const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offerId}`, {
      method: 'DELETE',
    })
    body = await res.json().catch(() => null)
    if (!res.ok) {
      toast({
        tone: 'critical',
        message:
          (body as { error?: { message?: string } } | null)?.error?.message ??
          'That did not save. Try again.',
      })
      return false
    }
  } catch {
    toast({ tone: 'critical', message: 'That did not save. Check your connection.' })
    return false
  }

  refresh()

  const snapshot = offerSnapshotSchema.safeParse(
    (body as { data?: { snapshot?: unknown } } | null)?.data?.snapshot
  )
  if (!snapshot.success) {
    toast({ tone: 'caution', message: `${name} was removed. This one cannot be undone.` })
    return true
  }

  const step: EditorStep = {
    kind: 'remove',
    offerId,
    label: name,
    snapshot: snapshot.data,
  }
  useEditorStore.getState().push(step)

  toast({
    message: `${name} removed.`,
    action: {
      label: 'Undo',
      onClick: () => {
        // **The step is claimed off the stack before the request goes**, and
        // that order is deliberate: Cmd+Z reaches the same step, and claiming
        // it first is what stops a keystroke and this button both issuing a
        // restore — the second of which would come back 409 and report a
        // failure to an owner whose offer is sitting right there.
        //
        // Named rather than "the last step", because by the time an owner
        // reaches for this they may have priced two other cards and `takeUndo`
        // would reverse one of those instead.
        if (!useEditorStore.getState().undoStep(step)) return
        void applyStep(bookId, step, 'undo').then((ok) => {
          if (ok) {
            refresh()
            return
          }
          // Back on the stack, so Cmd+Z is still a way out. The toast that
          // offered this has gone by now, and it is the only thing that had.
          useEditorStore.getState().requeue(step)
          toast({ tone: 'critical', message: `${name} could not be put back. Try undo again.` })
        })
      },
    },
  })

  return true
}


/**
 * Move an offer one place earlier or later in the book.
 *
 * **The whole order goes, not a move.** Two tabs sending `{from, to}` against
 * different starting states interleave into an order neither owner chose, and
 * the route refuses a partial list for the same reason. This is the tray's rule
 * from E6-02, lifted here unchanged so the panel's arrows cannot acquire a
 * second one.
 *
 * **Not optimistic, but it is on the undo stack.** Unlike a price, a move
 * changes what every *other* offer's position means, so a failed optimistic
 * reorder leaves the tray and the artboard describing different books — the
 * request goes first and the server re-renders. The step is recorded only after
 * the server has taken it, which is the difference between a stack that
 * describes the book and one that describes what the client attempted.
 */
export async function moveOffer({
  bookId,
  offerId,
  by,
  refresh,
}: {
  bookId: string
  offerId: string
  by: -1 | 1
  refresh: () => void
}): Promise<boolean> {
  const from = useEditorStore.getState().order.indexOf(offerId)
  if (from === -1) return false
  return reorderOffer({ bookId, offerId, toIndex: from + by, refresh })
}

/**
 * Move an offer to a given place in the book.
 *
 * **The whole order goes, not a move.** Two tabs sending `{from, to}` against
 * different starting states interleave into an order neither owner chose, and
 * the route refuses a partial list for the same reason. This is the tray's rule
 * from E6-02, lifted here unchanged so the panel's arrows, the tray's arrows
 * and the tray's drag cannot acquire three of them.
 *
 * **Not optimistic, but it is on the undo stack.** Unlike a price, a move
 * changes what every *other* offer's position means, so a failed optimistic
 * reorder leaves the tray and the artboard describing different books — the
 * request goes first and the server re-renders. The step is recorded only after
 * the server has taken it, which is the difference between a stack that
 * describes the book and one that describes what the client attempted.
 */
export async function reorderOffer({
  bookId,
  offerId,
  toIndex,
  refresh,
}: {
  bookId: string
  offerId: string
  /** Where it should end up. Out of range is a no-op, not a clamp — a drag that
   *  left the list is a cancelled gesture, not a request to move to the end. */
  toIndex: number
  refresh: () => void
}): Promise<boolean> {
  const { order, offers } = useEditorStore.getState()
  const from = order.indexOf(offerId)
  if (from === -1 || toIndex < 0 || toIndex >= order.length || toIndex === from) return false

  const next = [...order]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return false
  next.splice(toIndex, 0, moved)

  try {
    const res = await fetch(`/api/v1/offer-books/${bookId}/offers`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerIds: next }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      toast({
        tone: 'critical',
        message: body?.error?.message ?? 'That did not save. Try again.',
      })
      return false
    }
  } catch {
    toast({ tone: 'critical', message: 'That did not save. Check your connection.' })
    return false
  }

  useEditorStore.getState().push({
    kind: 'reorder',
    offerId,
    // Read as "Undo <label>", so it names the act rather than the field.
    label: `moving ${offers[offerId]?.name ?? 'that card'}`,
    fromOrder: order,
    toOrder: next,
  })
  refresh()
  return true
}
