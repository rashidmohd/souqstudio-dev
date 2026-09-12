'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, PanelLeftClose, TriangleAlert } from 'lucide-react'
import type { Block, BrandKit, PageBackground, Pin, SlotOverride } from '@souqstudio/types'
import type { FlowPage } from '@souqstudio/engine'
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

  // One request shape for the two tabs that write to the grid. The route takes
  // a delta, so each control sends only its own field.
  const grid = useGridPatch(bookId, pages.length)

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
                error={grid.error}
                headerBlocks={headerBlocks}
                footerBlocks={footerBlocks}
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
