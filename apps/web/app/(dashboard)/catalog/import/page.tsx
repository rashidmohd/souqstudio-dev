import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCompliantSession } from '@/lib/session'
import { ImportWizard } from '@/components/catalog/ImportWizard'

export const metadata: Metadata = { title: 'Import products · SouqStudio' }

/**
 * E5-06 — the spreadsheet import.
 *
 * Its own route rather than a dialog on `/catalog`. It is three steps with a
 * file upload in the middle and a review screen that can run to hundreds of
 * rows; a dialog that tall is a screen wearing a scrim, and losing the work to
 * a stray click outside it would be unforgivable at row four hundred.
 *
 * Everything here is the owner's own data and their own decisions, so the whole
 * thing is client-side after the session check. There is nothing to render on
 * the server that would not immediately be replaced.
 */
export default async function CatalogImportPage() {
  await requireCompliantSession()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/catalog"
          className="font-ui text-body-sm text-link underline"
        >
          Catalog
        </Link>
        <h1 className="font-display text-title text-primary">Import products</h1>
        <p className="font-ui text-body text-secondary">
          Bring in your own price list. We match each row against the catalog and you
          decide what happens to the rest.
        </p>
      </div>

      <ImportWizard lang="en" />
    </div>
  )
}
