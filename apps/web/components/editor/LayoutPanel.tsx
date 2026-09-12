'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
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
  /**
   * What the owner has selected on the artboard, and what can be done with it.
   *
   * **The gesture is on the canvas and the verb is in the panel**, which is the
   * split the design system already asks for: an affordance revealed by hover is
   * no affordance at all on the tablet this editor ships on, so "merge" is a
   * button with a visible label in a panel rather than something that appears
   * over a selection.
   */
  selection: {
    /** Cells covered. Zero when nothing is selected. */
    cells: number
    /** False for a single cell — merging one cell is not an operation. */
    canMerge: boolean
    /** Whether the selection touches anything already merged. */
    canUnmerge: boolean
  }
  onMerge: () => void
  onUnmerge: () => void
  /**
   * Whether a tap extends the selection instead of starting a new one.
   *
   * **The tablet's shift key.** Extending a selection is shift-click or a drag,
   * and an iPad has neither — long-press drag is unreliable there, which is why
   * the design system asks for a persistent equivalent rather than a gesture.
   * This is that equivalent, and it costs a mouse user nothing because they
   * still have both.
   */
  addToSelection: boolean
  onToggleAddToSelection: () => void
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
  selection,
  onMerge,
  onUnmerge,
  addToSelection,
  onToggleAddToSelection,
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

      <Cells
        selection={selection}
        disabled={busy}
        onMerge={onMerge}
        onUnmerge={onUnmerge}
        addToSelection={addToSelection}
        onToggleAddToSelection={onToggleAddToSelection}
      />

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

/**
 * Merging and unmerging, which is the one layout edit an owner makes on the
 * artboard rather than in this panel.
 *
 * **The verb lives here because hover does not exist on a tablet.** The design
 * system permits an icon-only control in the editor toolbar only on condition
 * the same action is reachable with a visible label elsewhere, and forbids
 * revealing a label on hover at all. A toolbar that floats over a selection is
 * exactly the affordance that disappears on an iPad, so the selection happens on
 * the canvas and the naming happens in a panel that is always there.
 *
 * **It says what a merge costs before the owner spends it.** One master grid is
 * instanced on every body page, so merging two cells on page one merges them on
 * all nine — which is what anybody actually wants, and which is also completely
 * invisible if the only page they are looking at is page one. The selection ring
 * appearing on every page says it once; this says it in words.
 *
 * **Empty is a state, not a disabled button with no explanation.** With nothing
 * selected this names the gesture that fills it, because "Merge (disabled)" is a
 * control that tells an owner nothing about how to enable it.
 */
function Cells({
  selection,
  disabled,
  onMerge,
  onUnmerge,
  addToSelection,
  onToggleAddToSelection,
}: {
  selection: { cells: number; canMerge: boolean; canUnmerge: boolean }
  disabled: boolean
  onMerge: () => void
  onUnmerge: () => void
  addToSelection: boolean
  onToggleAddToSelection: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-block bg-sand p-3">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Cells</h3>

      {selection.cells === 0 ? (
        <p className="font-ui text-body-sm text-muted">
          Pick a card on the page. To take in more, drag across them, shift-click,
          or turn on Add to selection.
        </p>
      ) : (
        <p className="font-ui text-body-sm text-muted">
          <Figure value={selection.cells} size="data-sm" />{' '}
          {selection.cells === 1 ? 'cell' : 'cells'} selected.{' '}
          {selection.canMerge ? 'Merging makes them one card.' : 'Take in one more to merge.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={disabled || !selection.canMerge}
          onClick={onMerge}
        >
          Merge
        </Button>
        <Button
          type="button"
          disabled={disabled || !selection.canUnmerge}
          onClick={onUnmerge}
        >
          Unmerge
        </Button>
        {/*
          A mode rather than a gesture, and it stays on until it is turned off.
          `aria-pressed` is what makes it a toggle to a screen reader; the label
          never changes, because a control that renames itself when pressed is
          one an owner has to read twice to know what it will do.
        */}
        <Button
          type="button"
          aria-pressed={addToSelection}
          variant={addToSelection ? 'primary' : 'ghost'}
          onClick={onToggleAddToSelection}
        >
          Add to selection
        </Button>
      </div>

      {selection.canMerge || selection.canUnmerge ? (
        <p className="font-ui text-body-sm text-muted">
          Every page has the same layout, so this changes all of them.
        </p>
      ) : null}
    </div>
  )
}
