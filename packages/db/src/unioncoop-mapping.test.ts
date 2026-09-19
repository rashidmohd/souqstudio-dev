import { describe, expect, it } from 'vitest'
import {
  buildTags,
  parseOrigin,
  parsePack,
  pickCategory,
  stripBrandPrefix,
  toProduct,
  type UnionCoopRow,
} from './unioncoop-mapping'

/**
 * Every fixture here is a real row from `products/products.json`, copied
 * verbatim. The mapping is the half of this import that will be wrong in a way
 * nobody notices — 18,428 rows through a parser nobody checked is a catalog
 * that looks full and prints wrong pack sizes onto a flyer.
 */

const row = (over: Partial<UnionCoopRow> = {}): UnionCoopRow => ({
  sku: '6281007032407',
  name: 'Almarai Full Cream Milk - 1 L',
  name_ar: 'حليب المراعي كامل الدسم - 1 لتر',
  url: 'https://www.unioncoop.ae/almarai-full-cream-milk-1l.html',
  brand: 'ALMARAI',
  category_one: 'Milk',
  categories_level0: ['Fresh Food'],
  categories_level1: ['Fresh Food /// Dairy & Eggs'],
  image_url: 'https://www.unioncoop.ae/media/catalog/product/6/2/6281007032407.jpg',
  ...over,
})

describe('parsePack', () => {
  it('reads a plain trailing size', () => {
    expect(parsePack('Yaumi Toast Sliced Bread - 600g')).toMatchObject({
      packSize: 600,
      packUnit: 'G',
      packCount: null,
    })
  })

  it('reads a multipack as count times size', () => {
    expect(parsePack('Mai Dubai Pure Drinking Water - 12 x 330ml')).toMatchObject({
      packSize: 330,
      packUnit: 'ML',
      packCount: 12,
    })
  })

  it('reads a decimal size and a spaced unit', () => {
    expect(parsePack('Masafi Natural Mineral Water - 6 x 1.5 L')).toMatchObject({
      packSize: 1.5,
      packUnit: 'L',
      packCount: 6,
    })
  })

  it("reads the apostrophe-s count this feed uses for eggs", () => {
    expect(parsePack("Al Ain Farms White Large Eggs 30's")).toMatchObject({
      packSize: 30,
      packUnit: 'PIECE',
      packCount: null,
    })
  })

  it('prefers the longest unit spelling', () => {
    // `Ltr` must not match `l` and leave `tr` behind — that fails the end
    // anchor and drops the pack data silently.
    expect(parsePack('Almarai Mixed Fruit Berry Drink - 1.4 Ltr')).toMatchObject({
      packSize: 1.4,
      packUnit: 'L',
    })
  })

  it('does not read a mobile network generation as five grams', () => {
    expect(parsePack('Samsung Galaxy Z Flip7 FE 5G')).toMatchObject({
      packSize: null,
      packUnit: null,
    })
  })

  it('still reads the lowercase small sachets this feed really sells', () => {
    // Case is the only thing separating these two, and both are real rows.
    expect(parsePack('Saffron - 2g')).toMatchObject({ packSize: 2, packUnit: 'G' })
    expect(parsePack('Siip Roasted Corn Snack - 5g')).toMatchObject({ packSize: 5, packUnit: 'G' })
  })

  it('does not take a number out of the middle of a name', () => {
    expect(parsePack('Pepsi 7up Free Can')).toMatchObject({ packSize: null, packUnit: null })
  })

  it('returns all three null for loose produce', () => {
    expect(parsePack('Loose Cucumber - UAE')).toMatchObject({
      packSize: null,
      packUnit: null,
      packCount: null,
    })
  })

  it('ignores a count of one rather than storing a meaningless multiplier', () => {
    expect(parsePack('Carrot Australia - 1 Kg')).toMatchObject({
      packSize: 1,
      packUnit: 'KG',
      packCount: null,
    })
  })
})

