import { describe, expect, it } from 'vitest'
import { OFFER_TYPES, offerTypeOf, offerTypeOptions } from './offer-types'
import { readOfferType } from './offer-import'

/**
 * One vocabulary, two ways in.
 *
 * **These exist because the two used to disagree.** The mechanics lived beside
 * the CSV parser, so a book built from a price list said "Buy 1 get 1 free" in
 * both languages and a book built by hand said whatever the owner typed into a
 * free-text chip, in one. Same promotion, same product, two wordings.
 *
 * The property worth protecting is that **adding a mechanic is a row**: nothing
 * in the editor, the importer or the route names a key, so a new entry in
 * `OFFER_TYPES` reaches all three with no other edit. A `switch` on `'bogo'`
 * anywhere is what would break that, and these tests would not catch it — so
 * they check the next best thing, which is that every consumer is generated
 * from the table.
 */

describe('offerTypeOptions', () => {
  it('offers every mechanic that has words, and nothing that does not', () => {
    const keys = offerTypeOptions().map((option) => option.key)

    // `discount` is a row whose phrase is null: the ordinary case, where the
    // two prices are the whole message. It must not be offered as a named
    // choice an owner could pick and then wonder why nothing changed.
    expect(keys).not.toContain('discount')
    expect(keys).toContain('bogo')

    const withWords = Object.entries(OFFER_TYPES).filter(([, phrase]) => phrase !== null)
    expect(keys).toHaveLength(withWords.length)
  })

  it('labels each one with the words the card will print', () => {
    for (const option of offerTypeOptions()) {
      expect(option.labelEn).toBe(OFFER_TYPES[option.key]?.labelEn)
    }
  })
})

describe('offerTypeOf', () => {
  it('recognises a stored chip written from the table', () => {
    expect(offerTypeOf('Buy 1 get 1 free')).toBe('bogo')
    expect(offerTypeOf('Buy 3 get 1 free')).toBe('buy3get1')
  })

  it('calls anything else custom, including an edited phrase', () => {
    // The row carries no key — the phrase *is* the record — so a chip somebody
    // retyped by hand reads back as the owner's own words. That is the honest
    // answer: it no longer says what the vocabulary says.
    expect(offerTypeOf('Ramadan special')).toBeNull()
    expect(offerTypeOf('Buy 1 get 1 FREE')).toBeNull()
  })
})

describe('the importer and the editor agree', () => {
  /**
   * The actual regression. A sheet saying `BOGOF` and an owner choosing "Buy 1
   * get 1 free" from the select must put the same two strings on the card, or
   * the same promotion prints two ways depending on how the book was made.
   */
  it('resolves a sheet spelling to the phrase the editor offers', () => {
    const fromSheet = readOfferType('BOGOF')
    expect(fromSheet.kind).toBe('known')
    if (fromSheet.kind !== 'known') return

    const fromEditor = OFFER_TYPES[fromSheet.key]
    expect(fromEditor).not.toBeNull()
    expect(fromSheet.labelEn).toBe(fromEditor?.labelEn)
    expect(fromSheet.labelAr).toBe(fromEditor?.labelAr)

    // And the editor would show that same chip as the mechanic it came from.
    expect(offerTypeOf(fromSheet.labelEn)).toBe(fromSheet.key)
  })

  it('gives every mechanic an Arabic phrase', () => {
    // A tier or a chip with no Arabic prints English on every card of an
    // Arabic edition. A CSV will never carry a translation, so the table is
    // the only place one can come from.
    for (const option of offerTypeOptions()) {
      expect(OFFER_TYPES[option.key]?.labelAr).toBeTruthy()
    }
  })
})
