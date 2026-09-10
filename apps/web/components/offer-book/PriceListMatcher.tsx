'use client'

import * as React from 'react'
import { AlertTriangle, Check, HelpCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { displayName, packLabel } from '@/lib/catalog-display'
import { FIELD_LABEL, inferColumnMap, parsePrice } from '@/lib/catalog-import'
import { parseSheet } from '@/lib/csv'
import type { MatchedRow } from '@/components/offer-book/match-types'

/**
 * Starting a book from a price list. E6 — `docs/E6-create-flow.md` §2.3.
 *
 * **An owner holding the sheet they were going to make a flyer from used to have
 * no way to say so.** The old screen offered "from a spreadsheet" only when the
 * organization already had a *committed* import, which meant going to
 * `/catalog/import` on an earlier visit, mapping columns, reviewing matches and
 * committing the sheet into the catalog. That is a different job — adding
 * products a shop sells — and requiring it first turned making a flyer into
 * editing the catalog.
 *
 * So this is the whole thing, inline, in one sitting, and **it writes nothing to
 * the catalog**. The sheet is parsed here, the names are matched by
 * `POST /api/v1/offer-books/match`, the owner resolves what is ambiguous, and
 * the answers become the book's offers.
 *
 * **The column map is inferred and not asked about.** `inferColumnMap` already
 * guesses name and price from the header spellings that turn up in real sheets,
 * in English and Arabic. E5-06 puts a mapping *screen* in front of everyone
 * because its stakes are permanent — a wrong guess there matches every row
 * against the wrong number and then writes products. Here the stakes are one
 * flyer, the wrong guess is visible immediately in the match table, and the
 * recovery is a select at the top of it. Showing the mapping screen to everyone
 * to serve the sheets it gets wrong is a step the majority does not need.
 */
type Props = {
  /** Rows the owner has resolved, lifted so the wizard can create from them. */
  onResolved: (rows: Array<{ catalogProductId: string; price: string | null }>) => void
  max: number
}

type Sheet = { headers: string[]; rows: string[][] }

/** What the owner chose for a row the matcher could not decide. Keyed by row index. */
type Picks = Record<number, string | null>

export function PriceListMatcher({ onResolved, max }: Props) {
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [nameColumn, setNameColumn] = React.useState('')
  const [priceColumn, setPriceColumn] = React.useState('')
  const [matched, setMatched] = React.useState<MatchedRow[] | null>(null)
  const [picks, setPicks] = React.useState<Picks>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function read(file: File) {
    setError(null)
    const reader = new FileReader()

    reader.onerror = () => setError('That file could not be read. Try saving it again as CSV.')
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const parsed = parseSheet(text)

      if (parsed.rows.length === 0) {
        setError('That file has no rows in it.')
        return
      }

      const guess = inferColumnMap(parsed.headers)
      const columnFor = (field: string): string =>
        parsed.headers.find((header) => guess[header] === field) ?? ''

      setSheet({ headers: parsed.headers, rows: parsed.rows })
      setNameColumn(columnFor('nameEn'))
      setPriceColumn(columnFor('price'))
      setMatched(null)
      setPicks({})
    }

    reader.readAsText(file)
  }

  async function match() {
    if (sheet === null || nameColumn === '') return
    setError(null)
    setBusy(true)

    const nameAt = sheet.headers.indexOf(nameColumn)
    const priceAt = priceColumn === '' ? -1 : sheet.headers.indexOf(priceColumn)

    const rows = sheet.rows
      .map((row) => ({
        name: (row[nameAt] ?? '').trim(),
        // `parsePrice` and not `Number()`. A cell can read `AED 9,50` or
        // `12.900`, and it returns a decimal string or null rather than routing
        // money through a binary float.
        price: priceAt === -1 ? null : parsePrice(row[priceAt] ?? ''),
      }))
      // A row with no name cannot be matched against anything. Dropped here
      // rather than sent and rejected, so the table shows rows, not failures.
      .filter((row) => row.name !== '')
      .slice(0, max)

    if (rows.length === 0) {
      setBusy(false)
      setError('No row in that column has a product name in it. Pick a different column.')
      return
    }

    try {
      const res = await fetch('/api/v1/offer-books/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const body = await res.json()

      if (!res.ok || body.error) {
        setError(body.error?.message ?? 'Those rows could not be matched. Try again.')
        return
      }

      setMatched(body.data.rows)
      setPicks({})
    } catch {
      setError('Those rows could not be matched. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * What the wizard will create from: matched rows, plus the ambiguous ones the
   * owner resolved. Unmatched rows contribute nothing.
   *
   * **Ordered by the sheet.** An owner who arranged their spreadsheet by aisle
   * expects the flyer to follow it, which is the same rule
   * `createBookFromImport` states about `rowIndex`.
   */
  const resolved = React.useMemo(() => {
    if (matched === null) return []
    return matched.flatMap((row) => {
      const productId = row.product?.id ?? picks[row.index] ?? null
      return productId === null ? [] : [{ catalogProductId: productId, price: row.price }]
    })
  }, [matched, picks])

  React.useEffect(() => onResolved(resolved), [resolved, onResolved])

  if (sheet === null) {
    return (
      <div className="flex flex-col gap-2">
        <FileDropzone
          label="Upload a price list"
          accept=".csv,text/csv"
          onFile={read}
          hint="A CSV with a product name and a price in each row. Excel files are not supported yet, so save as CSV first."
          error={error ?? undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={FIELD_LABEL.nameEn}
          required
          options={sheet.headers.map((header) => ({ value: header, label: header }))}
          value={nameColumn}
          onChange={(event) => setNameColumn(event.target.value)}
          hint="The column we match against your catalog."
        />
        <Select
          label={FIELD_LABEL.price}
          options={[
            { value: '', label: 'No price column' },
            ...sheet.headers.map((header) => ({ value: header, label: header })),
          ]}
          value={priceColumn}
          onChange={(event) => setPriceColumn(event.target.value)}
          hint="Left out, every offer starts at zero."
        />
      </div>

      {matched === null ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={match} loading={busy}>
            Match <Figure value={sheet.rows.length} size="data-sm" /> rows
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSheet(null)}>
            <RotateCcw className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Different file
          </Button>
        </div>
      ) : (
        <MatchTable
          rows={matched}
          picks={picks}
          onPick={(index, id) => setPicks((current) => ({ ...current, [index]: id }))}
          onRestart={() => {
            setSheet(null)
            setMatched(null)
          }}
        />
      )}

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function MatchTable({
  rows,
  picks,
  onPick,
  onRestart,
}: {
  rows: MatchedRow[]
  picks: Picks
  onPick: (index: number, productId: string | null) => void
  onRestart: () => void
}) {
  const unmatched = rows.filter((row) => row.status === 'UNMATCHED').length
  const open = rows.filter(
    (row) => row.status === 'AMBIGUOUS' && (picks[row.index] ?? null) === null
  ).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-ui text-body-sm text-secondary">
          <Figure value={rows.length - unmatched - open} size="data-sm" /> of{' '}
          <Figure value={rows.length} size="data-sm" /> rows ready.
          {open > 0 ? ' Pick a product for the ones we could not decide.' : ''}
        </p>
        <Button type="button" variant="ghost" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Different file
        </Button>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.index}>
            <Card padding="compact">
              <div className="flex flex-col gap-2">
                <div className="flex min-h-row items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    {/* The owner's own row, in their own words. */}
                    <span className="truncate font-ui text-body text-primary" title={row.name}>
                      {row.name}
                    </span>
                    <RowResult row={row} picked={picks[row.index] ?? null} />
                  </span>
                  {row.price === null ? (
                    <span className="shrink-0 font-ui text-body-sm text-muted">No price</span>
                  ) : (
                    <span className="shrink-0 font-ui text-body-sm text-secondary">
                      AED <Figure value={row.price} size="data-sm" />
                    </span>
                  )}
                </div>

                {row.status === 'AMBIGUOUS' ? (
                  <div className="flex flex-wrap gap-1">
                    {row.candidates.map((candidate) => {
                      const chosen = picks[row.index] === candidate.product.id
                      return (
                        <button
                          key={candidate.product.id}
                          type="button"
                          onClick={() => onPick(row.index, chosen ? null : candidate.product.id)}
                          className={
                            chosen
                              ? 'min-h-control rounded-control border-hairline border-border-focus bg-selected-bg px-2 font-ui text-body-sm text-primary'
                              : 'min-h-control rounded-control border-hairline border-border-subtle px-2 font-ui text-body-sm text-secondary hover:bg-stone-100'
                          }
                        >
                          {displayName(candidate.product, 'en')}
                          {packLabel(candidate.product) ? ` · ${packLabel(candidate.product)}` : ''}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What happened to one row, in one line.
 *
 * Three outcomes and three treatments, because they are three different
 * messages: we found it, we could not decide, and it is not in your catalog.
 */
function RowResult({ row, picked }: { row: MatchedRow; picked: string | null }) {
  if (row.product !== null) {
    return (
      <span className="flex items-center gap-1 truncate font-ui text-body-sm text-positive-fg">
        <Check className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        {displayName(row.product, 'en')}
      </span>
    )
  }

  if (row.status === 'AMBIGUOUS') {
    const chosen = row.candidates.find((candidate) => candidate.product.id === picked)
    return chosen ? (
      <span className="flex items-center gap-1 truncate font-ui text-body-sm text-positive-fg">
        <Check className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        {displayName(chosen.product, 'en')}
      </span>
    ) : (
      <span className="flex items-center gap-1 font-ui text-body-sm text-caution-fg">
        <HelpCircle className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        More than one match. Pick one.
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 font-ui text-body-sm text-muted">
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
      Not in your catalog. This row is skipped.
    </span>
  )
}
