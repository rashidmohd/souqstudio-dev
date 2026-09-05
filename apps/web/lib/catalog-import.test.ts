import { describe, expect, it } from 'vitest'
import {
  inferColumnMap,
  mappedFields,
  parsePackSize,
  parsePackUnit,
  parsePrice,
  resolveRow,
} from '@/lib/catalog-import'

/**
 * The pure half of the E5-06 import.
 *
 * Three things are pinned here because all three fail quietly: a column guessed
 * wrong matches every row against the wrong number, a price parsed wrong prints
 * on a flyer, and a match resolved too eagerly puts the wrong product at the
 * right price in front of a customer.
 */

describe('inferColumnMap', () => {
  it('reads the headers a real sheet actually carries', () => {
    expect(inferColumnMap(['Item', 'Brand', 'Barcode', 'Rate'])).toEqual({
      Item: 'nameEn',
      Brand: 'brandEn',
      Barcode: 'barcode',
      Rate: 'price',
    })
  })

  it('ignores case, spacing and punctuation in a header', () => {
    expect(inferColumnMap(['  PRODUCT_NAME  ', 'Offer Price'])).toEqual({
      '  PRODUCT_NAME  ': 'nameEn',
      'Offer Price': 'price',
    })
  })

  it('does not let the English name claim the Arabic column', () => {
    // "Product Name (Arabic)" contains "product name". Testing nameAr first is
    // what stops the general case swallowing the specific one.
    const map = inferColumnMap(['Product Name', 'Product Name (Arabic)'])
    expect(map['Product Name']).toBe('nameEn')
    expect(map['Product Name (Arabic)']).toBe('nameAr')
  })

  it('reads Arabic headers', () => {
    expect(inferColumnMap(['المنتج', 'السعر', 'الباركود'])).toEqual({
      المنتج: 'nameEn',
      السعر: 'price',
      الباركود: 'barcode',
    })
  })

  it('claims each field at most once, leaving the duplicate for the owner', () => {
    // Both would otherwise map to nameEn and the later one would silently win.
    const map = inferColumnMap(['Name', 'Item Name'])
    expect(Object.values(map).filter((f) => f === 'nameEn')).toHaveLength(1)
    expect(Object.values(map)).toContain(null)
  })

  it('does not confuse pack size with pack unit or count', () => {
    const map = inferColumnMap(['Size', 'Unit', 'Items per pack'])
    expect(map).toEqual({ Size: 'packSize', Unit: 'packUnit', 'Items per pack': 'packCount' })
  })

  it('leaves a header it does not recognise unmapped rather than guessing', () => {
    const map = inferColumnMap(['Aisle', 'Supplier ref'])
    expect(map).toEqual({ Aisle: null, 'Supplier ref': null })
  })

  it('survives an empty header cell', () => {
    expect(inferColumnMap(['Item', ''])).toEqual({ Item: 'nameEn', '': null })
  })
})

describe('mappedFields', () => {
  it('reports what the map covers, so the screen can block on the name', () => {
    const fields = mappedFields({ Item: 'nameEn', Rate: 'price', Aisle: null })
    expect(fields.has('nameEn')).toBe(true)
    expect(fields.has('price')).toBe(true)
    expect(fields.has('barcode')).toBe(false)
  })
})

describe('parsePrice', () => {
  it('reads a plain decimal', () => {
    expect(parsePrice('9.50')).toBe('9.50')
    expect(parsePrice('12')).toBe('12.00')
  })

  it('strips a currency code or symbol and the space after it', () => {
    expect(parsePrice('AED 9.50')).toBe('9.50')
    expect(parsePrice('AED 12.90')).toBe('12.90')
    expect(parsePrice('د.إ 9.50')).toBe('9.50')
  })

  it('reads a lone comma as a decimal separator', () => {
    // What Excel writes in a locale where the comma is the decimal point.
    expect(parsePrice('9,50')).toBe('9.50')
  })

  it('reads a lone comma before three digits as thousands', () => {
    // The distinction that decides whether this row costs 1,234 or 1.234.
    expect(parsePrice('1,234')).toBe('1234.00')
  })

  it('handles both separators together, in either order', () => {
    expect(parsePrice('1,234.56')).toBe('1234.56')
    expect(parsePrice('1.234,56')).toBe('1234.56')
  })

  it('returns null for anything it cannot read, never zero', () => {
    // A missing price is a row to look at. A zero price is a giveaway.
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('on request')).toBeNull()
    expect(parsePrice('-')).toBeNull()
    expect(parsePrice('-5.00')).toBeNull()
  })

  it('rounds to the two places the column stores', () => {
    expect(parsePrice('9.499')).toBe('9.50')
  })
})

