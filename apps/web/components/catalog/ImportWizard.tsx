'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogProductSummary, ImportRowStatus } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Select } from '@/components/ui/select'
import {
  CANONICAL_FIELDS,
  FIELD_LABEL,
  type CanonicalField,
  type ColumnMap,
  type MatchCandidate,
} from '@/lib/catalog-import'
import { displayName, packLabel, type CatalogLanguage } from '@/lib/catalog-display'

/**
 * E5-06 — upload a spreadsheet, say what its columns are, review what matched.
 *
 * Three phases in one component, because they are one task and the owner moves
 * forward through them without leaving. The phase is derived from what has been
 * loaded rather than stored as its own state, for the same reason the catalog
 * browser derives its view: a phase variable is a second thing able to disagree
 * with the data on screen.
 *
 * **The commit button states exactly what it is about to do** — how many
 * products it will create, how many rows it will link, how many it will leave
 * out. E5-06 says never auto-resolve an ambiguous match, and the spirit of that
 * extends to the whole screen: an owner pressing this must not be able to
 * create four hundred products without having been told the number.
 */

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

type Parsed = {
  importId: string
  filename: string
  headers: string[]
  columnMap: ColumnMap
  rowCount: number
  sample: string[][]
}

type ReviewRow = {
  id: string
  rowIndex: number
  raw: Record<string, string>
  status: ImportRowStatus
  catalogProductId: string | null
  candidates: MatchCandidate[]
  price: string | null
}

type Review = {
  rows: ReviewRow[]
  products: Record<string, CatalogProductSummary>
}

/** What the owner has decided about one row. */
type Decision =
  | { action: 'use'; catalogProductId: string }
  | { action: 'create' }
  | { action: 'skip' }

