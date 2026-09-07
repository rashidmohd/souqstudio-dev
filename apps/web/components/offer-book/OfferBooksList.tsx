'use client'

import Link from 'next/link'
import { Plus, CopyPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { BOOK_CREATION_BUILT, EDITOR_BUILT } from '@/lib/features'

/**
 * The offer books list — home. E1-05 needs this route to exist; E6 fills it in.
 *
 * The New button and "Duplicate last week" are the two controls the design
 * skill says belong here, the second expected to be the most-used in the
 * product. **Both still disabled, and for a narrower reason than before:** the
 * artboard at `/editor/[id]` is built, so a row opens — but choosing the
 * products a new book starts from is the offer tray's job and the tray is not
 * built. Two flags rather than one, because the two became true at different
 * times. See `lib/features.ts`.
 */
type OfferBookSummary = {
  id: string
  title: string
  format: string
  status: string
  updatedAt: string
}

const NOT_YET = 'Choosing products for a new book is not built yet.'

export function OfferBooksList({ books }: { books: OfferBookSummary[] }) {
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
        }}
        illustration="empty-offer-books"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={!BOOK_CREATION_BUILT}>
          <Plus className="size-4" aria-hidden="true" />
          New offer book
        </Button>
        <Button type="button" variant="secondary" disabled={!BOOK_CREATION_BUILT}>
          <CopyPlus className="size-4" aria-hidden="true" />
          Duplicate last week
        </Button>
        {BOOK_CREATION_BUILT ? null : (
          <span className="font-ui text-body-sm text-muted">{NOT_YET}</span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {books.map((book) => (
          <li key={book.id}>
            {/* A row opens the artboard. Wrapped rather than given an onClick:
                the whole row is the target, and a link is what makes it
                middle-clickable, focusable and readable to a screen reader as a
                destination. */}
            <Row book={book} />
          </li>
        ))}
      </ul>
    </div>
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
