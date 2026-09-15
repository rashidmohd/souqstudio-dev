'use client'

import * as React from 'react'
import { AlertTriangle, Check, HelpCircle, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { displayName, hasValidCheckDigit, normalizeBarcode, packLabel } from '@/lib/catalog-display'
import { FIELD_LABEL, inferColumnMap, parsePrice } from '@/lib/catalog-import'
import { parseSheet } from '@/lib/csv'
import {
  barcodeHint,
  guessOfferColumns,
  type MatchedRow,
  type ResolvedRow,
} from '@/components/offer-book/match-types'
import { parsePercent, readOfferType, resolvePrices } from '@/lib/offer-import'

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
 * guesses name, barcode and price from the header spellings that turn up in real
 * sheets, in English and Arabic. E5-06 puts a mapping *screen* in front of
 * everyone because its stakes are permanent — a wrong guess there matches every
 * row against the wrong number and then writes products. Here the stakes are one
 * flyer, the wrong guess is visible immediately in the match table, and the
 * recovery is a select at the top of it. Showing the mapping screen to everyone
 * to serve the sheets it gets wrong is a step the majority does not need.
 *
 * **Barcode is the strongest column on the sheet and this screen ignored it
 * until 15 September.** `POST /api/v1/offer-books/match` has always accepted one
 * and trusts it over any name score — a barcode is an identity where a name is a
 * guess — and the wizard sent only name and price, so a shop exporting from
 * their POS was matched on spelling alone. Nothing announced that; the matcher
 * simply did worse than it could.
 *
 * **A column named "SKU" is offered here and is usually not a barcode.** POS
 * exports label an internal item code that way, and `HEADER_HINTS` maps `sku`
 * and `code` onto this field because sometimes it is the GTIN. The guard is in
 * the route rather than here: a value that is not 8, 12, 13 or 14 digits, or
 * that fails the GS1 check digit, is dropped and the row falls back to matching
 * by name. So a mis-mapped column costs recall and never causes a wrong match —
 * which is the trade worth making, because the alternative is refusing the
 * column and losing every sheet that does put a real barcode under that header.
 * `barcodeStats` below is what tells the owner which of the two they have.
 */
type Props = {
  /** Rows the owner has resolved, lifted so the wizard can create from them. */
  onResolved: (rows: ResolvedRow[]) => void
  max: number
}

type Sheet = { headers: string[]; rows: string[][] }

/**
 * One row as it went to the matcher, plus everything the sheet said about its
 * promotion. **The matcher is not told any of it** — `/offer-books/match` is
 * explicit that it matches and does not read prices — so this is carried here
 * and handed to `POST /offer-books` once the owner is happy.
 */
/** The same option list four selects need: a "none" entry, then the headers. */
function columnOptions(headers: string[], none: string) {
  return [{ value: '', label: none }, ...headers.map((header) => ({ value: header, label: header }))]
}

type SentRow = {
  name: string
  barcode?: string
  price: string | null
  comparePrice: string | null
  chip?: { labelEn: string; labelAr: string | null }
  /** The sheet's percentage disagreed with its two prices. */
  mismatch: boolean
}

/** What the owner chose for a row the matcher could not decide. Keyed by row
 *  index, and also where an adopted row's new product id lands. */
type Picks = Record<number, string | null>

export function PriceListMatcher({ onResolved, max }: Props) {
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [nameColumn, setNameColumn] = React.useState('')
  const [barcodeColumn, setBarcodeColumn] = React.useState('')
  const [priceColumn, setPriceColumn] = React.useState('')
  const [wasColumn, setWasColumn] = React.useState('')
  const [percentColumn, setPercentColumn] = React.useState('')
  const [typeColumn, setTypeColumn] = React.useState('')
  const [matched, setMatched] = React.useState<MatchedRow[] | null>(null)
  /**
   * The rows as they were sent, keyed by the index the server answered with.
   *
   * **Because `MatchedRow.index` is a position in the *sent* array, not in the
   * sheet.** Rows with no name are dropped and the rest are sliced to `max`
   * before sending, so going back to `sheet.rows[index]` to find a barcode would
   * read a different line — silently, and only for sheets with a blank name in
   * them.
   */
  const [sent, setSent] = React.useState<SentRow[]>([])
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
      setBarcodeColumn(columnFor('barcode'))

      // The promotion columns get their own guess — see `guessOfferColumns`.
      const offer = guessOfferColumns(parsed.headers)
      setPriceColumn(offer.now)
      setWasColumn(offer.was)
      setPercentColumn(offer.percent)
      setTypeColumn(offer.type)
      setMatched(null)
      setPicks({})
    }

    reader.readAsText(file)
  }

  async function match() {
    if (sheet === null || nameColumn === '') return
    setError(null)
    setBusy(true)

    const at = (column: string) => (column === '' ? -1 : sheet.headers.indexOf(column))
    const nameAt = at(nameColumn)
    const barcodeAt = at(barcodeColumn)
    const priceAt = at(priceColumn)
    const wasAt = at(wasColumn)
    const percentAt = at(percentColumn)
    const typeAt = at(typeColumn)

    const rows: SentRow[] = sheet.rows
      .map((row) => {
        const barcode = barcodeAt === -1 ? '' : normalizeBarcode(row[barcodeAt] ?? '')

        /*
         * **The inversion happens here, once.** A till calls the shelf price
         * "price" and the promotion "offer price"; an offer calls the promotion
         * `price` and the shelf price `comparePrice`. `resolvePrices` takes the
         * sheet's words — `before` and `now` — so nothing downstream has to know
         * which of two numbers is the bigger one.
         *
         * `parsePrice` and not `Number()`: a cell can read `AED 9,50` or
         * `12.900`, and it returns a decimal string rather than routing money
         * through a binary float.
         */
        const prices = resolvePrices({
          before: wasAt === -1 ? null : parsePrice(row[wasAt] ?? ''),
          now: priceAt === -1 ? null : parsePrice(row[priceAt] ?? ''),
          percent: percentAt === -1 ? null : parsePercent(row[percentAt] ?? ''),
        })

        const type = typeAt === -1 ? { kind: 'none' as const } : readOfferType(row[typeAt] ?? '')

        return {
          name: (row[nameAt] ?? '').trim(),
          // Omitted rather than sent empty: the route's schema takes an optional
          // string, and `exactOptionalPropertyTypes` means `undefined` and
          // absent are the same thing here and an empty string is not.
          ...(barcode === '' ? {} : { barcode }),
          price: prices.price,
          comparePrice: prices.comparePrice,
          mismatch: prices.mismatch,
          ...(type.kind === 'none'
            ? {}
            : {
                chip: {
                  labelEn: type.labelEn,
                  // Only the closed set has a translation. An owner's own words
                  // reach the card in the language they wrote them.
                  labelAr: type.kind === 'known' ? type.labelAr : null,
                },
              }),
        }
      })
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
        // Only what matching needs. The promotion stays on the client until the
        // book is created — the route's own comment is explicit that it matches
        // and does not read prices, and sending it a was-price would invite it
        // to start.
        body: JSON.stringify({
          rows: rows.map(({ name, barcode, price }) => ({
            name,
            ...(barcode === undefined ? {} : { barcode }),
            price,
          })),
        }),
      })
      const body = await res.json()

      if (!res.ok || body.error) {
        setError(body.error?.message ?? 'Those rows could not be matched. Try again.')
        return
      }

      setMatched(body.data.rows)
      setSent(rows)
      setPicks({})
    } catch {
      setError('Those rows could not be matched. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * How many rows in the chosen column actually carry a barcode.
   *
   * **Because "SKU" is offered and is usually not one.** The route silently
   * drops a value that fails the GS1 check digit and falls back to the name,
   * which is the right behaviour and an invisible one: an owner who mapped their
   * internal item code would see a worse match rate and no reason for it. This
   * is the reason, said before the matching runs rather than after.
   *
   * Counted over the rows that will actually be sent — the same `max` slice and
   * the same name filter — so the figure cannot disagree with the table below.
   */
  const barcodeStats = React.useMemo(() => {
    if (sheet === null || barcodeColumn === '') return null
    const at = sheet.headers.indexOf(barcodeColumn)
    if (at === -1) return null

    const nameAt = nameColumn === '' ? -1 : sheet.headers.indexOf(nameColumn)
    const rows = sheet.rows
      .filter((row) => (row[nameAt] ?? '').trim() !== '')
      .slice(0, max)

    const valid = rows.filter((row) => hasValidCheckDigit(row[at] ?? '')).length
    return { valid, total: rows.length }
  }, [sheet, barcodeColumn, nameColumn, max])

  /**
   * What the wizard will create from: matched rows, plus the ambiguous ones the
   * owner resolved. Unmatched rows contribute nothing.
   *
   * **Ordered by the sheet.** An owner who arranged their spreadsheet by aisle
   * expects the flyer to follow it, which is the same rule
   * `createBookFromImport` states about `rowIndex`.
   */
  const resolved = React.useMemo<ResolvedRow[]>(() => {
    if (matched === null) return []
    return matched.flatMap((row) => {
      // **Every row, whether or not it matched.** The catalog is how an offer
      // finds its photograph, not a list of what a shop is allowed to promote —
      // and a grocery's private label is in nobody's universal catalog. An
      // unmatched row goes to the server with its name and is written into the
      // organization's own collection as the book is created.
      const productId = row.product?.id ?? picks[row.index] ?? null

      // **The promotion comes from `sent`, not from the match response.** The
      // matcher echoes the price it was given and knows nothing about the
      // was-price or the chip, by design.
      const source = sent[row.index]
      return [
        {
          catalogProductId: productId,
          name: row.name,
          ...(source?.barcode === undefined ? {} : { barcode: source.barcode }),
          price: source?.price ?? row.price,
          comparePrice: source?.comparePrice ?? null,
          ...(source?.chip === undefined ? {} : { chip: source.chip }),
        },
      ]
    })
  }, [matched, picks, sent])

  React.useEffect(() => onResolved(resolved), [resolved, onResolved])

  if (sheet === null) {
    return (
      <div className="flex flex-col gap-2">
        <FileDropzone
          label="Upload a price list"
          accept=".csv,text/csv"
          onFile={read}
          hint="A CSV with a product name in each row, and a barcode and price where you have them. Excel files are not supported yet, so save as CSV first."
          error={error ?? undefined}
        />
        {/* **A link rather than a Button.** It navigates to a file, and `Button`
            renders a `<button>` with no `asChild`; wrapping one to make it an
            anchor would be a second API for a component the inventory owns.
            Secondary to the drop either way — most owners already have a sheet,
            and this is for the one who is going to ask their POS for a new one. */}
        <p className="font-ui text-body-sm text-muted">
          Not sure of the format?{' '}
          <a
            href="/api/v1/catalog/price-list-template"
            download
            className="text-link underline-offset-2 hover:underline"
          >
            Download a template
          </a>{' '}
          with your own products in it, and hand it to whoever runs your till.
        </p>
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
          label={FIELD_LABEL.barcode}
          options={columnOptions(sheet.headers, 'No barcode column')}
          value={barcodeColumn}
          onChange={(event) => setBarcodeColumn(event.target.value)}
          hint={barcodeHint(barcodeStats)}
        />
        {/* **Named for the flyer, never for the till.** A POS calls the shelf
            price "price" and the promotion "offer price"; an offer calls the
            promotion `price` and the shelf price `comparePrice`. Echoing the
            sheet's words here is how the two get mapped the wrong way round and
            the wrong number ends up in the biggest type on the page. */}
        <Select
          label="Price now"
          options={columnOptions(sheet.headers, 'No price column')}
          value={priceColumn}
          onChange={(event) => setPriceColumn(event.target.value)}
          hint="What the customer pays. Left out, every offer starts at zero."
        />
        <Select
          label="Price before"
          options={columnOptions(sheet.headers, 'No was-price column')}
          value={wasColumn}
          onChange={(event) => setWasColumn(event.target.value)}
          hint="Printed struck through beside the price. Only used when it is higher."
        />
        <Select
          label="Discount %"
          options={columnOptions(sheet.headers, 'No discount column')}
          value={percentColumn}
          onChange={(event) => setPercentColumn(event.target.value)}
          hint="Used to work out the price when you have not given one. Never printed."
        />
        <Select
          label="Offer type"
          options={columnOptions(sheet.headers, 'No offer type column')}
          value={typeColumn}
          onChange={(event) => setTypeColumn(event.target.value)}
          hint="Buy 1 get 1 and the like. Anything we do not know is printed as you wrote it."
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
          sent={sent}
          picks={picks}
          busy={busy}
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
  sent,
  picks,
  busy,
  onPick,
  onRestart,
}: {
  rows: MatchedRow[]
  /** What the sheet said about each row's promotion, by the same index. */
  sent: SentRow[]
  picks: Picks
  busy: boolean
  onPick: (index: number, productId: string | null) => void
  onRestart: () => void
}) {
  // Counted as *still* unmatched: a row that has been adopted has a product now
  // and belongs with the ready ones, or the tally would keep reporting a problem
  // the owner has just solved.
  const unmatched = rows.filter(
    (row) => row.status === 'UNMATCHED' && (picks[row.index] ?? null) === null
  ).length
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

      {/* **Said once, not asked once.** These rows are not a problem to resolve:
          the catalog is how an offer finds its photograph, and a shop's own
          lines are in nobody's universal catalog. They are written into this
          organization's own collection as the book is created — not before, so
          an owner who uploads the wrong file and walks away leaves nothing
          behind. */}
      {unmatched > 0 ? (
        <Card padding="compact">
          <p className="font-ui text-body-sm text-secondary">
            <Figure value={unmatched} size="data-sm" />{' '}
            {unmatched === 1 ? 'row is' : 'rows are'} new to your catalog. They go in this
            book and are added to your products, so they match on their own next time.
          </p>
          <p className="pt-1 font-ui text-body-sm text-muted">
            Their cards show a placeholder until you add a photo.
          </p>
        </Card>
      ) : null}

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
                  <RowPrice source={sent[row.index]} />
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
 * What the sheet said this row costs, and what it called the promotion.
 *
 * **Shown before the book exists, because this is the last moment it is
 * cheap to fix.** A was-price mapped to the wrong column prints the wrong number
 * in the largest type on the page, and the flyer is where anyone finds out.
 *
 * The strikethrough is drawn struck through: the owner is checking that the
 * mapping is right, and a was-price rendered as plain text beside a price is two
 * numbers with no relationship on the screen where the relationship is the thing
 * being checked.
 */
function RowPrice({ source }: { source: SentRow | undefined }) {
  if (source === undefined || source.price === null) {
    return <span className="shrink-0 font-ui text-body-sm text-muted">No price</span>
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-baseline gap-2">
        {source.comparePrice === null ? null : (
          <span className="font-ui text-body-sm text-muted line-through">
            <Figure value={source.comparePrice} size="data-sm" />
          </span>
        )}
        <span className="font-ui text-body-sm text-secondary">
          AED <Figure value={source.price} size="data-sm" />
        </span>
      </span>

      {source.chip === undefined ? null : (
        <span className="rounded-chip bg-sand px-2 font-ui text-body-sm text-primary">
          {source.chip.labelEn}
        </span>
      )}

      {source.mismatch ? (
        // A percentage column that does not agree with the two prices is a
        // stale export — the prices were updated and the percentage was not.
        // The prices win; this says so rather than silently preferring one.
        <span className="font-ui text-body-sm text-caution-fg">
          Discount % does not match these prices. The prices are used.
        </span>
      ) : null}
    </span>
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

  if (picked !== null) {
    // Adopted. It has a product now, and saying *added* rather than repeating
    // the name is the honest line: the name is the one already above it, and
    // there is nothing else known about the row yet.
    return (
      <span className="flex items-center gap-1 font-ui text-body-sm text-positive-fg">
        <Check className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        Added to your catalog. No photo yet.
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 font-ui text-body-sm text-muted">
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
      New to your catalog. It goes in the book with a placeholder photo.
    </span>
  )
}
