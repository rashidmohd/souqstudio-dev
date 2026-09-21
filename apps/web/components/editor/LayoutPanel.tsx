'use client'

import * as React from 'react'
import { Ban, LayoutGrid, Pencil } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import type { BlockCategory } from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  DEFAULT_BAND_HEIGHT,
  GAP_STEPS,
  MARGIN_STEPS,
  MAX_BAND_HEIGHT,
  MIN_BAND_HEIGHT,
  MIN_BAND_WIDTH,
  nearestGapStep,
  nearestMarginStep,
} from '@/lib/offer-book-layout'
import { BlockPreview } from '@/components/blocks/BlockPreview'
import { PanelSection } from '@/components/editor/PanelSection'
import { bandBlocks, type Band as BandEnd } from '@/lib/band-blocks'
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
 * **This tab is the book, never one page.** Every control on it changes every
 * page at once, which is what an owner means by "three across" or "a footer on
 * every page". What one page does differently — its own paper, its merged cells
 * — is the Page tab, and keeping the two apart is what stopped the editor
 * asking "which page" in two different ways.
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
  /**
   * The card every cell draws, named. Null when the book has none stored,
   * which means the engine's own default.
   */
  cardName: string | null
  /** Open the picker at book scope. */
  onChangeCard: () => void
  /**
   * Open the card in the designer. Absent for a member who may not change
   * blocks — hidden rather than disabled, because no tier or permission they
   * can reach would turn it on.
   */
  onEditCard?: (() => void) | undefined
  /** Fraction of the page's shorter edge. */
  margin: number
  /** The gutter between cards, in the same units. */
  gap: number
  /** The running band at the top of every page, or null for none. */
  headerBlockId: string | null
  footerBlockId: string | null
  /**
   * How big each band is: height as a fraction of one body row, width as a
   * fraction of the page.
   *
   * Absent means the band is — there is no size for a band that does not exist —
   * so the sliders appear with the band and leave with it.
   */
  headerHeight?: number | undefined
  footerHeight?: number | undefined
  headerWidth?: number | undefined
  footerWidth?: number | undefined
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
   * Everything this shop could put in a cell or a band, drawn rather than named.
   *
   * **The arrangements travel, which is the point of this change.** The bands
   * used to take two lists of `{ id, name }` and render them as dropdowns, so an
   * owner chose the thing on every page of their book by reading "Corner flag
   * band" and hoping. Same payload the cell picker already carries; what it buys
   * here is the preview beside the control and the library browse behind it.
   *
   * Unfiltered: `lib/band-blocks.ts` decides what may be a header or a footer,
   * and both this panel and the picker read it, so the two cannot disagree about
   * what is eligible.
   */
  blocks: {
    id: string
    name: string
    repeats: boolean
    arrangements: Arrangement[]
    category: BlockCategory | null
  }[]
  /** The shop's colours, so a band preview is drawn in them. */
  kit: BrandKit
  /** Open the library browse for that end of the page. */
  onChangeHeader: () => void
  onChangeFooter: () => void
}

