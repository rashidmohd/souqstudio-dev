'use client'

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type {
  ApiResult,
  CatalogCategoryTile,
  CatalogProductSummary,
  CatalogSearchHit,
  Page,
} from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AddProductForm } from '@/components/catalog/AddProductForm'
import { CategoryTiles } from '@/components/catalog/CategoryTiles'
import { ProductCard } from '@/components/catalog/ProductCard'
import { EmptyState } from '@/components/shared/empty-state'
import {
  isBarcode,
  normalizeBarcode,
  type CatalogLanguage,
} from '@/lib/catalog-display'

/**
 * The catalog browser — E5-01 and E5-02 on one screen.
 *
 * Which of the three views is showing is **derived, never stored**: a query
 * shows results, a chosen category shows its products, neither shows the tiles.
 * A `view` state variable would be a fourth thing able to disagree with the
 * other three, and the bug it produces — tiles rendered over a query still
 * visible in the box — is one nobody reports because it looks deliberate.
 *
 * **Search and browse do not merge.** Typing while inside a category searches
 * within it, because an owner who navigated to Dairy and typed "milk" meant
 * Dairy. The breadcrumb stays on screen so the narrowing is never invisible.
 *
 * The two fetches keep **separate loading flags**. One shared flag lets the
 * browse effect's "nothing to load" path switch off a spinner the search effect
 * had just switched on, and the screen settles showing category tiles under a
 * query that is still running.
 */

/** E5-01: no search on every keystroke. */
const DEBOUNCE_MS = 300

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

type Trail = {
  category: CatalogCategoryTile
  subcategory: string | null
}

type Subcategory = { name: string; productCount: number }

type QueryResult =
  | { ok: true; items: CatalogSearchHit[]; scannedBarcode: string | null }
  | { ok: false; message: string }

/**
 * One query, two endpoints — E5-01 and E5-03.
 *
 * **A barcode never goes to full-text search.** The migration's trigger builds
 * `search_vector` from name, brand, category, spec and tags; `barcode` is not
 * in it, so a scanned code passed to `/catalog/search` matches nothing and the
 * screen would say "no products match that" about a product it holds. Routing
 * on the shape of the query is what makes the search box's own promise —
 * "product name, brand or barcode" — true.
 */
async function runQuery(q: string, category: string | null): Promise<QueryResult> {
  if (isBarcode(q)) {
    const res = await fetch(
      `/api/v1/catalog/barcode/${encodeURIComponent(normalizeBarcode(q))}`
    )
    const result: ApiResult<{ barcode: string; product: CatalogProductSummary | null }> =
      await res.json()

    if (result.error) return { ok: false, message: result.error.message }

    return {
      ok: true,
      items: result.data.product
        ? [{ ...result.data.product, matchedBy: 'barcode' }]
        : [],
      // Remembered even when nothing matched — especially then, because it is
      // what the "add this product" form starts from.
      scannedBarcode: result.data.barcode,
    }
  }

  const params = new URLSearchParams({ q })
  if (category) params.set('category', category)

  const res = await fetch(`/api/v1/catalog/search?${params.toString()}`)
  const result: ApiResult<{ items: CatalogSearchHit[] }> = await res.json()

  if (result.error) return { ok: false, message: result.error.message }
  return { ok: true, items: result.data.items, scannedBarcode: null }
}

