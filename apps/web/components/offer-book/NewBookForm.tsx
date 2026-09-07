'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import type { CatalogSearchHit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Figure } from '@/components/ui/figure'
import { displayName, packLabel } from '@/lib/catalog-display'

/**
 * Starting an offer book. E6-02, the half of it that has to exist first.
 *
 * **Not the offer tray.** The tray lives inside the editor beside the artboard
 * and does more than this: reorder by dragging, group two products under one
 * offer with a connector, edit an offer already on the page. This is the step
 * before it — choosing what the book starts with — and it exists because
 * without it nothing in the product could create a book at all, and the artboard
 * had nothing to open.
 *
 * **Prices are not asked for here, deliberately.** A price belongs to an offer,
 * and setting eleven of them in a form before seeing a single card is the wrong
 * order — E6-03 puts them in the properties panel beside the artboard, where the
 * owner can see what they are pricing. Every offer starts at zero, carries the
 * `no-price` flag, and the book cannot publish until they are set.
 */
type Props = {
  /** Whether there is an active shop to create against. A book belongs to a
   *  shop, and the form cannot invent one. */
  hasShop: boolean
}

const FORMATS = [
  { value: 'leaflet', label: 'Leaflet — A4' },
  { value: 'catalog', label: 'Catalog — A4' },
  { value: 'a3', label: 'Poster — A3' },
  { value: 'instagram_post', label: 'Instagram post — square' },
  { value: 'story', label: 'Story — vertical' },
  { value: 'whatsapp', label: 'WhatsApp — square' },
  { value: 'print', label: 'Print — A4' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
]

/** `createBook` caps the array at 200; the message has to arrive before the
 *  request is refused, not after. */
const MAX_PRODUCTS = 200

export function NewBookForm({ hasShop }: Props) {
  const router = useRouter()

  const [title, setTitle] = React.useState('')
  const [format, setFormat] = React.useState('leaflet')
  const [language, setLanguage] = React.useState('en')
  const [picked, setPicked] = React.useState<CatalogSearchHit[]>([])

  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<CatalogSearchHit[]>([])
  const [searching, setSearching] = React.useState(false)

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
        // them — an empty list would read as "no matches", which is a different
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

  function add(product: CatalogSearchHit) {
    if (pickedIds.has(product.id) || picked.length >= MAX_PRODUCTS) return
    setPicked((current) => [...current, product])
  }

  function remove(id: string) {
    setPicked((current) => current.filter((product) => product.id !== id))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    // Never disable submit to enforce validation — a disabled button with no
    // explanation is a dead end. Submit, then say what is missing.
    if (title.trim() === '') return setError('Give the book a title.')
    if (picked.length === 0) return setError('Add at least one product.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/offer-books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          format,
          language,
          productIds: picked.map((product) => product.id),
        }),
      })
      const body = await res.json()

      if (!res.ok || body.error) {
        setError(body.error?.message ?? 'The book could not be created. Try again.')
        return
      }

      router.push(`/editor/${body.data.id}`)
    } catch {
      setError('The book could not be created. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!hasShop) {
    return (
      <p className="font-ui text-body text-secondary">
        Create a shop before making an offer book.
      </p>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label="Title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Week 37 offers"
        />
        <Select
          label="Format"
          options={FORMATS}
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        />
        <Select
          label="Language"
          options={LANGUAGES}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          hint="The book's own language, not the interface's."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Input
          label="Add products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Basmati rice"
        />

        {query.trim() !== '' ? (
          <Card padding="compact">
            {results.length === 0 ? (
              // Zero results, not empty — a different message and no
              // illustration. The design system separates the two.
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
                        disabled={already}
                        className="flex min-h-row w-full items-center justify-between gap-3 rounded-control px-2 text-start hover:bg-stone-100 disabled:opacity-40"
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
            Search your catalog by name, brand or barcode.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-ui text-subhead text-primary">
          In this book <Figure value={picked.length} size="data-sm" />
        </h2>

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
      </div>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={submitting}>
          Create offer book
        </Button>
        <span className="font-ui text-body-sm text-muted">
          Prices are set on the next screen.
        </span>
      </div>
    </form>
  )
}