describe('parsePackSize', () => {
  it('takes a bare number', () => {
    expect(parsePackSize('500')).toBe('500')
    expect(parsePackSize(' 1.5 ')).toBe('1.5')
  })

  it('refuses a combined cell rather than splitting it', () => {
    // E5 §4 dropped the free-text unit column rather than parse it, and that
    // reasoning does not stop at the import boundary. A mis-split cell feeds
    // the derived unit price and prints a confident wrong number.
    expect(parsePackSize('500g')).toBeNull()
    expect(parsePackSize('versch. Sorten')).toBeNull()
    expect(parsePackSize('')).toBeNull()
  })
})

describe('parsePackUnit', () => {
  it('reads the spellings a sheet uses', () => {
    expect(parsePackUnit('g')).toBe('G')
    expect(parsePackUnit('Grams')).toBe('G')
    expect(parsePackUnit('KG')).toBe('KG')
    expect(parsePackUnit('ltr')).toBe('L')
    expect(parsePackUnit('pcs')).toBe('PIECE')
  })

  it('returns null rather than guessing', () => {
    expect(parsePackUnit('box')).toBeNull()
    expect(parsePackUnit('')).toBeNull()
  })
})

describe('resolveRow', () => {
  it('trusts a barcode over everything, because it is an identity', () => {
    const result = resolveRow({
      barcodeMatchId: 'prod_1',
      candidates: [{ catalogProductId: 'prod_2', score: 0.9 }],
    })
    expect(result.status).toBe('MATCHED')
    expect(result.catalogProductId).toBe('prod_1')
  })

  it('matches a lone strong candidate', () => {
    const result = resolveRow({ candidates: [{ catalogProductId: 'prod_1', score: 0.8 }] })
    expect(result.status).toBe('MATCHED')
    expect(result.catalogProductId).toBe('prod_1')
  })

  it('will not match a lone weak candidate', () => {
    const result = resolveRow({ candidates: [{ catalogProductId: 'prod_1', score: 0.2 }] })
    expect(result.status).toBe('AMBIGUOUS')
    expect(result.catalogProductId).toBeNull()
  })

  it('will not pick between two close strong candidates', () => {
    // "Basmati Rice 1kg" and "Basmati Rice 5kg". Picking the higher score
    // silently is most likely to be wrong exactly here, and least likely to be
    // noticed. E5-06: never silently pick the top score.
    const result = resolveRow({
      candidates: [
        { catalogProductId: 'prod_1', score: 0.82 },
        { catalogProductId: 'prod_2', score: 0.79 },
      ],
    })
    expect(result.status).toBe('AMBIGUOUS')
    expect(result.catalogProductId).toBeNull()
    expect(result.candidates).toHaveLength(2)
  })

  it('matches a strong candidate that is clear of the runner-up', () => {
    const result = resolveRow({
      candidates: [
        { catalogProductId: 'prod_1', score: 0.9 },
        { catalogProductId: 'prod_2', score: 0.3 },
      ],
    })
    expect(result.status).toBe('MATCHED')
    expect(result.catalogProductId).toBe('prod_1')
  })

  it('returns the candidates ranked, whatever order they arrived in', () => {
    const result = resolveRow({
      candidates: [
        { catalogProductId: 'low', score: 0.3 },
        { catalogProductId: 'high', score: 0.4 },
      ],
    })
    expect(result.candidates.map((c) => c.catalogProductId)).toEqual(['high', 'low'])
  })

  it('is UNMATCHED with no candidates at all', () => {
    expect(resolveRow({ candidates: [] })).toEqual({
      status: 'UNMATCHED',
      catalogProductId: null,
      candidates: [],
    })
    expect(resolveRow({}).status).toBe('UNMATCHED')
  })
})
