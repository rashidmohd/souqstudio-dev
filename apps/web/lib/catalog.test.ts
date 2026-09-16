import { describe, expect, it } from 'vitest'
import {
  displayBrand,
  displayName,
  displaySpec,
  formatPackSize,
  hasValidCheckDigit,
  isBarcode,
  normalizeBarcode,
  packLabel,
  toCatalogLanguage,
} from '@/lib/catalog-display'
import { toTsQuery } from '@/lib/catalog'
import { brandSlug, deriveUnitPrice, isUsableBrand } from '@souqstudio/types'

/**
 * The pure half of the catalog: `toTsQuery` from lib/catalog.ts and everything
 * in lib/catalog-display.ts.
 *
 * The queries themselves are SQL against a live database and are checked by
 * running them, not here. What is worth pinning is the string handed to
 * `to_tsquery` — a malformed one *raises* rather than returning nothing — and
 * the bilingual fallbacks, which are the difference between a legible card and
 * a blank one.
 */

describe('toTsQuery', () => {
  it('prefix-matches the last token so search works as the owner types', () => {
    expect(toTsQuery('ri')).toBe('ri:*')
    expect(toTsQuery('basmati ri')).toBe('basmati & ri:*')
  })

  it('strips tsquery operators rather than escaping them', () => {
    // Every one of these would either change the query's meaning or make
    // to_tsquery raise. `!` in particular would negate a term.
    expect(toTsQuery('rice & !water')).toBe('rice & water:*')
    expect(toTsQuery("l'oreal (shampoo)")).toBe('l & oreal & shampoo:*')
    expect(toTsQuery('a:b')).toBe('a & b:*')
  })

  it('keeps Arabic and other non-Latin scripts intact', () => {
    expect(toTsQuery('أرز')).toBe('أرز:*')
    expect(toTsQuery('أرز بسمتي')).toBe('أرز & بسمتي:*')
    // Transliterations are ordinary tokens — the synonym table is what maps
    // "chawal" to rice, not the query builder.
    expect(toTsQuery('chawal')).toBe('chawal:*')
  })

  it('keeps digits, which is how a pack size or a part number is searched', () => {
    expect(toTsQuery('500g tub')).toBe('500g & tub:*')
  })

  it('returns null when nothing survives, so the caller browses instead', () => {
    expect(toTsQuery('')).toBeNull()
    expect(toTsQuery('   ')).toBeNull()
    expect(toTsQuery('!!!')).toBeNull()
  })
})

describe('formatPackSize', () => {
  it('trims the decimal padding a Decimal(10,3) column carries', () => {
    expect(formatPackSize('500.000')).toBe('500')
    expect(formatPackSize('1.500')).toBe('1.5')
    expect(formatPackSize('0.750')).toBe('0.75')
  })

  it('leaves a value that needs its decimals alone', () => {
    expect(formatPackSize('1.125')).toBe('1.125')
    expect(formatPackSize('25')).toBe('25')
  })

  it('passes null through — no pack size is not a zero pack size', () => {
    expect(formatPackSize(null)).toBeNull()
  })
})

describe('bilingual fallbacks', () => {
  const product = {
    nameEn: 'Basmati Rice',
    nameAr: 'أرز بسمتي',
    brandEn: 'Al Wadi',
    brandAr: null,
    specEn: 'assorted flavours, 200g tub',
    specAr: null,
  }

  it('prefers the interface language', () => {
    expect(displayName(product, 'ar')).toBe('أرز بسمتي')
    expect(displayName(product, 'en')).toBe('Basmati Rice')
  })

  it('falls back rather than rendering blank', () => {
    // nameAr is nullable at ingest by design — a missing one is a completeness
    // warning at publish time, never an empty line in the catalog.
    expect(displayName({ nameEn: 'Basmati Rice', nameAr: null }, 'ar')).toBe(
      'Basmati Rice'
    )
    expect(displayBrand(product, 'ar')).toBe('Al Wadi')
    expect(displaySpec(product, 'ar')).toBe('assorted flavours, 200g tub')
  })

  it('returns null when neither language has the optional field', () => {
    expect(displayBrand({ brandEn: null, brandAr: null }, 'en')).toBeNull()
    expect(displaySpec({ specEn: null, specAr: null }, 'ar')).toBeNull()
  })
})