describe('parseOrigin', () => {
  it('reads a trailing country after a dash', () => {
    expect(parseOrigin('Tomato - Syria').originEn).toBe('Syria')
  })

  it('reads a trailing country with no dash', () => {
    expect(parseOrigin('Green Coriander UAE').originEn).toBe('UAE')
  })

  it('reads the slashed either-or this feed writes for produce', () => {
    expect(parseOrigin('Lettuce Iceberg - Oman/UAE').originEn).toBe('Oman / UAE')
  })

  it("resolves the retailer's own abbreviation", () => {
    expect(parseOrigin('Banana - AB').originEn).toBe('Ecuador')
  })

  it('leaves a variant suffix alone', () => {
    // The shape is identical to a country and the meaning is not. A closed list
    // is the only thing separating them.
    expect(parseOrigin('Americana Chicken Strips - Spicy').originEn).toBeNull()
  })

  it('normalises the case the feed wrote', () => {
    expect(parseOrigin('Apple Pink Lady - france').originEn).toBe('France')
  })
})

describe('pickCategory', () => {
  it('files frozen above the food it is made of', () => {
    expect(pickCategory('Frozen Chicken')).toBe('Frozen Foods')
    expect(pickCategory('Ice Cream')).toBe('Frozen Foods')
  })

  it('files milk chocolate as a snack, not as dairy', () => {
    expect(pickCategory('Milk Chocolate')).toBe('Snacks')
    expect(pickCategory('Milk')).toBe('Dairy')
  })

  it('files fresh juice as a drink, not as produce', () => {
    expect(pickCategory('Fresh Juice')).toBe('Beverages')
    expect(pickCategory('Fresh Fruits')).toBe('Fresh Produce')
  })

  it('keeps hand sanitizer out of the pantry', () => {
    expect(pickCategory('Hand Sanitizer')).toBe('Personal Care')
  })

  it('places the hypermarket aisles the original ten did not cover', () => {
    // These six categories were added on 19 September 2026 precisely because
    // 4,691 rows — a quarter of the assortment — landed here as null.
    expect(pickCategory('Men Wear')).toBe('Apparel')
    expect(pickCategory('Toys')).toBe('Toys')
    expect(pickCategory('Stationery Supplies')).toBe('Stationery')
    expect(pickCategory('Cat Food')).toBe('Pet')
    expect(pickCategory('Kitchen Ware')).toBe('Household')
    expect(pickCategory('Baby Diaper')).toBe('Baby')
  })

  it('runs Baby ahead of every aisle it borrows a word from', () => {
    // Each of these resolves somewhere else on its own word, and a baby
    // promotion built from a two-thirds-empty aisle is the failure.
    expect(pickCategory('Baby Wipes')).toBe('Baby') // `wipes` is Cleaning
    expect(pickCategory('Baby Bath')).toBe('Baby') // `bath` is Personal Care
    expect(pickCategory('Baby Food')).toBe('Baby') // `food` is Grocery
    expect(pickCategory('Nursery & Baby Care')).toBe('Baby')
  })

  it('moves infant formula to Baby without taking milk powder with it', () => {
    // `Milk Formula` reached Dairy through the word `milk` and is the baby
    // aisle. `Milk Powder` is Nido and Almarai full cream, and is not.
    expect(pickCategory('Milk Formula')).toBe('Baby')
    expect(pickCategory('Milk Powder')).toBe('Dairy')
  })

  it('believes the products over the category names', () => {
    // Every one of these reads as a different aisle than it is. They are in
    // the override table because sampling the product names contradicted the
    // category name, and no keyword ordering fixes them all.
    expect(pickCategory('Camping & Hiking')).toBe('Household') // charcoal tablets
    expect(pickCategory('BBQ Accessories')).toBe('Household') // charcoal and fuel
    expect(pickCategory('Picnic Accessories')).toBe('Household') // more charcoal
    expect(pickCategory('Outdoor Equipment')).toBe('Household') // gas lighters
    expect(pickCategory('Gardening & Lawn Care')).toBe('Household') // potting soil
    expect(pickCategory('Party & Birthday')).toBe('Apparel') // fancy dress
    expect(pickCategory('Hardware Tools')).toBe('Stationery') // glue and tape
    expect(pickCategory('library')).toBe('Stationery') // notebooks
    expect(pickCategory('Tablets')).toBe('Electronics') // iPads
    expect(pickCategory('Disposables')).toBe('Household') // foil and cling film
  })

  it('separates the three aisles that share the word kitchen', () => {
    // No ordering of keyword rules gets all three right, which is what the
    // whole-string override table exists for.
    expect(pickCategory('Kitchen')).toBe('Cleaning') // JIF, Dettol, Clorox
    expect(pickCategory('Kitchen Ware')).toBe('Household') // pans
    expect(pickCategory('Kitchen Appliances')).toBe('Electronics') // air fryers
    expect(pickCategory('Kitchen Paper')).toBe('Household') // towels
  })

  it('does not read a snack as a light fitting', () => {
    // `lights` as an Electronics keyword also matched `Crunchy De-lights` and
    // moved 72 rows of Sunbites bread bites into Electronics. Found by
    // auditing all 311 source categories; the totals looked fine.
    expect(pickCategory('Crunchy Delights')).toBe('Snacks')
    expect(pickCategory('Lights')).toBe('Household')
  })

  it('files air purifiers as appliances, not as cleaning products', () => {
    // `Air Quality` is Xiaomi humidifiers and Levoit filters. It read as a
    // Cleaning word and was one until the products were looked at.
    expect(pickCategory('Air Quality')).toBe('Electronics')
    expect(pickCategory('Air Cooling & Fans')).toBe('Electronics')
  })

  it('returns null rather than guessing at an empty value', () => {
    expect(pickCategory(null)).toBeNull()
    expect(pickCategory('   ')).toBeNull()
  })

  it('still returns null for what genuinely has no aisle', () => {
    // 2 rows out of 18,428. A category for them would be a tile reading
    // "nothing here yet" on every shop's catalog.
    expect(pickCategory('Flags')).toBeNull()
  })
})

