'use client'

import type { CatalogProductSummary } from '@souqstudio/types'
import * as React from 'react'
import { AlertTriangle, Check, HelpCircle, RotateCcw } from 'lucide-react'
import { ProductThumb } from '@/components/catalog/ProductThumb'
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
import type { Currency } from '@souqstudio/types'

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
 * **An item code is its own column now, and it outranks the barcode.** This
 * used to say that `HEADER_HINTS` mapped `sku` and `code` onto the barcode
 * field because sometimes an item code is a GTIN, and that a mis-mapped column
 * cost recall and never caused a wrong match. Both halves stopped being the
 * best available answer once `catalog_products.sku` existed: a POS item code
 * now matches the column it actually is, exactly, against the shop's own rows —
 * which is a better match than the GTIN gamble ever was, and `resolveRow`
 * trusts it over the barcode for the same reason it trusts a barcode over a
 * name.
 *
 * A sheet whose "SKU" column really does hold barcodes still works: map it to
 * the barcode select instead. `barcodeStats` below is what tells the owner
 * which of the two they have, and it is worth reading before moving the column.
 */
/**
 * Everything about a half-done review that is worth keeping.
 *
 * **The sheet, the mapping and the choices — and deliberately not the
 * matches.** Match results carry a full product summary per candidate, several
 * per row, which is most of a megabyte on a long sheet and the one part that can
 * be recomputed exactly. Re-running the match on resume is one request, gives
 * *fresher* candidates than the ones saved on Tuesday, and costs nothing to
 * store. The choices survive it because they are product ids, and the sheet's
 * row order is what keys them.
 */
export type MatcherDraft = {
  sheet: { headers: string[]; rows: string[][] }
  columns: {
    name: string
    barcode: string
    /**
     * Optional, because a draft saved before the item-code column existed does
     * not carry one. `offer_book_drafts.state` is opaque JSON that nothing
     * validates on the way back in, so an older draft restores with this
     * absent — and a required field here would be a type that lies about what
     * is actually in the column.
     */
    sku?: string
    price: string
    was: string
    percent: string
    type: string
  }
  /** Row index to the product the owner chose for it. */
  picks: Record<number, string | null>
}

type Props = {
  /** Rows the owner has resolved, lifted so the wizard can create from them. */
  onResolved: (rows: ResolvedRow[]) => void
  /** A review this person started earlier, to pick back up. */
  initial?: MatcherDraft | undefined
  /** Called whenever there is something new worth saving. */
  onDraftChange: (draft: MatcherDraft | null) => void
  max: number
  /**
   * What the book will be priced in.
   *
   * **The sheet is read to this currency's precision**, not to two decimals.
   * `resolvePrices` computes in whole minor units and there are a thousand of
   * them in a dinar and one in a yen, so a cell reading `12.755` keeps its
   * third digit in KWD and is refused in JPY rather than silently rounded.
   */
  currency: Currency
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
  sku?: string
  price: string | null
  comparePrice: string | null
  chip?: { labelEn: string; labelAr: string | null }
  /** The sheet's percentage disagreed with its two prices. */
  mismatch: boolean
}

/** What the owner chose for a row the matcher could not decide. Keyed by row
 *  index, and also where an adopted row's new product id lands. */
type Picks = Record<number, string | null>

/**
 * How many open decisions to put on screen at once.
 *
 * Twenty, because a sheet is two hundred rows and a wall of two hundred is
 * where an owner closes the tab. It is not a page size — answering a row takes
 * it out of the list, so this is twenty *questions*, and the button that
 * extends it says how many are left rather than "load more".
 */
const BATCH = 20

