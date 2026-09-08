import type { Currency } from '@souqstudio/types'

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
  nameEn: 'Automatic laundry detergent powder with lemon fragrance',
  nameAr: 'مسحوق غسيل أوتوماتيك بالليمون للغسالات الأوتوماتيكية',
  specEn: 'Front load, 3 kg, concentrated formula',
  specAr: 'تحميل أمامي، ٣ كجم، تركيبة مركزة',
  brandEn: 'Ariel',
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
  amount: 24.5,
  currency: 'AED' as Currency,
  comparePrice: '31.00',
  tierLabelEn: 'Save 20%',
  tierLabelAr: 'وفّر ٢٠٪',
} as const
