'use client'

import * as React from 'react'
import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * When the offers hold — the two dates a flyer header prints. E14 §3.4.
 *
 * **Not the share link's expiry, and that distinction is the whole reason this
 * exists.** `offer_books.expiresAt` is when the *URL* stops working; a header
 * reading "Offers valid 1–7 October" is a claim about prices. They are set for
 * different reasons and to different days, and a header that borrowed the link's
 * date would print one the shop never chose. `book.validFrom` and
 * `book.validTo` are the bindings, and until this control existed they resolved
 * to empty on every book.
 *
 * **Edit in place, beside the title, for the reason `BookTitle` gives.** A
 * dialog for two date fields is a scrim over the artboard. Pressing the summary
 * swaps in the fields at the same place, Enter commits and Escape cancels.
 *
 * **Not part of the editor's autosave.** `apps/web/CLAUDE.md`: saving is per
 * resource and there is no whole-book patch. `PATCH .../period` is this
 * control's own request, committed rather than debounced, so an owner who sets
 * a period and closes the tab has set it.
 *
 * **Either end may be empty.** A shop that knows when its offers start and not
 * when they end is ordinary, and §3.7 collapses the element bound to the
 * missing one rather than printing a hole.
 */
type Props = {
  bookId: string
  /** `YYYY-MM-DD`, or null. The wire format and the input's format are the same. */
  validFrom: string | null
  validTo: string | null
}

/** Day and month, matching what the card prints. `en-GB` for 1 October, not October 1. */
const summarize = (from: string | null, to: string | null): string | null => {
  const label = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value))
  if (from !== null && to !== null) return `${label(from)} – ${label(to)}`
  if (from !== null) return `From ${label(from)}`
  if (to !== null) return `Until ${label(to)}`
  return null
}

export function OfferPeriod({ bookId, validFrom, validTo }: Props) {
  const [period, setPeriod] = React.useState({ from: validFrom, to: validTo })
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({ from: validFrom ?? '', to: validTo ?? '' })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const first = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) first.current?.focus()
  }, [editing])

  function open() {
    setDraft({ from: period.from ?? '', to: period.to ?? '' })
    setError(null)
    setEditing(true)
  }

  async function commit() {
    const next = { from: draft.from === '' ? null : draft.from, to: draft.to === '' ? null : draft.to }

    if (next.from === period.from && next.to === period.to) {
      setEditing(false)
      return
    }

    // ISO dates sort lexicographically, so this needs no parsing. Checked here
    // as well as on the route: the owner should not need a round trip to be
    // told the end is before the start.
    if (next.from !== null && next.to !== null && next.from > next.to) {
      setError('The end date is before the start date.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/period`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ validFrom: next.from, validTo: next.to }),
      })
      if (!res.ok) {
        setError('That did not save. Try again.')
        return
      }
      setPeriod(next)
      setEditing(false)
    } catch {
      setError('That did not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const summary = summarize(period.from, period.to)

  if (!editing) {
    return (
      <Button variant="ghost" onClick={open}>
        <CalendarRange className="size-4" aria-hidden="true" strokeWidth={1.75} />
        {summary ?? 'Set offer dates'}
      </Button>
    )
  }

  return (
    <div
      className="flex items-end gap-2"
      onKeyDown={(event) => {
        // Escape closes the topmost layer, and the layer is this.
        if (event.key === 'Escape') setEditing(false)
        if (event.key === 'Enter') void commit()
      }}
    >
      <Input
        ref={first}
        type="date"
        label="Offers valid from"
        value={draft.from}
        onChange={(event) => {
          setDraft((prev) => ({ ...prev, from: event.target.value }))
          // Once it has errored, re-validate on change so the error clears as
          // it is fixed rather than persisting until the next blur.
          if (error !== null) setError(null)
        }}
        disabled={saving}
        {...(error === null ? {} : { error })}
      />
      <Input
        type="date"
        label="Until"
        value={draft.to}
        onChange={(event) => {
          setDraft((prev) => ({ ...prev, to: event.target.value }))
          if (error !== null) setError(null)
        }}
        disabled={saving}
      />
      <Button onClick={() => void commit()} disabled={saving}>
        {saving ? 'Saving' : 'Save'}
      </Button>
      <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
        Cancel
      </Button>
    </div>
  )
}
