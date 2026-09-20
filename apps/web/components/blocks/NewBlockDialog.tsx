'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MAGIC_CATEGORIES, type MagicCategory } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { KIND_LABEL, KIND_NOTE, KIND_STARTS_WITH } from '@/lib/block-kinds'

/**
 * A block of the owner's own, started from a starter rather than from a copy.
 *
 * **What "always seed" was protecting, and what it was costing.**
 * `docs/composition-model.md` §3.6 says a blank artboard produces something
 * worse than the default and the owner blames the product — so there was no
 * "new block" anywhere, and a new block was always a copy of one that works.
 * The rule is right about *blank*. It was wrong about *new*: an owner who
 * wanted a footer of their own had to take somebody else's, rename it, and
 * delete its contents, which is a worse first minute than a starting point.
 *
 * So this asks two questions and makes a block that already reads as one of its
 * kind — `starterBlock` in the engine, held to the same bar as a shipped block
 * by `starter.test.ts`. **It says what will be on it before making it**, because
 * an owner who expected an empty canvas and got three elements has been
 * surprised by their own product.
 *
 * **Two questions, not a form.** Name and kind, both with a default, so the
 * whole dialog can be answered by pressing the primary. The design happens on
 * the canvas, which is where it belongs — the first version of the designer was
 * a form with a canvas attached and the owner rejected it (`E7-pending.md` §8).
 */
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewBlockDialog({ open, onOpenChange }: Props) {
  const router = useRouter()
  const [kind, setKind] = React.useState<MagicCategory>('offer-card')
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Re-seeded each time it opens: a dialog that remembers the last attempt is
  // one that shows a stale error over a fresh question.
  React.useEffect(() => {
    if (!open) return
    setKind('offer-card')
    setName('')
    setError(null)
  }, [open])

  // **Defaulted, never required.** The kind is what decides the block; the name
  // is what the owner will change once they can see it, and demanding one up
  // front asks the least consequential question on the screen first — the same
  // mistake the create-a-book flow made and stopped making.
  const chosenName = name.trim() === '' ? KIND_LABEL[kind] : name.trim()

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: chosenName, kind }),
      })
      const body = (await res.json().catch(() => null)) as
        | { data: { id: string } | null; error: { message: string } | null }
        | null

      if (!res.ok || !body?.data) {
        setError(body?.error?.message ?? 'That did not work. Try again.')
        return
      }

      /**
       * **Invalidate the list before leaving it.** The App Router serves
       * `/blocks` from its client cache, so pushing straight to the designer
       * leaves a rendered payload behind that does not contain the block that
       * was just made — and an owner who presses back finds the library exactly
       * as they left it. Nothing failed, so nothing says so.
       *
       * The import and magic dialogs both `router.refresh()` when they finish;
       * they stay on the page, so it was doing the visible half of the job and
       * this one needed the invisible half too.
       */
      router.refresh()

      // Then into the designer. The block is a starting point and the whole
      // point of it is what the owner does next.
      router.push(`/card-designer/${body.data.id}`)
    } catch {
      setError('That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New block"
      description="Pick what you are making. It arrives with the basics on it, ready to change."
      primaryAction={{ label: 'Create and open', onClick: () => void create(), loading: busy }}
      secondaryAction={{ label: 'Cancel', onClick: () => onOpenChange(false) }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-ui text-label font-medium text-primary">
            What are you making?
          </span>
          {/* Scrolls rather than wraps below 400px: five options in one row is
              wider than a phone, and a wrapped segmented control reads as two
              controls. The import dialog does the same. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Segmented
              label="What kind of block"
              value={kind}
              disabled={busy}
              options={MAGIC_CATEGORIES.map((category) => ({
                value: category,
                label: KIND_LABEL[category],
              }))}
              onChange={setKind}
            />
          </div>
          <p className="font-ui text-body-sm text-muted">{KIND_NOTE[kind]}</p>
        </div>

        {/* **What it arrives with, said before it is made.** §3.6's rule is
            answered by this line as much as by the starter itself. */}
        <div className="rounded-block bg-sand p-3">
          <p className="font-ui text-body-sm text-secondary">
            <span className="font-medium text-primary">It starts with:</span>{' '}
            {KIND_STARTS_WITH[kind]}
          </p>
        </div>

        <Input
          label="Name"
          value={name}
          disabled={busy}
          placeholder={KIND_LABEL[kind]}
          hint="Leave it and we will call it what it is. You can rename it later."
          onChange={(event) => setName(event.target.value)}
        />

        {error !== null ? (
          <p className="font-ui text-body-sm text-critical-fg" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
