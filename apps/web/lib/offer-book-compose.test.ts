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
  id: 'p-rice',
  nameEn: 'Sella Basmati Rice',
  nameAr: 'أرز بسمتي سيلا',
  specEn: 'Aged 2 years',
  specAr: 'معتق سنتين',
  brandEn: 'Abu Kass',
  brandAr: 'أبو كاس',
  originEn: 'India',
  originAr: 'الهند',
  imageUrl: 'https://cdn.example/rice-cutout.png',
  imageIsFallback: false,
  // A demo-seed row belongs to the organization that was seeded with it.
  imageIsShared: false,
  packSize: '5.000',
  packUnit: 'KG',
  packCount: null,
  sellBy: 'PACK',
}

const CREPES: ProductRow = {
  id: 'p-crepes',
  nameEn: 'Crepes',
  nameAr: null,
  specEn: null,
  specAr: null,
  brandEn: null,
  brandAr: null,
  originEn: null,
  originAr: null,
  imageUrl: null,
  imageIsFallback: false,
  // An Open Food Facts row is universal, and so is whatever photo it carries.
  imageIsShared: true,
  // 4.2% of the catalog carries a pack size, so the ordinary row has none and
  // the unit price line has nothing to derive from.
  packSize: null,
  packUnit: null,
  packCount: null,
  sellBy: 'PACK',
}

const TIER: TierRow = { id: 'tier_deal', labelEn: 'Deal', labelAr: 'عرض', tokenRef: 'accent' }

let itemSeq = 0
const item = (product: ProductRow, overrides: Partial<ItemRow> = {}): ItemRow => ({
  id: `itm_${(itemSeq += 1)}`,
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
  unitPriceMode: 'AUTO',
  unitPriceValue: null,
  unitPriceUnit: null,
  legalLines: [],
  chips: [],
  footnotes: [],
  items,
  ...overrides,
})

