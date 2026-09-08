'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pin as PinIcon, X } from 'lucide-react'
import type { Pin } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'

/**
 * The page layout: how many cards across, and what is pinned where. E6-07 and
 * the composition model §4.3 and §6.
 *
 * **Density is derived, not chosen.** A 2×2 page *is* showcase and a 5×6 page
 * *is* dense, so there is one control — the track count — and the density
 * follows. Two controls that can disagree is one too many.
 *
 * **Page count is feedback, not a setting.** "42 products → 5 pages" under the
 * choice, because that is the number the owner cares about: it is the print
 * bill, and making them compute it is the thing this panel exists to avoid.
 *
 * **A pin displaces, it never consumes.** Pinning a message into a page of ten
 * products gives eleven positions, not ten with a product dropped — silently
 * losing a product is the class of bug that reaches print — so the arithmetic
 * is shown rather than assumed.
 */

type PinnableBlock = { id: string; name: string }

type Props = {
  bookId: string
  perRow: number
  bodyRows: number
  offerCount: number
  pageCount: number
  pins: Pin[]
  /** Static blocks only. A repeating block reads an offer, and a pin has none. */
  blocks: PinnableBlock[]
  blockNames: Record<string, string>
}

export function LayoutPanel({
  bookId,
  perRow,
  bodyRows,
  offerCount,
  pageCount,
  pins,
  blocks,
  blockNames,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState(pageCount)

  // The server recomposes on every change, so the count from props is the truth
  // as soon as it lands; this holds the answer the route gave in the meantime.
  React.useEffect(() => setPages(pageCount), [pageCount])

  async function setGrid(next: { perRow: number; bodyRows: number }) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/grid`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
      const body = (await res.json()) as {
        data: { pages: number } | null
        error: { message: string } | null
      }
      if (body.data === null) {
        setError(body.error?.message ?? 'That layout could not be applied.')
        return
      }
      setPages(body.data.pages)
      router.refresh()
    } catch {
      setError('That layout could not be applied. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-ui text-label font-medium text-primary">Layout</h2>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Across"
          value={String(perRow)}
          disabled={busy}
          options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => void setGrid({ perRow: Number(event.target.value), bodyRows })}
        />
        <Select
          label="Down"
          value={String(bodyRows)}
          disabled={busy}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => void setGrid({ perRow, bodyRows: Number(event.target.value) })}
        />
      </div>

      <p className="font-ui text-body-sm text-muted">
        <Figure value={offerCount} size="data-sm" />{' '}
        {offerCount === 1 ? 'offer' : 'offers'} → <Figure value={pages} size="data-sm" />{' '}
        {pages === 1 ? 'page' : 'pages'}
      </p>

      <Pins
        bookId={bookId}
        pins={pins}
        blocks={blocks}
        blockNames={blockNames}
        offerCount={offerCount}
        disabled={busy}
      />

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Pins({
  bookId,
  pins,
  blocks,
  blockNames,
  offerCount,
  disabled,
}: {
  bookId: string
  pins: Pin[]
  blocks: PinnableBlock[]
  blockNames: Record<string, string>
  offerCount: number
  disabled: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [blockId, setBlockId] = React.useState(blocks[0]?.id ?? '')
  const [page, setPage] = React.useState('1')
  const [span, setSpan] = React.useState('row')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function add() {
    if (blockId === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/pins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blockId,
          // One-based on screen, zero-based in the schema. Owners count pages
          // from one, and the conversion belongs here rather than in their head.
          pageIndex: Math.max(0, Number(page) - 1),
          span,
        }),
      })
      const body = (await res.json()) as { data: unknown; error: { message: string } | null }
      if (body.data === null) {
        setError(body.error?.message ?? 'That panel could not be pinned.')
        return
      }
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(pinId: string) {
    setBusy(true)
    await fetch(`/api/v1/offer-books/${bookId}/pins/${pinId}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  if (blocks.length === 0 && pins.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
        Pinned panels
      </h3>

      {pins.length === 0 && !open ? (
        <p className="font-ui text-body-sm text-muted">
          A header, a message or a brand panel parked on a page. Products move
          around it rather than being dropped.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {pins.map((pin) => (
          <li key={pin.id} className="flex min-h-row items-center justify-between gap-2">
            <span className="min-w-0 truncate font-ui text-body-sm text-secondary">
              {blockNames[pin.blockId] ?? 'Panel'}{' '}
              <span className="text-muted">
                · page <Figure value={pin.pageIndex + 1} size="data-sm" />
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label="Unpin this panel"
              disabled={busy || disabled}
              onClick={() => void remove(pin.id)}
            >
              <X className="size-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
          <Select
            label="Panel"
            value={blockId}
            options={blocks.map((block) => ({ value: block.id, label: block.name }))}
            onChange={(event) => setBlockId(event.target.value)}
          />
          <Select
            label="How much of the page"
            value={span}
            options={[
              { value: 'row', label: 'A band across the page' },
              { value: 'half-row', label: 'Half a row' },
              { value: 'page', label: 'The whole page' },
            ]}
            onChange={(event) => setSpan(event.target.value)}
          />
          <Select
            label="On page"
            value={page}
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
            onChange={(event) => setPage(event.target.value)}
          />

          {/* The arithmetic, out loud. Composition model §6.3: an owner must be
              able to see that nothing was dropped to make room. */}
          <p className="font-ui text-body-sm text-muted">
            <Figure value={offerCount} size="data-sm" /> offers + this panel — the
            products it covers move on rather than being dropped.
          </p>

          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" loading={busy} onClick={() => void add()}>
              Pin it
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || blocks.length === 0}
          onClick={() => setOpen(true)}
        >
          <PinIcon className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Pin a panel
        </Button>
      )}

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
