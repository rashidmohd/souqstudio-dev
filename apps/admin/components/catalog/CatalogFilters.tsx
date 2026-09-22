'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import type { CatalogFilters as Filters } from '@/lib/catalog-list'

/**
 * The catalog filter bar. E13-02.
 *
 * **Every filter is in the URL**, which is what makes a catalog view something
 * a reviewer can send to a colleague. It also means the server component above
 * does the filtering and this holds no product state at all.
 *
 * Changing any filter drops the cursor. Keeping it would page from a row that
 * is no longer in the result, which shows an empty page over a list that has
 * matches.
 */
export function CatalogFilters({
  filters,
  categories,
}: {
  filters: Filters
  categories: readonly string[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = useState(filters.q)

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === '') next.delete(key)
      else next.set(key, value)
    }
    next.delete('cursor')
    router.push(`/catalog?${next.toString()}`)
  }

  const filtered =
    filters.q !== '' ||
    filters.category !== '' ||
    filters.collection !== 'all' ||
    filters.archived !== 'active' ||
    filters.image !== 'any'

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          apply({ q: query.trim() })
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="catalog-search" className="text-label font-medium text-primary">
            Search
          </label>
          <Input
            id="catalog-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Almarai laban, or 6291001234567"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="catalog-collection" className="text-label font-medium text-primary">
            Collection
          </label>
          <Select
            id="catalog-collection"
            className="w-field-select"
            value={filters.collection}
            onChange={(event) => apply({ collection: event.target.value })}
          >
            <option value="all">Both</option>
            <option value="universal">Universal</option>
            <option value="private">Organization</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="catalog-category" className="text-label font-medium text-primary">
            Category
          </label>
          <Select
            id="catalog-category"
            className="w-field-select"
            value={filters.category}
            onChange={(event) => apply({ category: event.target.value })}
          >
            <option value="">Every category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="catalog-image" className="text-label font-medium text-primary">
            Image
          </label>
          <Select
            id="catalog-image"
            className="w-field-select"
            value={filters.image}
            onChange={(event) => apply({ image: event.target.value })}
          >
            <option value="any">Any</option>
            <option value="with">Has an image</option>
            <option value="without">No image</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="catalog-archived" className="text-label font-medium text-primary">
            State
          </label>
          <Select
            id="catalog-archived"
            className="w-field-select"
            value={filters.archived}
            onChange={(event) => apply({ archived: event.target.value })}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">Both</option>
          </Select>
        </div>

        <Button type="submit">Search</Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery('')
              router.push('/catalog')
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>
    </div>
  )
}
