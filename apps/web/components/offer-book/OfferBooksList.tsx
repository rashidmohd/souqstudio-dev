'use client'

import { useRouter } from 'next/navigation'
import { Plus, CopyPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { EDITOR_BUILT } from '@/lib/features'

/**
 * The offer books list — home. E1-05 needs this route to exist; E6 fills it in.
 *
 * The New button and "Duplicate last week" are the two controls the design
 * skill says belong here, the second expected to be the most-used in the
 * product. Neither can work until E6's editor exists, so both are disabled with
 * the reason on screen rather than pointed at a route that 404s. Flip
 * `EDITOR_BUILT` in lib/features.ts in the change that adds the editor.
 */
type OfferBookSummary = {
  id: string
  title: string
  format: string
  status: string
  updatedAt: string
}

const NOT_YET = 'The editor is not built yet.'

export function OfferBooksList({ books }: { books: OfferBookSummary[] }) {
  const router = useRouter()

  if (books.length === 0) {
    return (
      <EmptyState
        kind="empty"
        title="No offer books yet"
        body="An offer book is a page of your products and prices, ready to send on WhatsApp or print."
        action={{
          label: 'Create your first offer book',
          disabled: !EDITOR_BUILT,
          disabledReason: EDITOR_BUILT ? undefined : NOT_YET,
          onClick: EDITOR_BUILT ? () => router.push('/editor/new') : undefined,
        }}
        // No illustration. `empty-offer-books` is still `todo` in the manifest,
        // and shipping a placeholder box where artwork belongs is explicitly
        // barred — see illustration-manifest.md.
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!EDITOR_BUILT}
          onClick={EDITOR_BUILT ? () => router.push('/editor/new') : undefined}
        >
          <Plus className="size-4" aria-hidden="true" />
          New offer book
        </Button>
        <Button type="button" variant="secondary" disabled={!EDITOR_BUILT}>
          <CopyPlus className="size-4" aria-hidden="true" />
          Duplicate last week
        </Button>
        {EDITOR_BUILT ? null : (
          <span className="font-ui text-body-sm text-muted">{NOT_YET}</span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {books.map((book) => (
          <li key={book.id}>
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
          </li>
        ))}
      </ul>
    </div>
  )
}
