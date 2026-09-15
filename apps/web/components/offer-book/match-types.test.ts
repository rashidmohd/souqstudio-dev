import { describe, expect, expectTypeOf, it } from 'vitest'
import type { MatchedRow as FromRoute } from '@/app/api/v1/offer-books/match/route'
import {
  barcodeHint,
  guessOfferColumns,
  type MatchedRow as FromClient,
} from '@/components/offer-book/match-types'

/**
 * The two `MatchedRow` declarations, held to being one shape.
 *
 * **They are declared twice because they cannot be declared once.** The route
 * module imports `lib/catalog.ts`, which is `server-only`; a `'use client'`
 * component that imported the type from there would pull the module graph with
 * it, because a type import is erased but the module specifier is not always. So
 * the client keeps its own copy of the shape the route promises.
 *
 * Two copies of a wire format is exactly the drift this codebase keeps writing
 * comments about, and the cheapest fix is not a comment: assign each to the
 * other. A field added on one side, renamed, or made optional is then a
 * compile error in this file rather than `undefined` on a screen.
 *
 * Both directions, because one direction only catches removals.
 */
describe('MatchedRow', () => {
  it('is the same shape on both sides of the network', () => {
    expectTypeOf<FromRoute>().toEqualTypeOf<FromClient>()
  })

  it('is assignable each way, so neither side may quietly widen', () => {
    expectTypeOf<FromRoute>().toMatchTypeOf<FromClient>()
    expectTypeOf<FromClient>().toMatchTypeOf<FromRoute>()
  })
})

describe('barcodeHint', () => {
  /**
   * The sentence under the barcode select on `PriceListMatcher`.
   *
   * **Its job is to tell an owner which kind of column they picked before the
   * matching runs.** `POST /api/v1/offer-books/match` drops a value that fails
   * the GS1 check digit and falls back to the name — correct, and invisible from
   * the outside, so an owner who mapped their POS's internal item code would see
   * a worse match rate and no reason for it.
   */
  it('recommends a column when none is chosen', () => {
    expect(barcodeHint(null)).toContain('Strongly recommended')
  })

  it('names the likely cause when nothing in the column is a barcode', () => {
    // The common case: a POS labels its internal item code "SKU", and
    // `HEADER_HINTS` maps `sku` onto this field because sometimes it is a GTIN.
    const hint = barcodeHint({ valid: 0, total: 40 })
    expect(hint).toContain('internal code')
    expect(hint).toContain('matched on their name')
  })

  it('reports the split when a column is only partly barcodes', () => {
    // A real sheet: barcodes on the branded lines, internal codes on the bakery
    // counter. Still worth sending — it is never refused.
    expect(barcodeHint({ valid: 31, total: 40 })).toContain('31 of 40')
  })

  it('says so when every row carries one', () => {
    expect(barcodeHint({ valid: 40, total: 40 })).toContain('Every row')
  })
})

describe('guessOfferColumns', () => {
  /**
   * **Exact matching, where `inferColumnMap` matches on substrings**, and that
   * difference is the whole reason these live apart. The catalog importer's
   * guesser claimed `Price before` for `price` because it contains "price",
   * left `Price now` with nothing, and claimed `Offer type` for `specEn`
   * because it contains "type" — on the template this app hands out.
   */
  it('maps the template this app generates', () => {
    expect(
      guessOfferColumns([
        'Product name',
        'Barcode',
        'Price before',
        'Price now',
        'Discount %',
        'Offer type',
      ])
    ).toEqual({
      was: 'Price before',
      now: 'Price now',
      percent: 'Discount %',
      type: 'Offer type',
    })
  })

  it('reads a till export that names things its own way', () => {
    expect(guessOfferColumns(['Description', 'EAN', 'Old Price', 'Offer Price'])).toMatchObject({
      was: 'Old Price',
      now: 'Offer Price',
    })
  })

  it('takes a lone price column as the price, not the was-price', () => {
    // The commonest sheet of all: one price and nothing else. Reading it as a
    // was-price would print a strikethrough over a promotion that is not there.
    expect(guessOfferColumns(['Item', 'SKU', 'Price'])).toMatchObject({ was: '', now: 'Price' })
  })

  it('reads Arabic headers', () => {
    expect(guessOfferColumns(['المنتج', 'السعر القديم', 'السعر', 'نوع العرض'])).toMatchObject({
      was: 'السعر القديم',
      now: 'السعر',
      type: 'نوع العرض',
    })
  })

  it('never gives one column to two fields', () => {
    // `Discount` is in the percent hints and `Deal` in the type hints; a sheet
    // using one word for both must not have it counted twice.
    const guessed = guessOfferColumns(['Price', 'Discount'])
    const claimed = Object.values(guessed).filter((value) => value !== '')
    expect(new Set(claimed).size).toBe(claimed.length)
  })

  it('guesses nothing rather than guessing wrong', () => {
    expect(guessOfferColumns(['Column A', 'Column B'])).toEqual({
      was: '',
      now: '',
      percent: '',
      type: '',
    })
  })
})
