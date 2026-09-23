/**
 * What kind of promotion an offer is, in the words a card prints.
 *
 * **Extracted from `lib/offer-import.ts` the day the editor needed it.** The
 * vocabulary was written for a CSV column and lived beside the parser that read
 * one, which meant a book built from a sheet said "Buy 1 get 1 free" in both
 * languages and a book built by hand said whatever the owner typed into a free
 * -text chip, in one. Two wordings for one promotion, from the same product,
 * which is exactly what a closed set exists to prevent.
 *
 * So the set lives here, the importer reads it, and the editor's offer-type
 * control is generated from it.
 *
 * **Adding a mechanic is a row.** Nothing in the editor, the importer or the
 * card names a key: the select is built by iterating this object, the chip is
 * written from the phrase, and `TYPE_HINTS` only has to learn the spellings a
 * sheet might use. That is deliberate and it is the property to preserve —
 * a `switch` on `'bogo'` anywhere is the thing that makes the next mechanic a
 * change rather than a row.
 *
 * The set stays short on purpose: the mechanics a GCC grocery actually prints,
 * not a guess at every promotion in retail. Anything else is the owner's own
 * words, which `custom` carries.
 *
 * Pure: no database, no session, runs in the browser.
 */

/**
 * The closed set, bilingual.
 *
 * `null` is a mechanic that needs no chip. `discount` is the ordinary case —
 * the two prices are the whole message, and E6 §3 removed the discount-
 * magnitude badge deliberately, so a chip here would repeat what the price mark
 * already says louder.
 */
export const OFFER_TYPES = {
  discount: null,
  bogo: { labelEn: 'Buy 1 get 1 free', labelAr: 'اشترِ 1 واحصل على 1 مجاناً' },
  buy2get1: { labelEn: 'Buy 2 get 1 free', labelAr: 'اشترِ 2 واحصل على 1 مجاناً' },
  buy3get1: { labelEn: 'Buy 3 get 1 free', labelAr: 'اشترِ 3 واحصل على 1 مجاناً' },
} as const satisfies Record<string, { labelEn: string; labelAr: string } | null>

export type OfferTypeKey = keyof typeof OFFER_TYPES

/**
 * The chip kind an offer-type chip is written as.
 *
 * **`SCALE` already meant this.** The enum has carried it since E5 and the
 * editor's own chip dropdown labelled it "Buy N of M" — which is what a
 * multi-buy mechanic is. Reusing it means the offer type is identifiable on the
 * row without a new column: a card has at most one `SCALE` chip, so choosing a
 * different mechanic *replaces* rather than stacks, and clearing it removes
 * that chip and no other.
 *
 * The importer wrote these as `CUSTOM` before this existed, which made a
 * promotion from a sheet indistinguishable from a note the owner typed.
 */
export const OFFER_TYPE_CHIP_KIND = 'SCALE' as const

/**
 * What the control offers, in the order it offers it.
 *
 * Built from `OFFER_TYPES` rather than listed again, so a new row appears in
 * the editor with no second edit. `discount` is excluded: it is the absence of
 * a mechanic, and the control says that as "No promotion" rather than as a
 * named one an owner could pick and then wonder why nothing changed.
 */
export function offerTypeOptions(): { key: OfferTypeKey; labelEn: string }[] {
  // `Object.entries` widens the key to `string`, so the keys are taken from a
  // typed list instead. Everything else is still read off the table.
  return (Object.keys(OFFER_TYPES) as OfferTypeKey[]).flatMap((key) => {
    const phrase = OFFER_TYPES[key]
    return phrase === null ? [] : [{ key, labelEn: phrase.labelEn }]
  })
}

/**
 * Which mechanic a stored chip is, or null when its words are the owner's own.
 *
 * Matched on the English phrase rather than on a stored key, because the row
 * has no key column — the phrase *is* the record, written from this same table.
 * A chip whose text has since been edited by hand reads back as custom, which
 * is the honest answer: it no longer says what the vocabulary says.
 */
export function offerTypeOf(labelEn: string): OfferTypeKey | null {
  for (const key of Object.keys(OFFER_TYPES) as OfferTypeKey[]) {
    const phrase = OFFER_TYPES[key]
    if (phrase !== null && phrase.labelEn === labelEn) return key
  }
  return null
}
