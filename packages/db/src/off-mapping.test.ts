import { describe, expect, it } from 'vitest'
import { allValues, firstValue, isRelevant, toProduct, type OffRow } from './off-mapping'

/**
 * The Open Food Facts mapping.
 *
 * Nine million public rows go through this, so every rule here is applied a
 * few hundred thousand times before anybody looks at the result. The rejections
 * matter more than the mappings: a bad row that gets in occupies a barcode the
 * real product will be scanned under, and E5 §1's shadowing means an
 * organization that notices can only fix its own copy.
 */

const base: OffRow = {
  code: '3017624010701',
  product_name: 'Nutella',
  brands: 'Ferrero',
  categories_en: 'Spreads,Sweet spreads',
  quantity: '400 g',
  countries_en: 'France,United Arab Emirates',
}

describe('isRelevant', () => {
  it('keeps a product listed for a GCC country among others', () => {
    expect(isRelevant(base)).toBe(true)
    expect(isRelevant({ countries_en: 'Saudi Arabia' })).toBe(true)
  })

  it('keeps the two origins that fill a Gulf grocery centre aisle', () => {
    // Not a geography error: the rice, pulses and spices a shop actually
    // stocks are largely listed under these.
    expect(isRelevant({ countries_en: 'India' })).toBe(true)
    expect(isRelevant({ countries_en: 'Pakistan' })).toBe(true)
  })

  it('drops a product with no GCC listing at all', () => {
    expect(isRelevant({ countries_en: 'France,Belgium' })).toBe(false)
    expect(isRelevant({ countries_en: '' })).toBe(false)
    expect(isRelevant({})).toBe(false)
  })

  it('ignores case, because the export is not consistent about it', () => {
    expect(isRelevant({ countries_en: 'UNITED ARAB EMIRATES' })).toBe(true)
  })
})

describe('firstValue', () => {
  it('takes the first of a comma-separated list', () => {
    expect(firstValue('Spreads,Sweet spreads')).toBe('Spreads')
  })

  it('strips a language prefix', () => {
    expect(firstValue('en:Breakfast cereals')).toBe('Breakfast cereals')
  })

  it('leaves a real colon in a name alone', () => {
    // Only a two-letter tag is stripped, so this is not mistaken for a prefix.
    expect(firstValue('Product: the sequel')).toBe('Product: the sequel')
  })

  it('returns null for nothing', () => {
    expect(firstValue('')).toBeNull()
    expect(firstValue(undefined)).toBeNull()
    expect(firstValue(' , ')).toBeNull()
  })
})

describe('allValues', () => {
  it('cleans, lowercases and deduplicates', () => {
    expect(allValues('en:Organic, Organic ,Halal', 8)).toEqual(['organic', 'halal'])
  })

  it('stops at the limit, because the vector is rebuilt on every write', () => {
    expect(allValues('a,b,c,d,e', 3)).toHaveLength(3)
  })

  it('drops an implausibly long tag', () => {
    expect(allValues('x'.repeat(60), 8)).toEqual([])
  })
})

describe('toProduct', () => {
  it('maps a good row', () => {
    expect(toProduct(base)).toEqual({
      barcode: '3017624010701',
      nameEn: 'Nutella',
      nameAr: null,
      brandEn: 'Ferrero',
      specEn: '400 g',
      originEn: null,
      category: 'Spreads',
      tags: [],
    })
  })

  it('always leaves nameAr null, because this export has no Arabic column', () => {
    // Verified against the real header: 211 columns, none of them a language
    // variant. E5 §2 makes a missing nameAr a publish-time blocker for Arabic
    // editions, so this is a known limit of the seed, not a mapping bug — the
    // `enrich` worker fills it, and that worker is still a stub.
    expect(toProduct(base)?.nameAr).toBeNull()
  })

  it('rejects a barcode that fails its check digit', () => {
    // OFF stores whatever a contributor typed. A bad code here occupies the
    // number the real product will be scanned under.
    expect(toProduct({ ...base, code: '3017624010702' })).toBeNull()
    expect(toProduct({ ...base, code: '12345' })).toBeNull()
    expect(toProduct({ ...base, code: '' })).toBeNull()
  })

  it('rejects a row with no English name', () => {
    // Weight A in the search vector and the only thing a card can print.
    expect(toProduct({ ...base, product_name: '' })).toBeNull()
    expect(toProduct({ ...base, product_name: '   ' })).toBeNull()
  })

  it('rejects a placeholder name', () => {
    // "Unknown" appears thousands of times and would rank against every vague
    // query in the product.
    expect(toProduct({ ...base, product_name: 'Unknown' })).toBeNull()
    expect(toProduct({ ...base, product_name: 'n/a' })).toBeNull()
    expect(toProduct({ ...base, product_name: '-' })).toBeNull()
  })

  it('rejects an absurdly long name rather than truncating it', () => {
    // Truncation would produce a plausible-looking product that is not one.
    expect(toProduct({ ...base, product_name: 'x'.repeat(201) })).toBeNull()
  })

  it('keeps quantity as free text rather than splitting it', () => {
    // E5 §4: "500 g" cannot be split reliably, and a wrong pack size feeds the
    // derived unit price and prints a confident wrong number on a card.
    expect(toProduct({ ...base, quantity: 'versch. Sorten, je 200-g-Becher' })?.specEn).toBe(
      'versch. Sorten, je 200-g-Becher'
    )
  })

  it('never carries an image, whatever the row holds', () => {
    const product = toProduct({
      ...base,
      // Not in OFF_FIELDS, so it never reaches the mapper — asserted anyway,
      // because "images are never scraped" is a licence position, not a
      // preference, and a future field addition must not quietly break it.
      ...({ image_url: 'https://images.openfoodfacts.org/x.jpg' } as OffRow),
    })
    expect(JSON.stringify(product)).not.toContain('image')
    expect(JSON.stringify(product)).not.toContain('openfoodfacts')
  })
})
