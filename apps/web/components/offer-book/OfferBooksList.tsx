'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, CopyPlus, FileText, Plus } from 'lucide-react'
import type { Block, BrandKit, PageBackground } from '@souqstudio/types'
import type { FlowPage } from '@souqstudio/engine'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { BookPage } from '@/components/editor/BookPage'
import { assetResolver } from '@/lib/block-assets'
import type { ComposedOffer } from '@/lib/offer-book-compose'
import { BOOK_CREATION_BUILT, EDITOR_BUILT } from '@/lib/features'

/**
 * The offer books list — home. E1-05 needs this route to exist; E6 fills it in.
 *
 * The New button and "Duplicate last week" are the two controls the design skill
 * says belong here, the second expected to be the most-used in the product.
 * **Both work now.** Duplicating copies the most recently updated book — its
 * grids, pins, offers, items, chips, notes and prices — and copies none of its
 * reach: the copy is a draft with its own short code, no link and no views.
 *
 * That is the weekly reissue, and it is cheap because a `flow` region binds to a
 * *position* in the product list rather than to a product. Last week's layout
 * with this week's prices is a copy plus some typing.
 */
type OfferBookSummary = {
  id: string
  title: string
  format: string
  status: string
  updatedAt: string
}

/**
 * A book's first page, composed on the server, ready to draw.
 *
 * **The real page at a small size, not a picture of it.** The artboard is inline
 * SVG produced from engine geometry, so a thumbnail is the same component the
 * editor and the preview use — which means it cannot disagree with the page it
 * stands for. A stored image would, the first time somebody changed a price.
 */
export type BookCover = {
  page: FlowPage
  size: { width: number; height: number }
  offers: Record<string, ComposedOffer>
  blocks: Record<string, Block>
  direction: 'ltr' | 'rtl'
  background: PageBackground | null
}

const NOT_YET = 'Creating an offer book is not built yet.'

