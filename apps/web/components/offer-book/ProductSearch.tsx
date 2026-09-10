'use client'

import * as React from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { CatalogSearchHit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Figure } from '@/components/ui/figure'
import { displayName, packLabel } from '@/lib/catalog-display'

/**
 * Adding products one at a time. E6 — `docs/E6-create-flow.md` §2.3.
 *
 * **Lifted out of `NewBookForm` rather than rewritten**, because this half of
 * that screen was never the problem: search, add, remove, in order. What changed
 * around it is that it is now one of two ways in rather than the only one, and
 * that it is offered whether or not the shop has ever uploaded a spreadsheet.
 *
 * **Prices are not asked for here, and that is deliberate.** A price belongs to
 * an offer, and setting eleven of them in a form before seeing a single card is
 * the wrong order. Every offer starts at zero, carries the `no-price` flag, and
 * the book cannot publish until they are set. The other path — a price list —
 * arrives priced precisely because a sheet has one per row.
 */
type Props = {
  picked: CatalogSearchHit[]
  onChange: (picked: CatalogSearchHit[]) => void
  /** `createBook` caps the array; the message has to arrive before the request
   *  is refused, not after. */
  max: number
}

export function ProductSearch({ picked, onChange, max }: Props) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<CatalogSearchHit[]>([])
  const [searching, setSearching] = React.useState(false)

  // Debounced, because this fires per keystroke against a query that does
  // full-text ranking and a trigram join. 250ms is under the 400ms at which the
  // design system says to show a spinner at all.
  React.useEffect(() => {
    const term = query.trim()
    if (term === '') {
      setResults([])
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/catalog/search?q=${encodeURIComponent(term)}&limit=10`)
        const body = await res.json()
        // A search that fails leaves the last results up rather than clearing
        // them. An empty list would read as "no matches", which is a different
        // answer from "the request did not arrive".
        if (!cancelled && body.data) setResults(body.data.items)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const pickedIds = new Set(picked.map((product) => product.id))
  const full = picked.length >= max

  function add(product: CatalogSearchHit) {
    if (pickedIds.has(product.id) || full) return
    onChange([...picked, product])
  }

  function remove(id: string) {
    onChange(picked.filter((product) => product.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Input
          label="Search your catalog"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Basmati rice"
        />

        {query.trim() !== '' ? (
          <Card padding="compact">
            {results.length === 0 ? (
              // Zero results, not empty. A different message and no
              // illustration; the design system separates the two.
              <p className="font-ui text-body-sm text-muted">
                {searching ? 'Searching…' : `Nothing matches “${query.trim()}”.`}
              </p>
            ) : (
              <ul className="flex flex-col">
                {results.map((product) => {
                  const already = pickedIds.has(product.id)
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => add(product)}
                        disabled={already || full}
                        className="flex min-h-row w-full items-center justify-between gap-3 rounded-control px-2 text-start hover:bg-stone-100 disabled:opacity-disabled"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-ui text-body text-primary">
                            {displayName(product, 'en')}
                          </span>
                          <span className="truncate font-ui text-body-sm text-muted">
                            {[product.brandEn, packLabel(product)].filter(Boolean).join(' · ') ||
                              'No brand'}
                          </span>
                        </span>
                        {already ? (
                          <span className="font-ui text-body-sm text-muted">Added</span>
                        ) : (
                          <Plus className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        ) : (
          <p className="flex items-center gap-2 font-ui text-body-sm text-muted">
            <Search className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Search by name, brand or barcode.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-ui text-label font-medium text-secondary">
          In this book <Figure value={picked.length} size="data-sm" />
        </h3>

        {picked.length === 0 ? (
          <p className="font-ui text-body-sm text-muted">
            Nothing added yet. Each product becomes one offer, in the order you add it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {picked.map((product, index) => (
              <li key={product.id}>
                <Card padding="compact">
                  <div className="flex min-h-row items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <Figure value={index + 1} size="data-sm" className="text-muted" />
                      <span className="truncate font-ui text-body text-primary">
                        {displayName(product, 'en')}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      iconOnly
                      aria-label={`Remove ${displayName(product, 'en')}`}
                      onClick={() => remove(product.id)}
                    >
                      <X className="size-4" aria-hidden="true" strokeWidth={2} />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {full ? (
          <p className="font-ui text-body-sm text-caution-fg">
            That is the most a book can hold. Remove one to add another.
          </p>
        ) : null}
      </div>
    </div>
  )
}
