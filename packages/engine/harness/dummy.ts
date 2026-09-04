/**
 * Dummy products for the harness.
 *
 * Two sets, deliberately. `FRIENDLY` is what a demo would use. `WORST_CASE` is
 * the longest Arabic names in a real GCC grocery catalog, three-decimal Kuwaiti
 * prices and two-line specs — because a design that survives friendly data and
 * breaks on real data is worse than no preview at all.
 *
 * The owner never edits these. That puts the burden on us to pick badly-behaved
 * ones.
 */

import type { TokenRef, TypeScale } from '@souqstudio/types'

export interface DummyTier {
  labelEn: string
  labelAr: string
  token: TokenRef
}

export interface DummyProduct {
  id: string
  nameEn: string
  nameAr: string
  specEn: string
  specAr: string
  brandEn: string
  major: string
  minor: string
  currency: string
  comparePrice?: string
  tier: DummyTier
}

const DEAL: DummyTier = { labelEn: 'Deal', labelAr: 'عرض', token: 'accent' }
const HALF: DummyTier = { labelEn: 'Half price', labelAr: 'نصف السعر', token: 'primary' }
const NEW: DummyTier = { labelEn: 'New', labelAr: 'جديد', token: 'secondary' }

export const FRIENDLY: DummyProduct[] = [
  p('Basmati rice', 'أرز بسمتي', '5 kg', '٥ كجم', 'Tilda', '24', '50', 'AED', DEAL, '32.00'),
  p('Olive oil', 'زيت زيتون', '1 L', '١ لتر', 'Rahma', '18', '75', 'AED', HALF, '37.50'),
  p('Greek yoghurt', 'زبادي يوناني', '500 g', '٥٠٠ جم', 'Almarai', '9', '25', 'AED', DEAL),
  p('Chicken breast', 'صدور دجاج', '1 kg', '١ كجم', 'Sadia', '21', '00', 'AED', DEAL, '26.00'),
  p('Orange juice', 'عصير برتقال', '1.5 L', '١٫٥ لتر', 'Lacnor', '11', '50', 'AED', NEW),
  p('Cheddar cheese', 'جبن شيدر', '400 g', '٤٠٠ جم', 'Puck', '16', '00', 'AED', DEAL),
  p('Laundry powder', 'مسحوق غسيل', '3 kg', '٣ كجم', 'Tide', '32', '75', 'AED', HALF, '65.50'),
  p('Mineral water', 'مياه معدنية', '12 × 1.5 L', '١٢ × ١٫٥ لتر', 'Masafi', '13', '25', 'AED', DEAL),
  p('Sunflower oil', 'زيت دوار الشمس', '1.8 L', '١٫٨ لتر', 'Noor', '14', '95', 'AED', DEAL),
  p('Instant coffee', 'قهوة سريعة الذوبان', '200 g', '٢٠٠ جم', 'Nescafé', '29', '00', 'AED', NEW),
  p('Corn flakes', 'رقائق الذرة', '750 g', '٧٥٠ جم', 'Kelloggs', '19', '50', 'AED', DEAL),
  p('Tomato paste', 'معجون طماطم', '6 × 135 g', '٦ × ١٣٥ جم', 'Al Alali', '8', '75', 'AED', DEAL),
]

/**
 * The same twelve slots, loaded with the longest realistic strings and a
 * three-decimal currency. This is the page to look at when deciding whether a
 * block design holds.
 */
export const WORST_CASE: DummyProduct[] = [
  p(
    'Automatic laundry detergent powder with lemon fragrance',
    'مسحوق غسيل أوتوماتيك بالليمون للغسالات الأوتوماتيكية',
    'Front load, 3 kg, concentrated formula',
    'تحميل أمامي، ٣ كجم، تركيبة مركزة',
    'Ariel',
    '12',
    '750',
    'KWD',
    HALF,
    '25.500'
  ),
  p(
    'Extra virgin olive oil, cold pressed, first harvest',
    'زيت زيتون بكر ممتاز معصور على البارد من الحصاد الأول',
    'Glass bottle, 750 ml, product of Spain',
    'زجاجة زجاجية، ٧٥٠ مل، منتج إسباني',
    'Rahma',
    '8',
    '250',
    'KWD',
    DEAL
  ),
  p(
    'Long grain golden sella basmati rice aged two years',
    'أرز بسمتي ذهبي سيلا حبة طويلة معتق لمدة عامين',
    '10 kg jute bag',
    'كيس خيش ١٠ كجم',
    'Tilda',
    '15',
    '500',
    'KWD',
    DEAL,
    '19.750'
  ),
  ...FRIENDLY.slice(3),
]

function p(
  nameEn: string,
  nameAr: string,
  specEn: string,
  specAr: string,
  brandEn: string,
  major: string,
  minor: string,
  currency: string,
  tier: DummyTier,
  comparePrice?: string
): DummyProduct {
  const base = {
    id: `dummy_${nameEn.toLowerCase().replace(/[^a-z]+/g, '_').slice(0, 24)}`,
    nameEn,
    nameAr,
    specEn,
    specAr,
    brandEn,
    major,
    minor,
    currency,
    tier,
  }
  return comparePrice === undefined ? base : { ...base, comparePrice }
}

/** Stands in for a shop's brand kit. These are a *shop's* colours, not ours. */
export const KIT: Record<TokenRef, string> = {
  primary: '#1B4DB1',
  secondary: '#0E2A5C',
  accent: '#C9A227',
  surface: '#FFFFFF',
  ink: '#1A1A1A',
  inkMuted: '#6E7480',
}

export const PAGE_GROUND = '#F8F7F3'

/**
 * The typography half of the stand-in brand kit.
 *
 * `base` is a fraction of the block's shorter edge and every level multiplies
 * it, so h1 stays larger than h2 in a 1080px carousel post and in a 380px
 * booklet cell alike. A px size would be right in exactly one of them.
 */
export const SAMPLE_SCALE: TypeScale = {
  families: {
    // Four slots. `headline` is not `display`: a hero band and a product name
    // are not the same voice, and one slot for both made them the same size
    // problem instead of two type decisions.
    headline: "'Lalezar', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    display: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    price: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  base: 0.055,
  levels: {
    h1: { family: 'headline', size: 2.2, weight: 400, lineHeight: 1.02 },
    h2: { family: 'headline', size: 1.7, weight: 400, lineHeight: 1.06 },
    h3: { family: 'display', size: 1.25, weight: 700, lineHeight: 1.15 },
    h4: { family: 'display', size: 1, weight: 700, lineHeight: 1.2 },
    h5: { family: 'body', size: 0.85, weight: 600, lineHeight: 1.25 },
    h6: { family: 'body', size: 0.72, weight: 600, lineHeight: 1.3, transform: 'uppercase' },
    body: { family: 'body', size: 0.72, weight: 400, lineHeight: 1.35 },
    caption: { family: 'body', size: 0.58, weight: 400, lineHeight: 1.3 },
  },
}
