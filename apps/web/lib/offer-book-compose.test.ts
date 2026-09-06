import { describe, expect, it } from 'vitest'
import {
  composeOffer,
  toMasterGrid,
  type ItemRow,
  type OfferRow,
  type ProductRow,
  type TierRow,
} from '@/lib/offer-book-compose'

/**
 * The product shapes here are real catalog rows. `RICE` is a demo-seed row —
 * fully bilingual, which almost nothing in the universal catalog is. `CREPES`
 * is an Open Food Facts row: an English name, no Arabic, no spec, no image.
 * 96% of the catalog looks like the second one, so it is the case that decides
 * whether an Arabic edition is publishable.
 */
const RICE: ProductRow = {
  nameEn: 'Sella Basmati Rice',
  nameAr: 'أرز بسمتي سيلا',
  specEn: 'Aged 2 years',
  specAr: 'معتق سنتين',
  brandEn: 'Abu Kass',
  brandAr: 'أبو كاس',
  imageUrl: 'https://cdn.example/rice-cutout.png',
  imageIsFallback: false,
}

const CREPES: ProductRow = {
  nameEn: 'Crepes',
  nameAr: null,
  specEn: null,
  specAr: null,
  brandEn: null,
  brandAr: null,
  imageUrl: null,
  imageIsFallback: false,
}

const TIER: TierRow = { id: 'tier_deal', labelEn: 'Deal', labelAr: 'عرض', tokenRef: 'accent' }

const item = (product: ProductRow, overrides: Partial<ItemRow> = {}): ItemRow => ({
  position: 0,
  connector: null,
  nameOverrideEn: null,
  nameOverrideAr: null,
  specOverrideEn: null,
  specOverrideAr: null,
  product,
  ...overrides,
})

const offer = (items: ItemRow[], overrides: Partial<OfferRow> = {}): OfferRow => ({
  id: 'off_1',
  position: 0,
  price: '24.50',
  comparePrice: null,
  currency: 'AED',
  promoTierId: TIER.id,
  items,
  ...overrides,
})

