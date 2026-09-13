'use client'

import * as React from 'react'
import type { BrandColor, PageBackground, TokenRef } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { PageBackgroundControl } from '@/components/editor/PageBackgroundControl'

/**
 * One page, and everything it may do differently from the rest of the book.
 *
 * **It exists because two page-scoped controls had grown two ways of asking
 * which page.** Merging took its page from whichever cell was clicked on the
 * artboard; the page background took its page from a dropdown inside the
 * Background tab. Both were correct on their own and together they were
 * incoherent — the same question, answered by two mechanisms, in two tabs, one
 * of which also held book-wide settings.
 *
 * So there is one active page, named once at the top of this panel, and
 * everything below it is about that page. Clicking any cell on the artboard sets
 * it, because the page an owner is working on is the page they just touched.
 *
 * **What is *not* here is as deliberate.** Cards across and down, the margin, the
 * running bands and the book's default paper all belong to the book and change
 * every page at once; they stay in Layout and Background. This tab is the
 * exception list.
 */
type Props = {
  /** Zero-based. The page every control below is about. */
  page: number
  pageCount: number
  onPage: (index: number) => void

  /** The paper this page draws, whether its own or the book's. */
  background: PageBackground | null
  /** False once the page has paper of its own. */
  inherits: boolean
  onBackground: (value: PageBackground | null) => void
  onMatchBook: () => void
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string

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
  addToSelection: boolean
  onToggleAddToSelection: () => void
  pendingCells: 'merge' | 'unmerge' | null
  busy: boolean
  error: string | null

  /**
   * The one cell the design picker is about, or null when the selection is not
   * exactly one.
   *
   * **One cell, because "what does this draw" has no answer for six of them.**
   * Merging is the operation for many cells; choosing a design is an operation
   * for one, and offering it for a range would ask an owner to accept whatever
   * it did to the other five.
   */
  cell: { regionId: string; blockId: string; takesProduct: boolean } | null
  /** Everything this shop may put in a cell. `repeats` decides what happens to
   *  the product that was there. */
  blocks: { id: string; name: string; repeats: boolean }[]
  /** The book's repeating card — what a cell draws when it has no choice of its own. */
  offerCardBlockId: string | null
  onCellBlock: (blockId: string | null) => void
  pendingBlock: boolean
}

export function PagePanel({
  page,
  pageCount,
  onPage,
  background,
  inherits,
  onBackground,
  onMatchBook,
  palette,
  token,
  selection,
  onMerge,
  onUnmerge,
  addToSelection,
  onToggleAddToSelection,
  pendingCells,
  busy,
  error,
  cell,
  blocks,
  offerCardBlockId,
  onCellBlock,
  pendingBlock,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/*
        **Named once, at the top, and everything below is about it.** The same
        control `PinsPanel` uses to ask the same question, for the same reason:
        there is nothing on a tablet to hover and an explicit list is the only
        version that works with a finger.
      */}
      <Select
        label="Page"
        value={String(page)}
        options={Array.from({ length: pageCount }, (_, index) => ({
          value: String(index),
          label: `Page ${index + 1}`,
        }))}
        onChange={(event) => onPage(Number(event.target.value))}
        hint="Picking a card on the artboard switches here too."
      />

      <section className="flex flex-col gap-2 rounded-block bg-sand p-3">
        <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Paper</h3>
        <p className="font-ui text-body-sm text-muted">
          {inherits
            ? 'This page follows the book. Changing it here gives it paper of its own.'
            : 'This page has paper of its own.'}
        </p>

        <PageBackgroundControl
          value={background}
          onChange={onBackground}
          palette={palette}
          token={token}
          /*
            **Never disabled while a write is in flight.** A colour control emits
            continuously and the write is debounced, so there is nothing to
            protect against: the next change simply replaces the pending one.
            Wiring `busy` here killed the gesture mid-drag once already.
          */
          disabled={false}
        />

        {/*
          **Only once the page has something of its own to give back.** A reset
          offered to a page that is already following the book is a button that
          cannot do anything, and an owner pressing it learns nothing about why.
        */}
        {!inherits ? (
          <Button type="button" onClick={onMatchBook}>
            Match the book
          </Button>
        ) : null}
      </section>

      <Design
        cell={cell}
        blocks={blocks}
        offerCardBlockId={offerCardBlockId}
        onChange={onCellBlock}
        pending={pendingBlock}
        disabled={busy}
      />

      <Cells
        selection={selection}
        disabled={busy}
        onMerge={onMerge}
        onUnmerge={onUnmerge}
        addToSelection={addToSelection}
        onToggleAddToSelection={onToggleAddToSelection}
        pending={pendingCells}
        page={page}
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
 * **A merge belongs to the page it was made on.** Merging the first two cells of
 * page one leaves page two alone — pages share the tracks, the bands and the
 * book's default paper, and nothing else. The ring drawn on that page and no
 * other says it once; the line under the buttons names the page in words,
 * because an owner three pages down cannot see which page they are changing.
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
  pending,
  page,
}: {
  selection: { cells: number; canMerge: boolean; canUnmerge: boolean }
  disabled: boolean
  onMerge: () => void
  onUnmerge: () => void
  addToSelection: boolean
  onToggleAddToSelection: () => void
  pending: 'merge' | 'unmerge' | null
  page: number | null
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
        {/*
          `loading` rather than a disabled button, because it holds the width and
          says *something is happening* rather than *you may not do this*. The
          grid is rebuilt and re-flowed server-side, so the wait is real and the
          artboard cannot move until it is over.
        */}
        <Button
          type="button"
          loading={pending === 'merge'}
          disabled={disabled || !selection.canMerge}
          onClick={onMerge}
        >
          Merge
        </Button>
        <Button
          type="button"
          loading={pending === 'unmerge'}
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
        {/*
          **`secondary` when off, never `ghost`.** A ghost button on this tinted
          block is bold text with no border and no ground — beside two outlined
          pills it reads as a heading, not a control, and an owner has no reason
          to press it. Off it is an outlined pill like its neighbours; on it is
          the one primary in this panel, because blue carries active state.
        */}
        <Button
          type="button"
          aria-pressed={addToSelection}
          variant={addToSelection ? 'primary' : 'secondary'}
          onClick={onToggleAddToSelection}
        >
          Add to selection
        </Button>
      </div>

      {/*
        **Which page, by number, and it matters.** Merging changes the page the
        cells are on and no other, so the panel names it: an owner who has
        scrolled three pages down needs to know which page is about to change
        before they change it, and the selection ring alone only tells them once
        they have found it again.
      */}
      {(selection.canMerge || selection.canUnmerge) && page !== null ? (
        <p className="font-ui text-body-sm text-muted">
          This changes page <Figure value={page + 1} size="data-sm" /> only. Other
          pages keep their own layout.
        </p>
      ) : null}
    </div>
  )
}

