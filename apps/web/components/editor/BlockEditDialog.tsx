'use client'

import * as React from 'react'
import { Copy, Layers } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { BlockEditStep, Repoint } from '@/components/editor/use-block-edit'

/**
 * What "edit this design" is about to mean, said before it happens.
 *
 * **Two questions wearing one dialog, because the owner is answering one
 * thing**: am I changing this design, or making my own. The difference between
 * the seeded case and the shared case is who else is affected, and that belongs
 * in the sentence rather than in a second component.
 *
 * **The seeded case is not a confirmation.** There is no other outcome to pick
 * — ours are read-only to every account — so it is a statement with one button.
 * Offering "cancel or copy" would imply a third option exists.
 *
 * **The shared case leads with the copy.** Changing a design that three printed
 * books draw is the answer they are less likely to want and the one they cannot
 * undo by pressing back, so the safe verb is the primary and the other is
 * beside it. Both are spelled out: neither button says "OK".
 *
 * `useBlockEdit` decides which of these is showing; this only draws it.
 */

type Props = {
  step: BlockEditStep | null
  onCancel: () => void
  onFork: (blockId: string, name: string, repoint: Repoint) => void
  onEditShared: (blockId: string) => void
}

export function BlockEditDialog({ step, onCancel, onFork, onEditShared }: Props) {
  const asking = step?.kind === 'asking' ? step : null
  const failed = step?.kind === 'failed' ? step : null

  return (
    <>
      <Dialog
        open={asking !== null}
        onOpenChange={(next) => {
          if (!next) onCancel()
        }}
        title={
          asking?.usage.seeded === true
            ? 'This design comes with your account'
            : 'This design is used in other books'
        }
        description={
          asking === null
            ? undefined
            : asking.usage.seeded
              ? `${asking.usage.name} is one of ours, so it is read-only. We will make you a copy and this book will use it. The original stays as it is.`
              : `${asking.usage.name} is also drawn by the books below. Changing it changes all of them.`
        }
      >
        {asking === null ? null : (
          <div className="flex flex-col gap-4">
            {/*
              Named, not counted. "Used in 3 other books" asks the owner to go
              and find out which; the list is the thing that makes this a
              decision rather than a warning.
            */}
            {asking.usage.books.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-control bg-sunken p-3">
                {asking.usage.books.map((book) => (
                  <li key={book.id} className="font-ui text-body-sm text-secondary">
                    {book.title}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => onFork(asking.blockId, asking.usage.name, asking.repoint)}
              >
                <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {asking.usage.seeded
                  ? 'Make me a copy and open it'
                  : 'Give this book its own copy'}
              </Button>

              {/*
                Absent for a seeded block, because there is nothing behind it:
                ours cannot be edited in place by anyone. A disabled button
                would suggest an upgrade or a permission would unlock it.
              */}
              {asking.usage.seeded ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onEditShared(asking.blockId)}
                >
                  <Layers className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Change it in every book
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/*
        A separate dialog rather than a state inside the one above: the failure
        can arrive from `begin` *or* from `fork`, and by the time a copy has
        failed there is no longer a question on screen to attach it to.
      */}
      <Dialog
        open={failed !== null}
        onOpenChange={(next) => {
          if (!next) onCancel()
        }}
        title="That design could not be opened"
        description={failed?.message ?? ''}
        primaryAction={{ label: 'Close', onClick: onCancel }}
      />
    </>
  )
}
