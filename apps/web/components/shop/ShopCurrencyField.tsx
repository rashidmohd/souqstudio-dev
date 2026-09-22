'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOLS,
  MAX_CURRENCY_SYMBOL,
  PRIORITY_CURRENCIES,
  currencyLabelFor,
  isCurrency,
  minorUnits,
  type Currency,
  type CurrencyDisplay,
} from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Segmented } from '@/components/ui/segmented'

/**
 * What this shop prices in, and how its cards write it.
 *
 * **It exists because the currency was a string literal in an API route.** Every
 * offer was created `'AED'` with no control anywhere in the product, and the
 * editor read the currency back off the first offer in the book under a comment
 * saying it belonged to the shop. It does — so it lives here, and the offer's
 * own column is the copy frozen with the book.
 *
 * **Three fields, and only the first one is about money.** The code decides
 * whether a price carries two fils or three, which is what a price *is*; the
 * other two decide what a card prints, which is typography. Keeping them apart
 * is what stops a shop choosing a nicer symbol and silently dropping a digit off
 * every Kuwaiti price.
 *
 * **The symbol defaults to Arabic and is editable, because the market is.** A
 * Gulf grocery prints `د.إ` far more often than it prints `AED`, and a chain
 * with a Latin brand voice prints `Dhs`. Neither is more correct, so the shop
 * says which.
 */

/**
 * The register, the priority six first.
 *
 * Built once at module scope rather than per render: it is a hundred and
 * fifty-five objects that never change, and rebuilding it on every keystroke in
 * the symbol field is work for nothing.
 */
const CURRENCY_OPTIONS = [
  ...PRIORITY_CURRENCIES.map((value) => ({
    value,
    label: `${CURRENCY_LABEL[value]} (${value})`,
    group: 'Gulf',
  })),
  ...CURRENCIES.filter((value) => !PRIORITY_CURRENCIES.includes(value)).map((value) => ({
    value,
    label: `${CURRENCY_LABEL[value]} (${value})`,
    group: 'All currencies',
  })),
]

type Props = {
  shopId: string
  currency: string
  currencyDisplay: string
  currencySymbol: string | null
  canEdit: boolean
}

export function ShopCurrencyField({
  shopId,
  currency,
  currencyDisplay,
  currencySymbol,
  canEdit,
}: Props) {
  const router = useRouter()

  // Narrowed once, here. The column is a string because the database has no
  // enum for it; everything below branches on the union.
  const initialCode = isCurrency(currency) ? currency : 'AED'
  const initialDisplay: CurrencyDisplay = currencyDisplay === 'SYMBOL' ? 'SYMBOL' : 'CODE'

  const [code, setCode] = React.useState<Currency>(initialCode)
  const [display, setDisplay] = React.useState<CurrencyDisplay>(initialDisplay)
  const [symbol, setSymbol] = React.useState(currencySymbol ?? '')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const dirty =
    code !== initialCode || display !== initialDisplay || symbol !== (currencySymbol ?? '')

  /**
   * The string a card will actually print, through the same function the
   * composer calls.
   *
   * A preview built from a second reading of the rule is how the setting and the
   * card start disagreeing — the same argument the price-mark gallery makes
   * about laying its thumbnails out with `layoutPriceMark`.
   */
  const preview = currencyLabelFor(code, display, symbol)

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const response = await fetch(`/api/v1/shops/${shopId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: code,
          currencyDisplay: display,
          // Empty means "no symbol of my own" — the market default. Sent as null
          // so the column holds one answer rather than two that mean the same.
          currencySymbol: symbol.trim() === '' ? null : symbol.trim(),
        }),
      })

      const parsed = (await response.json().catch(() => null)) as {
        error: { message: string } | null
      } | null

      if (parsed?.error) throw new Error(parsed.error.message)
      if (!response.ok) throw new Error('That did not save. Try again.')

      setSaved(true)
      router.refresh()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Currency</h2>
        <p className="font-ui text-body-sm text-secondary">
          What this shop prices in, and how its offer books write it.
        </p>
      </div>

      {canEdit ? (
        <>
          {/*
            **The six this product sells into, then all of them.** A hundred and
            fifty-five rows alphabetical is a list nobody scrolls: the shop that
            needs the euro will look for it, and the shop that needs the dirham
            should not have to pass Afghanistan to reach it. Both groups come
            from one register — this only decides what is offered first.
          */}
          <Select
            label="Currency"
            disabled={saving}
            value={code}
            options={CURRENCY_OPTIONS}
            onChange={(event) => setCode(event.target.value as Currency)}
            hint={
              minorUnits(code) === 0
                ? `${CURRENCY_LABEL[code]} prices are whole numbers, no decimal part.`
                : `${CURRENCY_LABEL[code]} prices carry ${minorUnits(code)} decimal places. Books already made keep the currency they were priced in.`
            }
          />

          <div className="flex flex-col gap-1">
            <span className="font-ui text-label font-medium text-primary">On the card</span>
            <Segmented
              label="On the card"
              className="grid w-full grid-cols-2 rounded-control"
              disabled={saving}
              value={display}
              options={[
                { value: 'CODE', label: code },
                { value: 'SYMBOL', label: CURRENCY_SYMBOLS[code] },
              ]}
              onChange={(next) => setDisplay(next as CurrencyDisplay)}
            />
          </div>

          {/*
            Only when there is a symbol to replace. Offering "your own symbol"
            beside a card that is printing the code is a field whose effect is
            invisible until a second, unrelated control is changed.
          */}
          {display === 'SYMBOL' ? (
            <Input
              label="Your own symbol"
              value={symbol}
              maxLength={MAX_CURRENCY_SYMBOL}
              disabled={saving}
              placeholder={CURRENCY_SYMBOLS[code]}
              hint="Leave it empty for the usual one. It is set in the largest type on the page, so keep it short."
              onChange={(event) => setSymbol(event.target.value)}
            />
          ) : null}

          {/*
            **The price mark is not drawn here.** It needs a brand kit, a promo
            tier and an offer, none of which this screen has — and a sample one
            would be a second price design an owner could mistake for theirs.
            What is uncertain is the *string*, so that is what is shown.
          */}
          <p className="font-ui text-body-sm text-secondary">
            Prices will read{' '}
            <span className="font-medium text-primary" dir="auto">
              {preview}
            </span>{' '}
            <span data-figure>24.50</span>
          </p>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save currency'}
            </Button>
            {saved && !dirty ? (
              <span className="font-ui text-body-sm text-secondary" role="status">
                Saved.
              </span>
            ) : null}
          </div>

          {error === null ? null : (
            <p className="font-ui text-body-sm text-critical-fg" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="font-ui text-body-sm text-muted">
          You need to be a manager of this shop to change its currency.
        </p>
      )}
    </section>
  )
}