describe('toCatalogLanguage', () => {
  it('defaults to English for anything it does not recognise', () => {
    expect(toCatalogLanguage('ar')).toBe('ar')
    expect(toCatalogLanguage('en')).toBe('en')
    expect(toCatalogLanguage('fr')).toBe('en')
    expect(toCatalogLanguage(null)).toBe('en')
    expect(toCatalogLanguage(undefined)).toBe('en')
  })
})

describe('packLabel', () => {
  const base = { packSize: '500', packUnit: 'G' as const, packCount: null }

  it('writes the unit as a shelf label does', () => {
    expect(packLabel(base)).toBe('500 g')
    expect(packLabel({ ...base, packSize: '1', packUnit: 'KG' })).toBe('1 kg')
  })

  it('writes a multipack with the multiplication sign', () => {
    expect(packLabel({ packSize: '25', packUnit: 'G', packCount: 8 })).toBe('8 × 25 g')
  })

  it('treats a count of one as no multipack — "1 × 500 g" is noise', () => {
    expect(packLabel({ ...base, packCount: 1 })).toBe('500 g')
  })

  it('drops the symbol for pieces, which have none worth printing', () => {
    expect(packLabel({ packSize: '6', packUnit: 'PIECE', packCount: null })).toBe('6')
  })

  it('renders nothing without a pack size — no size is not a zero size', () => {
    expect(packLabel({ packSize: null, packUnit: 'G', packCount: 8 })).toBeNull()
  })
})

describe('sold loose', () => {
  /**
   * The distinction `sellBy` exists for. Before it, loose tomatoes at 4.50 a
   * kilo had to be entered as a *pack* of one kilo — which read plausibly and
   * then made both functions below answer a question nobody asked.
   */
  it('prints no pack line, because a loose product has no pack', () => {
    expect(packLabel({ packSize: null, packUnit: 'KG', packCount: null, sellBy: 'LOOSE' }))
      .toBeNull()
  })

  it('ignores a pack size that should not have been entered at all', () => {
    expect(packLabel({ packSize: '1', packUnit: 'KG', packCount: null, sellBy: 'LOOSE' }))
      .toBeNull()
  })

  it('takes the price as the rate rather than dividing by a pack', () => {
    expect(deriveUnitPrice('4.50', { packSize: null, packUnit: 'KG', packCount: null, sellBy: 'LOOSE' }))
      .toEqual({ value: '4.500', unit: 'KG' })
  })

  it('normalises a rate quoted per gram up to the base unit', () => {
    // 0.0045 per gram and 4.50 per kilo are the same price, and a card putting
    // them side by side has to quote one of them.
    expect(deriveUnitPrice('0.0045', { packSize: null, packUnit: 'G', packCount: null, sellBy: 'LOOSE' }))
      .toEqual({ value: '4.500', unit: 'KG' })
  })

  it('answers nothing without a unit — a rate per unknown is not a rate', () => {
    expect(deriveUnitPrice('4.50', { packSize: null, packUnit: null, packCount: null, sellBy: 'LOOSE' }))
      .toBeNull()
  })

  it('treats a zero price as unset here too, not as free', () => {
    expect(deriveUnitPrice('0', { packSize: null, packUnit: 'KG', packCount: null, sellBy: 'LOOSE' }))
      .toBeNull()
  })

  it('leaves a packed product on the dividing path', () => {
    // The regression that matters: adding the branch must not change the case
    // that was already right. 8 × 25 g at 3.52 is 200 g, so 17.60 per kilo.
    expect(deriveUnitPrice('3.52', { packSize: '25', packUnit: 'G', packCount: 8, sellBy: 'PACK' }))
      .toEqual({ value: '17.600', unit: 'KG' })
  })

  it('reads an absent sellBy as PACK, which is what every older row is', () => {
    expect(deriveUnitPrice('3.52', { packSize: '25', packUnit: 'G', packCount: 8 }))
      .toEqual({ value: '17.600', unit: 'KG' })
    expect(packLabel({ packSize: '500', packUnit: 'G', packCount: null })).toBe('500 g')
  })
})

