'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, PanelLeftClose, TriangleAlert } from 'lucide-react'
import type { Block, BrandKit, PageBackground, Pin, SlotOverride } from '@souqstudio/types'
import {
  expandSpan,
  hasMergeIn,
  mergeSpan,
  spanArea,
  spansIntersect,
  unionSpan,
  unmergeSpan,
  type CellSpan,
  type FlowPage,
} from '@souqstudio/engine'
import { Figure } from '@/components/ui/figure'
import { BookPage } from '@/components/editor/BookPage'
import { LayoutPanel } from '@/components/editor/LayoutPanel'
import { PinsPanel } from '@/components/editor/PinsPanel'
import {
  BookToolRail,
  labelForTool,
  type BookTool,
} from '@/components/editor/BookToolRail'
import { PageBackgroundControl } from '@/components/editor/PageBackgroundControl'
import { useGridPatch } from '@/components/editor/use-grid-patch'
import { usePageMerges } from '@/components/editor/use-page-merges'
import { OfferTray } from '@/components/editor/OfferTray'
import {
  OfferProperties,
  SaveStatus,
  useFlaggedCount,
} from '@/components/editor/OfferProperties'
import { UndoRedo } from '@/components/editor/UndoRedo'
import { BookTitle } from '@/components/editor/BookTitle'
import { assetResolver } from '@/lib/block-assets'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import {
  CanvasDrawer,
  CanvasDrawerToggles,
  useCanvasDrawer,
} from '@/components/shared/canvas-drawer'
import { useEditorStore } from '@/stores/editor-store'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * The editor's client shell. E6-01.
 *
 * **All three panes**: offer tray (start), artboard (centre), properties (end),
 * per the design skill's editor family. Below 1024px the side panes stack rather
 * than compress the artboard — a squeezed canvas makes the whole product feel
 * cramped, and that rule is why they stack instead of shrinking.
 *
 * **The artboard is not a drawing surface.** Selecting a card sets logical state;
 * the engine still decides every rectangle. Nothing here positions anything, and
 * the tray decides only *which* offers are in the book and in what sequence.
 */
type Props = {
  bookId: string
  title: string
  status: string
  edition: 'en' | 'ar'
  page: { width: number; height: number }
  pages: FlowPage[]
  offers: ComposedOffer[]
  blocks: Record<string, Block>
  kit: BrandKit
  shopName: string
  tiers: { id: string; labelEn: string }[]
  currency: string
  /** Bounded nudges by page index, as stored. E6-04. */
  overrides: Record<number, SlotOverride[]>
  pins: Pin[]
  /** The master grid as a set of choices. `loadBook` reads it off the regions. */
  layout: {
    perRow: number
    bodyRows: number
    margin: number
    headerBlockId: string | null
    footerBlockId: string | null
    /** False when the offer card has no design for the shape this layout gives
     *  its cells, so it is being stretched. */
    cardFits: boolean
    /** The paper behind every card. Null is `--sq-tpl-paper`. */
    background: PageBackground | null
  }
  /**
   * Where uploaded artwork lives, for a page background and for any `image`
   * element inside a block.
   *
   * **The editor had no resolver at all until now**, which the designer has had
   * since E7 — so a block carrying artwork the owner uploaded drew *nothing*
   * here while looking right in the designer. Passed as a prop rather than read
   * from the environment because `R2_PUBLIC_URL` is a server variable and this
   * is a client component.
   */
  assetBaseUrl: string
  /** Static blocks this shop may pin. A repeating one reads an offer, and a pin
   *  has none. */
  pinnable: { id: string; name: string; season?: { starts: string } }[]
  /** Static blocks that can be a running band, by what they are for. A band on
   *  every page is a different thing from a pin on one. */
  headerBlocks: { id: string; name: string }[]
  footerBlocks: { id: string; name: string }[]
  gridProblems: { code: string }[]
}

