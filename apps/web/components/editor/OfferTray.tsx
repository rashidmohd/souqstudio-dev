'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react'
import type { CatalogSearchHit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Figure } from '@/components/ui/figure'
import { useEditorStore } from '@/stores/editor-store'
import { displayName, packLabel } from '@/lib/catalog-display'

/**
 * The offer tray. E6-02.
 *
 * **The engine places; the owner orders.** Nothing here positions anything — the
 * tray decides *which* offers are in the book and in what sequence, and
 * `flowBook` decides which cell each one lands in. That separation is what makes
 * next week's book an edit rather than a rebuild.
 *
 * **Reordering is buttons, not drag, and that is deliberate for now.** The epic
 * says drag; the design system says every hover-revealed affordance needs a
 * persistent equivalent because the editor ships on tablet, and that long-press
 * drag is unreliable on iPad. Buttons are the persistent equivalent, they are
 * keyboard-operable for free, and they can be built correctly before drag rather
 * than retrofitted after. Drag is still owed — see `docs/E6-pending.md`.
 *
 * **Mutations go through the server and re-render.** No optimistic reordering:
 * unlike a price, a move changes what every *other* offer's position means, and
 * a failed optimistic reorder would leave the tray and the artboard disagreeing
 * about a book neither of them can now describe. Prices are optimistic precisely
 * because they are independent of each other.
 */
type Props = { bookId: string }