export function ImportWizard({ lang }: { lang: CatalogLanguage }) {
  const router = useRouter()

  const [parsed, setParsed] = React.useState<Parsed | null>(null)
  const [columnMap, setColumnMap] = React.useState<ColumnMap>({})
  const [review, setReview] = React.useState<Review | null>(null)
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({})

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<{ created: number; matched: number } | null>(null)

  // ── 1. Upload ─────────────────────────────────────────────────────────────
  async function onPickFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const authRes = await fetch('/api/v1/catalog/imports/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Browsers disagree about the type of a .csv, and some send nothing
          // at all for one. The server's list is wide and the parse decides.
          contentType: file.type || 'text/csv',
          contentLength: file.size,
        }),
      })
      const auth = await authRes.json()
      if (auth.error) return setError(auth.error.message)

      const put = await fetch(auth.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'text/csv' },
        body: file,
      })
      if (!put.ok) return setError('That file did not upload. Try again.')

      const createRes = await fetch('/api/v1/catalog/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: auth.data.key, filename: file.name }),
      })
      const created = await createRes.json()
      if (created.error) return setError(created.error.message)

      setParsed(created.data)
      setColumnMap(created.data.columnMap)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  // ── 2. Confirm the map ────────────────────────────────────────────────────
  async function confirmMap() {
    if (!parsed) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/catalog/imports/${parsed.importId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnMap }),
      })
      const result = await res.json()
      if (result.error) return setError(result.error.message)

      await loadReview(parsed.importId)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Every row, following the cursor to the end.
   *
   * **Not one page.** The commit sends a decision per row and applies them in
   * one transaction, so a review screen holding the first page and no more does
   * not show the owner less — it silently commits less, and the rows it never
   * loaded are simply not imported. `MAX_ROWS` on the upload is ten thousand,
   * so that gap was real for any sheet worth calling a price list.
   *
   * Paged at the route's maximum and looped, rather than asked for in one
   * request: the ceiling exists so a client cannot ask for an unbounded read,
   * and raising it for this caller would remove it for everyone.
   */
  async function loadReview(importId: string) {
    const rows: ReviewRow[] = []
    let products: Record<string, CatalogProductSummary> = {}
    let cursor: string | null = null

    // Bounded by MAX_ROWS / the page size, so a server that kept returning a
    // cursor could not spin here forever.
    for (let page = 0; page < 60; page += 1) {
      const query: string = cursor
        ? `?limit=200&cursor=${encodeURIComponent(cursor)}`
        : '?limit=200'
      const res: Response = await fetch(`/api/v1/catalog/imports/${importId}${query}`)
      const result = await res.json()
      if (result.error) return setError(result.error.message)

      rows.push(...result.data.rows)
      // Later pages carry the products their own rows reference, and several
      // rows across pages name the same product — so this merges rather than
      // replaces.
      products = { ...products, ...result.data.products }

      cursor = result.data.nextCursor
      if (!cursor) break
    }

    setReview({ rows, products })

    // The proposed decisions, all of them visible and all of them changeable.
    // An ambiguous row proposes nothing: E5-06 forbids picking its top score
    // silently, and proposing one would be picking it with extra steps.
    setDecisions(
      Object.fromEntries(
        rows.map((row): [string, Decision] => {
          if (row.status === 'MATCHED' && row.catalogProductId) {
            return [row.id, { action: 'use', catalogProductId: row.catalogProductId }]
          }
          if (row.status === 'UNMATCHED') return [row.id, { action: 'create' }]
          return [row.id, { action: 'skip' }]
        })
      )
    )
  }

  // ── 3. Commit ─────────────────────────────────────────────────────────────
  async function commit() {
    if (!parsed || !review) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/catalog/imports/${parsed.importId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisions: review.rows.map((row) => {
            const decision = decisions[row.id] ?? { action: 'skip' as const }
            return {
              rowId: row.id,
              action: decision.action,
              ...(decision.action === 'use'
                ? { catalogProductId: decision.catalogProductId }
                : {}),
            }
          }),
        }),
      })
      const result = await res.json()
      if (result.error) return setError(result.error.message)

      setDone({ created: result.data.created, matched: result.data.matched })
      router.refresh()
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  const counts = React.useMemo(() => {
    const values = Object.values(decisions)
    return {
      create: values.filter((d) => d.action === 'create').length,
      use: values.filter((d) => d.action === 'use').length,
      skip: values.filter((d) => d.action === 'skip').length,
    }
  }, [decisions])

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-card border-hairline border-border-subtle bg-surface p-6">
        <h2 className="font-display text-heading text-primary">Import finished</h2>
        <p className="font-ui text-body text-secondary">
          <Figure value={done.created} /> new products are in your catalog, and{' '}
          <Figure value={done.matched} /> rows were linked to products that already
          existed.
        </p>
        {/* Said plainly rather than left to be discovered: the prices came in
            with the sheet and are waiting on the editor that does not exist. */}
        <p className="font-ui text-body-sm text-muted">
          The prices from your sheet are saved with this import. They go into an offer
          book once the editor is built.
        </p>
        <div>
          <Button type="button" variant="primary" onClick={() => router.push('/catalog')}>
            Back to the catalog
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      {!parsed ? (
        <UploadStep busy={busy} onPick={(file) => void onPickFile(file)} />
      ) : !review ? (
        <MappingStep
          parsed={parsed}
          columnMap={columnMap}
          onChange={setColumnMap}
          busy={busy}
          onConfirm={() => void confirmMap()}
        />
      ) : (
        <ReviewStep
          review={review}
          decisions={decisions}
          onDecide={(rowId, decision) =>
            setDecisions((prev) => ({ ...prev, [rowId]: decision }))
          }
          onDecideMany={(rowIds, decision) =>
            setDecisions((prev) => {
              const next = { ...prev }
              for (const rowId of rowIds) next[rowId] = decision
              return next
            })
          }
          counts={counts}
          busy={busy}
          lang={lang}
          onCommit={() => void commit()}
        />
      )}
    </div>
  )
}

function UploadStep({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (file: File) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* The one place in this flow that takes an illustration: a first-run
          prompt with nothing in progress, which is the same test the design
          system applies to `EmptyState`. The mapping and review steps get
          none — the owner is mid-task there and artwork above a decision
          delays it. */}
      <FileDropzone
        label="Bring in your price list"
        accept=".csv,text/csv,application/csv,text/plain"
        illustration="import-upload"
        busy={busy}
        buttonLabel="Choose a CSV"
        onFile={onPick}
        // Both limits stated before the drop rather than as a rejection after
        // it: the format we cannot read yet, and the size the route refuses.
        hint="A CSV with one product per row, up to 5MB. Excel files are not supported yet — save as CSV first."
      />

      <p className="font-ui text-body-sm text-muted">
        Whatever your columns are called, you say what they mean on the next screen.
      </p>
    </div>
  )
}

