import type { Currency } from '@souqstudio/types'

/**
 * The stand-in packshot a block preview draws.
 *
 * **For the library and nowhere near a book.** A shop browsing sixty-seven
 * blocks is looking at a shop window, and every card in it drawing the grey
 * "this product has no photograph" box sells none of them — the owner cannot
 * tell a photo-led card from a compact one when neither has a photo. The moment
 * they use the block it renders their own products, so nothing here reaches a
 * page anyone prints.
 *
 * It is **category artwork, not a photograph**, which is the honest thing for a
 * placeholder to be: it says "a product goes here" without pretending to be a
 * product the shop sells. Dairy is one of the ten in
 * `packages/db/src/catalog-categories.ts`; the rest slot in beside it the day
 * they exist, and `PACKSHOT` becomes a lookup rather than a constant.
 *
 * Served from `public/`, not from `assets.souqstudio.com`, for the same reason
 * as the illustrations and the fonts: a preview must not wait on a third-party
 * round trip to paint. It is deliberately **not** in `public/illustrations/` —
 * that directory is the chrome slot map in `lib/illustrations.ts`, audited
 * against the illustration manifest's charcoal-line, sand-ground rules, and this
 * is artboard content in its own palette rather than a chrome illustration.
 */
export const SAMPLE_PACKSHOT = '/preview/packshot-dairy.svg'

/**
 * The product a block preview draws.
 *
 * **Deliberately the worst case**, and the owner cannot change it. A preview
 * built from friendly data tells an owner their card works and then their real
 * catalog proves otherwise — so this carries the longest Arabic-length name in a
 * GCC grocery catalog, a two-line spec and a three-decimal Kuwaiti price. If a
 * block looks right here it looks right loaded.
 *
 * Same reasoning as the dummy set in the render harness, and the same reason
 * E6 §5 says to design a card at the dense, bilingual worst case.
 *
 * **It is not the worst case in one respect, and real rows found it.** Every
 * field here is translated, and 96% of the universal catalog has no `specAr` and
 * no `nameAr` at all — the Open Food Facts export carries no language variants
 * in any of its 211 columns. So an Arabic edition of a real product draws a
 * *Latin* spec line, and that is the string that reordered: `2 kg` printed as
 * `kg 2` until `textDirection` landed in the engine. A preview built only from
 * translated data cannot show that, which is why the render harness composes
 * real catalog rows beside these — `pnpm --filter @souqstudio/db
 * catalog:harness-export`. Adding an English string to `specAr` here would be
 * the wrong fix: the column means "the Arabic spec", and a row that has one is
 * still the case this preview is for.
 */
export const PREVIEW_PRODUCT = {
  // **Dairy, because the packshot is.** These were a laundry detergent until the
  // sample gained a picture, and a card reading "Automatic laundry detergent
  // powder" over a carton of milk and a wedge of cheese is a preview that
  // undoes the reason for having a picture at all. Every worst-case property is
  // preserved and the strings got *longer*: the English name is 56 characters
  // against 55, the Arabic 58 against 52, and the spec still wraps to two lines
  // in a booklet cell.
  nameEn: 'Full cream long life milk enriched with vitamins A and D',
  nameAr: 'حليب طويل الأجل كامل الدسم مدعّم بفيتامينات أ و د الطبيعية',
  specEn: '1 litre, pack of 4, ultra heat treated',
  specAr: '١ لتر، عبوة من ٤، معالج بالحرارة العالية',
  brandEn: 'Al Rawabi',
  imageUrl: SAMPLE_PACKSHOT,
  amount: 12.75,
  currency: 'KWD' as Currency,
  comparePrice: '25.500',
  tierLabelEn: 'Half price',
  tierLabelAr: 'نصف السعر',
} as const

/**
 * The product the designer's *canvas* draws, as against the stress panel above.
 *
 * The design system asks for two different things in two places, and both are
 * right: bound elements on the canvas render sample data so the owner is
 * designing against something that looks like their catalog, and a persistent
 * stress panel renders the worst case so they see the failure while they are
 * causing it.
 *
 * **This is the median real row, not a friendly one.** Of the 2,140 rows in the
 * catalog, 58% carry a brand, 33% a spec, 4.2% a pack size and 4.2% an image —
 * so a typical card is a short name, a placeholder and a good deal of space. A
 * "typical" sample with every field filled would be a third preview of the same
 * happy case, and the empty half is the part a designer has to see.
 */
export const TYPICAL_PRODUCT = {
  nameEn: 'Basmati rice 5 kg',
  // Null rather than a translation: 96% of the universal catalog has no Arabic
  // name, and a card that has never been drawn without one is a card whose
  // Arabic edition nobody has seen.
  nameAr: null,
  specEn: null,
  specAr: null,
  brandEn: 'Al Wadi',
  // **Null, and it stays null.** This is the median real row and 4.2% of the
  // catalog carries an image, so a typical card is a placeholder and a good deal
  // of space — which is the half of the card a designer has to see while they
  // are laying one out. The library preview is a shop window and may be dressed;
  // the canvas an owner designs on may not.
  imageUrl: null,
  amount: 24.5,
  currency: 'AED' as Currency,
  comparePrice: '31.00',
  tierLabelEn: 'Save 20%',
  tierLabelAr: 'وفّر ٢٠٪',
} as const