describe('barcodes', () => {
  // Real GTINs. A validator written against invented numbers passes on the
  // invented numbers and fails on the pack in the owner's hand.
  const EAN13 = '4006381333931'
  const UPCA = '036000291452'

  it('recognises the four GTIN lengths and nothing else', () => {
    expect(isBarcode(EAN13)).toBe(true) // EAN-13
    expect(isBarcode(UPCA)).toBe(true) // UPC-A
    expect(isBarcode('96385074')).toBe(true) // EAN-8
    expect(isBarcode('00012345600012')).toBe(true) // GTIN-14

    // A five-digit number is a search for a five-digit number.
    expect(isBarcode('12345')).toBe(false)
    expect(isBarcode('basmati')).toBe(false)
    expect(isBarcode('123456789012345')).toBe(false)
  })

  it('strips the separators a label prints and a person types', () => {
    expect(normalizeBarcode('4006381 333931')).toBe(EAN13)
    expect(normalizeBarcode('0-36000-29145-2')).toBe(UPCA)
    expect(isBarcode('4006381 333931')).toBe(true)
  })

  it('leaves anything else in place so it fails rather than transforming', () => {
    // `+` is not a separator. Removing it would turn a nonsense string into a
    // valid-looking code for a product nobody meant.
    expect(normalizeBarcode('400638+1333931')).toBe('400638+1333931')
    expect(isBarcode('400638+1333931')).toBe(false)
  })

  it('validates the check digit at every length', () => {
    expect(hasValidCheckDigit(EAN13)).toBe(true)
    expect(hasValidCheckDigit(UPCA)).toBe(true)
    expect(hasValidCheckDigit('96385074')).toBe(true)
    expect(hasValidCheckDigit('00012345600012')).toBe(true)
  })

  it('catches a single mistyped digit, which is what it is for', () => {
    expect(hasValidCheckDigit('4006381333932')).toBe(false)
    expect(hasValidCheckDigit('4006381333831')).toBe(false)
    expect(hasValidCheckDigit('036000291451')).toBe(false)
  })

  it('catches a transposition, which weighting from the right is what buys', () => {
    // Anchoring the 3-1 weights from the left instead of the right passes this.
    expect(hasValidCheckDigit('4006381333913')).toBe(false)
  })

  it('rejects anything that is not a barcode at all', () => {
    expect(hasValidCheckDigit('12345')).toBe(false)
    expect(hasValidCheckDigit('')).toBe(false)
    expect(hasValidCheckDigit('basmati rice')).toBe(false)
  })
})

describe('brandSlug', () => {
  /**
   * The key that decides whether two spellings are one brand. Every case here
   * is one the Open Food Facts export or a keyboard actually produces.
   */
  it('folds the four ways the export writes one brand', () => {
    for (const spelling of ['Almarai', 'almarai', 'AL MARAI', 'Almarai®']) {
      expect(brandSlug(spelling)).toBe('almarai')
    }
  })

  it('does not let a separator split one brand — the bug this had', () => {
    // Stripping the hyphen but keeping the space filed `Coca-Cola` under
    // `cocacola` and `Coca Cola` under `coca cola`: the same brand in two rows,
    // decided by nothing but which separator someone typed. Caught by `AL
    // MARAI` landing beside `Almarai`.
    expect(brandSlug('Coca-Cola')).toBe('cocacola')
    expect(brandSlug('Coca Cola')).toBe('cocacola')
    expect(brandSlug('CocaCola')).toBe('cocacola')
  })

  it('folds accents, which a Gulf keyboard does not produce', () => {
    expect(brandSlug('Nestlé')).toBe(brandSlug('Nestle'))
  })

  it('keeps Arabic, rather than reducing it to nothing', () => {
    // An allowlist of Latin letters would empty every Arabic brand name and
    // collapse all of them into one row.
    expect(brandSlug('المراعي')).toBe('المراعي')
  })

  it('refuses what would become a junk row', () => {
    // The first such row would go on to collect every other unnameable string.
    expect(isUsableBrand('®')).toBe(false)
    expect(isUsableBrand('  ')).toBe(false)
    expect(isUsableBrand('A')).toBe(false)
    expect(isUsableBrand('Almarai')).toBe(true)
  })
})
