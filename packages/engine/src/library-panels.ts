/**
 * The blocks placed once: covers, hero bands, section dividers, panels, footers
 * and the square posts a shop puts on its feed.
 *
 * A static block has **no product in scope**, so the binding vocabulary here is
 * static copy, the shop's name and the logo — a product field on one of these is
 * an error `validateBlock` refuses, not merely an empty box. That constraint is
 * the whole content of "this only works on a product template".
 *
 * ## Two things the research settled
 *
 * **A flyer is not only offers.** Every weekly leaflet examined carries the same
 * furniture around the deals: a masthead with the validity dates, dividers
 * between categories so a shopper can navigate, a panel or two of message, and a
 * footer with the shop's name and the small print. Those are what make a page of
 * cards read as a publication, and until now the library had one hero, one
 * message and one footer.
 *
 * **Static copy carries both languages or it carries nothing.** `words()` takes
 * English and Arabic as two required arguments for that reason: a placeholder
 * headline with no Arabic renders a hole in the Arabic edition, and the owner
 * who typed it will never open that edition to find out.
 *
 * Every string here is a **placeholder the owner replaces**, so it says what
 * belongs in the slot rather than pretending to be real copy. "Section name",
 * not "Fresh & chilled" — an owner who leaves the default in should have printed
 * something that reads as unfinished.
 */

import type { Arrangement } from '@souqstudio/types'
import {
  HALF,
  OPEN,
  PAGE,
  SQUARE,
  STRIP,
  box,
  ground,
  logo,
  outline,
  panel,
  rule,
  shopField,
  still,
  words,
} from './library-kit'

/** A banner taller than it is wide: the side column of a page. */
const COLUMN = { aspectMin: 0.15, aspectMax: 0.5 }

export interface PanelBlock {
  id: string
  name: string
  description: string
  arrangements: Arrangement[]
}

// ─── Headers, covers and dividers ─────────────────────────────────────────────

/**
 * The headline blocks.
 *
 * `h1` resolves to the headline face, which is deliberately not the face product
 * names are set in — a flyer's "RAMADAN KAREEM" and its product names are not
 * one voice. That separation is why `TypeFamily` has `headline` and `display`
 * rather than one slot doing both.
 */
