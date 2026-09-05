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
