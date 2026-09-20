/**
 * The shop a harness page is for, in both editions.
 *
 * **One fixture rather than a string per call site.** `main.ts` and
 * `gallery.ts` each carried `shopName: direction === 'rtl' ? … : …` and nothing
 * else, which was exactly as much of the vocabulary as the painter could
 * answer. A header or a footer is bound to an address, a phone number and an
 * offer period, and a gallery that renders those as empty boxes is a gallery
 * that says the block is broken when the fixture is.
 *
 * Every field is populated on purpose. E14 §3.5's test asserts each binding
 * draws *something*, and it can only do that against a fixture where each
 * subject exists — so an empty string here would be indistinguishable from a
 * binding nobody wired up, which is the whole defect being fixed.
 *
 * The numbers are invented and the formats are not: a UAE landline is
 * `+971 4 NNN NNNN`, and an offer period is a string the composer resolved
 * rather than a date the engine formatted — §8.
 */

export interface HarnessIdentity {
  shop: { name: string; address: string; phone: string }
  brand: { name: string; logo: string | null }
  book: { title: string; validFrom: string; validTo: string }
}

const EN: HarnessIdentity = {
  shop: {
    name: 'Al Nakheel Market',
    address: 'Shop 14, Al Wasl Road, Jumeirah 1, Dubai',
    phone: '+971 4 398 7710',
  },
  // The organization's name, which is what `brand.name` returns when the block's
  // identity is pinned to the parent — §3.2. A shop that inherits shows this.
  brand: { name: 'Al Nakheel Group', logo: null },
  book: {
    title: 'Weekly Offers',
    validFrom: '1 October',
    validTo: '7 October',
  },
}

const AR: HarnessIdentity = {
  shop: {
    name: 'أسواق النخيل',
    address: 'محل ١٤، شارع الوصل، جميرا ١، دبي',
    phone: '+971 4 398 7710',
  },
  brand: { name: 'مجموعة النخيل', logo: null },
  book: {
    title: 'عروض الأسبوع',
    validFrom: '١ أكتوبر',
    validTo: '٧ أكتوبر',
  },
}

export const identityFor = (direction: 'ltr' | 'rtl'): HarnessIdentity =>
  direction === 'rtl' ? AR : EN
