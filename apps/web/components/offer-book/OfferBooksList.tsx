'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, CopyPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
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

const NOT_YET = 'Creating an offer book is not built yet.'

export function OfferBooksList({ books }: { books: OfferBookSummary[] }) {
  const router = useRouter()
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