const HEADER_BLOCKS: PanelBlock[] = [
  {
    id: 'blk_hero_band',
    name: 'Hero band',
    description: 'A headline across the top of a page, in the headline typeface.',
    arrangements: still(STRIP, [
      ground('primary'),
      logo(box(0.04, 0.12, 0.08, 0.2)),
      words('headline', box(0.04, 0.4, 0.56, 0.3), 'Your headline', 'العنوان الرئيسي', 'h1'),
      words('support', box(0.04, 0.74, 0.56, 0.14), 'Supporting line', 'سطر داعم', 'body'),
      words('flash', box(0.66, 0.4, 0.3, 0.3), 'This week only', 'هذا الأسبوع فقط', 'h2', {
        align: 'end',
      }),
    ]),
  },
  {
    id: 'blk_hero_center',
    name: 'Hero band, centred',
    description: 'Logo, headline and a supporting line stacked on the centre line.',
    arrangements: still(STRIP, [
      ground('primary'),
      logo(box(0.45, 0.1, 0.1, 0.22)),
      words('headline', box(0.1, 0.38, 0.8, 0.3), 'Your headline', 'العنوان الرئيسي', 'h1', {
        align: 'center',
      }),
      words('support', box(0.1, 0.72, 0.8, 0.16), 'Supporting line', 'سطر داعم', 'body', {
        align: 'center',
      }),
    ]),
  },
  {
    id: 'blk_hero_split',
    name: 'Hero band, split',
    description: 'A colour block holding the headline, with the supporting copy on white beside it.',
    arrangements: still(STRIP, [
      ground('surface'),
      panel('tint', box(0, 0, 0.44, 1), 'primary'),
      logo(box(0.04, 0.12, 0.09, 0.22)),
      words('headline', box(0.04, 0.42, 0.34, 0.36), 'Your headline', 'العنوان الرئيسي', 'h1'),
      words('support', box(0.5, 0.32, 0.44, 0.24), 'Supporting line', 'سطر داعم', 'h4', {
        color: 'ink',
      }),
      words(
        'note',
        box(0.5, 0.6, 0.44, 0.16),
        'A second line of detail',
        'سطر ثانٍ من التفاصيل',
        'caption',
        { color: 'inkMuted' }
      ),
    ]),
  },
  {
    id: 'blk_section_divider',
    name: 'Section divider',
    description: 'A category heading between groups of offers, so a page can be navigated.',
    arrangements: still(STRIP, [
      ground('secondary'),
      panel('mark', box(0, 0, 0.018, 1), 'accent', { radius: 0 }),
      words('title', box(0.05, 0.24, 0.55, 0.5), 'Section name', 'اسم القسم', 'h2'),
      words('note', box(0.64, 0.34, 0.32, 0.3), 'Supporting line', 'سطر داعم', 'body', {
        align: 'end',
      }),
    ]),
  },
  {
    id: 'blk_validity_strip',
    name: 'Validity strip',
    description: 'The dates the prices hold, as a thin band. The line every leaflet has and few design.',
    arrangements: still(STRIP, [
      ground('accent'),
      words('label', box(0.04, 0.28, 0.4, 0.44), 'Offers valid', 'العروض سارية', 'h4'),
      words('dates', box(0.5, 0.28, 0.46, 0.44), '1 – 7 January', '١ – ٧ يناير', 'h4', {
        align: 'end',
      }),
    ]),
  },
  {
    id: 'blk_cover_page',
    name: 'Cover, page',
    description: 'A full-page front: logo, masthead, the dates, and your name on a plate.',
    arrangements: still(PAGE, [
      ground('primary'),
      logo(box(0.36, 0.08, 0.28, 0.1)),
      words('masthead', box(0.08, 0.26, 0.84, 0.2), 'Weekly offers', 'عروض الأسبوع', 'h1', {
        align: 'center',
      }),
      words('dates', box(0.08, 0.49, 0.84, 0.06), '1 – 7 January', '١ – ٧ يناير', 'body', {
        align: 'center',
      }),
      panel('plate', box(0.14, 0.62, 0.72, 0.14), 'surface'),
      shopField('name', box(0.16, 0.655, 0.68, 0.08), 'h3', { align: 'center', color: 'ink' }),
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
    id: 'blk_cover_story',
    name: 'Cover, story',
    description: 'The nine-by-sixteen front, with the type held clear of where a story puts its controls.',
    arrangements: still({ aspectMin: 0.45, aspectMax: 0.62 }, [
      ground('primary'),
      logo(box(0.36, 0.14, 0.28, 0.07)),
      words('masthead', box(0.08, 0.34, 0.84, 0.16), 'Weekly offers', 'عروض الأسبوع', 'h1', {
        align: 'center',
      }),
      words('dates', box(0.08, 0.52, 0.84, 0.05), '1 – 7 January', '١ – ٧ يناير', 'body', {
        align: 'center',
      }),
      panel('plate', box(0.16, 0.62, 0.68, 0.09), 'surface'),
      shopField('name', box(0.18, 0.641, 0.64, 0.05), 'h4', { align: 'center', color: 'ink' }),
    ]),
  },
]

// ─── Message and brand panels ─────────────────────────────────────────────────

/**
 * The blocks an owner **pins** rather than fills.
 *
 * A pin targets a position — page 2, cells 5–6 — and displaces products rather
 * than consuming them, so a message here means eleven posts from ten products
 * and never ten with one dropped. Composition model §6.2.
 */
const MESSAGE_BLOCKS: PanelBlock[] = [
  {
    id: 'blk_message',
    name: 'Message',
    description: 'A whole post or a pinned panel carrying a message instead of a product.',
    arrangements: still(OPEN, [
      ground('primary'),
      logo(box(0.38, 0.12, 0.24, 0.16)),
      words('message', box(0.1, 0.36, 0.8, 0.2), 'Your message', 'رسالتك', 'h2', {
        align: 'center',
      }),
      words('second-line', box(0.1, 0.6, 0.8, 0.16), 'A second line', 'سطر ثانٍ', 'body', {
        align: 'center',
      }),
    ]),
  },
  {
    id: 'blk_message_quiet',
    name: 'Message, quiet',
    description: 'The same panel on white with a hairline frame, for a note rather than an announcement.',
    arrangements: still(OPEN, [
      ground('surface', { stroke: outline('inkMuted', 0.004) }),
      words('message', box(0.1, 0.34, 0.8, 0.2), 'Your message', 'رسالتك', 'h3', {
        align: 'center',
        color: 'ink',
      }),
      rule('divider', box(0.4, 0.58, 0.2, 0.006), 'accent'),
      words('second-line', box(0.1, 0.63, 0.8, 0.16), 'A second line', 'سطر ثانٍ', 'body', {
        align: 'center',
        color: 'inkMuted',
      }),
    ]),
  },
  {
    id: 'blk_brand_panel',
    name: 'Brand panel, half page',
    description: 'A two-cell advertisement to pin beside the offers. Headline, support, logo.',
    arrangements: still(HALF, [
      ground('accent'),
      logo(box(0.06, 0.12, 0.16, 0.18)),
      words('headline', box(0.06, 0.38, 0.6, 0.24), 'Your headline', 'العنوان الرئيسي', 'h1'),
      words(
        'support',
        box(0.06, 0.66, 0.6, 0.18),
        'Supporting line',
        'سطر داعم',
        'h4'
      ),
    ]),
  },
  {
    id: 'blk_brand_panel_page',
    name: 'Brand panel, full page',
    description: 'A whole page given to one message. Pin it and the products route around it.',
    arrangements: still(PAGE, [
      ground('accent'),
      logo(box(0.08, 0.1, 0.2, 0.08)),
      words('headline', box(0.08, 0.32, 0.72, 0.18), 'Your headline', 'العنوان الرئيسي', 'h1'),
      words('support', box(0.08, 0.53, 0.72, 0.12), 'Supporting line', 'سطر داعم', 'h4'),
      rule('divider', box(0.08, 0.7, 0.3, 0.006), 'surface'),
      shopField('name', box(0.08, 0.75, 0.6, 0.06), 'body'),
    ]),
  },
  {
    id: 'blk_order_panel',
    name: 'Order-with-us panel',
    description: 'The call to action a shared book needs: how to order, in the two lines it takes.',
    arrangements: still(SQUARE, [
      ground('primary'),
      logo(box(0.4, 0.12, 0.2, 0.12)),
      words('headline', box(0.08, 0.34, 0.84, 0.16), 'Order with us', 'اطلب منّا', 'h1', {
        align: 'center',
      }),
      words(
        'support',
        box(0.08, 0.54, 0.84, 0.14),
        'Send your list and we will deliver',
        'أرسل قائمتك ونحن نوصلها',
        'body',
        { align: 'center' }
      ),
      panel('plate', box(0.2, 0.74, 0.6, 0.12), 'surface'),
      shopField('name', box(0.22, 0.771, 0.56, 0.07), 'h4', { align: 'center', color: 'ink' }),
    ]),
  },
  {
    id: 'blk_hours_panel',
    name: 'Opening hours panel',
    description: 'Hours and days on white with a frame. The panel a printed book is asked for most.',
    arrangements: still(SQUARE, [
      ground('surface', { stroke: outline('primary', 0.005) }),
      words('title', box(0.1, 0.16, 0.8, 0.12), 'Opening hours', 'ساعات العمل', 'h3', {
        align: 'center',
        color: 'ink',
      }),
      rule('divider', box(0.35, 0.33, 0.3, 0.006), 'primary'),
      words('line-one', box(0.1, 0.4, 0.8, 0.12), 'Saturday to Thursday', 'السبت إلى الخميس', 'h4', {
        align: 'center',
        color: 'ink',
      }),
      words('line-two', box(0.1, 0.54, 0.8, 0.1), '8am – 11pm', '٨ ص – ١١ م', 'body', {
        align: 'center',
        color: 'inkMuted',
      }),
      words('line-three', box(0.1, 0.68, 0.8, 0.1), 'Friday 2pm – 11pm', 'الجمعة ٢ م – ١١ م', 'body', {
        align: 'center',
        color: 'inkMuted',
      }),
    ]),
  },
  {
    id: 'blk_now_open',
    name: 'Now open panel',
    description: 'A new branch, announced on the page the customers are already reading.',
    arrangements: still(HALF, [
      ground('secondary'),
      words('flash', box(0.06, 0.16, 0.5, 0.18), 'Now open', 'افتتاح جديد', 'h1'),
      words('where', box(0.06, 0.42, 0.6, 0.2), 'Your new branch', 'فرعك الجديد', 'h3'),
      words('when', box(0.06, 0.68, 0.6, 0.14), 'Supporting line', 'سطر داعم', 'body'),
      logo(box(0.78, 0.36, 0.16, 0.28)),
    ]),
  },
  {
    id: 'blk_statement',
    name: 'Statement panel',
    description: 'One phrase, as large as the panel allows. For a pinned post between products.',
    arrangements: still(SQUARE, [
      ground('accent'),
      words('statement', box(0.08, 0.32, 0.84, 0.3), 'Your statement', 'عبارتك', 'h1', {
        align: 'center',
      }),
      words('support', box(0.08, 0.66, 0.84, 0.12), 'Supporting line', 'سطر داعم', 'body', {
        align: 'center',
      }),
    ]),
  },
  {
    id: 'blk_side_banner',
    name: 'Side banner',
    description: 'A tall column beside the offers, for a merged region down one edge of a page.',
    arrangements: still(COLUMN, [
      ground('primary'),
      logo(box(0.24, 0.06, 0.52, 0.08)),
      words('headline', box(0.1, 0.24, 0.8, 0.2), 'Your headline', 'العنوان الرئيسي', 'h2', {
        align: 'center',
      }),
      rule('divider', box(0.3, 0.5, 0.4, 0.006), 'surface'),
      words('support', box(0.1, 0.56, 0.8, 0.24), 'Supporting line', 'سطر داعم', 'body', {
        align: 'center',
      }),
    ]),
  },
]

// ─── Square posts ─────────────────────────────────────────────────────────────

/**
 * The blocks that **are** a page rather than sitting on one.
 *
 * A social post is one square — 1080 in `offer-book-compose.ts`, and full bleed,
 * because `PageGrid`'s margin is optional for exactly this. So these are drawn
 * at `SQUARE` and they are the only group here whose shape is not a negotiation
 * with the rest of a page: nothing else is on it.
 *
 * **They are a category rather than a corner of `panel`, and two of them moved
 * here to make that true.** `blk_cover_square` and `blk_thanks` were authored as
 * a header and a panel and describe themselves as the first and last post of a
 * carousel — which is what they are, and which is not what an owner is looking
 * for when they open "headers". The category is derived at seed time from the id
 * sets below, so moving them is a `pnpm db:seed` and nothing else; no book
 * references a category, and every pin references an id.
 *
 * **What a shop actually posts, and why there is no product on any of them.** A
 * post advertising one product is an *offer card* drawn at its square
 * arrangement — every card in `library-cards.ts` already carries `SQUARISH`, so
 * that case was covered before this group existed. What was missing is the other
 * half of a shop's feed: the announcement, the opening hours, the where-to-find
 * us, the thank-you. Those have no product in scope, which is why they are here
 * with the static blocks and why `validateBlock` refuses a product field on one.
 */
const SOCIAL_BLOCKS: PanelBlock[] = [
  {
    id: 'blk_cover_square',
    name: 'Cover, square post',
    description: 'The first post of a carousel. Logo, masthead, the dates, your name on a plate.',
    arrangements: still(SQUARE, [
      ground('primary'),
      logo(box(0.38, 0.1, 0.24, 0.12)),
      words('masthead', box(0.08, 0.32, 0.84, 0.22), 'Weekly offers', 'عروض الأسبوع', 'h1', {
        align: 'center',
      }),
      words('dates', box(0.08, 0.57, 0.84, 0.08), '1 – 7 January', '١ – ٧ يناير', 'body', {
        align: 'center',
      }),
      panel('plate', box(0.18, 0.72, 0.64, 0.14), 'surface'),
      shopField('name', box(0.2, 0.755, 0.6, 0.08), 'h4', { align: 'center', color: 'ink' }),
    ]),
  },
  {
    id: 'blk_post_split',
    name: 'Post, split',
    description: 'A colour half carrying the message, a white half carrying the shop.',
    arrangements: still(SQUARE, [
      ground('surface'),
      panel('tint', box(0, 0, 1, 0.56), 'primary'),
      logo(box(0.08, 0.08, 0.16, 0.09)),
      words('headline', box(0.08, 0.24, 0.84, 0.18), 'Your headline', 'العنوان الرئيسي', 'h1'),
      words('support', box(0.08, 0.44, 0.84, 0.08), 'Supporting line', 'سطر داعم', 'body'),
      shopField('name', box(0.08, 0.64, 0.84, 0.09), 'h3', { color: 'ink' }),
      words('note', box(0.08, 0.76, 0.84, 0.07), 'A second line of detail', 'سطر ثانٍ من التفاصيل', 'body', {
        color: 'inkMuted',
      }),
      // Static rather than `shopField('phone')`: neither painter resolves a shop's
      // phone or address — `contentFor` returns an empty string for both — so a
      // binding here is a blank where the design says there is a line.
      // `library.test.ts` holds the whole seeded library to that.
      words('phone', box(0.08, 0.85, 0.84, 0.07), 'Your phone number', 'رقم هاتفكم', 'h4', {
        color: 'ink',
      }),
    ]),
  },
  {
    id: 'blk_post_framed',
    name: 'Post, framed',
    description: 'A hairline frame, centred type and a rule. The quiet one on a loud feed.',
    arrangements: still(SQUARE, [
      ground('surface'),
      panel('frame', box(0.06, 0.06, 0.88, 0.88), 'surface', { stroke: outline('primary') }),
      logo(box(0.44, 0.14, 0.12, 0.08)),
      words('flash', box(0.14, 0.26, 0.72, 0.05), 'This week only', 'هذا الأسبوع فقط', 'caption', {
        align: 'center',
        color: 'inkMuted',
        transform: 'uppercase',
      }),
      words('headline', box(0.12, 0.34, 0.76, 0.2), 'Your headline', 'العنوان الرئيسي', 'h1', {
        align: 'center',
        color: 'ink',
      }),
      rule('divider', box(0.42, 0.58, 0.16, 0.004), 'primary'),
      words('support', box(0.14, 0.63, 0.72, 0.1), 'Supporting line', 'سطر داعم', 'body', {
        align: 'center',
        color: 'inkMuted',
      }),
      shopField('name', box(0.12, 0.8, 0.76, 0.06), 'h4', { align: 'center', color: 'ink' }),
    ]),
  },
  {
    id: 'blk_post_flag',
    name: 'Post, flag',
    description: 'A coloured flag across the top corner carrying the flash, the message under it.',
    arrangements: still(SQUARE, [
      ground('surface'),
      // Straight rather than angled. A rotated flag is drawn from its box, so a
      // convincing one has to hang past the leading edge — and `validateBlock`
      // warns on any box outside the block that is not a chip, because on paper
      // that is the trim cutting through it.
      panel('flag', box(0, 0.08, 0.42, 0.1), 'accent', { radius: 0 }),
      words('flash', box(0.04, 0.1, 0.34, 0.06), 'This week only', 'هذا الأسبوع فقط', 'h4'),
      words('headline', box(0.08, 0.3, 0.84, 0.22), 'Your headline', 'العنوان الرئيسي', 'h1', {
        color: 'ink',
      }),
      words('support', box(0.08, 0.55, 0.84, 0.1), 'Supporting line', 'سطر داعم', 'body', {
        color: 'inkMuted',
      }),
      rule('divider', box(0.08, 0.7, 0.3, 0.004), 'accent'),
      shopField('name', box(0.08, 0.76, 0.6, 0.08), 'h4', { color: 'ink' }),
      logo(box(0.76, 0.76, 0.16, 0.1)),
    ]),
  },
  {
    id: 'blk_post_contact',
    name: 'Post, find us',
    description: 'Where the shop is and how to reach it, on a plate under the headline.',
    arrangements: still(SQUARE, [
      ground('primary'),
      logo(box(0.08, 0.08, 0.18, 0.1)),
      words('headline', box(0.08, 0.26, 0.84, 0.18), 'Find us', 'زوروا فرعنا', 'h1'),
      words('support', box(0.08, 0.47, 0.84, 0.08), 'Supporting line', 'سطر داعم', 'body'),
      panel('plate', box(0.08, 0.62, 0.84, 0.3), 'surface'),
      shopField('name', box(0.12, 0.66, 0.76, 0.08), 'h4', { color: 'ink' }),
      words('address', box(0.12, 0.75, 0.76, 0.07), 'Your address', 'عنوان فرعكم', 'body', {
        color: 'ink',
      }),
      words('phone', box(0.12, 0.83, 0.76, 0.06), 'Your phone number', 'رقم هاتفكم', 'body', {
        color: 'inkMuted',
      }),
    ]),
  },
  {
    id: 'blk_post_hours',
    name: 'Post, opening hours',
    description: 'The days and the times, set as a list. The post a shop is asked for weekly.',
    arrangements: still(SQUARE, [
      ground('secondary'),
      logo(box(0.08, 0.08, 0.16, 0.09)),
      words('title', box(0.08, 0.24, 0.84, 0.12), 'Opening hours', 'ساعات العمل', 'h2'),
      rule('divider', box(0.08, 0.4, 0.84, 0.004), 'surface'),
      words('days-1', box(0.08, 0.46, 0.44, 0.07), 'Saturday – Thursday', 'السبت – الخميس', 'body'),
      words('hours-1', box(0.54, 0.46, 0.38, 0.07), '8am – 11pm', '٨ ص – ١١ م', 'body', {
        align: 'end',
      }),
      words('days-2', box(0.08, 0.56, 0.44, 0.07), 'Friday', 'الجمعة', 'body'),
      words('hours-2', box(0.54, 0.56, 0.38, 0.07), '2pm – 11pm', '٢ م – ١١ م', 'body', {
        align: 'end',
      }),
      panel('plate', box(0.08, 0.72, 0.84, 0.16), 'surface'),
      shopField('name', box(0.12, 0.75, 0.76, 0.06), 'h4', { color: 'ink' }),
      words('phone', box(0.12, 0.815, 0.76, 0.05), 'Your phone number', 'رقم هاتفكم', 'caption', {
        color: 'inkMuted',
      }),
    ]),
  },
  {
    id: 'blk_post_dates',
    name: 'Post, dates',
    description: 'The dates set as the largest thing on the post. For the day before an offer starts.',
    arrangements: still(SQUARE, [
      ground('accent'),
      words('flash', box(0.08, 0.18, 0.84, 0.08), 'Starts Friday', 'يبدأ الجمعة', 'h4', {
        align: 'center',
      }),
      words('dates', box(0.08, 0.32, 0.84, 0.24), '1 – 7 January', '١ – ٧ يناير', 'h1', {
        align: 'center',
      }),
      rule('divider', box(0.4, 0.6, 0.2, 0.004), 'surface'),
      words('support', box(0.08, 0.65, 0.84, 0.1), 'Supporting line', 'سطر داعم', 'body', {
        align: 'center',
      }),
      logo(box(0.42, 0.82, 0.16, 0.1)),
    ]),
  },
  {
    id: 'blk_thanks',
    name: 'Post, thank you',
    description: 'The last post of a carousel, which is the one that gets the reply.',
    arrangements: still(SQUARE, [
      ground('surface'),
      logo(box(0.4, 0.22, 0.2, 0.14)),
      words('message', box(0.1, 0.46, 0.8, 0.14), 'Thank you', 'شكرًا لكم', 'h1', {
        align: 'center',
        color: 'ink',
      }),
      shopField('name', box(0.1, 0.63, 0.8, 0.08), 'h4', { align: 'center', color: 'ink' }),
      words('support', box(0.1, 0.74, 0.8, 0.08), 'Supporting line', 'سطر داعم', 'caption', {
        align: 'center',
        color: 'inkMuted',
      }),
    ]),
  },
]

// ─── Footers and the small print ─────────────────────────────────────────────

const FOOTER_BLOCKS: PanelBlock[] = [
  {
    id: 'blk_footer',
    name: 'Footer',
    description: 'Shop name, logo and the small print. Sits on a merged last row.',
    arrangements: still(STRIP, [
      ground('secondary'),
      logo(box(0.02, 0.2, 0.1, 0.6)),
      shopField('name', box(0.14, 0.24, 0.3, 0.5), 'h4'),
      words(
        'small-print',
        box(0.5, 0.3, 0.48, 0.4),
        'Prices valid while stocks last',
        'الأسعار سارية حتى نفاد الكمية',
        'caption',
        { align: 'end' }
      ),
    ]),
  },
  {
    id: 'blk_footer_center',
    name: 'Footer, centred',
    description: 'The shop name on the centre line with the small print beneath it.',
    arrangements: still(STRIP, [
      ground('primary'),
      shopField('name', box(0.2, 0.2, 0.6, 0.34), 'h4', { align: 'center' }),
      words(
        'small-print',
        box(0.2, 0.58, 0.6, 0.24),
        'Prices valid while stocks last',
        'الأسعار سارية حتى نفاد الكمية',
        'caption',
        { align: 'center' }
      ),
    ]),
  },
  {
    id: 'blk_footer_ink',
    name: 'Footer, ink',
    description: 'A near-black bar to close a page. The quietest of the three, and the most printable.',
    arrangements: still(STRIP, [
      ground('ink'),
      logo(box(0.02, 0.22, 0.09, 0.56)),
      shopField('name', box(0.13, 0.26, 0.34, 0.48), 'h4'),
      words(
        'small-print',
        box(0.52, 0.3, 0.46, 0.4),
        'Prices valid while stocks last',
        'الأسعار سارية حتى نفاد الكمية',
        'caption',
        { align: 'end' }
      ),
    ]),
  },
  {
    id: 'blk_terms',
    name: 'Terms block',
    description: 'Where the book-scoped footnotes collect. The back page of a printed leaflet.',
    arrangements: still(HALF, [
      ground('surface'),
      words('title', box(0.06, 0.1, 0.88, 0.12), 'Terms and conditions', 'الشروط والأحكام', 'h4', {
        color: 'ink',
      }),
      rule('divider', box(0.06, 0.26, 0.88, 0.006), 'inkMuted'),
      words(
        'body',
        box(0.06, 0.32, 0.88, 0.3),
        'Prices are in local currency and include VAT. Offers are valid while stocks last and may be limited per customer.',
        'الأسعار بالعملة المحلية وتشمل ضريبة القيمة المضافة. العروض سارية حتى نفاد الكمية وقد تكون محدودة لكل عميل.',
        'caption',
        { color: 'inkMuted' }
      ),
      shopField('name', box(0.06, 0.78, 0.5, 0.1), 'caption', { color: 'ink' }),
    ]),
  },
  {
    id: 'blk_contact_strip',
    name: 'Contact strip',
    description: 'Your name at the start of a thin band and a line of your own at the end.',
    arrangements: still(STRIP, [
      ground('accent'),
      shopField('name', box(0.04, 0.3, 0.42, 0.4), 'h4'),
      words('detail', box(0.5, 0.32, 0.46, 0.36), 'Visit us in store', 'زوروا فرعنا', 'body', {
        align: 'end',
      }),
    ]),
  },
]

export const PANEL_BLOCKS: PanelBlock[] = [
  ...HEADER_BLOCKS,
  ...MESSAGE_BLOCKS,
  ...FOOTER_BLOCKS,
  ...SOCIAL_BLOCKS,
]

export const HEADER_IDS = new Set(HEADER_BLOCKS.map((block) => block.id))
export const MESSAGE_IDS = new Set(MESSAGE_BLOCKS.map((block) => block.id))
export const FOOTER_IDS = new Set(FOOTER_BLOCKS.map((block) => block.id))
export const SOCIAL_IDS = new Set(SOCIAL_BLOCKS.map((block) => block.id))
