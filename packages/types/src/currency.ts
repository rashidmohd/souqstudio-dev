/**
 * What a shop's currency is called on its own cards.
 *
 * **The code and the symbol are two different questions and only one of them is
 * the pricing authority.** `Currency` is an ISO code and stays that: it is what
 * decides whether a price carries two fils or three, and `THREE_DECIMAL_CURRENCIES`
 * reads it. What a *card prints* is a separate decision — a Gulf grocery prints
 * `د.إ` far more often than it prints `AED`, and a chain with a Latin brand
 * voice prints `Dhs`. Conflating the two would make choosing a symbol a pricing
 * change, which is how a Kuwaiti price quietly loses a digit.
 *
 * So the mark carries both: `PriceMark.currency` is the code and drives the
 * arithmetic, `PriceMark.currencyLabel` is the string and drives nothing.
 *
 * Here rather than in `apps/web/lib` for the reason `promo-tier.ts` gives at
 * length: the picker that renders these is a client component, and importing
 * `@souqstudio/db` from one pulls Prisma into the browser bundle — `typecheck`
 * and `lint` both pass on that and `next build` does not.
 */

import type { Currency } from './index'

/** Whether a card prints the ISO code or the symbol. A shop setting. */
export type CurrencyDisplay = 'CODE' | 'SYMBOL'

/**
 * The symbol each currency is written with in its own market.
 *
 * **Arabic script, all six, and that is the market rather than an oversight.**
 * Every GCC currency's everyday symbol is an Arabic abbreviation — `د.إ` is
 * *dirham imarati*, `ر.س` *riyal saudi*. A shop wanting a Latin short form
 * types one into `currencySymbol`; these are the defaults, not the only option.
 *
 * **Deliberately not the Unicode currency ligatures.** `﷼` (U+FDFC) and the
 * 2025 dirham and riyal marks are single codepoints with no coverage in most of
 * the brand-kit font catalog, and a missing glyph on a printed flyer is a
 * tofu box in the largest type on the page. Two or three ordinary Arabic
 * letters render in every font that covers Arabic at all, which every family in
 * the catalog does — that is a selection criterion for it.
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AED: 'د.إ',
  SAR: 'ر.س',
  QAR: 'ر.ق',
  KWD: 'د.ك',
  OMR: 'ر.ع',
  BHD: 'د.ب',
}

/** What each currency is called to an owner. Nobody picks an ISO code blind. */
export const CURRENCY_LABEL: Record<Currency, string> = {
  AED: 'UAE dirham',
  SAR: 'Saudi riyal',
  QAR: 'Qatari riyal',
  KWD: 'Kuwaiti dinar',
  OMR: 'Omani rial',
  BHD: 'Bahraini dinar',
}

/**
 * How long a shop's own symbol may be.
 *
 * It lands in the price mark, which is the largest thing on the card, and the
 * solver sizes the whole amount cluster around it — so a long one does not
 * overflow, it *shrinks the price*. Six characters is `Dhs.` with room and well
 * short of the length where that starts to show.
 */
export const MAX_CURRENCY_SYMBOL = 6

/**
 * What a card prints for this shop's currency.
 *
 * The owner's own symbol wins, then the market default, then the code — and
 * `CODE` short-circuits all of it. One function so the editor's preview, the
 * composer and the settings screen cannot answer it three ways.
 */
export function currencyLabelFor(
  currency: Currency,
  display: CurrencyDisplay,
  custom?: string | null
): string {
  if (display === 'CODE') return currency
  const own = custom?.trim()
  return own !== undefined && own !== '' ? own : CURRENCY_SYMBOLS[currency]
}