function MappingStep({
  parsed,
  columnMap,
  onChange,
  busy,
  onConfirm,
}: {
  parsed: Parsed
  columnMap: ColumnMap
  onChange: (map: ColumnMap) => void
  busy: boolean
  onConfirm: () => void
}) {
  // A field may be used once. Offering an already-taken field in another
  // column's picker invites a map where two headers claim `nameEn`, and only
  // one of them would survive being applied.
  const taken = new Set(
    Object.values(columnMap).filter((field): field is CanonicalField => field !== null)
  )
  const hasName = taken.has('nameEn')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">What is in each column?</h2>
        <p className="font-ui text-body text-secondary">
          We have guessed from the headings in <strong>{parsed.filename}</strong>.
          Correct anything we got wrong — a column we read as a barcode when it is your own
          stock code would match every row against the wrong number.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {parsed.headers.map((header, index) => (
          <li
            key={header}
            className="flex flex-wrap items-end gap-3 rounded-card border-hairline border-border-subtle bg-surface p-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-ui text-label font-medium text-primary">{header}</span>
              {/* Their own first row under their own heading, so the decision is
                  made against the data rather than against the word. */}
              <span className="truncate font-ui text-body-sm text-muted">
                {parsed.sample
                  .map((row) => row[index])
                  .filter((value) => value && value.trim() !== '')
                  .slice(0, 3)
                  .join(' · ') || 'No values in this column'}
              </span>
            </div>

            <Select
              label="Means"
              placeholder="Ignore this column"
              value={columnMap[header] ?? ''}
              options={CANONICAL_FIELDS.map((field) => ({
                value: field,
                label: FIELD_LABEL[field],
                disabled: taken.has(field) && columnMap[header] !== field,
              }))}
              onChange={(event) =>
                onChange({
                  ...columnMap,
                  [header]: (event.target.value || null) as CanonicalField | null,
                })
              }
            />
          </li>
        ))}
      </ul>

      {!hasName ? (
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          Choose which column holds the product name. Nothing can be matched without it.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={!hasName}
          loading={busy}
          onClick={onConfirm}
        >
          Match <Figure value={parsed.rowCount} /> rows
        </Button>
      </div>
    </div>
  )
}

/**
 * How many rows are drawn at once.
 *
 * A first import against an empty catalog matches nothing, so "the rows that
 * need a decision" is *every* row — ten thousand of them at the `MAX_ROWS`
 * ceiling, and ten thousand list items is a page that stops responding. The
 * rest are not hidden: their decision is stated, they are counted on the commit
 * button, and they are all sent. Reviewing row nine thousand individually is
 * not a thing anyone does; knowing what happens to it is.
 */
const RENDER_LIMIT = 200

function needsDecision(row: ReviewRow): boolean {
  return row.status === 'AMBIGUOUS' || row.status === 'UNMATCHED'
}

function ReviewStep({
  review,
  decisions,
  onDecide,
  onDecideMany,
  counts,
  busy,
  lang,
  onCommit,
}: {
  review: Review
  decisions: Record<string, Decision>
  onDecide: (rowId: string, decision: Decision) => void
  onDecideMany: (rowIds: string[], decision: Decision) => void
  counts: { create: number; use: number; skip: number }
  busy: boolean
  lang: CatalogLanguage
  onCommit: () => void
}) {
  const [showAll, setShowAll] = React.useState(false)

  const attention = review.rows.filter(needsDecision)
  const settled = review.rows.length - attention.length
  const listed = showAll ? review.rows : attention
  const drawn = listed.slice(0, RENDER_LIMIT)
  const undrawn = listed.length - drawn.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Check the matches</h2>
        <p className="font-ui text-body text-secondary">
          Rows we could not place with confidence are yours to decide. We never pick
          between two close matches on your behalf.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-card border-hairline border-border-subtle bg-surface p-3">
        <p className="flex-1 font-ui text-body-sm text-secondary">
          <Figure value={attention.length} /> of <Figure value={review.rows.length} />{' '}
          rows need a decision. The other <Figure value={settled} /> matched on their own.
        </p>

        {review.rows.length > attention.length ? (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="rounded-control font-ui text-body-sm text-link underline"
          >
            {showAll ? 'Show only what needs deciding' : 'Show every row'}
          </button>
        ) : null}
      </div>

      {/* One decision applied to a whole set, because the first import against
          an empty catalog is thousands of rows that all want the same answer.
          It is scoped to what is listed, so it can never quietly touch a row
          the owner is not looking at. */}
      {attention.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ui text-body-sm text-secondary">
            For all <Figure value={listed.length} /> listed:
          </span>
          <Button
            type="button"
            onClick={() => onDecideMany(listed.map((row) => row.id), { action: 'create' })}
          >
            Add all as new
          </Button>
          <Button
            type="button"
            onClick={() => onDecideMany(listed.map((row) => row.id), { action: 'skip' })}
          >
            Leave all out
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {drawn.map((row) => (
          <ReviewRowItem
            key={row.id}
            row={row}
            products={review.products}
            decision={decisions[row.id] ?? { action: 'skip' }}
            onDecide={(decision) => onDecide(row.id, decision)}
            lang={lang}
          />
        ))}
      </ul>

      {undrawn > 0 ? (
        <p role="status" className="font-ui text-body-sm text-muted">
          <Figure value={undrawn} /> more rows are not drawn here, to keep this page
          responsive. They are still part of the import and the decision below counts
          them — use the buttons above to set them all at once.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 rounded-card border-hairline border-border-subtle bg-surface p-4">
        {/* The whole point of this line: nobody presses the button without
            having been told the number of products it creates. */}
        <p className="font-ui text-body text-secondary">
          This will create <Figure value={counts.create} /> new products, link{' '}
          <Figure value={counts.use} /> rows to products you already have, and leave{' '}
          <Figure value={counts.skip} /> rows out.
        </p>
        <div>
          <Button type="button" variant="primary" loading={busy} onClick={onCommit}>
            Finish import
          </Button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  MATCHED: 'Matched',
  AMBIGUOUS: 'Needs a decision',
  UNMATCHED: 'Not in the catalog',
  CREATED: 'Created',
  SKIPPED: 'Left out',
}

function ReviewRowItem({
  row,
  products,
  decision,
  onDecide,
  lang,
}: {
  row: ReviewRow
  products: Record<string, CatalogProductSummary>
  decision: Decision
  onDecide: (decision: Decision) => void
  lang: CatalogLanguage
}) {
  // Their own row, in their own words. Not a parsed approximation of it —
  // E5-06 is explicit that this is what the review screen shows.
  const ownWords = Object.values(row.raw)
    .filter((value) => value && value.trim() !== '')
    .join(' · ')

  return (
    <li className="flex flex-col gap-2 rounded-card border-hairline border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 font-ui text-body text-primary">{ownWords}</p>
        <span className="font-ui text-eyebrow uppercase text-muted">
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      {row.price ? (
        <Figure value={row.price} currency="AED" size="data-sm" className="text-secondary" />
      ) : null}

      {row.candidates.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-ui text-label font-medium text-primary">
            Which one is it?
          </span>
          <ul className="flex flex-wrap gap-2">
            {row.candidates.map((candidate) => {
              const product = products[candidate.catalogProductId]
              if (!product) return null
              const chosen =
                decision.action === 'use' &&
                decision.catalogProductId === candidate.catalogProductId

              return (
                <li key={candidate.catalogProductId}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() =>
                      onDecide({
                        action: 'use',
                        catalogProductId: candidate.catalogProductId,
                      })
                    }
                    className={
                      chosen
                        ? 'rounded-pill bg-selected-bg px-3 py-1 font-ui text-body-sm text-selected-fg'
                        : 'rounded-pill border-hairline border-border-strong px-3 py-1 font-ui text-body-sm text-secondary'
                    }
                  >
                    {displayName(product, lang)}
                    {packLabel(product) ? ` · ${packLabel(product)}` : ''}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ActionChip
          label="Add as new"
          active={decision.action === 'create'}
          onClick={() => onDecide({ action: 'create' })}
        />
        <ActionChip
          label="Leave out"
          active={decision.action === 'skip'}
          onClick={() => onDecide({ action: 'skip' })}
        />
      </div>
    </li>
  )
}

function ActionChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-pill bg-selected-bg px-3 py-1 font-ui text-body-sm text-selected-fg'
          : 'rounded-pill border-hairline border-border-strong px-3 py-1 font-ui text-body-sm text-secondary'
      }
    >
      {label}
    </button>
  )
}
