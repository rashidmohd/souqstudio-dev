'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pin as PinIcon, X } from 'lucide-react'
import type { Pin } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { MARGIN_STEPS, nearestMarginStep } from '@/lib/offer-book-layout'

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
 *
 * **Bands are running, pins are not**, and that is the whole difference between
 * the two halves of this panel. A header or footer set here is written into the
 * master grid, so it appears on every page; a pin belongs to one page. An owner
 * wanting a masthead on page one and nothing after it wants a pin, and one
 * wanting the shop's address at the foot of all nine pages wants a footer.
 *
 * **Every control here sends only what it changed.** `PATCH .../grid` reads the
 * stored grid back into the choice that made it and applies a delta, so setting
 * the margin cannot reset the offer card. Until that seam existed this panel's
 * track-count select did exactly that. `docs/E6-create-flow.md` §5.1.
 */

/**
 * `season` is present only while the block's occasion is running — the page
 * computes it, because the window for Ramadan or either Eid is a Hijri
 * calculation rather than a column. `starts` is when the occasion itself begins,
 * which is what a countdown needs; the block is already on offer by then.
 */
type PinnableBlock = { id: string; name: string; season?: { starts: string } }

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

type Props = {
  bookId: string
  perRow: number
  bodyRows: number
  /** Fraction of the page's shorter edge. */
  margin: number
  /** The running band at the top of every page, or null for none. */
  headerBlockId: string | null
  footerBlockId: string | null
  /**
   * False when the chosen offer card has no arrangement for the shape this
   * layout gives its cells, so the renderer is stretching a design drawn for
   * another shape. Nothing errors; this is the only place it is visible.
   */
  cardFits: boolean
  offerCount: number
  pageCount: number
  pins: Pin[]
  /** Static blocks only. A repeating block reads an offer, and a pin has none. */
  blocks: PinnableBlock[]
  /**
   * Static blocks grouped by what they are for.
   *
   * **Filtered by category rather than offered as one list**, because "which of
   * these fifty is a footer" is not a question an owner should answer. A block
   * the shop authored has no category — that is a fact about the library we
   * shipped, not about their row — so those are offered in both.
   */
  headerBlocks: { id: string; name: string }[]
  footerBlocks: { id: string; name: string }[]
  blockNames: Record<string, string>
}

export function LayoutPanel({
  bookId,
  perRow,
  bodyRows,
  margin,
  headerBlockId,
  footerBlockId,
  cardFits,
  offerCount,
  pageCount,
  pins,
  blocks,
  headerBlocks,
  footerBlocks,
  blockNames,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState(pageCount)

  // The server recomposes on every change, so the count from props is the truth
  // as soon as it lands; this holds the answer the route gave in the meantime.
  React.useEffect(() => setPages(pageCount), [pageCount])

  /**
   * Send one field. Everything absent is left as it is by the route, which is
   * what stops the margin control from resetting the offer card.
   */
  async function setGrid(next: {
    perRow?: number
    bodyRows?: number
    margin?: number
    headerBlockId?: string | null
    footerBlockId?: string | null
  }) {
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
          onChange={(event) => void setGrid({ perRow: Number(event.target.value) })}
        />
        <Select
          label="Down"
          value={String(bodyRows)}
          disabled={busy}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => void setGrid({ bodyRows: Number(event.target.value) })}
        />
      </div>

      <p className="font-ui text-body-sm text-muted">
        <Figure value={offerCount} size="data-sm" />{' '}
        {offerCount === 1 ? 'offer' : 'offers'} → <Figure value={pages} size="data-sm" />{' '}
        {pages === 1 ? 'page' : 'pages'}
      </p>

      {/*
        Named steps rather than a number. A margin is a fraction of the page's
        shorter edge, which is what makes one value work on a square post and on
        A3, and it is not a quantity any shop owner has an opinion about.
        `nearestMarginStep` is what keeps a book created outside these five from
        rendering a select that says None when it is not.
      */}
      <Select
        label="Page margin"
        value={String(nearestMarginStep(margin).value)}
        disabled={busy}
        options={MARGIN_STEPS.map((step) => ({
          value: String(step.value),
          label: step.label,
        }))}
        onChange={(event) => void setGrid({ margin: Number(event.target.value) })}
        hint="The white edge around every page."
      />

      {/*
        **The one thing about a layout that nothing else can tell the owner.**
        `pickArrangement` falls back to the nearest arrangement rather than
        failing, so a card designed tall in a near-square cell renders stretched
        with no error, no failed test and no broken page. Adding a header band to
        a story is enough to reach it.

        Caution rather than critical: the page is usable and printable, and this
        is a judgement about how it looks. It names the fix, because "your cards
        are stretched" without one is just bad news.
      */}
      {!cardFits ? (
        <p className="rounded-control bg-caution-bg p-2 font-ui text-body-sm text-caution-fg">
          This design has no layout for cells this shape, so the cards are being
          stretched. Try one row fewer, or remove a band.
        </p>
      ) : null}

      <Band
        title="Header"
        empty="No band across the top."
        blocks={headerBlocks}
        value={headerBlockId}
        disabled={busy}
        onChange={(next) => void setGrid({ headerBlockId: next })}
      />

      <Band
        title="Footer"
        empty="No band across the bottom."
        blocks={footerBlocks}
        value={footerBlockId}
        disabled={busy}
        onChange={(next) => void setGrid({ footerBlockId: next })}
      />

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

/**
 * A running band, on every page: add one, swap it, or take it away.
 *
 * **One control does all three**, because they are one decision. A separate
 * "remove" button beside a picker would make taking a footer off a page a
 * different kind of act from changing which footer it is, and it is not — the
 * owner is answering "what is along the bottom of every page", and "nothing" is
 * one of the answers. So "None" is the first option in the list.
 *
 * **`null` on the wire, and it has to be.** Absent means "leave it alone" to
 * `PATCH .../grid`; `null` means "remove it". If removal were sent as absent,
 * the route would rebuild from the stored grid and hand the band straight back.
 *
 * A band is what appears on **every** page. `Pins` below is the other half: one
 * page, placed by the owner. The two look similar in a panel and are not the
 * same thing, so each says which it is.
 */
function Band({
  title,
  empty,
  blocks,
  value,
  disabled,
  onChange,
}: {
  title: string
  /** What "None" means here, said once, so the panel is readable at a glance. */
  empty: string
  blocks: { id: string; name: string }[]
  value: string | null
  disabled: boolean
  onChange: (blockId: string | null) => void
}) {
  /*
   * A band naming a block this shop cannot pick from — one archived since, or
   * moved behind a plan — still has to be selectable, or the select would show
   * the first option and the next change would silently swap the band. Same
   * reasoning as `loadBlocks` not filtering by status: a book already in print
   * must go on rendering what it was printed with.
   */
  const known = blocks.some((block) => block.id === value)
  const options = [
    { value: '', label: `None. ${empty}` },
    ...blocks.map((block) => ({ value: block.id, label: block.name })),
    ...(value !== null && !known ? [{ value, label: 'The block this book uses' }] : []),
  ]

  return (
    <Select
      label={title}
      value={value ?? ''}
      disabled={disabled || blocks.length === 0}
      options={options}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      hint={blocks.length === 0 ? 'No blocks of this kind in your library yet.' : 'On every page.'}
    />
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
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
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
