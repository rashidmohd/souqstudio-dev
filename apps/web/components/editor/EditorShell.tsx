'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import type { Block, BrandKit } from '@souqstudio/types'
import type { FlowPage } from '@souqstudio/engine'
import { Figure } from '@/components/ui/figure'
import { BookPage } from '@/components/editor/BookPage'
import { OfferTray } from '@/components/editor/OfferTray'
import {
  OfferProperties,
  SaveStatus,
  useFlaggedCount,
} from '@/components/editor/OfferProperties'
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
  gridProblems,
}: Props) {
  const hydrate = useEditorStore((state) => state.hydrate)
  const select = useEditorStore((state) => state.select)
  const selectedOfferId = useEditorStore((state) => state.selectedOfferId)
  const liveOffers = useEditorStore((state) => state.offers)
  const flagged = useFlaggedCount()

  // Hydrated in an effect rather than at module scope: the server payload is a
  // prop, and a store written during render would leak one book's offers into
  // the next book's first paint.
  React.useEffect(() => {
    hydrate({ bookId, offers })
  }, [hydrate, bookId, offers])

  // Before hydration the store is empty; drawing from the props keeps the first
  // paint identical to the server's and avoids a flash of an empty book.
  const drawn = Object.keys(liveOffers).length > 0
    ? liveOffers
    : Object.fromEntries(offers.map((offer) => [offer.id, offer]))

  return (
    <div className="flex min-h-screen flex-col bg-canvas-surround">
      <header className="flex flex-wrap items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
        >
          {/* Directional, so it mirrors in an Arabic interface. */}
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
          Offer books
        </Link>

        <h1 className="font-ui text-subhead text-primary">{title}</h1>

        <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
          {status}
        </span>

        <div className="ms-auto flex items-center gap-4 font-ui text-body-sm text-secondary">
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

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 overflow-auto border-b-hairline border-border-subtle bg-surface p-4 lg:order-first lg:w-72 lg:border-b-0 lg:border-e-hairline">
          <OfferTray bookId={bookId} />
        </aside>

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
                selectedOfferId={selectedOfferId}
                onSelectOffer={select}
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

        <aside className="w-full shrink-0 overflow-auto border-t-hairline border-border-subtle bg-surface p-4 lg:w-80 lg:border-s-hairline lg:border-t-0">
          <OfferProperties bookId={bookId} tiers={tiers} currency={currency} />
        </aside>
      </div>
    </div>
  )
}
