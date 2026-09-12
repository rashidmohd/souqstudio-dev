'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pin as PinIcon, X } from 'lucide-react'
import type { Pin } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'

/**
 * Panels parked on a page, and the products that move around them. E6-07 and
 * the composition model §6.
 *
 * **A pin displaces, it never consumes.** Pinning a message into a page of ten
 * products gives eleven positions, not ten with a product dropped — silently
 * losing a product is the class of bug that reaches print — so the arithmetic
 * is shown rather than assumed.
 *
 * **A pin is one page; a band is every page.** That is the whole difference
 * between this panel and the header and footer controls in `LayoutPanel`, and
 * it is why they are two tabs rather than one list of "things on the page". An
 * owner wanting a masthead on page one alone wants a pin; one wanting the shop
 * address at the foot of all nine pages wants a footer.
 *
 * **Its own file since the editor grew tabs.** It was a local function inside
 * `LayoutPanel`, which by then was 509 lines holding tracks, margin, bands,
 * background and this.
 */

/**
 * `season` is present only while the block's occasion is running — the page
 * computes it, because the window for Ramadan or either Eid is a Hijri
 * calculation rather than a column. `starts` is when the occasion itself begins,
 * which is what a countdown needs; the block is already on offer by then.
 */
export type PinnableBlock = { id: string; name: string; season?: { starts: string } }

/**
 * What the season adds to a panel's name. Days rather than a date: the reason
 * it is at the top of the list is that it is nearly time, and that is the
 * sentence — a date is something the owner has to compare against today.
 */
function seasonNote(starts: string): string {
  const days = Math.ceil((new Date(starts).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'on now'
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

/**
 * The pages a panel may be pinned to: the ones that exist, plus one.
 *
 * **It was a flat 1 to 12 whatever the book was.** On a single-page square post
 * that offered eleven pages that did not exist — and it did not error, because
 * `flowBook` generates pages far enough to reach the last pin. A panel pinned to
 * page 12 of a one-page post silently produced eleven empty pages.
 *
 * The plus-one is deliberate rather than an off-by-one: pinning onto the next
 * page is how an owner *deliberately* extends a book, so the option stays and
 * says what it does. Exported and tested because the flat list looked perfectly
 * reasonable in review and was wrong for three of the four kinds.
 */
export function pinPageOptions(pageCount: number): { value: string; label: string }[] {
  const pages = Math.max(1, pageCount)
  return Array.from({ length: pages + 1 }, (_, index) => {
    const page = index + 1
    return {
      value: String(page),
      label: page > pages ? `${page} (adds a page)` : String(page),
    }
  })
}

export function PinsPanel({
  bookId,
  pins,
  blocks,
  blockNames,
  offerCount,
  pageCount,
  disabled,
}: {
  bookId: string
  pins: Pin[]
  blocks: PinnableBlock[]
  blockNames: Record<string, string>
  offerCount: number
  /**
   * How many pages this book actually has.
   *
   * **The page select offered 1 to 12 whatever the book was**, which on a
   * single-page square post is eleven choices that put a panel somewhere no
   * page exists. `flowBook` generates pages far enough to reach the last pin,
   * so a pin on page 12 of a one-page post does not error — it silently makes
   * eleven empty pages. Bounded to what exists, plus one: pinning onto the next
   * page is how an owner deliberately extends a book, and refusing that would
   * remove a real thing they can do.
   */
  pageCount: number
  disabled: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  /**
   * **In season first — E7-03's composer half.** A seasonal panel is no use in
   * a list of forty a fortnight after Eid, and it is the first thing an owner
   * wants in the fortnight before it. The order is otherwise untouched: only
   * the flag is compared, so a browser whose sort is not stable cannot reshuffle
   * the rest.
   */
  const ordered = React.useMemo(
    () => [...blocks].sort((a, b) => Number(b.season !== undefined) - Number(a.season !== undefined)),
    [blocks]
  )

  const [blockId, setBlockId] = React.useState(ordered[0]?.id ?? '')
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
            // The label carries the season, because a native `<option>` is text
            // and cannot take a badge — the same limit `InlineSelect` documents.
            options={ordered.map((block) => ({
              value: block.id,
              label:
                block.season === undefined
                  ? block.name
                  : `${block.name} · ${seasonNote(block.season.starts)}`,
            }))}
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
            options={pinPageOptions(pageCount)}
            onChange={(event) => setPage(event.target.value)}
          />

          {/* The arithmetic, out loud. Composition model §6.3: an owner must be
              able to see that nothing was dropped to make room. */}
          <p className="font-ui text-body-sm text-muted">
            <Figure value={offerCount} size="data-sm" /> offers + this panel. The
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