describe('composeOffer', () => {
  /**
   * The shop decides what a card prints where the currency goes; the offer
   * decides what the price *is*. These are the two halves of keeping that
   * separation honest.
   */
  describe('the currency a shop chose', () => {
    it('prints the ISO code when the shop has not chosen otherwise', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en')
      expect(out.priceMark.currencyLabel).toBeUndefined()
      expect(out.priceMark.currency).toBe('AED')
    })

    it('prints the market symbol when the shop asked for one', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en', {
        display: 'SYMBOL',
        symbol: null,
      })
      expect(out.priceMark.currencyLabel).toBe('د.إ')
    })

    it('prefers the shop’s own symbol over the market one', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en', {
        display: 'SYMBOL',
        symbol: 'Dhs',
      })
      expect(out.priceMark.currencyLabel).toBe('Dhs')
    })

    it('ignores a symbol while the shop is printing the code', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en', {
        display: 'CODE',
        symbol: 'Dhs',
      })
      expect(out.priceMark.currencyLabel).toBeUndefined()
    })

    /**
     * The one that matters. A symbol is typography; the code is arithmetic.
     * A Kuwaiti price carries three fils whichever the card prints, and the
     * failure this prevents is a flyer understating a price at a till.
     */
    it('never lets the symbol change how many fils a price has', () => {
      const kuwaiti = offer([item(RICE)], { currency: 'KWD', price: '12.75' })
      const asCode = composeOffer(kuwaiti, TIER, 'en')
      const asSymbol = composeOffer(kuwaiti, TIER, 'en', { display: 'SYMBOL', symbol: null })

      expect(asCode.priceMark.minor).toBe('750')
      expect(asSymbol.priceMark.minor).toBe('750')
      expect(asSymbol.priceMark.currency).toBe('KWD')
      expect(asSymbol.priceMark.currencyLabel).toBe('د.ك')
    })
  })

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

    it('exposes the items apart as well as joined', () => {
      // The card draws one string; the properties panel needs them separate to
      // remove one or change its connector.
      const out = composeOffer(
        offer([item(RICE), item(OIL, { position: 1, connector: 'OR' })]),
        TIER,
        'en'
      )
      expect(out.name).toBe('Sella Basmati Rice or Olive oil')
      expect(out.items.map((i) => [i.name, i.connector])).toEqual([
        ['Sella Basmati Rice', null],
        ['Olive oil', 'OR'],
      ])
    })

    it('refuses an offer with no items rather than drawing an empty card', () => {
      expect(() => composeOffer(offer([]), TIER, 'en')).toThrow(/no items/)
    })
  })

  /**
   * **What an override box falls back to, which is not what the card draws.**
   *
   * The properties panel shows each override field's fallback as its
   * placeholder — "leave this empty and you get *this*". It was using `name`
   * for that, and `name` is the wrong value twice over: it is resolved for the
   * *edition*, so an Arabic book offered the Arabic name as what the English
   * box would revert to; and it already has the override folded in, so a box
   * showed its own current value as the thing it would revert to.
   *
   * "Size or spec in this book" had no fallback shown at all, because there was
   * nothing on the item to show. That is what these pin.
   */
  describe('the catalog values behind each override', () => {
    it('carries the catalog’s own strings, unresolved and per language', () => {
      const out = composeOffer(offer([item(RICE)]), TIER, 'en')
      expect(out.items[0]?.catalog).toEqual({
        nameEn: 'Sella Basmati Rice',
        nameAr: 'أرز بسمتي سيلا',
        specEn: 'Aged 2 years',
        specAr: 'معتق سنتين',
      })
    })

    it('does not change with the edition', () => {
      // The bug this replaces: the English box's fallback was the Arabic name
      // whenever the book was Arabic.
      const en = composeOffer(offer([item(RICE)]), TIER, 'en')
      const ar = composeOffer(offer([item(RICE)]), TIER, 'ar')
      expect(ar.items[0]?.catalog).toEqual(en.items[0]?.catalog)
      // …while the resolved name does, which is the distinction.
      expect(ar.items[0]?.name).not.toBe(en.items[0]?.name)
    })

    it('is the catalog’s value even when the book overrides it', () => {
      // A box that showed its own current value as what it would revert to
      // says nothing at all.
      const out = composeOffer(
        offer([item(RICE, { nameOverrideEn: 'House basmati', specOverrideEn: '10 kg sack' })]),
        TIER,
        'en'
      )
      expect(out.items[0]?.name).toBe('House basmati')
      expect(out.items[0]?.catalog.nameEn).toBe('Sella Basmati Rice')
      expect(out.items[0]?.catalog.specEn).toBe('Aged 2 years')
    })

    it('reports a null rather than an empty string where the catalog is silent', () => {
      // 96% of the catalog looks like CREPES. The panel branches on null to say
      // "the catalog has no Arabic name" instead of promising one that is not
      // there, so the difference has to survive composition.
      const out = composeOffer(offer([item(CREPES)]), TIER, 'en')
      expect(out.items[0]?.catalog).toEqual({
        nameEn: 'Crepes',
        nameAr: null,
        specEn: null,
        specAr: null,
      })
    })

    it('carries one set per item, not the lead’s for all of them', () => {
      const out = composeOffer(
        offer([item(RICE), item(CREPES, { position: 1, connector: 'OR' })]),
        TIER,
        'en'
      )
      expect(out.items.map((i) => i.catalog.nameEn)).toEqual(['Sella Basmati Rice', 'Crepes'])
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

    it('says whether the fallback photo is the shared catalog\'s', () => {
      /*
       * What the panel asks before spending a credit. A shared photo's cutout
       * reaches every other shop once a reviewer accepts it; the shop's own
       * photo is theirs, and asking about it would be a dialog with nothing
       * behind it.
       */
      const photo = { imageUrl: 'https://cdn.example/crepes.jpg', imageIsFallback: true }
      const shared = composeOffer(offer([item({ ...CREPES, ...photo })]), TIER, 'en')
      expect(shared.fallbackImageProductId).toBe('p-crepes')
      expect(shared.fallbackImageIsShared).toBe(true)

      const own = composeOffer(offer([item({ ...RICE, imageIsFallback: true })]), TIER, 'en')
      expect(own.fallbackImageProductId).toBe('p-rice')
      expect(own.fallbackImageIsShared).toBe(false)
    })

    it('does not describe a photo no button is offered against', () => {
      // Gated on the flag exactly as the id is, so a card with a good cutout
      // carries neither. A shared photo that needs nothing is not "shared" here
      // — there is no question to caption.
      const fine = composeOffer(offer([item(CREPES)]), TIER, 'en')
      expect(fine.flags).not.toContain('fallback-image')
      expect(fine.fallbackImageProductId).toBeNull()
      expect(fine.fallbackImageIsShared).toBe(false)
    })

    it('flags an unset price, because zero is not free', () => {
      // A book built from catalog rows has no prices to write — a price belongs
      // to an offer, and `offers.price` is NOT NULL. Zero is the placeholder and
      // it must never print.
      expect(composeOffer(offer([item(RICE)], { price: '0.00' }), TIER, 'en').flags).toContain(
        'no-price'
      )
      expect(composeOffer(offer([item(RICE)], { price: '0' }), TIER, 'en').flags).toContain(
        'no-price'
      )
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

    it('formats a was-price whose trailing zeros Prisma dropped', () => {
      // `Decimal(10,2)` holding 32.00 arrives from Prisma as the string `32`,
      // and `PriceMark.comparePrice` is documented as already formatted. Left
      // alone it prints `32` struck through beside `24.50`, which reads as a
      // typo on a flyer. Found by running a real book, not by a test.
      const out = composeOffer(offer([item(RICE)], { comparePrice: '32' }), TIER, 'en')
      expect(out.priceMark.comparePrice).toBe('32.00')
    })

    it('gives a three-decimal currency three digits on the was-price too', () => {
      const out = composeOffer(
        offer([item(RICE)], { price: '12.750', currency: 'KWD', comparePrice: '25.5' }),
        TIER,
        'en'
      )
      expect(out.priceMark.comparePrice).toBe('25.500')
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

describe('the unit price line — E5 §4', () => {
  it('derives from the lead item’s pack under AUTO', () => {
    // 24.50 for a 5 kg sack is 4.900 per kilo.
    expect(composeOffer(offer([item(RICE)]), TIER, 'en').unitPrice).toBe('1 kg = 4.900')
  })

  it('normalises grams to kilograms, so two packs are comparable', () => {
    const grams = { ...RICE, packSize: '500.000', packUnit: 'G' as const }
    const out = composeOffer(offer([item(grams)], { price: '6.00' }), TIER, 'en')
    expect(out.unitPrice).toBe('1 kg = 12.000')
  })

  it('multiplies a multipack out', () => {
    const multipack = { ...RICE, packSize: '25.000', packUnit: 'G' as const, packCount: 8 }
    const out = composeOffer(offer([item(multipack)], { price: '4.00' }), TIER, 'en')
    expect(out.unitPrice).toBe('1 kg = 20.000')
  })

  it('draws no line at all when the pack cannot answer', () => {
    // Not a zero, and not a guess: E5 §4 says a null reads as no line, because
    // a wrong rate on a printed page is worse than a missing one.
    expect(composeOffer(offer([item(CREPES)]), TIER, 'en').unitPrice).toBeNull()
  })

  it('draws no line for an unpriced offer', () => {
    // Zero is `createBook`'s placeholder for "not set yet", not a free product.
    expect(composeOffer(offer([item(RICE)], { price: '0' }), TIER, 'en').unitPrice).toBeNull()
  })

  it('reads the frozen value under MANUAL rather than recomputing', () => {
    // The whole point of freezing it: a reprint reproduces what was printed,
    // even after the pack data behind it was corrected.
    const out = composeOffer(
      offer([item(RICE)], {
        unitPriceMode: 'MANUAL',
        unitPriceValue: '3.250',
        unitPriceUnit: 'KG',
      }),
      TIER,
      'en'
    )
    expect(out.unitPrice).toBe('1 kg = 3.250')
  })

  it('draws nothing under HIDDEN, even with a pack that could answer', () => {
    const out = composeOffer(offer([item(RICE)], { unitPriceMode: 'HIDDEN' }), TIER, 'en')
    expect(out.unitPrice).toBeNull()
  })
})

describe('chips, footnotes and legal lines', () => {
  it('takes the edition’s label and falls back to the other language', () => {
    const chips = [
      {
        id: 'chip_1',
        labelEn: 'Limit 2',
        labelAr: 'حد ٢',
        anchor: 'TOP_START' as const,
        kind: 'COUNTER',
      },
      {
        id: 'chip_2',
        labelEn: 'Halal',
        labelAr: null,
        anchor: 'TOP_END' as const,
        kind: 'CERT',
      },
    ]
    const out = composeOffer(offer([item(RICE)], { chips }), TIER, 'ar')
    expect(out.chips.map((chip) => chip.label)).toEqual(['حد ٢', 'Halal'])
  })

  /**
   * Which chip the panel's offer-type control is editing.
   *
   * **Derived from the kind rather than stored twice.** A card draws all four
   * chips the same way; only the properties panel needs to know which one is
   * the mechanic, because that control replaces its value instead of appending
   * a second. `SCALE` is the marker — `lib/offer-types.ts` says why.
   */
  it('marks the mechanic chip and no other', () => {
    const chips = [
      {
        id: 'chip_1',
        labelEn: 'Buy 1 get 1 free',
        labelAr: 'اشترِ 1 واحصل على 1 مجاناً',
        anchor: 'TOP_START' as const,
        kind: 'SCALE',
      },
      {
        id: 'chip_2',
        labelEn: 'Limit 2',
        labelAr: null,
        anchor: 'TOP_END' as const,
        kind: 'COUNTER',
      },
    ]
    const out = composeOffer(offer([item(RICE)], { chips }), TIER, 'en')
    expect(out.chips.map((chip) => chip.isOfferType)).toEqual([true, false])
  })

  it('carries footnotes without a marker number', () => {
    // E6 §8: markers are assigned at render time in reading order, so an AR
    // edition numbers right-to-left from the same rows. Storing one would give
    // two answers that can disagree.
    const footnotes = [
      { id: 'fn_1', textEn: 'While stocks last', textAr: null, scope: 'PAGE' as const },
    ]
    const out = composeOffer(offer([item(RICE)], { footnotes }), TIER, 'en')
    expect(out.footnotes).toEqual([
      { id: 'fn_1', text: 'While stocks last', scope: 'PAGE' },
    ])
    expect(JSON.stringify(out.footnotes)).not.toContain('marker')
  })

  it('passes legal lines through untouched', () => {
    const out = composeOffer(offer([item(RICE)], { legalLines: ['Plus 0.50 deposit'] }), TIER, 'en')
    expect(out.legalLines).toEqual(['Plus 0.50 deposit'])
  })
})