export function CatalogBrowser({
  categories,
  lang,
}: {
  categories: CatalogCategoryTile[]
  lang: CatalogLanguage
}) {
  const [query, setQuery] = React.useState('')
  const [trail, setTrail] = React.useState<Trail | null>(null)

  const [hits, setHits] = React.useState<CatalogSearchHit[] | null>(null)
  const [browse, setBrowse] = React.useState<Page<CatalogProductSummary> | null>(null)
  const [subcategories, setSubcategories] = React.useState<Subcategory[]>([])

  /** The code behind a lookup that found nothing, so the add form starts from it. */
  const [scannedBarcode, setScannedBarcode] = React.useState<string | null>(null)
  /** Open with the name or code the owner was looking for when they gave up. */
  const [adding, setAdding] = React.useState(false)
  /**
   * Bumped after a product is added. It is a dependency of the search effect,
   * so the list the owner is looking at re-runs and their new product appears
   * in it — `router.refresh()` would re-render the server component and leave
   * this client-held result set exactly as it was.
   */
  const [reload, setReload] = React.useState(0)

  const [searchLoading, setSearchLoading] = React.useState(false)
  const [browseLoading, setBrowseLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const searching = query.trim().length > 0
  const loading = searching ? searchLoading : browseLoading

  // ── Search — E5-01 ────────────────────────────────────────────────────────
  //
  // The timer is cleared on every change and on unmount, so a request is only
  // ever issued for a query the owner stopped typing. `settled` guards the
  // *response* as well: fetches can land out of order, and the one that must
  // win is the one for the query currently in the box.
  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      setScannedBarcode(null)
      setSearchLoading(false)
      return
    }

    let settled = false
    setSearchLoading(true)

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await runQuery(q, trail ? trail.category.name : null)
          if (settled) return

          if (!result.ok) {
            setError(result.message)
            setHits([])
            setScannedBarcode(null)
            return
          }
          setError(null)
          setHits(result.items)
          setScannedBarcode(result.scannedBarcode)
        } catch {
          if (settled) return
          setError(NETWORK_ERROR)
          setHits([])
          setScannedBarcode(null)
        } finally {
          if (!settled) setSearchLoading(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      settled = true
      clearTimeout(timer)
    }
  }, [query, trail, reload])

  // ── Browse — E5-02 ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!trail) {
      setBrowse(null)
      setSubcategories([])
      setBrowseLoading(false)
      return
    }

    let settled = false
    setBrowseLoading(true)

    const params = new URLSearchParams({ category: trail.category.name })
    if (trail.subcategory) params.set('subcategory', trail.subcategory)

    void (async () => {
      try {
        // The subcategory list belongs to the category, not to the filtered
        // view, so it is fetched with the category name alone — narrowing to
        // one subcategory must not remove the others from the filter row.
        const [productsRes, subRes] = await Promise.all([
          fetch(`/api/v1/catalog/products?${params.toString()}`),
          fetch(
            `/api/v1/catalog/categories?parent=${encodeURIComponent(trail.category.name)}`
          ),
        ])
        const products: ApiResult<Page<CatalogProductSummary>> = await productsRes.json()
        const subs: ApiResult<{ subcategories: Subcategory[] }> = await subRes.json()

        if (settled) return
        if (products.error) {
          setError(products.error.message)
          setBrowse({ items: [], nextCursor: null })
          return
        }
        setError(null)
        setBrowse(products.data)
        setSubcategories(subs.error ? [] : subs.data.subcategories)
      } catch {
        if (settled) return
        setError(NETWORK_ERROR)
        setBrowse({ items: [], nextCursor: null })
      } finally {
        if (!settled) setBrowseLoading(false)
      }
    })()

    return () => {
      settled = true
    }
  }, [trail])

  async function loadMore() {
    if (!trail || !browse?.nextCursor || loadingMore) return
    setLoadingMore(true)

    const params = new URLSearchParams({
      category: trail.category.name,
      cursor: browse.nextCursor,
    })
    if (trail.subcategory) params.set('subcategory', trail.subcategory)

    try {
      const res = await fetch(`/api/v1/catalog/products?${params.toString()}`)
      const result: ApiResult<Page<CatalogProductSummary>> = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setError(null)
      // Appended rather than replaced: this is "show me more of the same list",
      // not a page the owner navigated to and could navigate back from.
      setBrowse((current) =>
        current
          ? {
              items: [...current.items, ...result.data.items],
              nextCursor: result.data.nextCursor,
            }
          : result.data
      )
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setLoadingMore(false)
    }
  }

  function reset() {
    setQuery('')
    setTrail(null)
  }

  const products: CatalogProductSummary[] | null = searching
    ? hits
    : (browse?.items ?? null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Input
          label="Search the catalog"
          type="search"
          // E5-01: the search input is the primary element of this screen and
          // is focused when it opens. Every other control here is a shortcut
          // to something this box can also reach.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            trail ? `Search in ${trail.category.name}` : 'Product name, brand or barcode'
          }
          hint="Search in English or Arabic — both find the same products."
        />

        {trail ? (
          <Breadcrumb
            trail={trail}
            lang={lang}
            onRoot={reset}
            onCategory={() => setTrail({ category: trail.category, subcategory: null })}
          />
        ) : null}

        {trail && subcategories.length > 0 ? (
          <SubcategoryFilter
            subcategories={subcategories}
            selected={trail.subcategory}
            onSelect={(name) => setTrail({ category: trail.category, subcategory: name })}
          />
        ) : null}
      </div>

      {error ? (
        <p
          role="status"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        // Five cards in one row: the shape the grid takes at its widest, so the
        // page does not reflow when the real tiles arrive.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} shape="card" />
          ))}
        </div>
      ) : products === null ? (
        <CategoryTiles
          categories={categories}
          lang={lang}
          onSelect={(category) => setTrail({ category, subcategory: null })}
        />
      ) : products.length === 0 ? (
        <ZeroResults
          searching={searching}
          scannedBarcode={scannedBarcode}
          onAdd={() => setAdding(true)}
          onReset={reset}
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} lang={lang} />
            ))}
          </ul>

          {/* Search returns a ranked top ten and does not page — asking for
              "more" of a relevance ranking means a better query, not a second
              page of worse answers. Browsing a category does page. */}
          {!searching && browse?.nextCursor ? (
            <div className="flex justify-center">
              <Button type="button" onClick={() => void loadMore()} loading={loadingMore}>
                Show more
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* E5-04. The dialog is mounted once here rather than inside the
          zero-results branch: rendering it there would unmount the form the
          moment the product is created and the list stops being empty, which
          takes the success path down with it. */}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a product"
        description="It goes into your own catalog straight away."
        // The form owns its own submit button, so the dialog's primary is the
        // way out. Two submit buttons for one form is the thing the Dialog
        // signature's single `primaryAction` exists to prevent, and the form
        // is the one that knows whether it is valid.
        primaryAction={{ label: 'Close', onClick: () => setAdding(false) }}
      >
        <AddProductForm
          categories={categories}
          {...(scannedBarcode
            ? { initialBarcode: scannedBarcode }
            : { initialName: query.trim() })}
          onDone={() => {
            setAdding(false)
            setReload((n) => n + 1)
          }}
          onCancel={() => setAdding(false)}
        />
      </Dialog>
    </div>
  )
}

