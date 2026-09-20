import { describe, it, expect } from 'vitest'
import {
  AMOUNT_PATTERN,
  CURRENCIES,
  CURRENCY_INFO,
  MAX_MINOR_UNITS,
  PRIORITY_CURRENCIES,
  THREE_DECIMAL_CURRENCIES,
  ZERO_DECIMAL_CURRENCIES,
  amountFitsCurrency,
  currencyLabelFor,
  decimalsOf,
  fromMinorUnits,
  isCurrency,
  minorUnits,
  toMinorUnits,
} from './currency'

/**
 * The register is data, and one column of it is arithmetic.
 *
 * `minorUnits` decides what a price *is* — a yen has no sen, a dinar has a
 * thousand fils — so these pin the two exception lists rather than trusting a
 * table that looks plausible. Getting a row wrong prints a flyer at ten times
 * or a tenth of the intended price.
 */
describe('the currency register', () => {
  it('carries every code as three uppercase letters', () => {
    for (const code of CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/)
    }
  })

  it('gives every currency a name and a symbol', () => {
    for (const code of CURRENCIES) {
      expect(CURRENCY_INFO[code].name.length).toBeGreaterThan(0)
      expect(CURRENCY_INFO[code].symbol.length).toBeGreaterThan(0)
    }
  })

  it('knows exactly the seven three-decimal currencies', () => {
    expect([...THREE_DECIMAL_CURRENCIES].sort()).toEqual([
      'BHD',
      'IQD',
      'JOD',
      'KWD',
      'LYD',
      'OMR',
      'TND',
    ])
  })

  it('knows the zero-decimal currencies', () => {
    // Sixteen of them, and the ones a GCC shop is most likely to meet — yen,
    // won, dong, and the two CFA francs — are in it.
    expect([...ZERO_DECIMAL_CURRENCIES].sort()).toEqual([
      'BIF',
      'CLP',
      'DJF',
      'GNF',
      'ISK',
      'JPY',
      'KMF',
      'KRW',
      'PYG',
      'RWF',
      'UGX',
      'VND',
      'VUV',
      'XAF',
      'XOF',
      'XPF',
    ])
  })

  it('gives everything else two', () => {
    const odd = CURRENCIES.filter((code) => ![0, 2, 3].includes(minorUnits(code)))
    expect(odd).toEqual([])
    expect(minorUnits('AED')).toBe(2)
    expect(minorUnits('USD')).toBe(2)
    expect(minorUnits('EUR')).toBe(2)
  })

  it('never carries more decimals than the money column holds', () => {
    for (const code of CURRENCIES) {
      expect(minorUnits(code)).toBeLessThanOrEqual(MAX_MINOR_UNITS)
    }
  })

  it('offers the Gulf six first, and every one of them is in the register', () => {
    expect(PRIORITY_CURRENCIES).toEqual(['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD'])
    for (const code of PRIORITY_CURRENCIES) expect(isCurrency(code)).toBe(true)
  })

  it('recognises a code and refuses anything else', () => {
    expect(isCurrency('AED')).toBe(true)
    expect(isCurrency('aed')).toBe(false)
    expect(isCurrency('XYZ')).toBe(false)
    // Not fooled by a property every object has.
    expect(isCurrency('toString')).toBe(false)
  })
})

describe('what a card prints', () => {
  it('prints the code when the shop asked for the code', () => {
    expect(currencyLabelFor('AED', 'CODE')).toBe('AED')
    expect(currencyLabelFor('AED', 'CODE', 'Dhs')).toBe('AED')
  })

  it('prefers the shop’s own symbol, then the market one, then the code', () => {
    expect(currencyLabelFor('AED', 'SYMBOL', 'Dhs')).toBe('Dhs')
    expect(currencyLabelFor('AED', 'SYMBOL', null)).toBe('د.إ')
    expect(currencyLabelFor('AED', 'SYMBOL', '   ')).toBe('د.إ')
  })
})

describe('money, in whole minor units', () => {
  it('counts the decimals a string carries', () => {
    expect(decimalsOf('24')).toBe(0)
    expect(decimalsOf('24.5')).toBe(1)
    expect(decimalsOf('24.500')).toBe(3)
  })

  /**
   * The check that stops a column doing the rounding.
   *
   * A price typed with more decimals than its currency has is not a formatting
   * slip — it is a number that cannot be stored as written, and storing the
   * rounded one prints a flyer somebody carries to a till.
   */
  it('refuses more decimals than the currency has', () => {
    expect(amountFitsCurrency('24.50', 'AED')).toBe(true)
    expect(amountFitsCurrency('24.500', 'AED')).toBe(false)
    expect(amountFitsCurrency('12.750', 'KWD')).toBe(true)
    expect(amountFitsCurrency('12.75', 'KWD')).toBe(true)
    expect(amountFitsCurrency('1200', 'JPY')).toBe(true)
    expect(amountFitsCurrency('1200.50', 'JPY')).toBe(false)
  })

  it('refuses anything that is not an amount', () => {
    for (const bad of ['', '-1', 'AED 5', '1,000', '1.2345', '.5', '1.']) {
      expect(AMOUNT_PATTERN.test(bad)).toBe(false)
    }
  })

  it('scales by the currency rather than by a hundred', () => {
    expect(toMinorUnits('24.50', 'AED')).toBe(2450)
    expect(toMinorUnits('12.750', 'KWD')).toBe(12750)
    // The bug the old hard-coded ×100 had: a dinar lost its third digit.
    expect(toMinorUnits('12.755', 'KWD')).toBe(12755)
    expect(toMinorUnits('1200', 'JPY')).toBe(1200)
  })

  it('round-trips at every precision', () => {
    for (const [value, code] of [
      ['24.50', 'AED'],
      ['12.755', 'KWD'],
      ['1200', 'JPY'],
      ['0.01', 'USD'],
    ] as const) {
      const units = toMinorUnits(value, code)
      expect(units).not.toBeNull()
      expect(fromMinorUnits(units as number, code)).toBe(value)
    }
  })

  it('returns null rather than a wrong number for an amount that does not fit', () => {
    expect(toMinorUnits('12.7555', 'KWD')).toBeNull()
    expect(toMinorUnits('5.5', 'JPY')).toBeNull()
  })
})
