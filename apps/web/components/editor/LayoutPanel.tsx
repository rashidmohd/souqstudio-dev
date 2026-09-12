'use client'

import * as React from 'react'
import type { Pin } from '@souqstudio/types'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { MARGIN_STEPS, nearestMarginStep } from '@/lib/offer-book-layout'
import type { GridPatch } from '@/components/editor/use-grid-patch'

/**
 * The shape of every page: how many cards, how much white edge, and what runs
 * along the top and bottom. E6-07 and the composition model §4.3.
 *
 * **Density is derived, not chosen.** A 2×2 page *is* showcase and a 5×6 page
 * *is* dense, so there is one control — the track count — and the density
 * follows. Two controls that can disagree is one too many.
 *
 * **Page count is feedback, not a setting.** "42 products → 5 pages" under the
 * choice, because that is the number the owner cares about: it is the print
 * bill, and making them compute it is the thing this panel exists to avoid.
 *
 * **Bands are here rather than in their own tab because they are structural.**
 * A header or footer takes a track, which changes every cell's aspect and
 * therefore which arrangement each card draws at — the same kind of change as
 * a track count or a margin. The page *background* is the only purely visual
 * property, and that is the one that got its own tab.
 *
 * **Every control sends only what it changed.** `useGridPatch` posts a delta and
 * the route rebuilds from the stored grid, so setting the margin cannot reset
 * the offer card. Until that seam existed the track-count select did exactly
 * that. `docs/E6-create-flow.md` §10.1.
 */

type Props = {
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
  /** The count the route last computed, held by `useGridPatch`. */
  pages: number
  /** Shared with the background tab, so one request shape serves both. */
  patch: (next: GridPatch) => void
  busy: boolean
  error: string | null
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
}

export function LayoutPanel({
  perRow,
  bodyRows,
  margin,
  headerBlockId,
  footerBlockId,
  cardFits,
  offerCount,
  pages,
  patch,
  busy,
  error,
  headerBlocks,
  footerBlocks,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Across"
          value={String(perRow)}
          disabled={busy}
          options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => patch({ perRow: Number(event.target.value) })}
        />
        <Select
          label="Down"
          value={String(bodyRows)}
          disabled={busy}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => patch({ bodyRows: Number(event.target.value) })}
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
        onChange={(event) => patch({ margin: Number(event.target.value) })}
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
        onChange={(next) => patch({ headerBlockId: next })}
      />

      <Band
        title="Footer"
        empty="No band across the bottom."
        blocks={footerBlocks}
        value={footerBlockId}
        disabled={busy}
        onChange={(next) => patch({ footerBlockId: next })}
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
