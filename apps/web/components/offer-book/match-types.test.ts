import { describe, expect, expectTypeOf, it } from 'vitest'
import type { MatchedRow as FromRoute } from '@/app/api/v1/offer-books/match/route'
import { barcodeHint, type MatchedRow as FromClient } from '@/components/offer-book/match-types'

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