export function OfferBooksList({
  books,
  covers,
  kit,
  shopName,
  assetBaseUrl,
}: {
  books: OfferBookSummary[]
  /** Keyed by book id. Present only for the ones with a drawn cover. */
  covers: Record<string, BookCover>
  kit: BrandKit
  shopName: string
  assetBaseUrl: string
}) {
  const router = useRouter()
  const [showingPast, setShowingPast] = React.useState(false)
  const asset = React.useMemo(() => assetResolver(assetBaseUrl), [assetBaseUrl])

  /**
   * Six on the screen and the rest behind a control.
   *
   * **A shop makes one of these a week**, so six is a month and a half — far
   * enough back to find last Ramadan's if you are looking, and short enough that
   * the screen is the two or three you actually reuse. Everything older is still
   * one click away and is a list rather than a grid, because by then you are
   * searching for a name rather than recognising a picture.
   */
  const recent = books.slice(0, 6)
  const past = books.slice(6)
  const [duplicating, setDuplicating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // The most recently updated book, which is what "last week" means to a shop
  // that makes one a week. Sorted by `updatedAt` on the server, so it is the
  // first row.
  const latest = books[0]

  async function duplicateLatest() {
    if (latest === undefined) return
    setDuplicating(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/offer-books/${latest.id}/duplicate`, { method: 'POST' })
      const body = (await res.json()) as {
        data: { id: string } | null
        error: { message: string } | null
      }
      if (body.data === null) {
        setError(body.error?.message ?? 'That book could not be duplicated.')
        return
      }
      // Straight into the copy: the next thing an owner does is change the
      // prices, and landing back on a list to find the row they just made is a
      // step that teaches nothing.
      router.push(`/editor/${body.data.id}`)
    } catch {
      setError('That book could not be duplicated. Check your connection.')
    } finally {
      setDuplicating(false)
    }
  }

  if (books.length === 0) {
    return (
      <EmptyState
        kind="empty"
        title="No offer books yet"
        body="An offer book is a page of your products and prices, ready to send on WhatsApp or print."
        action={{
          label: 'Create your first offer book',
          disabled: !BOOK_CREATION_BUILT,
          disabledReason: BOOK_CREATION_BUILT ? undefined : NOT_YET,
          onClick: BOOK_CREATION_BUILT ? () => router.push('/editor/new') : undefined,
        }}
        illustration="empty-offer-books"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!BOOK_CREATION_BUILT}
          onClick={BOOK_CREATION_BUILT ? () => router.push('/editor/new') : undefined}
        >
          <Plus className="size-4" aria-hidden="true" />
          New offer book
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={duplicating}
          onClick={() => void duplicateLatest()}
        >
          <CopyPlus className="size-4" aria-hidden="true" />
          Duplicate last week
        </Button>
      </div>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}

      {/* **A grid of what they look like, not a list of what they are called.**
          A shop's books are "last week's", "the Eid one" and "the one with the
          rice on the front" — recognised by sight long before the title is
          read. Three across on a desktop, two on a tablet, one on a phone. */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((book) => (
          <li key={book.id} className="flex">
            <BookTile
              book={book}
              cover={covers[book.id]}
              kit={kit}
              shopName={shopName}
              asset={asset}
            />
          </li>
        ))}
      </ul>

      {past.length > 0 ? (
        <div className="flex">
          <Button type="button" variant="secondary" onClick={() => setShowingPast(true)}>
            <Archive className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Earlier books <Figure value={past.length} size="data-sm" />
          </Button>
        </div>
      ) : null}

      {/* **A list, not a grid, and composing nothing.** By the time an owner is
          looking this far back they are searching for a name rather than
          recognising a picture — and a cover is a full composition per book,
          which is a cost worth paying six times and not forty. */}
      <Dialog
        open={showingPast}
        onOpenChange={setShowingPast}
        title="Earlier books"
        description="Everything older than the six on your home screen."
        size="lg"
      >
        <ul className="flex flex-col gap-2">
          {past.map((book) => (
            <li key={book.id}>
              <Row book={book} />
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

/**
 * One book, with its first page drawn on it.
 *
 * **The cover is the real page at a small size.** `BookPage` is the same
 * component the editor and the preview render, so this cannot drift from what
 * the book actually looks like — which a stored image would, the first time
 * somebody changed a price.
 *
 * `aspect-[3/4]` on the frame rather than letting the page set the height: a
 * grid of mixed heights reads as broken rather than as varied, and a book can be
 * a story, a poster or a booklet. The page is `object-contain` inside it, so a
 * square post sits in a portrait frame with space either side rather than
 * cropped.
 */
function BookTile({
  book,
  cover,
  kit,
  shopName,
  asset,
}: {
  book: OfferBookSummary
  cover: BookCover | undefined
  kit: BrandKit
  shopName: string
  asset: (assetId: string) => string | null
}) {
  const body = (
    <Card padding="compact" className="flex w-full flex-col gap-2">
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-100">
        {cover === undefined ? (
          // Not an error and not a spinner: a book whose first page could not be
          // composed still opens, and the tile says what it is rather than
          // pretending something is loading.
          <FileText className="size-icon-lg text-secondary" aria-hidden="true" strokeWidth={1.5} />
        ) : (
          <BookPage
            page={cover.page}
            size={cover.size}
            offers={cover.offers}
            blocks={cover.blocks}
            kit={kit}
            shopName={shopName}
            // The **book's** language, never the interface's.
            direction={cover.direction}
            background={cover.background}
            asset={asset}
            overrides={[]}
            selectedOfferId={null}
            // **Both dimensions constrained, so the page fits rather than
            // crops.** `BookPage` renders `width="100%"` with a viewBox and no
            // `preserveAspectRatio`, which defaults to `xMidYMid meet` — given a
            // height as well it letterboxes inside the frame, centred. Width
            // alone lets a tall page run past the bottom and the frame's
            // `overflow-hidden` cuts it off, which on a booklet is the half of
            // the page with the prices on it.
            className="h-full w-full"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate font-ui text-body text-primary" title={book.title}>
          {book.title}
        </span>
        <span className="font-ui text-body-sm text-muted">
          {book.status} · {book.format} ·{' '}
          <span data-figure>
            {new Date(book.updatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </span>
      </div>
    </Card>
  )

  if (!EDITOR_BUILT) return body

  return (
    <Link href={`/editor/${book.id}`} className="flex w-full rounded-card hover:bg-stone-100">
      {body}
    </Link>
  )
}

function Row({ book }: { book: OfferBookSummary }) {
  const body = (
    <Card padding="compact">
      <div className="flex min-h-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-ui text-body text-primary">{book.title}</span>
          <span className="font-ui text-body-sm text-muted">
            {book.status} · {book.format}
          </span>
        </div>
        <span className="font-ui text-body-sm text-muted" data-figure>
          {new Date(book.updatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>
    </Card>
  )

  // Not a link when the destination does not exist — the rule this file already
  // follows for the New button. A row that looks pressable and 404s is worse
  // than one that does not look pressable.
  if (!EDITOR_BUILT) return body

  return (
    <Link href={`/editor/${book.id}`} className="block rounded-card hover:bg-stone-100">
      {body}
    </Link>
  )
}