export function LayoutPanel({
  perRow,
  bodyRows,
  cardName,
  onChangeCard,
  onEditCard,
  margin,
  gap,
  headerBlockId,
  footerBlockId,
  headerHeight,
  footerHeight,
  headerWidth,
  footerWidth,
  cardFits,
  offerCount,
  pages,
  patch,
  busy,
  error,
  blocks,
  kit,
  onChangeHeader,
  onChangeFooter,
}: Props) {
  const bandName = (blockId: string | null): string =>
    blockId === null
      ? 'None'
      : (blocks.find((block) => block.id === blockId)?.name ?? 'A block from outside your library')

  return (
    <div className="flex flex-col gap-3">
      {/*
        **Three sections rather than one list, because the tab outgrew the
        rail.** It holds eleven controls, and the two an owner comes for — the
        cards across and what runs along the bottom — had drifted a scroll
        apart. Each remembers whether it was left open, and each says what it
        currently holds when it is not, so folding one does not mean opening it
        again to find out. `PanelSection` carries the rest of the reasoning.
      */}
      <PanelSection
        title="Page"
        rememberAs="layout-page"
        summary={
          <>
            <span data-figure>{perRow}</span> across ·{' '}
            <span data-figure>{pages}</span> {pages === 1 ? 'page' : 'pages'}
          </>
        }
      >
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
        **What every cell draws, and the two things an owner does to it.**
        Change is picking a different design; Edit is reworking the one they
        have. They were the same missing control for a long time and they are
        not the same act — one is a choice from sixty-five, the other opens a
        canvas — so they are two buttons rather than one menu.

        **Here rather than on the artboard**, because this is the book's card
        and everything else on this tab is the book's too. The artboard's
        equivalent changes *one cell*, which is the Page tab's business.

        A button showing the name, not a select. Sixty-five designs reduced to
        sixty-five names asks the owner to know what "Corner flag card" looks
        like, which is the knowledge the picker's previews exist to save them
        needing — the same argument `BlockPickerDialog` opens with.
      */}
      <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
        <div className="flex flex-col gap-px">
          <span className="font-ui text-label text-secondary">Offer card</span>
          <span className="font-ui text-body-sm text-primary">
            {cardName ?? 'The standard card'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onChangeCard}>
            <LayoutGrid className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Change
          </Button>
          {onEditCard === undefined ? null : (
            <Button type="button" variant="secondary" disabled={busy} onClick={onEditCard}>
              <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </div>

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
        **Beside the margin because they are one decision seen twice.** Both are
        white space measured off the shorter edge, and an owner tightening a page
        is choosing between them — a wider gutter and a narrower edge is a
        different flyer from the reverse. Two selects of named steps, adjacent,
        say that better than a paragraph would.

        **It is also what makes the Background tab mean anything.** Until this
        control existed the gap was whatever preset built the book, so a shop
        that set its paper to a deep navy got navy in a 2% hairline between cards
        and nowhere else. The ground is only visible in the gutter.
      */}
      <Select
        label="Gap between cards"
        value={String(nearestGapStep(gap).value)}
        disabled={busy}
        options={GAP_STEPS.map((step) => ({
          value: String(step.value),
          label: step.label,
        }))}
        onChange={(event) => patch({ gap: Number(event.target.value) })}
        hint="Where the page background shows through."
      />

      </PanelSection>

      {/*
        **Outside the sections, and deliberately.** It is the consequence of the
        track count *and* of the bands together — adding a header to a story is
        enough to reach it — so it belongs to neither, and a warning folded away
        inside a section an owner has closed is a warning nobody reads.

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

      <PanelSection
        title="Header"
        rememberAs="layout-header"
        summary={bandName(headerBlockId)}
      >
      <Band
        title="Header"
        empty="Nothing across the top of the page."
        band="header"
        blocks={blocks}
        kit={kit}
        value={headerBlockId}
        height={headerHeight}
        width={headerWidth}
        disabled={busy}
        onBrowse={onChangeHeader}
        onRemove={() => patch({ headerBlockId: null })}
        onHeight={(next) => patch({ headerHeight: next })}
        onWidth={(next) => patch({ headerWidth: next })}
      />
      </PanelSection>

      <PanelSection
        title="Footer"
        rememberAs="layout-footer"
        summary={bandName(footerBlockId)}
      >
      <Band
        title="Footer"
        empty="Nothing across the bottom of the page."
        band="footer"
        blocks={blocks}
        kit={kit}
        value={footerBlockId}
        height={footerHeight}
        width={footerWidth}
        disabled={busy}
        onBrowse={onChangeFooter}
        onRemove={() => patch({ footerBlockId: null })}
        onHeight={(next) => patch({ footerHeight: next })}
        onWidth={(next) => patch({ footerWidth: next })}
      />
      </PanelSection>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A running band, on every page: what it is, what it looks like, and the way to
 * change it.
 *
 * **It was a select, and a select cannot show a band.** An owner picked the
 * strip that would appear on every page of a printed book by reading its name
 * out of a dropdown — the exact fault `BlockPickerDialog`'s own note describes
 * about cards, left unfixed here because bands were built before that dialog
 * existed. The stake is higher, not lower: a card is wrong in one cell, a band
 * is wrong on every page.
 *
 * So the control is now what the owner is choosing — the band, drawn, at the
 * proportions it will actually have — and pressing it opens the library browse.
 * Choosing happens there, against previews, which is where it belongs.
 *
 * **Remove stays a separate button, unlike in the picker.** In the grid "None"
 * is one of the answers to "which band", and a tile among tiles is the honest
 * shape for that. Out here, with a band already set, taking it off is a thing
 * an owner wants to do in one press rather than by opening a dialog to pick
 * nothing — and the button only exists when there is something to remove.
 *
 * **`null` on the wire, and it has to be.** Absent means "leave it alone" to
 * `PATCH .../grid`; `null` means "remove it". If removal were sent as absent,
 * the route would rebuild from the stored grid and hand the band straight back.
 *
 * A band is what appears on **every** page. `Pins` is the other half: one page,
 * placed by the owner. The two look similar in a panel and are not the same
 * thing, so each says which it is.
 */
function Band({
  title,
  empty,
  band,
  blocks,
  kit,
  value,
  height,
  width,
  disabled,
  onBrowse,
  onRemove,
  onHeight,
  onWidth,
}: {
  title: string
  /** What "nothing here" means, said once, so the panel reads at a glance. */
  empty: string
  band: BandEnd
  blocks: Props['blocks']
  kit: BrandKit
  value: string | null
  height: number | undefined
  width: number | undefined
  disabled: boolean
  onBrowse: () => void
  onRemove: () => void
  onHeight: (height: number) => void
  onWidth: (width: number) => void
}) {
  const current = value === null ? undefined : blocks.find((block) => block.id === value)
  const available = bandBlocks(blocks, band).length

  /**
   * The sliders' live positions.
   *
   * **Local, and committed on release, exactly as the page background's blur
   * is.** Every step of a drag would rebuild the master grid and recompose every
   * page in the book; `patch` is debounced, but a debounce still fires mid-drag
   * and reflows the artboard under the owner's hand. The thumb has to move in
   * between or the control feels broken, so the position is state and the write
   * is a gesture ending.
   *
   * Percent rather than the stored fraction, so the readout says `34%` instead
   * of `0.34` — a number nobody can act on is the defect `Slider`'s own comment
   * describes.
   */
  const storedHeight = Math.round((height ?? DEFAULT_BAND_HEIGHT) * 100)
  const storedWidth = Math.round((width ?? 1) * 100)
  const [heightPercent, setHeightPercent] = React.useState(storedHeight)
  const [widthPercent, setWidthPercent] = React.useState(storedWidth)
  React.useEffect(() => setHeightPercent(storedHeight), [storedHeight])
  React.useEffect(() => setWidthPercent(storedWidth), [storedWidth])

  return (
    <section className="flex flex-col gap-2">
      {/*
        **No heading of its own any more — `PanelSection` names it.** Two
        "Header" labels one above the other is what the fold produced when this
        kept its own, and the section's is the one that stays visible when the
        controls are folded away. The Remove button stays here, because it acts
        on the band rather than on the section.
      */}
      {value === null ? null : (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" disabled={disabled} onClick={onRemove}>
            Remove {title.toLowerCase()}
          </Button>
        </div>
      )}

      {/*
        **The preview is the button.** An owner looking at the band and an owner
        about to change it are the same person a moment apart, so the thing on
        screen is the thing they press — the same gesture the offer card's own
        row in this panel uses.
      */}
      <button
        type="button"
        disabled={disabled || available === 0}
        onClick={onBrowse}
        className="flex w-full items-center gap-3 rounded-card border-hairline border-border-subtle p-2 text-start hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:opacity-disabled"
      >
        <span
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0"
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        >
          {current === undefined ? (
            <Ban className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            /* Drawn at the band's own proportions inside a fixed frame — a
               footer really is a thin strip and showing it as one is the
               information. `BlockTile` makes the same argument at grid size. */
            <BlockPreview
              arrangements={current.arrangements}
              kit={kit}
              {...previewSize(current)}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-ui text-label font-medium text-primary">
            {current !== undefined
              ? current.name
              : value === null
                ? 'None'
                : /* A band naming a block this shop can no longer pick — archived
                     since, or moved behind a plan. It goes on being drawn, and
                     the panel says so rather than showing "None" over a page
                     that plainly has a band on it. Same reasoning as `loadBlocks`
                     not filtering by status: a book already in print must go on
                     rendering what it was printed with. */
                  'A block that is no longer in your library'}
          </span>
          <span className="block font-ui text-body-sm text-secondary">
            {available === 0
              ? 'No blocks of this kind in your library yet.'
              : current === undefined && value === null
                ? empty
                : 'On every page.'}
          </span>
        </span>
      </button>

      {/*
        **The size controls appear with the band and leave with it.** There is
        no height for a header that does not exist, and a pair of dead sliders
        under "None" is two controls an owner has to work out do nothing.

        Height is a fraction of a *body row* rather than of the page, which is
        what keeps a band looking like a band at every page size — the reasoning
        `offer-book-layout.ts` carries. The readout is a percentage of a row, so
        100% is a band as tall as a row of cards.
      */}
      {current === undefined ? null : (
        <div className="flex flex-col gap-2">
          <Slider
            label="Height"
            min={MIN_BAND_HEIGHT * 100}
            max={MAX_BAND_HEIGHT * 100}
            step={1}
            unit="%"
            value={heightPercent}
            disabled={disabled}
            onValueChange={setHeightPercent}
            // Release, not change: each step rebuilds the master and recomposes
            // every page. Both events, because a slider is a keyboard control
            // as much as a pointer one.
            onPointerUp={() => commit(heightPercent, storedHeight, onHeight)}
            onKeyUp={() => commit(heightPercent, storedHeight, onHeight)}
            hint="As much as a row of cards, at 100%."
          />

          <Slider
            label="Width"
            min={MIN_BAND_WIDTH * 100}
            max={100}
            step={1}
            unit="%"
            value={widthPercent}
            disabled={disabled}
            onValueChange={setWidthPercent}
            onPointerUp={() => commit(widthPercent, storedWidth, onWidth)}
            onKeyUp={() => commit(widthPercent, storedWidth, onWidth)}
            hint="Narrower than the page, centred. Full width is edge to edge."
          />
        </div>
      )}
    </section>
  )
}

/**
 * Write a slider's value, unless it is the one already stored.
 *
 * Releasing without having moved is not a change, and without this every click
 * on the thumb costs a grid rebuild and a recompose of every page in the book.
 * The same guard `PageBackgroundControl.setBlur` makes, for the same reason.
 */
function commit(percent: number, stored: number, write: (value: number) => void): void {
  if (percent === stored) return
  write(percent / 100)
}

/**
 * The frame a band is previewed in, and the size the block is drawn at inside
 * it.
 *
 * Wider than it is tall, unlike a tile: this sits in a 320px rail beside its
 * own label, and a band is a wide, short object. `tileSize`'s reasoning, at the
 * proportions this frame has.
 */
const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 44

function previewSize(block: { repeats: boolean; arrangements: Arrangement[] }): {
  width: number
  height: number
} {
  const arrangement = block.arrangements[0]
  const natural =
    arrangement === undefined
      ? PREVIEW_WIDTH / PREVIEW_HEIGHT
      : Math.min(12, Math.max(0.4, Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)))

  return natural > PREVIEW_WIDTH / PREVIEW_HEIGHT
    ? { width: PREVIEW_WIDTH, height: Math.round(PREVIEW_WIDTH / natural) }
    : { width: Math.round(PREVIEW_HEIGHT * natural), height: PREVIEW_HEIGHT }
}