describe('composeOffer', () => {
  describe('the edition picks the strings, and falls back', () => {
    it('draws the Arabic edition from the Arabic columns', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'ar')
      expect(out.name).toBe('أرز بسمتي سيلا')
      expect(out.spec).toBe('معتق سنتين')
      expect(out.brand).toBe('أبو كاس')
      expect(out.tierLabel).toBe('عرض')
    })

    it('falls back to English on an Arabic edition rather than drawing a blank', () => {
      // What every Open Food Facts row does today: the enrich worker throws, so
      // `nameAr` is null across the universal catalog. A blank card is worse
      // than a legible English one — the flag is what stops it publishing.
      const out = composeOffer(offer([item(CREPES)]), TIER, 'ar')
      expect(out.name).toBe('Crepes')
      expect(out.flags).toContain('missing-name-ar')
    })

    it('falls back the other way too', () => {
      const arabicOnly: ProductRow = { ...CREPES, nameEn: 'خردل', nameAr: 'خردل' }
      expect(composeOffer(offer([item(arabicOnly)]), TIER, 'en').name).toBe('خردل')
    })

    it('takes a per-book override ahead of the catalog, without touching it', () => {
      // E6-03: a shop renaming a product for one flyer is not a catalog edit.
      const renamed = item(RICE, { nameOverrideEn: 'Basmati, 2-year aged' })
      expect(composeOffer(offer([renamed]), TIER, 'en').name).toBe('Basmati, 2-year aged')
      // And the override is per-language: the AR edition still reads the catalog.
      expect(composeOffer(offer([renamed]), TIER, 'ar').name).toBe('أرز بسمتي سيلا')
    })
  })

  describe('a multi-item offer is one card', () => {
    const OIL: ProductRow = { ...RICE, nameEn: 'Olive oil', nameAr: 'زيت زيتون', brandEn: 'Rahma' }

    it('joins the items with the localised connector', () => {
      const out = composeOffer(
        offer([item(RICE), item(OIL, { position: 1, connector: 'OR' })]),
        TIER,
        'en'
      )
      expect(out.name).toBe('Sella Basmati Rice or Olive oil')
    })

    it('localises the connector for the Arabic edition', () => {
      const out = composeOffer(
        offer([item(RICE), item(OIL, { position: 1, connector: 'AND' })]),
        TIER,
        'ar'
      )
      expect(out.name).toBe('أرز بسمتي سيلا و زيت زيتون')
    })

    it('takes the brand, spec and image from item 0 only', () => {
      // The schema's rule: item 0 supplies the brand lockup and the packshot.
      // One card, one photo — not two cards sharing a price.
      const out = composeOffer(
        offer([item(RICE), item({ ...OIL, imageUrl: 'https://cdn.example/oil.png' }, { position: 1, connector: 'OR' })]),
        TIER,
        'en'
      )
      expect(out.brand).toBe('Abu Kass')
      expect(out.spec).toBe('Aged 2 years')
      expect(out.imageUrl).toBe('https://cdn.example/rice-cutout.png')
    })

    it('reads items in position order, not array order', () => {
      const out = composeOffer(
        offer([item(OIL, { position: 1, connector: 'OR' }), item(RICE)]),
        TIER,
        'en'
      )
      expect(out.name).toBe('Sella Basmati Rice or Olive oil')
    })

    it('joins with a space when an item carries no connector', () => {
      // Rather than inventing an "or" nobody chose.
      const out = composeOffer(offer([item(RICE), item(OIL, { position: 1 })]), TIER, 'en')
      expect(out.name).toBe('Sella Basmati Rice Olive oil')
    })

    it('refuses an offer with no items rather than drawing an empty card', () => {
      expect(() => composeOffer(offer([]), TIER, 'en')).toThrow(/no items/)
    })
  })

  describe('quality flags — E6-01', () => {
    it('flags a missing Arabic name on any item, not only the lead', () => {
      // Flagging only the item that supplies the image would pass a two-product
      // offer that cannot legally publish to an AR edition.
      const out = composeOffer(
        offer([item(RICE), item(CREPES, { position: 1, connector: 'OR' })]),
        TIER,
        'ar'
      )
      expect(out.flags).toContain('missing-name-ar')
    })

    it('does not flag a missing Arabic name on an English edition', () => {
      expect(composeOffer(offer([item(CREPES)]), TIER, 'en').flags).not.toContain(
        'missing-name-ar'
      )
    })

    it('tells a missing image apart from a fallback one', () => {
      // They need different words: one is "nothing to print", the other is
      // "a packshot with its background still on".
      expect(composeOffer(offer([item(CREPES)]), TIER, 'en').flags).toContain('no-image')

      const original = item({ ...RICE, imageIsFallback: true })
      const flags = composeOffer(offer([original]), TIER, 'en').flags
      expect(flags).toContain('fallback-image')
      expect(flags).not.toContain('no-image')
    })

    it('flags nothing on a complete row', () => {
      expect(composeOffer(offer([item(RICE)]), TIER, 'ar').flags).toEqual([])
    })
  })

  it("carries the tier's template token as written, not as a brand slot", () => {
    // `--sq-tpl-offer-red`, not `accent`. Two vocabularies that do not overlap:
    // a block element binds to the shop's palette, a promo tier names a fixed
    // system colour. See the note on ComposedOffer.tierToken.
    const tier: TierRow = { ...TIER, tokenRef: '--sq-tpl-offer-red' }
    expect(composeOffer(offer([item(RICE)]), tier, 'en').tierToken).toBe('--sq-tpl-offer-red')
  })

  describe('the price mark', () => {
    it('splits the amount and carries the tier', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en')
      expect(out.priceMark.major).toBe('24')
      expect(out.priceMark.minor).toBe('50')
      expect(out.priceMark.tierId).toBe('tier_deal')
      expect(out.priceMark.comparePrice).toBeUndefined()
    })

    it('carries the was-price when there is one', () => {
      const out = composeOffer(offer([item(RICE)], { comparePrice: '32.00' }), TIER, 'en')
      expect(out.priceMark.comparePrice).toBe('32.00')
    })

    it('gives a three-decimal currency three minor digits', () => {
      const out = composeOffer(
        offer([item(RICE)], { price: '12.750', currency: 'KWD' }),
        TIER,
        'en'
      )
      expect(out.priceMark.major).toBe('12')
      expect(out.priceMark.minor).toBe('750')
    })
  })
})

describe('toMasterGrid', () => {
  const ROW = { cols: [1, 1, 1], rows: [1, 1], gap: 0.022, margin: 0.04, regions: [] }

  it('passes the tracks through unchanged', () => {
    expect(toMasterGrid(ROW)).toEqual({
      cols: [1, 1, 1],
      rows: [1, 1],
      gap: 0.022,
      margin: 0.04,
      regions: [],
    })
  })

  it('throws on a regions column that is not an array', () => {
    // A Json column arrives as unknown. An overlapping region is an authoring
    // mistake the engine's own validateGrid reports; a regions value that is
    // not a list is a corrupt row, and there is nothing an owner can do with it.
    expect(() => toMasterGrid({ ...ROW, regions: null })).toThrow(/not an array/)
    expect(() => toMasterGrid({ ...ROW, regions: { id: 'r0' } })).toThrow(/not an array/)
  })
})