/**
 * What one cell draws.
 *
 * **Every cell drew the book's offer card until this existed.** Merging changed a
 * cell's *shape* and the card re-laid itself out into its wide arrangement, which
 * looks like a different design and is not one. An owner wanting a brand block in
 * the top-left cell had no way to say so.
 *
 * **Choosing something that does not repeat moves the products.** A cell holding
 * a brand block takes no offer, so the offer that was there goes to the next cell
 * and the book grows by a page rather than losing it. That is the same rule pins
 * follow, and it is surprising enough that the panel says it in words *before*
 * the owner picks rather than leaving them to notice a product moved.
 *
 * **Grouped by whether a block repeats**, because that is the only distinction
 * that changes what the cell does. Names alone would not tell an owner that
 * "Ramadan band" is going to displace their rice.
 */
function Design({
  cell,
  blocks,
  offerCardBlockId,
  onChange,
  pending,
  disabled,
}: {
  cell: { regionId: string; blockId: string; takesProduct: boolean } | null
  blocks: { id: string; name: string; repeats: boolean }[]
  offerCardBlockId: string | null
  onChange: (blockId: string | null) => void
  pending: boolean
  disabled: boolean
}) {
  const cards = blocks.filter((block) => block.repeats)
  const panels = blocks.filter((block) => !block.repeats)

  return (
    <section className="flex flex-col gap-2 rounded-block bg-sand p-3">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Design</h3>

      {cell === null ? (
        <p className="font-ui text-body-sm text-muted">
          Pick one card on the page to change what it draws.
        </p>
      ) : (
        <>
          <Select
            label="This cell draws"
            value={cell.blockId === offerCardBlockId ? '' : cell.blockId}
            disabled={disabled || pending || blocks.length === 0}
            options={[
              { value: '', label: 'The offer card, like every other cell' },
              ...cards.map((block) => ({ value: block.id, label: `${block.name} — a card` })),
              ...panels.map((block) => ({
                value: block.id,
                label: `${block.name} — no product`,
              })),
            ]}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : event.target.value)
            }
          />

          {/*
            Said before it happens, not discovered afterwards. A cell that stops
            taking a product pushes every offer after it along by one, which an
            owner reads as their book having quietly rearranged itself.
          */}
          <p className="font-ui text-body-sm text-muted">
            {cell.takesProduct
              ? 'Blocks marked “no product” turn this cell into a panel, and the products move along to the next cell.'
              : 'This cell holds a panel, so it shows no product. The products flow around it.'}
          </p>
        </>
      )}
    </section>
  )
}
