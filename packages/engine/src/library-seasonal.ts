/**
 * The occasions a GCC retail calendar is actually built around.
 *
 * A seasonal block is a hero or a cover with the greeting already set in both
 * languages, which is the part an owner at 11pm on a Friday does not want to
 * compose — and the part that goes wrong when they do, because the English and
 * the Arabic get typed at different times and only one of them gets proofread.
 *
 * **No dates are attached to any of these.** `blocks.activeFrom` and `activeTo`
 * exist and stay null: Ramadan and both Eids move roughly eleven days earlier
 * each year against the Gregorian calendar, so a hard-coded window is a block
 * that hides itself in the wrong month from its second year onward. `isSeasonal`
 * is the honest half of that pair — it says *this is for an occasion*, which is
 * enough to group them in the library, and scheduling can arrive later without
 * a wrong answer having shipped in the meantime.
 *
 * The greetings are the conventional forms, not translations of the English:
 * "Ramadan Kareem" is what the band says in both editions because that is what
 * it says on the street.
 */

import type { Arrangement } from '@souqstudio/types'
import {
  HALF,
  PAGE,
  STRIP,
  box,
  ground,
  logo,
  panel,
  rule,
  shopField,
  still,
  words,
} from './library-kit'

export interface SeasonalBlock {
  id: string
  name: string
  description: string
  arrangements: Arrangement[]
}

/**
 * The shape most of these take: a greeting on a tinted band with a supporting
 * line under it and the logo at the end.
 *
 * Written once because it is genuinely the same design — eleven hand-drawn bands
 * would drift, and a library where the Eid band sits two points lower than the
 * Ramadan band is one an owner notices without knowing why.
 */
const greetingBand = (
  greetingEn: string,
  greetingAr: string,
  supportEn: string,
  supportAr: string,
  tint: 'primary' | 'secondary' | 'accent' | 'ink'
): Arrangement[] =>
  still(STRIP, [
    ground(tint),
    words('greeting', box(0.05, 0.2, 0.55, 0.34), greetingEn, greetingAr, 'h1'),
    // The rule sat at 0.62 with the support line starting at 0.64, and a band is
    // short enough that the two met: every one of these shipped with its second
    // line struck through. Text is drawn from the top of its box downward, so a
    // divider needs the gap above the box rather than beside it.
    rule('divider', box(0.05, 0.6, 0.14, 0.006), 'surface'),
    words('support', box(0.05, 0.68, 0.55, 0.2), supportEn, supportAr, 'body'),
    logo(box(0.86, 0.3, 0.1, 0.4)),
  ])

/** The centred variant, for the occasions that carry a single line and no more. */
const greetingCentred = (
  greetingEn: string,
  greetingAr: string,
  supportEn: string,
  supportAr: string,
  tint: 'primary' | 'secondary' | 'accent' | 'ink'
): Arrangement[] =>
  still(STRIP, [
    ground(tint),
    logo(box(0.46, 0.08, 0.08, 0.2)),
    words('greeting', box(0.1, 0.34, 0.8, 0.32), greetingEn, greetingAr, 'h1', {
      align: 'center',
    }),
    words('support', box(0.1, 0.7, 0.8, 0.18), supportEn, supportAr, 'body', { align: 'center' }),
  ])

