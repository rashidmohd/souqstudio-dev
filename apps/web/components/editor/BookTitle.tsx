'use client'

import * as React from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The book's name, and the control that changes it.
 * E6 — `docs/E6-create-flow.md` §4 and §6.
 *
 * **This is the other half of not asking for a name.** The creation screen used
 * to open with a title field and refuse to submit without one, which asked the
 * least consequential question on the screen first, about a thing that did not
 * exist yet. Now a book is named for the week or the day. That is only
 * defensible because it can be changed here, once the owner has seen what they
 * made and knows what to call it — without this, every book a shop owns is
 * called "Week 37 offers" forever.
 *
 * **Edit in place rather than a dialog.** A dialog for one text field is a scrim
 * over the artboard to change six characters. The heading is a button, pressing
 * it swaps in an input at the same size and position, Enter commits and Escape
 * cancels — the design system's rule that Escape closes the topmost layer, where
 * the layer is this.
 *
 * **Not part of the editor's autosave.** `apps/web/CLAUDE.md` is explicit that
 * saving is per resource and that there is no whole-book patch, because a
 * partial write of one is a book half in each version. A rename is a deliberate
 * act on the book itself, so it is its own request and it is committed rather
 * than debounced: an owner who types a name and closes the tab has renamed it.
 */
type Props = {
  bookId: string
  title: string
}

export function BookTitle({ bookId, title }: Props) {
  const [name, setName] = React.useState(title)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const input = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  function open() {
    setDraft(name)
    setError(null)
    setEditing(true)
  }

  async function commit() {
    const next = draft.trim()

    // Nothing to say and nothing to send. Closing silently is the right answer
    // to "they opened it and changed their mind".
    if (next === '' || next === name) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: next }),
      })
      const body = await res.json()

      if (!res.ok || body.error) {
        // The field keeps what they typed. Preserve everything they typed when
        // the server rejects it.
        setError(body.error?.message ?? 'That name could not be saved.')
        return
      }

      setName(next)
      setEditing(false)
    } catch {
      setError('That name could not be saved. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className="group flex min-h-control items-center gap-2 rounded-control px-2 text-start hover:bg-stone-100"
      >
        <span className="font-ui text-subhead text-primary">{name}</span>
        {/*
          Visible at rest, not revealed on hover. Every hover-revealed affordance
          needs a persistent equivalent, because the editor ships on tablet where
          hover does not exist.
        */}
        <Pencil
          className="size-4 shrink-0 text-muted"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        <span className="sr-only">Rename this offer book</span>
      </button>
    )
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
          maxLength={160}
          aria-label="Offer book name"
          className="min-h-control rounded-control border-hairline border-border-strong bg-surface px-2 font-ui text-subhead text-primary"
        />
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Save name"
          onClick={commit}
          loading={saving}
        >
          <Check className="size-4" aria-hidden="true" strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Cancel rename"
          onClick={() => setEditing(false)}
        >
          <X className="size-4" aria-hidden="true" strokeWidth={2} />
        </Button>
      </span>

      {error ? (
        <span className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