/**
 * Two different nothings, and they do not say the same thing.
 *
 * A search that found nothing is the owner's query to fix. A category with no
 * products is the catalog's gap, and telling them to try fewer words would be
 * blaming them for an empty table. Both are `zero-results` rather than `empty` —
 * a question was asked in each case — which is also why neither carries an
 * illustration.
 */
function ZeroResults({
  searching,
  scannedBarcode,
  onAdd,
  onReset,
}: {
  searching: boolean
  scannedBarcode: string | null
  onAdd: () => void
  onReset: () => void
}) {
  // E5-04 is triggered by exactly this: a search or a scan that found nothing.
  // So the one CTA an `EmptyState` allows is the add, not the clear — the
  // search box is still on screen and clearing it costs a keystroke, whereas
  // "we do not have it, add it" is the move the owner came here to make.
  if (scannedBarcode) {
    return (
      <EmptyState
        kind="zero-results"
        title="No product with that barcode"
        body="Nothing in the shared catalog or yours carries that code. Add it and it is yours to use straight away."
        action={{ label: 'Add this product', onClick: onAdd }}
      />
    )
  }

  return searching ? (
    <EmptyState
      kind="zero-results"
      title="No products match that"
      body="Try fewer words, or the brand name printed on the pack. If we simply do not have it, add it yourself."
      action={{ label: 'Add this product', onClick: onAdd }}
    />
  ) : (
    <EmptyState
      kind="zero-results"
      title="Nothing in this category yet"
      body="The universal catalog does not cover this one yet, and you have not added your own products here."
      action={{ label: 'Back to categories', onClick: onReset }}
    />
  )
}

function Breadcrumb({
  trail,
  lang,
  onRoot,
  onCategory,
}: {
  trail: Trail
  lang: CatalogLanguage
  onRoot: () => void
  onCategory: () => void
}) {
  const label =
    lang === 'ar' ? (trail.category.nameAr ?? trail.category.name) : trail.category.name

  return (
    <nav aria-label="Catalog" className="flex flex-wrap items-center gap-1">
      <Crumb label="All categories" onClick={onRoot} />
      <Separator />
      {trail.subcategory ? (
        <>
          <Crumb label={label} onClick={onCategory} />
          <Separator />
          <Current label={trail.subcategory} />
        </>
      ) : (
        <Current label={label} />
      )}
    </nav>
  )
}

/**
 * The chevron is rotated in RTL rather than swapped for a left-pointing one.
 * It separates steps in reading order; it does not point at anything, so it
 * follows the direction of the text the way a slash would.
 */
function Separator() {
  return (
    <ChevronRight
      aria-hidden="true"
      className="size-4 shrink-0 text-muted rtl:rotate-180"
    />
  )
}

function Current({ label }: { label: string }) {
  return (
    <span aria-current="page" className="font-ui text-body-sm font-medium text-primary">
      {label}
    </span>
  )
}

function Crumb({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control font-ui text-body-sm text-link underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      {label}
    </button>
  )
}

/**
 * The subcategories inside a category, as a filter row.
 *
 * "Everything" is a member of the row rather than a separate clear control, so
 * the selected state always has somewhere to be and the row never renders with
 * nothing chosen.
 */
function SubcategoryFilter({
  subcategories,
  selected,
  onSelect,
}: {
  subcategories: Subcategory[]
  selected: string | null
  onSelect: (name: string | null) => void
}) {
  const options: Array<string | null> = [null, ...subcategories.map((s) => s.name)]

  return (
    <ul className="flex flex-wrap gap-2">
      {options.map((name) => (
        <li key={name ?? 'all'}>
          <button
            type="button"
            onClick={() => onSelect(name)}
            aria-pressed={selected === name}
            className={
              selected === name
                ? 'rounded-pill bg-selected-bg px-3 py-1 font-ui text-body-sm text-selected-fg'
                : 'rounded-pill border-hairline border-border-strong px-3 py-1 font-ui text-body-sm text-secondary'
            }
          >
            {name ?? 'Everything'}
          </button>
        </li>
      ))}
    </ul>
  )
}