export const SEASONAL_BLOCKS: SeasonalBlock[] = [
  {
    id: 'blk_season_ramadan',
    name: 'Ramadan band',
    description: 'Ramadan Kareem across the head of a page, with a line for the month’s offer.',
    arrangements: greetingBand(
      'Ramadan Kareem',
      'رمضان كريم',
      'Offers all month',
      'عروض طوال الشهر',
      'primary'
    ),
  },
  {
    id: 'blk_season_ramadan_cover',
    name: 'Ramadan cover',
    description: 'A full-page front for the month. The one book a grocery shop reprints every week.',
    arrangements: still(PAGE, [
      ground('primary'),
      logo(box(0.38, 0.08, 0.24, 0.09)),
      words('greeting', box(0.08, 0.28, 0.84, 0.14), 'Ramadan Kareem', 'رمضان كريم', 'h1', {
        align: 'center',
      }),
      // A tinted disc behind the masthead was the first idea and it drew a grey
      // smudge across the greeting: a circle at a third of its opacity is not a
      // lantern, it is a stain. A rule says the same thing and cannot go wrong.
      rule('divider', box(0.42, 0.46, 0.16, 0.006), 'surface'),
      words(
        'support',
        box(0.08, 0.52, 0.84, 0.07),
        'Offers all month',
        'عروض طوال الشهر',
        'h4',
        { align: 'center' }
      ),
      panel('plate', box(0.16, 0.64, 0.68, 0.12), 'surface'),
      shopField('name', box(0.18, 0.671, 0.64, 0.07), 'h4', { align: 'center', color: 'ink' }),
      words(
        'small',
        box(0.08, 0.9, 0.84, 0.05),
        'While stocks last',
        'حتى نفاد الكمية',
        'caption',
        { align: 'center' }
      ),
    ]),
  },
  {
    id: 'blk_season_eid_fitr',
    name: 'Eid Al Fitr band',
    description: 'Eid Mubarak, for the week the baskets get larger and the list gets longer.',
    arrangements: greetingCentred(
      'Eid Mubarak',
      'عيد مبارك',
      'Celebrate with us',
      'احتفلوا معنا',
      'accent'
    ),
  },
  {
    id: 'blk_season_eid_adha',
    name: 'Eid Al Adha band',
    description: 'Eid Al Adha Mubarak. The second Eid, and the one a butchery counter plans around.',
    arrangements: greetingBand(
      'Eid Al Adha Mubarak',
      'عيد أضحى مبارك',
      'Offers on your table',
      'عروض على مائدتكم',
      'secondary'
    ),
  },
  {
    id: 'blk_season_national_day',
    name: 'National Day band',
    description: 'The Spirit of the Union, for the first week of December.',
    arrangements: greetingCentred(
      'Spirit of the Union',
      'روح الاتحاد',
      'National Day offers',
      'عروض اليوم الوطني',
      'primary'
    ),
  },
  {
    id: 'blk_season_back_to_school',
    name: 'Back to school band',
    description: 'The August and September page: stationery, lunchboxes and uniform.',
    arrangements: greetingBand(
      'Back to school',
      'العودة إلى المدارس',
      'Everything on the list',
      'كل ما في القائمة',
      'accent'
    ),
  },
  {
    id: 'blk_season_summer',
    name: 'Summer band',
    description: 'The long, quiet months. Cooling, travel and everything that sells in forty degrees.',
    arrangements: greetingCentred(
      'Summer offers',
      'عروض الصيف',
      'Cool prices all season',
      'أسعار منعشة طوال الموسم',
      'secondary'
    ),
  },
  {
    id: 'blk_season_shopping_festival',
    name: 'Shopping festival band',
    description: 'The winter festival weeks, when every shop on the street is running something.',
    arrangements: greetingBand(
      'Shopping festival',
      'مهرجان التسوق',
      'Deals across the store',
      'عروض في كل الأقسام',
      'ink'
    ),
  },
  {
    id: 'blk_season_new_year',
    name: 'New year band',
    description: 'The turn of the year, and the restock that comes with it.',
    arrangements: greetingCentred(
      'Happy new year',
      'كل عام وأنتم بخير',
      'A fresh start on every aisle',
      'بداية جديدة في كل ممر',
      'ink'
    ),
  },
  {
    id: 'blk_season_mothers_day',
    name: 'Mother’s Day band',
    description: 'The twenty-first of March in the Gulf, not the date the rest of the world uses.',
    arrangements: greetingBand(
      'Mother’s Day',
      'عيد الأم',
      'Gifts and flowers in store',
      'هدايا وورود في الفرع',
      'accent'
    ),
  },
  {
    id: 'blk_season_anniversary',
    name: 'Anniversary band',
    description: 'The shop’s own occasion, which is the only one on this list nobody else is running.',
    arrangements: still(HALF, [
      ground('primary'),
      logo(box(0.06, 0.12, 0.16, 0.16)),
      words('greeting', box(0.06, 0.34, 0.7, 0.2), 'Our anniversary', 'ذكرانا السنوية', 'h1'),
      rule('divider', box(0.06, 0.6, 0.16, 0.006), 'surface'),
      words(
        'support',
        box(0.06, 0.66, 0.72, 0.14),
        'Thank you for shopping with us',
        'شكرًا لتسوقكم معنا',
        'h4'
      ),
      shopField('name', box(0.06, 0.85, 0.6, 0.08), 'body'),
    ]),
  },
]
