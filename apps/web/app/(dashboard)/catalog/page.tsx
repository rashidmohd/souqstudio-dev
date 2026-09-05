import type { Metadata } from 'next'
import { listCategories } from '@/lib/catalog'
import { requireCompliantSession } from '@/lib/session'
import { CatalogBrowser } from '@/components/catalog/CatalogBrowser'

export const metadata: Metadata = { title: 'Catalog · SouqStudio' }

/**
 * E5-01 and E5-02 — the product catalog browser.
 *
 * A plain member of layout family 1, wider than the settings screens because
 * the content is a five-column grid of product tiles rather than a column of
 * fields.
 *
 * The category tiles are read on the server and handed down: they are the first
 * thing on screen, they do not change while the owner is looking at them, and
 * fetching them from the client would put a spinner in front of the one view
 * that exists to be immediately useful. Everything after that first paint is
 * the owner's own query, so it belongs on the client.
 *
 * Read through lib/catalog.ts rather than through the API route, for the same
 * reason lib/shops.ts is read directly — a server component holding the
 * organization should not make a network round trip to reach its own database.
 */
export default async function CatalogPage() {
  const session = await requireCompliantSession()
  const categories = await listCategories(session)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Catalog</h1>
        <p className="font-ui text-body text-secondary">
          Search the shared catalog and your own products. Pick one to put it in an
          offer book.
        </p>
      </div>

      {/* The interface language is hardcoded to English in app/layout.tsx and
          this follows it rather than inventing a second answer. When the locale
          moves onto the session, this reads it from there and the component
          below already handles both. */}
      <CatalogBrowser categories={categories} lang="en" />
    </div>
  )
}