export function OfferTray({ bookId }: Props) {
  const router = useRouter()
  const order = useEditorStore((state) => state.order)
  const offers = useEditorStore((state) => state.offers)
  const selectedOfferId = useEditorStore((state) => state.selectedOfferId)
  const select = useEditorStore((state) => state.select)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * Drag state. **HTML5 drag-and-drop, and the up/down buttons stay.**
   *
   * The design system says long-press drag is unreliable on an iPad and asks for
   * a persistent equivalent, so the buttons were built first and are not a
   * fallback — they are the tablet path. This is the pointer one, and HTML5 DnD
   * is what gives it the browser's own drag image, autoscroll and escape-to-
   * cancel for nothing.
   */
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)

  async function mutate(request: () => Promise<Response>) {
    setBusy(true)
    setError(null)
    try {
      const res = await request()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? 'That did not save. Try again.')
        return
      }
      // The server component re-reads the book and the store re-hydrates from
      // it, so the artboard and the tray cannot drift apart.
      router.refresh()
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function move(offerId: string, by: -1 | 1) {
    const from = order.indexOf(offerId)
    const to = from + by
    if (from === -1 || to < 0 || to >= order.length) return

    const next = [...order]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)

    void mutate(() =>
      fetch(`/api/v1/offer-books/${bookId}/offers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerIds: next }),
      })
    )
  }

  /** Drop `dragged` where `target` currently sits, and send the whole order. */
  function dropOn(target: string) {
    const source = dragging
    setDragging(null)
    setOver(null)
    if (source === null || source === target) return

    const from = order.indexOf(source)
    const to = order.indexOf(target)
    if (from === -1 || to === -1) return

    const next = [...order]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)

    // The whole order, not a move: two tabs sending `{from, to}` against
    // different starting states interleave into an order neither owner chose.
    // The route refuses a partial list for the same reason.
    void mutate(() =>
      fetch(`/api/v1/offer-books/${bookId}/offers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerIds: next }),
      })
    )
  }

  function remove(offerId: string) {
    void mutate(() =>
      fetch(`/api/v1/offer-books/${bookId}/offers/${offerId}`, { method: 'DELETE' })
    )
  }

  function add(productId: string) {
    void mutate(() =>
      fetch(`/api/v1/offer-books/${bookId}/offers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productIds: [productId] }),
      })
    )
  }

  /**
   * The second product on the selected offer — E6-02's *"Pesto Rosso **or**
   * Pasta Sauce Basilico"*. One card, one price, two products.
   */
  function addToSelected(productId: string, connector: 'OR' | 'AND') {
    if (selectedOfferId === null) return
    void mutate(() =>
      fetch(`/api/v1/offer-books/${bookId}/offers/${selectedOfferId}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ catalogProductId: productId, connector }),
      })
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <AddProduct
        onAdd={add}
        onAddToSelected={addToSelected}
        selectedName={
          selectedOfferId === null ? null : (offers[selectedOfferId]?.name ?? null)
        }
        disabled={busy}
      />

      <div className="flex flex-col gap-2">
        <h2 className="font-ui text-label font-medium text-primary">
          In this book <Figure value={order.length} size="data-sm" />
        </h2>

        {order.length === 0 ? (
          <p className="font-ui text-body-sm text-muted">
            No offers yet. Search above to add one.
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {order.map((offerId, index) => {
              const offer = offers[offerId]
              if (offer === undefined) return null
              const selected = offerId === selectedOfferId

              return (
                <li
                  key={offerId}
                  draggable={!busy}
                  onDragStart={(event) => {
                    setDragging(offerId)
                    // Move, not copy — the cursor says which one this is, and a
                    // copy cursor on a reorder reads as "this will duplicate".
                    event.dataTransfer.effectAllowed = 'move'
                    // Firefox starts no drag at all without payload.
                    event.dataTransfer.setData('text/plain', offerId)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  onDragOver={(event) => {
                    if (dragging === null) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setOver(offerId)
                  }}
                  onDragLeave={() => setOver((current) => (current === offerId ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    dropOn(offerId)
                  }}
                  className={
                    // The drop target, marked with the same outline the system
                    // uses for focus rather than a colour of its own.
                    over === offerId && dragging !== offerId
                      ? 'rounded-control outline outline-2 outline-offset-2 outline-border-focus'
                      : undefined
                  }
                >
                  <div
                    className={[
                      selected
                        ? 'flex items-center gap-1 rounded-control bg-selected-bg p-1'
                        : 'flex items-center gap-1 rounded-control p-1 hover:bg-stone-100',
                      dragging === offerId ? 'opacity-50' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => select(offerId)}
                      aria-pressed={selected}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    >
                      <Figure value={index + 1} size="data-sm" className="text-muted" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-ui text-body-sm text-primary">
                          {offer.name}
                        </span>
                        {offer.flags.length > 0 ? (
                          <span className="font-ui text-body-sm text-caution-fg">
                            <Figure value={offer.flags.length} size="data-sm" /> to fix
                          </span>
                        ) : null}
                      </span>
                    </button>

                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move ${offer.name} earlier`}
                      disabled={busy || index === 0}
                      onClick={() => move(offerId, -1)}
                    >
                      <ChevronUp className="size-4" aria-hidden="true" strokeWidth={2} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move ${offer.name} later`}
                      disabled={busy || index === order.length - 1}
                      onClick={() => move(offerId, 1)}
                    >
                      <ChevronDown className="size-4" aria-hidden="true" strokeWidth={2} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove ${offer.name}`}
                      disabled={busy}
                      onClick={() => remove(offerId)}
                    >
                      <X className="size-4" aria-hidden="true" strokeWidth={2} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Catalog search, adding one product per tap.
 *
 * Debounced at 250ms — under the 400ms at which the design system says to show a
 * loading indicator at all, so a fast query never flashes one.
 */
function AddProduct({
  onAdd,
  onAddToSelected,
  selectedName,
  disabled,
}: {
  onAdd: (productId: string) => void
  onAddToSelected: (productId: string, connector: 'OR' | 'AND') => void
  /** The selected offer's name, or null when nothing is selected. Present is
   *  what makes the "or / and" actions appear at all. */
  selectedName: string | null
  disabled: boolean
}) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<CatalogSearchHit[]>([])
  const [searching, setSearching] = React.useState(false)

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
        const res = await fetch(`/api/v1/catalog/search?q=${encodeURIComponent(term)}&limit=8`)
        const body = await res.json()
        // A failed search leaves the last results up rather than clearing them:
        // an empty list reads as "no matches", which is a different answer from
        // "the request did not arrive".
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

  return (
    <div className="flex flex-col gap-2">
      <Input
        label="Add a product"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Basmati rice"
      />

      {query.trim() === '' ? (
        <p className="flex items-center gap-2 font-ui text-body-sm text-muted">
          <Search className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Search by name, brand or barcode.
        </p>
      ) : results.length === 0 ? (
        <p className="font-ui text-body-sm text-muted">
          {searching ? 'Searching…' : `Nothing matches “${query.trim()}”.`}
        </p>
      ) : (
        <ul className="flex flex-col">
          {results.map((product) => {
            const name = displayName(product, 'en')
            return (
              <li key={product.id} className="flex flex-col">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(product.id)}
                  className="flex min-h-row w-full items-center justify-between gap-2 rounded-control px-2 text-start hover:bg-stone-100 disabled:opacity-disabled"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-ui text-body-sm text-primary">{name}</span>
                    <span className="truncate font-ui text-body-sm text-muted">
                      {[product.brandEn, packLabel(product)].filter(Boolean).join(' · ') ||
                        'No brand'}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                </button>

                {/* Joining onto the selected offer, only when there is one.
                    Two words rather than a connector dropdown: the choice is
                    binary and naming it costs less than a control that has to
                    be opened to find out what is in it. */}
                {selectedName === null ? null : (
                  <span className="flex items-center gap-1 ps-2 pb-1">
                    <span className="font-ui text-body-sm text-muted">Join to selected:</span>
                    {(['OR', 'AND'] as const).map((connector) => (
                      <Button
                        key={connector}
                        type="button"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`Add ${name} to ${selectedName} with ${
                          connector === 'OR' ? 'or' : 'and'
                        }`}
                        onClick={() => onAddToSelected(product.id, connector)}
                      >
                        {connector === 'OR' ? 'or' : 'and'}
                      </Button>
                    ))}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