describe('stripBrandPrefix', () => {
  it('strips the brand a name repeats', () => {
    expect(stripBrandPrefix('Masafi Natural Mineral Water', 'MASAFI')).toBe(
      'Natural Mineral Water'
    )
  })

  it('strips a multi-word brand', () => {
    expect(stripBrandPrefix('Al Arz Bakery Large Arabic Bread', 'AL ARZ BAKERY')).toBe(
      'Large Arabic Bread'
    )
  })

  it('matches through punctuation the two fields spell differently', () => {
    expect(stripBrandPrefix("Driscoll's Blueberry", 'Driscolls')).toBe('Blueberry')
  })

  it('leaves the name alone when it does not start with the brand', () => {
    expect(stripBrandPrefix('Natural Mineral Water', 'MASAFI')).toBe('Natural Mineral Water')
  })

  it('refuses to strip a name down to nothing', () => {
    expect(stripBrandPrefix('Oasis', 'OASIS')).toBe('Oasis')
  })

  it('is a no-op without a brand', () => {
    expect(stripBrandPrefix('Loose Cucumber', null)).toBe('Loose Cucumber')
  })
})

describe('buildTags', () => {
  it('splits the level-1 path so both halves are searchable', () => {
    expect(buildTags(row({ categories_level1: ['Fresh Food /// Fruits & Vegetables'] }))).toEqual(
      expect.arrayContaining(['fresh food', 'fruits & vegetables'])
    )
  })

  it('caps the list, because a trigger rebuilds the vector on every write', () => {
    expect(
      buildTags(
        row({
          categories_level0: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
          categories_level1: ['k /// l', 'm /// n'],
        })
      )
    ).toHaveLength(7)
  })
})

