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
