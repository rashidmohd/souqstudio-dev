import { describe, expect, it } from 'vitest'
import { hasValidCheckDigit } from '@souqstudio/types'
import { detectDelimiter, parseDelimited, parseSheet, toCsv, toRecord } from '@/lib/csv'

/**
 * The CSV parser, E5-06.
 *
 * Worth this many tests because every failure here is silent. A parser that
 * mishandles a quoted comma does not throw — it produces a row with one extra
 * field, every value after it shifted by one, and an import that looks like it
 * worked until someone reads the printed flyer.
 */

describe('detectDelimiter', () => {
  it('reads the header line, and prefers the comma on a tie', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })

  it('handles a file with no newline at all', () => {
    expect(detectDelimiter('a,b,c')).toBe(',')
  })

  it('falls back to the comma when there is nothing to go on', () => {
    expect(detectDelimiter('single')).toBe(',')
    expect(detectDelimiter('')).toBe(',')
  })
})

describe('parseDelimited', () => {
  it('splits plain rows', () => {
    expect(parseDelimited('a,b\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps a quoted delimiter inside its field', () => {
    // The failure this prevents: "Rice, Basmati" becoming two fields and every
    // column after it shifting one to the left, silently.
    expect(parseDelimited('"Rice, Basmati",9.50', ',')).toEqual([
      ['Rice, Basmati', '9.50'],
    ])
  })

  it('reads a doubled quote as one literal quote', () => {
    expect(parseDelimited('"He said ""hi""",2', ',')).toEqual([['He said "hi"', '2']])
  })

  it('keeps a newline inside quotes on one row', () => {
    expect(parseDelimited('"line one\nline two",x', ',')).toEqual([
      ['line one\nline two', 'x'],
    ])
  })

  it('treats CRLF as one line ending', () => {
    expect(parseDelimited('a,b\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('emits empty fields rather than dropping them', () => {
    expect(parseDelimited('a,,b', ',')).toEqual([['a', '', 'b']])
    expect(parseDelimited(',,', ',')).toEqual([['', '', '']])
  })

  it('does not turn a trailing newline into a row', () => {
    expect(parseDelimited('a,b\n', ',')).toEqual([['a', 'b']])
  })

  it('keeps a quote that appears mid-field as a literal', () => {
    // 12" is a size, not the start of a quoted field. Only a quote at the very
    // start of a field opens one.
    expect(parseDelimited('12" pan,3', ',')).toEqual([['12" pan', '3']])
  })

  it('reads Arabic unchanged', () => {
    // E5 §2: Arabic round-trips through the import resolver untouched. No
    // normalisation, no diacritic stripping.
    expect(parseDelimited('أرز بسمتي,9.50', ',')).toEqual([['أرز بسمتي', '9.50']])
  })
})

describe('parseSheet', () => {
  it('takes the first row as headers and trims them', () => {
    const sheet = parseSheet(' Item , Rate \nRice,9.50')
    expect(sheet.headers).toEqual(['Item', 'Rate'])
    expect(sheet.rows).toEqual([['Rice', '9.50']])
  })

  it('strips a UTF-8 BOM off the first header', () => {
    // Excel writes one. Written as an escape rather than typed literally: a
    // literal BOM is invisible in review and eslint's no-irregular-whitespace
    // refuses it — the same rule the currency thin space is written out for.
    const sheet = parseSheet('\uFEFFItem,Rate\nRice,9.50')
    expect(sheet.headers).toEqual(['Item', 'Rate'])
  })

  it('drops blank rows, of which spreadsheets are full', () => {
    const sheet = parseSheet('Item,Rate\nRice,9.50\n,\n\nSugar,4.00')
    expect(sheet.rows).toEqual([
      ['Rice', '9.50'],
      ['Sugar', '4.00'],
    ])
  })

  it('leaves a ragged row ragged', () => {
    // `catalog_import_rows.raw` holds the row exactly as read — the review
    // screen shows the owner their own row, not a padded approximation.
    const sheet = parseSheet('Item,Rate,Unit\nRice,9.50')
    expect(sheet.rows).toEqual([['Rice', '9.50']])
  })

  it('returns nothing for an empty file rather than throwing', () => {
    expect(parseSheet('')).toEqual({ headers: [], rows: [] })
  })

  it('detects a semicolon file without being told', () => {
    const sheet = parseSheet('Item;Rate\nRice;9,50')
    expect(sheet.headers).toEqual(['Item', 'Rate'])
    expect(sheet.rows).toEqual([['Rice', '9,50']])
  })
})

describe('toRecord', () => {
  it('keys a row by its headers', () => {
    expect(toRecord(['Item', 'Rate'], ['Rice', '9.50'])).toEqual({
      Item: 'Rice',
      Rate: '9.50',
    })
  })

  it('fills a short row with empty strings rather than undefined', () => {
    expect(toRecord(['Item', 'Rate'], ['Rice'])).toEqual({ Item: 'Rice', Rate: '' })
  })
})

describe('toCsv', () => {
  /**
   * The template the price-list flow hands out. It is opened in Excel by a shop
   * owner and then passed to whoever runs their POS, so it has to survive being
   * edited in place and read back by `parseSheet`.
   */
  it('quotes only the fields that need it', () => {
    // A sheet where every cell is quoted reads as machine output and invites
    // being "cleaned up". One that looks hand-typed gets edited in place.
    expect(toCsv(['Product name', 'Price'], [['Basmati rice', '12.90']])).toBe(
      'Product name,Price\r\nBasmati rice,12.90\r\n'
    )
  })

  it('quotes a comma, and doubles an embedded quote', () => {
    expect(toCsv(['a'], [['Rice, 5 kg']])).toBe('a\r\n"Rice, 5 kg"\r\n')
    expect(toCsv(['a'], [['5" pan']])).toBe('a\r\n"5"" pan"\r\n')
  })

  it('quotes padding, because Excel keeps it and our parser trims it', () => {
    expect(toCsv(['a'], [[' Rice ']])).toBe('a\r\n" Rice "\r\n')
  })

  it('round-trips through parseSheet', () => {
    // The property that matters: whatever we hand out, we can read back.
    const headers = ['Product name', 'Barcode', 'Price']
    const rows = [
      ['Rice, long grain', '6291234567890', '12.90'],
      ['Tea 5" tin', '', '4.50'],
    ]
    const parsed = parseSheet(toCsv(headers, rows))
    expect(parsed.headers).toEqual(headers)
    expect(parsed.rows).toEqual(rows)
  })
})

describe('the price-list template example barcodes', () => {
  /**
   * The fallback rows in `GET /api/v1/catalog/price-list-template`, for an
   * organization whose catalog is empty.
   *
   * **They are data, not behaviour, and they were wrong first time.** Three
   * numbers that looked like barcodes in a template whose job is partly to teach
   * what a barcode column is — `hasValidCheckDigit` would have dropped every one
   * of them on the way back in, and the owner would have seen the barcode column
   * quietly do nothing. Pinned here so changing a digit fails a test rather than
   * shipping.
   */
  it('carry correct GS1 check digits', () => {
    for (const code of ['6291100000012', '6291100000029', '6291100000036']) {
      expect(hasValidCheckDigit(code)).toBe(true)
    }
  })
})
