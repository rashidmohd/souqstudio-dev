'use client'

import * as React from 'react'

/**
 * Opening a design for editing, and deciding first whether that is safe.
 *
 * **A block is organization-wide, and the window makes it feel local.** The
 * owner is visibly inside one book; the design they are about to change may be
 * drawn by three others, or may be one of ours that every account on the
 * platform composes with. Both cases end with "and nobody told me", so both are
 * resolved before a designer opens rather than after.
 *
 * Three outcomes, from `GET /api/v1/blocks/:id/usage`:
 *
 * - **Seeded** — ours, read-only to every shop. There is no "edit" to offer, so
 *   the only honest version is duplicate, repoint this book at the copy, and
 *   open that. Stated plainly, then done in one press.
 * - **Theirs, drawn elsewhere** — name the other books and let them choose:
 *   change it everywhere, or give this book a copy of its own.
 * - **Theirs, only here** — open it. No dialog: a confirmation that always says
 *   yes is a keystroke, not a safeguard.
 *
 * **`repoint` is passed to `begin`, not to the hook, because the scope differs
 * per press.** The book's card is `PATCH .../grid`; one cell is
 * `PATCH .../pages/:index/region-blocks`. Both routes are reachable from the
 * same editor, so which one a copy has to be written through is a property of
 * the button that was pressed rather than of the editor. This hook knows a copy
 * was made and what its id is; it does not know what the copy is *for*.
 */

export type BlockUsage = {
  /** Ours, shared by every account, read-only to all of them. */
  seeded: boolean
  locked: boolean
  name: string
  /** Other books of this organization that draw it. Never this one. */
  books: { id: string; title: string }[]
}

/**
 * Point the book at a different block. Called only when a copy was made, and
 * awaited — the window must not open on a design the book is not yet drawing,
 * or every save in it would change nothing the owner can see.
 *
 * Returns false to abort: the copy exists but the book still draws the
 * original, which is recoverable and worth saying rather than hiding.
 */
export type Repoint = (blockId: string) => Promise<boolean>

/** What the editor should be showing. `null` is: nothing in progress. */
export type BlockEditStep =
  | { kind: 'asking'; blockId: string; usage: BlockUsage; repoint: Repoint }
  | { kind: 'working' }
  | { kind: 'failed'; message: string }

type Options = {
  bookId: string
  /** Open the designer window on this block. */
  open: (blockId: string) => void
}

export function useBlockEdit({ bookId, open }: Options) {
  const [step, setStep] = React.useState<BlockEditStep | null>(null)

  const dismiss = React.useCallback(() => setStep(null), [])

  /** Ask what this block is before deciding what "edit" means for it. */
  const begin = React.useCallback(
    async (blockId: string, repoint: Repoint) => {
      setStep({ kind: 'working' })
      try {
        const response = await fetch(
          `/api/v1/blocks/${blockId}/usage?exclude=${encodeURIComponent(bookId)}`
        )
        const body = (await response.json()) as {
          data: BlockUsage | null
          error: { message: string } | null
        }
        if (body.data === null) {
          setStep({
            kind: 'failed',
            message: body.error?.message ?? 'That design could not be opened.',
          })
          return
        }

        // Nothing to warn about and nothing to copy: this book is the only one
        // drawing a design the shop owns. Straight in.
        if (!body.data.seeded && body.data.books.length === 0) {
          setStep(null)
          open(blockId)
          return
        }

        setStep({ kind: 'asking', blockId, usage: body.data, repoint })
      } catch {
        setStep({
          kind: 'failed',
          message: 'That design could not be opened. Check your connection.',
        })
      }
    },
    [bookId, open]
  )

  /**
   * Duplicate, repoint this book, then open the copy.
   *
   * **The name sent is the source's own.** `POST /api/v1/blocks` turns a name
   * that collides with the source into "Corner flag card copy" through
   * `copyName`, which already knows how the rest of the product names copies.
   * Choosing one here would be a second naming scheme, and the two would
   * diverge the first time either changed.
   */
  const fork = React.useCallback(
    async (blockId: string, name: string, repoint: Repoint) => {
      setStep({ kind: 'working' })
      try {
        const response = await fetch('/api/v1/blocks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, fromId: blockId }),
        })
        const body = (await response.json()) as {
          data: { id: string } | null
          error: { message: string } | null
        }
        if (body.data === null) {
          setStep({
            kind: 'failed',
            message: body.error?.message ?? 'That design could not be copied.',
          })
          return
        }

        // Repointed before the window opens, so what the owner edits is what
        // the book draws. The other order shows them a designer over a book
        // that is still using the original — and every save looks lost.
        if (!(await repoint(body.data.id))) {
          setStep({
            kind: 'failed',
            message: 'The copy was made, but this book could not be switched to it.',
          })
          return
        }

        setStep(null)
        open(body.data.id)
      } catch {
        setStep({
          kind: 'failed',
          message: 'That design could not be copied. Check your connection.',
        })
      }
    },
    [open]
  )

  /** Edit the shared design in place — every book drawing it changes. */
  const editShared = React.useCallback(
    (blockId: string) => {
      setStep(null)
      open(blockId)
    },
    [open]
  )

  return { step, begin, fork, editShared, dismiss }
}