export function PriceListMatcher({ onResolved, initial, onDraftChange, max, currency }: Props) {
  const [sheet, setSheet] = React.useState<Sheet | null>(initial?.sheet ?? null)
  const [nameColumn, setNameColumn] = React.useState(initial?.columns.name ?? '')
  const [barcodeColumn, setBarcodeColumn] = React.useState(initial?.columns.barcode ?? '')
  const [skuColumn, setSkuColumn] = React.useState(initial?.columns.sku ?? '')
  const [priceColumn, setPriceColumn] = React.useState(initial?.columns.price ?? '')
  const [wasColumn, setWasColumn] = React.useState(initial?.columns.was ?? '')
  const [percentColumn, setPercentColumn] = React.useState(initial?.columns.percent ?? '')
  const [typeColumn, setTypeColumn] = React.useState(initial?.columns.type ?? '')
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
  /** Whether the table is showing every row or only the open decisions. */
  const [showAll, setShowAll] = React.useState(false)
  /** Set once, when this screen was restored rather than built from a drop. */
  const [resumedAt] = React.useState<string | null>(initial === undefined ? null : 'resumed')
  const [picks, setPicks] = React.useState<Picks>(initial?.picks ?? {})
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
      setSkuColumn(columnFor('sku'))

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
    const skuAt = at(skuColumn)
    const priceAt = at(priceColumn)
    const wasAt = at(wasColumn)
    const percentAt = at(percentColumn)
    const typeAt = at(typeColumn)

    const rows: SentRow[] = sheet.rows
      .map((row) => {
        const barcode = barcodeAt === -1 ? '' : normalizeBarcode(row[barcodeAt] ?? '')
        // No normalising and no check digit: an item code is whatever the
        // shop's till calls it, so it travels as typed and the unique index
        // decides whether it names a row.
        const sku = skuAt === -1 ? '' : (row[skuAt] ?? '').trim()

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
          currency,
        })

        const type = typeAt === -1 ? { kind: 'none' as const } : readOfferType(row[typeAt] ?? '')

        return {
          name: (row[nameAt] ?? '').trim(),
          // Omitted rather than sent empty: the route's schema takes an optional
          // string, and `exactOptionalPropertyTypes` means `undefined` and
          // absent are the same thing here and an empty string is not.
          ...(barcode === '' ? {} : { barcode }),
          ...(sku === '' ? {} : { sku }),
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

  /**
   * Tell the wizard what is worth saving, whenever it changes.
   *
   * **Only once there is a sheet.** Before a file is dropped there is nothing to
   * come back to, and writing an empty draft would give an owner who opened the
   * screen and left a "continue where you left off" pointing at nothing.
   */
  React.useEffect(() => {
    if (sheet === null) {
      onDraftChange(null)
      return
    }
    onDraftChange({
      sheet,
      columns: {
        name: nameColumn,
        barcode: barcodeColumn,
        sku: skuColumn,
        price: priceColumn,
        was: wasColumn,
        percent: percentColumn,
        type: typeColumn,
      },
      picks,
    })
  }, [
    sheet,
    nameColumn,
    barcodeColumn,
    skuColumn,
    priceColumn,
    wasColumn,
    percentColumn,
    typeColumn,
    picks,
    onDraftChange,
  ])

  /**
   * Resuming runs the match again, once, by itself.
   *
   * **Because the alternative is asking someone to press Match on a file they
   * already matched on Tuesday.** They come back to the table they left, with
   * their choices on it. The candidates are recomputed rather than restored,
   * which also means a product added to the catalog since is offered now.
   *
   * Guarded on `matched` being null so it never re-runs after the owner has the
   * table, and on the ref so React 18's double-invoke in development does not
   * send it twice.
   */
  const resumed = React.useRef(false)
  React.useEffect(() => {
    if (initial === undefined || resumed.current || sheet === null) return
    resumed.current = true
    void match()
    // `match` closes over this render's columns, which are the restored ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <Select
          label={FIELD_LABEL.sku}
          options={columnOptions(sheet.headers, 'No item code column')}
          value={skuColumn}
          onChange={(event) => setSkuColumn(event.target.value)}
          hint="Your own code for the product. Matched before the barcode."
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
          showAll={showAll}
          resumedFrom={resumedAt}
          onShowAll={setShowAll}
          onPick={(index, id) => setPicks((current) => ({ ...current, [index]: id }))}
          onRestart={() => {
            setSheet(null)
            setMatched(null)
            setPicks({})
            // **Cleared on the server too, not just here.** Otherwise the next
            // visit restores the sheet the owner has just thrown away, which
            // reads as the product refusing to let go of it.
            void fetch('/api/v1/offer-books/draft', { method: 'DELETE' }).catch(
              () => undefined
            )
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
  showAll,
  resumedFrom,
  onPick,
  onShowAll,
  onRestart,
}: {
  rows: MatchedRow[]
  /** What the sheet said about each row's promotion, by the same index. */
  sent: SentRow[]
  picks: Picks
  busy: boolean
  showAll: boolean
  /** Non-null when this table was restored rather than just built. */
  resumedFrom: string | null
  onPick: (index: number, productId: string | null) => void
  onShowAll: (next: boolean) => void
  onRestart: () => void
}) {
  const unmatched = rows.filter(
    (row) => row.status === 'UNMATCHED' && (picks[row.index] ?? null) === null
  ).length

  /**
   * The rows that actually want the owner's attention: the ones where the
   * matcher found several products and could not choose between them.
   *
   * **Everything else is not work.** A matched row is decided, and a row the
   * catalog has never seen is a product that gets written down — neither is a
   * question, and listing two hundred of them above six real decisions is how a
   * five-minute job looks like an afternoon.
   */
  const deciding = rows.filter(
    (row) => row.status === 'AMBIGUOUS' && (picks[row.index] ?? null) === null
  )
  const decided = rows.filter(
    (row) => row.status === 'AMBIGUOUS' && (picks[row.index] ?? null) !== null
  ).length

  /**
   * How many of the open decisions are on screen.
   *
   * **Twenty at a time, and it grows rather than paging.** A page control asks
   * an owner to keep track of where they are in a job whose whole difficulty is
   * that it is long; a batch that extends leaves everything they have already
   * done above them, which is the progress. Answering a row removes it from the
   * list, so a batch of twenty is twenty decisions rather than twenty rows.
   */
  const [shown, setShown] = React.useState(BATCH)
  const visible = showAll ? rows : deciding.slice(0, shown)

  return (
    <div className="flex flex-col gap-3">
      {resumedFrom !== null ? (
        <Card padding="compact">
          <p className="font-ui text-body-sm text-secondary">
            Picking up where you left off. Your choices were saved.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-ui text-body-sm text-secondary">
          {deciding.length === 0 ? (
            <>
              All <Figure value={rows.length} size="data-sm" /> rows are ready.
            </>
          ) : (
            <>
              <Figure value={deciding.length} size="data-sm" />{' '}
              {deciding.length === 1 ? 'row needs' : 'rows need'} you to pick a product.{' '}
              <span className="text-muted">
                The other <Figure value={rows.length - deciding.length} size="data-sm" /> are
                ready.
              </span>
            </>
          )}
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
        {visible.map((row) => (
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
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {row.candidates.map((candidate) => (
                      <li key={candidate.product.id} className="flex">
                        <CandidateTile
                          product={candidate.product}
                          chosen={picks[row.index] === candidate.product.id}
                          onChoose={(id) => onPick(row.index, id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {/* **Named with what is left, not with "load more".** An owner deciding
          whether to keep going wants the size of the rest, and a button that
          says it is also the answer to "how much is left of this". */}
      {!showAll && deciding.length > shown ? (
        <Button type="button" variant="secondary" onClick={() => setShown((n) => n + BATCH)}>
          Show{' '}
          <Figure value={Math.min(BATCH, deciding.length - shown)} size="data-sm" /> more of{' '}
          <Figure value={deciding.length - shown} size="data-sm" /> left
        </Button>
      ) : null}

      {/* The way to see everything, including the rows that are already
          decided — because "ready" is a claim, and an owner printing a flyer is
          entitled to check it rather than take our word for it. */}
      <Button type="button" variant="ghost" onClick={() => onShowAll(!showAll)}>
        {showAll ? 'Show only what needs a decision' : 'Show every row'}
      </Button>
    </div>
  )
}

/**
 * One product the row might be, with its picture.
 *
 * **The picture is the whole reason this is a choice an owner can make
 * quickly.** Two rows of text reading `Almarai Full Cream Milk 1 L` and
 * `Almarai Full Cream Milk 1.5 L` are a spot-the-difference puzzle; two
 * packshots are a glance. `CatalogProductSummary` has carried `imageUrl` since
 * it was written and this picker was rendering the name and the pack label —
 * the harder half of the same question.
 *
 * **A product with no photograph shows the same reserved space the card
 * does**, rather than collapsing to a text row and making the tiles a
 * different size each. It also tells the owner something true before they
 * pick: choosing this one gives the card a placeholder.
 *
 * Bordered rather than filled when chosen, and the border is the focus token —
 * the same treatment selection gets everywhere else in the product.
 */
function CandidateTile({
  product,
  chosen,
  onChoose,
}: {
  product: CatalogProductSummary
  chosen: boolean
  onChoose: (productId: string | null) => void
}) {
  const pack = packLabel(product)

  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={() => onChoose(chosen ? null : product.id)}
      className={[
        'flex min-h-row w-full items-center gap-2 rounded-control border-hairline p-1 text-start',
        chosen
          ? 'border-border-focus bg-selected-bg'
          : 'border-border-subtle hover:bg-stone-100',
      ].join(' ')}
    >
      <ProductThumb product={product} />

      <span className="flex min-w-0 flex-col">
        <span className="truncate font-ui text-body-sm text-primary">
          {displayName(product, 'en')}
        </span>
        <span className="truncate font-ui text-body-sm text-muted">
          {[product.brandEn, pack].filter(Boolean).join(' · ') ||
            (product.imageUrl === null ? 'No photo' : 'No brand')}
        </span>
      </span>
    </button>
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