describe('toProduct', () => {
  it('maps a branded packaged row', () => {
    expect(toProduct(row())).toMatchObject({
      barcode: '6281007032407',
      sku: '6281007032407',
      nameEn: 'Full Cream Milk',
      nameAr: 'حليب المراعي كامل الدسم - 1 لتر',
      brandEn: 'ALMARAI',
      category: 'Dairy',
      subcategory: 'Milk',
      packSize: 1,
      packUnit: 'L',
      sellBy: 'PACK',
    })
  })

  it('keeps a loose produce row that has no barcode', () => {
    // The OFF mapping rejects a row without a valid check digit. Here that
    // would drop the 536 rows a grocery's offer book is actually built from.
    const loose = toProduct(
      row({
        sku: '01190',
        name: 'Loose Cucumber - UAE',
        name_ar: 'خيار – الإمارات',
        brand: null,
        category_one: 'Fresh Vegetables',
      })
    )
    expect(loose).toMatchObject({
      barcode: null,
      sku: '01190',
      nameEn: 'Loose Cucumber',
      originEn: 'UAE',
      category: 'Fresh Produce',
      sellBy: 'LOOSE',
      packSize: null,
      packUnit: null,
      packCount: null,
    })
  })

  it('keeps a bagged produce row a pack, because it has a printed weight', () => {
    expect(
      toProduct(row({ sku: '05178', name: 'Potato Syria - 4kg', brand: null, category_one: 'Fresh Vegetables' }))
    ).toMatchObject({ sellBy: 'PACK', packSize: 4, packUnit: 'KG', originEn: 'Syria' })
  })

  it('nulls an Arabic name that is really the English one', () => {
    // Publishing an Arabic edition is blocked on a null nameAr — E5 §2. An
    // English string in that column publishes silently and prints English.
    expect(
      toProduct(row({ name_ar: 'Lusine White Sliced Bread - 600g' }))?.nameAr
    ).toBeNull()
  })

  it('drops the shared Magento placeholder rather than claiming an image', () => {
    expect(
      toProduct(
        row({
          image_url: 'https://www.unioncoop.ae/media/catalog/product/placeholder/default/image_1.jpg',
        })
      )?.sourceImageUrl
    ).toBeNull()
  })

  it('keeps an over-length electronics listing by taking its first segment', () => {
    // All 34 over-length rows in the file are TVs, laptops, phones and white
    // goods carrying their whole spec sheet as a name. Rejecting on length
    // dropped every one of them.
    const mapped = toProduct(
      row({
        sku: '8806097497936',
        brand: 'Samsung',
        category_one: 'Mobiles',
        name:
          'Samsung Galaxy Z Flip7 FE 5G | 8GB RAM | 256GB ROM | 6.7" Foldable Display | ' +
          '50MP + 12MP Dual Rear Camera | 10MP Front Camera | 4000mAh Battery | Exynos 2400 ' +
          '| Physical SIM + eSIM | White | UAE Version | SM-F761BZKAMEAW-PR5',
      })
    )
    expect(mapped?.nameEn).toBe('Galaxy Z Flip7 FE 5G')
    expect(mapped?.category).toBe('Electronics')
  })

  it('decodes the HTML entities the feed leaves in a name', () => {
    expect(toProduct(row({ name: 'Surface Laptop En &amp; Ar Keyboard', brand: null }))?.nameEn).toBe(
      'Surface Laptop En & Ar Keyboard'
    )
  })

  it('rejects a row with no usable name', () => {
    expect(toProduct(row({ name: '' }))).toBeNull()
    expect(toProduct(row({ name: 'unknown' }))).toBeNull()
    expect(toProduct(row({ name: '6281007032407' }))).toBeNull()
  })

  it('rejects a row with no item code, which is the only identity it has', () => {
    expect(toProduct(row({ sku: '' }))).toBeNull()
  })

  it('carries an invalid check digit as a SKU rather than as a barcode', () => {
    // A bad barcode in the universal catalog occupies the number the real
    // product will be scanned under — the reason `off-mapping.ts` rejects one
    // outright. Here the row is still worth having, so the code moves to the
    // field that makes no identity claim.
    const mapped = toProduct(row({ sku: '6281007032400' }))
    expect(mapped).toMatchObject({ barcode: null, sku: '6281007032400' })
  })

  it('records provenance for a later licensed replacement pass', () => {
    expect(toProduct(row())).toMatchObject({
      sourceUrl: 'https://www.unioncoop.ae/almarai-full-cream-milk-1l.html',
      sourceImageUrl: 'https://www.unioncoop.ae/media/catalog/product/6/2/6281007032407.jpg',
    })
  })
})