export function EditorShell({
  bookId,
  title,
  status,
  edition,
  page,
  pages,
  offers,
  blocks,
  kit,
  shopName,
  tiers,
  currency,
  overrides,
  pins,
  layout,
  pinnable,
  headerBlocks,
  footerBlocks,
  assetBaseUrl,
  gridProblems,
}: Props) {
  const hydrate = useEditorStore((state) => state.hydrate)
  const select = useEditorStore((state) => state.select)
  const selectedOfferId = useEditorStore((state) => state.selectedOfferId)
  const liveOffers = useEditorStore((state) => state.offers)
  const markEscalated = useEditorStore((state) => state.markEscalated)
  const cellAnchor = useEditorStore((state) => state.cellAnchor)
  const cellFocus = useEditorStore((state) => state.cellFocus)
  const cellPage = useEditorStore((state) => state.cellPage)
  const selectCell = useEditorStore((state) => state.selectCell)
  const clearCells = useEditorStore((state) => state.clearCells)
  const flagged = useFlaggedCount()
  const drawer = useCanvasDrawer()
  // Deterministic and memoised: a new function identity per render would make
  // every page re-draw its artwork on any state change.
  const asset = React.useMemo(() => assetResolver(assetBaseUrl), [assetBaseUrl])
  // The shop's colours, for the page-background picker. `BookPage` resolves its
  // own from the same kit; this is the panel's copy of the same read.
  const palette = React.useMemo(() => resolvePalette(kit), [kit])

  /**
   * Which tool's settings the start pane is showing.
   *
   * Local rather than in the store or the URL: it is a view preference with no
   * consequence, nothing else reads it, and a book deep-linked to its Background
   * tab is not a thing anyone has asked to share.
   */
  const [tool, setTool] = React.useState<BookTool>('offers')

  /**
   * Whether the settings panel beside the rail is showing.
   *
   * Open by default: an editor whose settings start collapsed is one where the
   * first thing an owner has to discover is how to see anything at all. The
   * collapse is for reclaiming width once they know where things are.
   */
  const [panelOpen, setPanelOpen] = React.useState(true)

  /**
   * Whether a tap on a cell extends the selection rather than starting one.
   *
   * Local, like `tool`: it is a modifier on the next gesture, nothing outside
   * this shell reads it, and it has no meaning once the editor is closed.
   */
  const [addToSelection, setAddToSelection] = React.useState(false)

  // One request shape for the two tabs that write to the grid. The route takes
  // a delta, so each control sends only its own field.
  const grid = useGridPatch(bookId, pages.length)
  const pageMergeWriter = usePageMerges(bookId)

  /**
   * The rectangle the owner's two corners imply, with merges taken in whole.
   *
   * **Derived here rather than in the store, because this is where the merges
   * are.** A selection that half-covers a merged hero has to grow to cover all
   * of it — there is no L-shaped merge to make from an L-shaped selection, and
   * every spreadsheet does the same — and `expandSpan` is what does that. The
   * store holds two corners and no opinion about the grid's shape.
   */
  /** The page the selection belongs to, and what it has already merged. */
  const selectedPage = React.useMemo(
    () => (cellPage === null ? undefined : pages.find((p) => p.index === cellPage)),
    [cellPage, pages]
  )
  const pageMerges = React.useMemo(() => selectedPage?.merges ?? [], [selectedPage])

  const selectionSpan = React.useMemo<CellSpan | null>(() => {
    if (cellAnchor === null || cellFocus === null) return null
    return expandSpan(unionSpan(cellAnchor, cellFocus), pageMerges)
  }, [cellAnchor, cellFocus, pageMerges])

  /**
   * What the panel needs to know about the selection, in its own words.
   *
   * **Cells rather than regions is the count an owner is shown**, because the
   * selection is a rectangle in cell space and "four cells" is what they drew. A
   * count of regions would say "two" for a hero plus a card, which is true of
   * the grid and not of the gesture.
   *
   * **`canMerge` is about regions, though.** Merging is only an operation when
   * it combines two of them: a selection sitting entirely inside one merged hero
   * covers four cells and has nothing to merge.
   */
  const selection = React.useMemo(() => {
    if (selectionSpan === null || selectedPage === undefined) {
      return { cells: 0, canMerge: false, canUnmerge: false }
    }

    const covered = selectedPage.cells.filter((cell) =>
      spansIntersect(cell.body, selectionSpan)
    )
    return {
      cells: spanArea(selectionSpan),
      canMerge: covered.length > 1,
      canUnmerge: hasMergeIn(pageMerges, selectionSpan),
    }
  }, [pageMerges, selectedPage, selectionSpan])

  const bounds = { perRow: layout.perRow, bodyRows: layout.bodyRows }

  /**
   * **Merges are not optimistic, and that is deliberate.** Every rectangle on
   * this artboard comes from the engine running over the stored master, so a
   * merge drawn before the write landed would be a second layout engine in the
   * client — the thing this editor has avoided since it was built. A background
   * is a colour and can paint ahead of its save; a merge changes what the page
   * *is*. The buttons disable while the write is in flight and the page redraws
   * when it returns.
   */
  /**
   * The cell edit the owner is waiting on, if any.
   *
   * **`useGridPatch.busy` is not this.** That flag follows the *fetch*, and the
   * fetch resolves long before the page changes: `router.refresh()` is not
   * awaited, so every control came back to life and then nothing moved for nine
   * seconds. An owner pressing Merge and watching their page sit still for nine
   * seconds has been told, as clearly as an interface can, that the button does
   * not work.
   */
  const [pendingCells, setPendingCells] = React.useState<'merge' | 'unmerge' | null>(null)

  // The new layout has landed — `pages` is a fresh array on every server render
  // — so whatever was in flight is now on screen.
  React.useEffect(() => {
    setPendingCells(null)
  }, [pages])

  const applyMerges = React.useCallback(
    (pageIndex: number, next: readonly CellSpan[], action: 'merge' | 'unmerge') => {
      setPendingCells(action)
      // Cleared on failure only. A *success* is not the end of the wait — the
      // route has written the row, but the artboard does not move until
      // `router.refresh()` has re-run the flow engine and the new props land,
      // which is the effect below.
      void pageMergeWriter.write(pageIndex, next).then((ok) => {
        if (!ok) setPendingCells(null)
      })
    },
    [pageMergeWriter]
  )


  /**
   * Selection is cleared when the grid changes shape under it.
   *
   * A merge that no longer fits is dropped by `composeGrid` rather than clipped,
   * so after a track-count change the owner's two corners may describe cells the
   * book no longer has. Keeping them would draw a ring around nothing and offer
   * a Merge button for it.
   */
  React.useEffect(() => {
    clearCells()
  }, [clearCells, layout.perRow, layout.bodyRows])

  /**
   * Leaving the Layout tool puts the cells away.
   *
   * The grid hairlines and the selection ring are chrome drawn over the owner's
   * flyer, and the whole point of the artboard is that they can judge how it
   * looks. They go when the tool that needs them goes.
   */
  React.useEffect(() => {
    if (tool !== 'layout') {
      clearCells()
      // The extend mode goes with them. Coming back to Layout and finding the
      // first tap silently extending a selection that is no longer on screen is
      // the kind of sticky mode nobody remembers arming.
      setAddToSelection(false)
    }
  }, [clearCells, tool])

  /**
   * The background as the owner is currently seeing it, before the server has
   * been told.
   *
   * **Every colour control in this product emits continuously** — the native
   * picker fires while it is being dragged, a range input fires per pixel, and
   * the gradient bar fires per pointermove. Waiting for a round trip to repaint
   * the artboard makes the whole panel feel broken, and it was: each of those
   * events used to be its own PATCH, rebuilding the grid and re-running the flow
   * engine through `router.refresh()`.
   *
   * So the draft paints immediately and `patchSoon` stores it once the owner
   * stops moving. `undefined` means no local edit — the stored value is what
   * shows.
   *
   * **Cleared on failure, not kept.** The design system's rule for an optimistic
   * update is that a failure reverts *that field* and names it; the panel's error
   * line is the naming. Keeping a draft the server rejected would show an owner a
   * background their book does not have.
   */
  const [draftBackground, setDraftBackground] = React.useState<
    PageBackground | null | undefined
  >(undefined)

  const shownBackground =
    draftBackground === undefined ? layout.background : draftBackground

  // Once a write lands, `router.refresh()` brings the stored value back down and
  // the draft has nothing left to say.
  React.useEffect(() => setDraftBackground(undefined), [layout.background])

  // One set for the whole book, assembled from the pages. Each page reports its
  // own, so the union has to be held here rather than replaced per page — page
  // two reporting nothing must not clear page one's flags.
  const escalatedByPage = React.useRef<Record<number, string[]>>({})

  // Hydrated in an effect rather than at module scope: the server payload is a
  // prop, and a store written during render would leak one book's offers into
  // the next book's first paint.
  React.useEffect(() => {
    // Where each card landed, so a nudge knows which page row to write to.
    // Derived from the flow rather than stored: the engine decides placement,
    // and a second copy of that answer is one that can be wrong.
    const placement: Record<string, { pageIndex: number; regionId: string }> = {}
    for (const flowPage of pages) {
      for (const spot of flowPage.placements) {
        if (spot.offerId !== null) {
          placement[spot.offerId] = { pageIndex: flowPage.index, regionId: spot.sourceId }
        }
      }
    }

    hydrate({ bookId, offers, overrides, placement })
  }, [hydrate, bookId, offers, overrides, pages])

  // Before hydration the store is empty; drawing from the props keeps the first
  // paint identical to the server's and avoids a flash of an empty book.
  const drawn = Object.keys(liveOffers).length > 0
    ? liveOffers
    : Object.fromEntries(offers.map((offer) => [offer.id, offer]))

  // Before hydration the store is empty, so the first paint draws the server's
  // nudges — identical to what the server rendered, and no flash of an
  // un-nudged card.
  const liveOverrides = useEditorStore((state) => state.overrides)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas-surround">
      <header className="flex flex-wrap items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
        >
          {/* Directional, so it mirrors in an Arabic interface. */}
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
          Offer books
        </Link>

        <h1>
          <BookTitle bookId={bookId} title={title} />
        </h1>

        <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
          {status}
        </span>

        <div className="ms-auto flex items-center gap-4 font-ui text-body-sm text-secondary">
          <UndoRedo bookId={bookId} />
          <SaveStatus />
          <span>
            <Figure value={offers.length} size="data-sm" />{' '}
            {offers.length === 1 ? 'offer' : 'offers'}
          </span>
          <span>
            <Figure value={pages.length} size="data-sm" />{' '}
            {pages.length === 1 ? 'page' : 'pages'}
          </span>
          <span className="uppercase">{edition}</span>
        </div>
      </header>

      {/* A quality flag is a publish blocker, not decoration — E6-01. The count
          comes from the store, so it drops as prices are entered rather than
          waiting for a reload. */}
      {flagged > 0 ? (
        <p className="flex items-center gap-2 border-b-hairline border-border-subtle bg-caution-bg px-4 py-2 font-ui text-body-sm text-caution-fg">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
          <span>
            <Figure value={flagged} size="data-sm" /> of{' '}
            <Figure value={offers.length} size="data-sm" /> offers need attention before this
            book can publish.
          </span>
        </p>
      ) : null}

      {gridProblems.length > 0 ? (
        <p className="border-b-hairline border-border-subtle bg-critical-bg px-4 py-2 font-ui text-body-sm text-critical-fg">
          This book&rsquo;s page grid has {gridProblems.length} problem
          {gridProblems.length === 1 ? '' : 's'}:{' '}
          {gridProblems.map((problem) => problem.code).join(', ')}.
        </p>
      ) : null}

      <CanvasDrawerToggles
        open={drawer.open}
        onToggle={drawer.toggle}
        startLabel="Tools"
        endLabel="Offer"
      />

      {/* `relative`, because the drawers below `lg` position against this row —
          they have to cover the pages and not the header above them. */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        <CanvasDrawer
          side="start"
          open={drawer.open === 'start'}
          onClose={drawer.close}
          // Collapsed, the pane *is* the rail. Below `lg` it is a drawer the
          // owner opened on purpose, so the panel always shows there — hiding it
          // would leave a drawer containing a strip of icons they can already
          // reach. Same contract as the designer's.
          lgWidth={panelOpen ? 'lg:w-pane-start' : 'lg:w-tool-rail'}
        >
          <BookToolRail
            tool={tool}
            onSelect={(next) => {
              setTool(next)
              // Picking a tool while the panel is shut opens it. A rail that
              // changed a hidden panel would be four buttons that do nothing.
              setPanelOpen(true)
            }}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((open) => !open)}
          />

          <div
            className={
              panelOpen
                ? 'flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-3'
                : 'flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-3 lg:hidden'
            }
          >
            {/*
              **The heading is the visible label the icon rail owes.** The design
              system permits icon-only controls in an editor toolbar on condition
              the same action is reachable with a visible label elsewhere; this is
              that, and it doubles as the answer to "which of those four am I in".

              The close control sits beside it for the same reason the designer's
              does: a close belongs on the thing being closed, which is where
              anyone looks for it. The rail keeps its own copy, because once this
              pane is gone a control inside it is gone with it.
            */}
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
                {labelForTool(tool)}
              </h2>
              <button
                type="button"
                aria-label="Hide settings"
                aria-expanded={panelOpen}
                title="Hide settings"
                onClick={() => setPanelOpen(false)}
                className="hidden rounded-control p-1 text-secondary hover:bg-stone-100 lg:block"
              >
                <PanelLeftClose className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {/*
              Hidden rather than unmounted, so switching tools does not discard a
              gradient mid-edit or a pin form half filled.
            */}
            <div hidden={tool !== 'offers'}>
              <OfferTray bookId={bookId} />
            </div>

            <div hidden={tool !== 'layout'}>
              <LayoutPanel
                perRow={layout.perRow}
                bodyRows={layout.bodyRows}
                margin={layout.margin}
                headerBlockId={layout.headerBlockId}
                footerBlockId={layout.footerBlockId}
                cardFits={layout.cardFits}
                offerCount={offers.length}
                pages={grid.pages}
                patch={(next) => void grid.patch(next)}
                busy={grid.busy}
                error={grid.error ?? pageMergeWriter.error}
                headerBlocks={headerBlocks}
                footerBlocks={footerBlocks}
                selection={selection}
                addToSelection={addToSelection}
                onToggleAddToSelection={() => setAddToSelection((on) => !on)}
                pendingCells={pendingCells}
                selectedPage={cellPage}
                onMerge={() => {
                  if (selectionSpan === null || cellPage === null) return
                  applyMerges(cellPage, mergeSpan(pageMerges, selectionSpan, bounds), 'merge')
                }}
                onUnmerge={() => {
                  if (selectionSpan === null || cellPage === null) return
                  applyMerges(cellPage, unmergeSpan(pageMerges, selectionSpan), 'unmerge')
                }}
              />
            </div>

            <div hidden={tool !== 'background'}>
              <PageBackgroundControl
                value={shownBackground}
                onChange={(next) => {
                  setDraftBackground(next)
                  grid.patchSoon({ background: next }, (ok) => {
                    if (!ok) setDraftBackground(undefined)
                  })
                }}
                palette={palette}
                token={(ref) => resolveToken(palette, ref)}
                /*
                  **Never disabled while a write is in flight.** `grid.busy` was
                  wired here, so the control went dead mid-drag the moment a
                  request started and the gesture was lost. A debounced write has
                  nothing to protect against anyway: the next change simply
                  replaces the pending one.
                */
                disabled={false}
              />
              {grid.error !== null ? (
                <p className="pt-2 font-ui text-body-sm text-critical-fg" role="alert">
                  {grid.error}
                </p>
              ) : null}
            </div>

            <div hidden={tool !== 'pins'}>
              <PinsPanel
                bookId={bookId}
                pins={pins}
                blocks={pinnable}
                blockNames={Object.fromEntries(
                  Object.values(blocks).map((block) => [block.id, block.name])
                )}
                offerCount={offers.length}
                pageCount={pages.length}
                disabled={grid.busy}
              />
            </div>
          </div>
        </CanvasDrawer>

        <div className="flex flex-1 flex-col items-center gap-8 overflow-auto p-8">
          {pages.map((flowPage) => (
            <figure key={flowPage.index} className="flex w-full max-w-3xl flex-col items-center gap-2">
              <BookPage
                page={flowPage}
                size={page}
                offers={drawn}
                blocks={blocks}
                kit={kit}
                shopName={shopName}
                // The artboard follows the *book's* language, never the
                // interface's.
                direction={edition === 'ar' ? 'rtl' : 'ltr'}
                background={shownBackground}
                asset={asset}
                overrides={liveOverrides[flowPage.index] ?? overrides[flowPage.index] ?? []}
                selectedOfferId={selectedOfferId}
                onSelectOffer={select}
                /*
                  **Only while the Layout tool is up.** Cell selection and card
                  selection are two rings on one artboard, and an owner pricing
                  offers has no use for the second — so the grid, the hairlines
                  and the merge gesture arrive with the tool that names them and
                  leave with it. Everywhere else this is the artboard it was.
                */
                {...(tool === 'layout'
                  ? {
                      cells: flowPage.cells,
                      // Only the page that owns the selection draws a ring. A
                      // merge belongs to one page, so showing it on all of them
                      // would promise an edit that is not going to happen.
                      cellSelection: cellPage === flowPage.index ? selectionSpan : null,
                      onSelectCell: (cell, { extend, offerId }) => {
                        const extending = extend || addToSelection
                        selectCell(flowPage.index, cell.body, extending)
                        // A fresh pick means this card; extending a range does
                        // not, and swapping the properties panel for every cell
                        // the pointer crossed would make the gesture unusable.
                        if (!extending && offerId !== null) select(offerId)
                      },
                    }
                  : {})}
                onEscalated={(ids) => {
                  escalatedByPage.current[flowPage.index] = ids
                  markEscalated(Object.values(escalatedByPage.current).flat())
                }}
                className="rounded-artboard"
              />
              {/* On a chip rather than directly on the surround: the canvas
                  surround is the one dark surface in the product and the system
                  defines no ink token for it. Raised in `docs/E6-pending.md`. */}
              <figcaption className="rounded-pill bg-surface px-3 py-1 font-ui text-body-sm text-secondary">
                Page <Figure value={flowPage.index + 1} size="data-sm" />
              </figcaption>
            </figure>
          ))}
        </div>

        <CanvasDrawer
          side="end"
          open={drawer.open === 'end'}
          onClose={drawer.close}
          className="flex-col p-4"
        >
          <OfferProperties
            bookId={bookId}
            tiers={tiers}
            currency={currency}
            direction={edition === 'ar' ? 'rtl' : 'ltr'}
          />
        </CanvasDrawer>
      </div>
    </div>
  )
}
