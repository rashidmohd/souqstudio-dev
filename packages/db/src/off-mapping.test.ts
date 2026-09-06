import { describe, expect, it } from 'vitest'
import {
  allValues,
  firstValue,
  isRelevant,
  toCatalogCategory,
  toProduct,
  type OffRow,
} from './off-mapping'

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

  /**
   * The country name has to match a whole entry in the list, not appear
   * anywhere inside the joined string.
   *
   * Found in the first real import run: `"romania".includes("oman")` is true,
   * so every Romanian product in the export entered the GCC catalog. By the
   * time it was spotted Romania was the largest single origin in the table at
   * 12.8%, ahead of Saudi Arabia, carrying names like "Paine Campagne Cu Maia".
   * Nothing errored — the rows looked exactly like every other row.
   */
  it('does not admit a country because its name contains another', () => {
    expect(isRelevant({ countries_en: 'Romania' })).toBe(false)
    expect(isRelevant({ countries_en: 'Romania,Hungary' })).toBe(false)
    expect(isRelevant({ countries_en: 'Roman Empire' })).toBe(false)
    // The ones that would break if the split were too aggressive instead.
    expect(isRelevant({ countries_en: 'Oman' })).toBe(true)
    expect(isRelevant({ countries_en: 'France,Oman' })).toBe(true)
  })

  it('reads both spellings the export uses for a country', () => {
    expect(isRelevant({ countries_en: 'United Arab Emirates' })).toBe(true)
    expect(isRelevant({ countries_en: 'en:united-arab-emirates' })).toBe(true)
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
      // Not `Spreads`. The OFF taxonomy string is resolved onto one of the ten
      // the app browses by, and survives as a tag — see `toCatalogCategory`.
      category: 'Grocery',
      tags: ['spreads'],
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

  it('rejects a name with no letter in it', () => {
    // What a scanner or a spreadsheet leaves behind rather than what somebody
    // typed. The first real import wrote 636 of these — bare barcodes, dates
    // and a lone full stop — all unfindable by name and unprintable on a card.
    expect(toProduct({ ...base, product_name: '0012000057502' })).toBeNull()
    expect(toProduct({ ...base, product_name: '.' })).toBeNull()
    expect(toProduct({ ...base, product_name: '01/04/2025' })).toBeNull()
    // Digits alongside letters are ordinary in a product name.
    expect(toProduct({ ...base, product_name: 'Nutella 400g' })?.nameEn).toBe('Nutella 400g')
    // And a non-Latin name is a name.
    expect(toProduct({ ...base, product_name: 'حليب طازج' })?.nameEn).toBe('حليب طازج')
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

describe('toCatalogCategory', () => {
  /**
   * The ordering cases. Each of these is a category the rules would get wrong
   * if the list were alphabetical, or grouped per category, or written in the
   * order the ten happen to be seeded in.
   */
  it('files a frozen product by its aisle, not by what it is made of', () => {
    // Bakery would claim "pizzas" on the word alone; a shop stocks it frozen.
    expect(toCatalogCategory('Frozen pizzas')).toBe('Frozen Foods')
    expect(toCatalogCategory('Frozen desserts')).toBe('Frozen Foods')
  })

  it('files ice cream as frozen rather than dairy', () => {
    // `cream` is a Dairy keyword and would otherwise win.
    expect(toCatalogCategory('Ice cream')).toBe('Frozen Foods')
  })

  it('files milk chocolate as a snack, not as dairy', () => {
    // The single biggest miscategorisation available here: `milk` is a Dairy
    // keyword, and Dairy running first puts every chocolate bar in the export
    // under Dairy.
    expect(toCatalogCategory('Milk chocolate')).toBe('Snacks')
    expect(toCatalogCategory('Milk chocolate bars')).toBe('Snacks')
  })

  it('files fruit juice as a drink, not as produce', () => {
    // `fruit` is a Fresh Produce keyword.
    expect(toCatalogCategory('Fruit juices')).toBe('Beverages')
  })

  it('resolves the everyday aisles', () => {
    expect(toCatalogCategory('Breads')).toBe('Bakery')
    expect(toCatalogCategory('Dairies')).toBe('Dairy')
    expect(toCatalogCategory('Cheeses')).toBe('Dairy')
    expect(toCatalogCategory('Vegetables')).toBe('Fresh Produce')
    expect(toCatalogCategory('Biscuits')).toBe('Snacks')
    expect(toCatalogCategory('Cleaning products')).toBe('Cleaning')
  })

  it('falls to Grocery only after the specific aisles have not answered', () => {
    expect(toCatalogCategory('Spreads')).toBe('Grocery')
    expect(toCatalogCategory('Breakfast cereals')).toBe('Grocery')
    expect(toCatalogCategory('Canned foods')).toBe('Grocery')
  })

  it('catches the compound phrases OFF actually writes', () => {
    // The signal is often in the tail rather than the head of the phrase.
    expect(toCatalogCategory('Sweet snacks')).toBe('Snacks')
    expect(toCatalogCategory('Beverages and beverages preparations')).toBe('Beverages')
    expect(toCatalogCategory('Meats and their products')).toBe('Grocery')
  })

  /**
   * The overrides, and why each exists. Every count here was measured over 2.39
   * million rows of the real export rather than assumed — which is the only
   * reason the first one is right, because the keyword rules got it wrong and
   * this test asserted the wrong answer until the tally said otherwise.
   */
  it('does not file the export largest category as a drink', () => {
    // 261,377 rows — more than the next two categories together. It is OFF's
    // umbrella for plant foods, and `beverage` in the name had it landing in
    // Beverages, which would have made Beverages the biggest tile in the
    // catalog and filled it with rice and lentils.
    expect(toCatalogCategory('Plant-based foods and beverages')).toBe('Grocery')
  })

  it('reads a negation as a negation', () => {
    // 399 rows caught by Grocery's `food` keyword — the one failure a substring
    // match cannot see on its own.
    expect(toCatalogCategory('Non food products')).toBeNull()
  })

  it('keeps what is genuinely outside the ten out of them', () => {
    // Present in volume, and no shelf in a grocery is the right answer.
    expect(toCatalogCategory('Dietary supplements')).toBeNull()
    expect(toCatalogCategory('Medicine')).toBeNull()
  })

  it("treats OFF's own placeholders as absent", () => {
    // 34,686 and 1,189 rows. They are values in the column and nothing in the
    // world; a tile counting them would be counting the export gaps.
    expect(toCatalogCategory('Undefined')).toBeNull()
    expect(toCatalogCategory('Null')).toBeNull()
  })

  it('files the aisles the tally found had no rule at all', () => {
    // Each of these sat in the top forty by row count and returned null until
    // the measured pass turned them up.
    expect(toCatalogCategory('Breakfasts')).toBe('Grocery')
    expect(toCatalogCategory('Sweeteners')).toBe('Grocery')
    expect(toCatalogCategory('Sandwiches')).toBe('Grocery')
    expect(toCatalogCategory('Cooking helpers')).toBe('Grocery')
    expect(toCatalogCategory('Fats')).toBe('Grocery')
    expect(toCatalogCategory('beauty')).toBe('Personal Care')
    expect(toCatalogCategory('Baked-goods')).toBe('Bakery')
  })

  it('does not let `pies` claim `pieces`', () => {
    // `pie` as a keyword files every "Chocolate pieces" row under Bakery.
    expect(toCatalogCategory('Chocolate pieces')).toBe('Snacks')
    expect(toCatalogCategory('Sweet pies')).toBe('Bakery')
  })

  it('ignores case, because the export is not consistent about it', () => {
    expect(toCatalogCategory('FROZEN PIZZAS')).toBe('Frozen Foods')
  })

  it('returns null rather than guessing', () => {
    // A wrong category prints a confident answer nobody can tell is wrong and
    // makes the tile counts lie. An uncategorised product is still searchable.
    expect(toCatalogCategory('Quantum widgets')).toBeNull()
    expect(toCatalogCategory(null)).toBeNull()
    expect(toCatalogCategory('')).toBeNull()
  })
})

describe('toProduct — categories', () => {
  it('stores one of the ten rather than the OFF taxonomy string', () => {
    // `listCategories` counts with `p.category = c.name`, so a raw OFF string
    // here means a tile reading "nothing here yet" over products that exist.
    expect(toProduct(base)?.category).toBe('Grocery')
  })

  it('keeps the OFF category as a tag, so the words are not lost', () => {
    // Resolving onto the ten is lossy: "Spreads" and "Breakfast cereals" are
    // both Grocery. Without this an owner searching "spreads" stops finding
    // Nutella.
    expect(toProduct(base)?.tags).toContain('spreads')
  })

  it('leaves category null when nothing matches, without dropping the row', () => {
    const product = toProduct({ ...base, categories_en: 'Quantum widgets' })
    expect(product).not.toBeNull()
    expect(product?.category).toBeNull()
    expect(product?.tags).toContain('quantum widgets')
  })
})
