/**
 * Every currency a shop may price in — ISO 4217, and the data a price mark
 * needs to set one.
 *
 * **The code is the pricing authority and the symbol is typography.** That
 * separation is the whole reason this module exists as a table rather than as
 * two lists: `minorUnits` decides whether a price carries two fils, three or
 * none, which is what a price *is*; `symbol` decides what a card prints, which
 * is a look. Conflating them is how a shop choosing a nicer mark quietly drops
 * a digit off every Kuwaiti price.
 *
 * **Why all of them and not the six.** The set shipped as the GCC currencies
 * alone, which is the market this product sells into — but a currency picker
 * that cannot name the euro is a product telling a shop in Dubai that it may
 * not run a book for its Frankfurt branch. Every field here is already needed
 * for the six; carrying the rest costs a table and no code.
 *
 * **`minorUnits` is the column that must be right.** Sixteen currencies carry
 * none — a price in yen or CFA francs has no decimal part at all — and seven
 * carry three, of which Kuwait, Bahrain and Oman are core market. Everything
 * else is two. Those two exception lists are short, fixed and worth checking
 * against the ISO register rather than trusted because they look plausible.
 *
 * **A missing symbol is a real answer.** Most currencies have no mark of their
 * own and are written as their code — so `symbol` is what the currency is
 * *usually* written as, and for many of them that is `$` or the code itself.
 * `currencyLabelFor` falls back to the code, and a shop that disagrees types
 * its own into `Shop.currencySymbol`.
 *
 * Here rather than in `apps/web/lib` for the reason `promo-tier.ts` gives at
 * length: the picker that renders these is a client component, and importing
 * `@souqstudio/db` from one pulls Prisma into the browser bundle.
 */

/** Whether a card prints the ISO code or the symbol. A shop setting. */
export type CurrencyDisplay = 'CODE' | 'SYMBOL'

export interface CurrencyInfo {
  /** What it is called to an owner. Nobody picks an ISO code blind. */
  name: string
  /**
   * Digits after the decimal point, per ISO 4217.
   *
   * Arithmetic, never presentation. `minorDigits` reads it, `splitAmount`
   * splits on it, and the offer's price column has to be wide enough for the
   * largest of them.
   */
  minorUnits: 0 | 2 | 3
  /** What the currency is usually written as. Often the code, or a shared `$`. */
  symbol: string
}

/**
 * The register. Ordered by code, so the picker has a stable default order and
 * a reader can find a row.
 */
export const CURRENCY_INFO = {
  AED: { name: 'UAE dirham', minorUnits: 2, symbol: 'د.إ' },
  AFN: { name: 'Afghan afghani', minorUnits: 2, symbol: '؋' },
  ALL: { name: 'Albanian lek', minorUnits: 2, symbol: 'L' },
  AMD: { name: 'Armenian dram', minorUnits: 2, symbol: '֏' },
  ANG: { name: 'Netherlands Antillean guilder', minorUnits: 2, symbol: 'ƒ' },
  AOA: { name: 'Angolan kwanza', minorUnits: 2, symbol: 'Kz' },
  ARS: { name: 'Argentine peso', minorUnits: 2, symbol: '$' },
  AUD: { name: 'Australian dollar', minorUnits: 2, symbol: '$' },
  AWG: { name: 'Aruban florin', minorUnits: 2, symbol: 'ƒ' },
  AZN: { name: 'Azerbaijani manat', minorUnits: 2, symbol: '₼' },
  BAM: { name: 'Bosnia-Herzegovina convertible mark', minorUnits: 2, symbol: 'KM' },
  BBD: { name: 'Barbadian dollar', minorUnits: 2, symbol: '$' },
  BDT: { name: 'Bangladeshi taka', minorUnits: 2, symbol: '৳' },
  BGN: { name: 'Bulgarian lev', minorUnits: 2, symbol: 'лв' },
  BHD: { name: 'Bahraini dinar', minorUnits: 3, symbol: 'د.ب' },
  BIF: { name: 'Burundian franc', minorUnits: 0, symbol: 'FBu' },
  BMD: { name: 'Bermudian dollar', minorUnits: 2, symbol: '$' },
  BND: { name: 'Brunei dollar', minorUnits: 2, symbol: '$' },
  BOB: { name: 'Bolivian boliviano', minorUnits: 2, symbol: 'Bs.' },
  BRL: { name: 'Brazilian real', minorUnits: 2, symbol: 'R$' },
  BSD: { name: 'Bahamian dollar', minorUnits: 2, symbol: '$' },
  BTN: { name: 'Bhutanese ngultrum', minorUnits: 2, symbol: 'Nu.' },
  BWP: { name: 'Botswana pula', minorUnits: 2, symbol: 'P' },
  BYN: { name: 'Belarusian ruble', minorUnits: 2, symbol: 'Br' },
  BZD: { name: 'Belize dollar', minorUnits: 2, symbol: '$' },
  CAD: { name: 'Canadian dollar', minorUnits: 2, symbol: '$' },
  CDF: { name: 'Congolese franc', minorUnits: 2, symbol: 'FC' },
  CHF: { name: 'Swiss franc', minorUnits: 2, symbol: 'CHF' },
  CLP: { name: 'Chilean peso', minorUnits: 0, symbol: '$' },
  CNY: { name: 'Chinese yuan', minorUnits: 2, symbol: '¥' },
  COP: { name: 'Colombian peso', minorUnits: 2, symbol: '$' },
  CRC: { name: 'Costa Rican colon', minorUnits: 2, symbol: '₡' },
  CUP: { name: 'Cuban peso', minorUnits: 2, symbol: '$' },
  CVE: { name: 'Cape Verdean escudo', minorUnits: 2, symbol: '$' },
  CZK: { name: 'Czech koruna', minorUnits: 2, symbol: 'Kč' },
  DJF: { name: 'Djiboutian franc', minorUnits: 0, symbol: 'Fdj' },
  DKK: { name: 'Danish krone', minorUnits: 2, symbol: 'kr' },
  DOP: { name: 'Dominican peso', minorUnits: 2, symbol: '$' },
  DZD: { name: 'Algerian dinar', minorUnits: 2, symbol: 'د.ج' },
  EGP: { name: 'Egyptian pound', minorUnits: 2, symbol: 'ج.م' },
  ERN: { name: 'Eritrean nakfa', minorUnits: 2, symbol: 'Nfk' },
  ETB: { name: 'Ethiopian birr', minorUnits: 2, symbol: 'Br' },
  EUR: { name: 'Euro', minorUnits: 2, symbol: '€' },
  FJD: { name: 'Fijian dollar', minorUnits: 2, symbol: '$' },
  FKP: { name: 'Falkland Islands pound', minorUnits: 2, symbol: '£' },
  GBP: { name: 'British pound', minorUnits: 2, symbol: '£' },
  GEL: { name: 'Georgian lari', minorUnits: 2, symbol: '₾' },
  GHS: { name: 'Ghanaian cedi', minorUnits: 2, symbol: '₵' },
  GIP: { name: 'Gibraltar pound', minorUnits: 2, symbol: '£' },
  GMD: { name: 'Gambian dalasi', minorUnits: 2, symbol: 'D' },
  GNF: { name: 'Guinean franc', minorUnits: 0, symbol: 'FG' },
  GTQ: { name: 'Guatemalan quetzal', minorUnits: 2, symbol: 'Q' },
  GYD: { name: 'Guyanese dollar', minorUnits: 2, symbol: '$' },
  HKD: { name: 'Hong Kong dollar', minorUnits: 2, symbol: '$' },
  HNL: { name: 'Honduran lempira', minorUnits: 2, symbol: 'L' },
  HTG: { name: 'Haitian gourde', minorUnits: 2, symbol: 'G' },
  HUF: { name: 'Hungarian forint', minorUnits: 2, symbol: 'Ft' },
  IDR: { name: 'Indonesian rupiah', minorUnits: 2, symbol: 'Rp' },
  ILS: { name: 'Israeli new shekel', minorUnits: 2, symbol: '₪' },
  INR: { name: 'Indian rupee', minorUnits: 2, symbol: '₹' },
  IQD: { name: 'Iraqi dinar', minorUnits: 3, symbol: 'ع.د' },
  IRR: { name: 'Iranian rial', minorUnits: 2, symbol: '﷼' },
  ISK: { name: 'Icelandic krona', minorUnits: 0, symbol: 'kr' },
  JMD: { name: 'Jamaican dollar', minorUnits: 2, symbol: '$' },
  JOD: { name: 'Jordanian dinar', minorUnits: 3, symbol: 'د.ا' },
  JPY: { name: 'Japanese yen', minorUnits: 0, symbol: '¥' },
  KES: { name: 'Kenyan shilling', minorUnits: 2, symbol: 'KSh' },
  KGS: { name: 'Kyrgyzstani som', minorUnits: 2, symbol: 'с' },
  KHR: { name: 'Cambodian riel', minorUnits: 2, symbol: '៛' },
  KMF: { name: 'Comorian franc', minorUnits: 0, symbol: 'CF' },
  KPW: { name: 'North Korean won', minorUnits: 2, symbol: '₩' },
  KRW: { name: 'South Korean won', minorUnits: 0, symbol: '₩' },
  KWD: { name: 'Kuwaiti dinar', minorUnits: 3, symbol: 'د.ك' },
  KYD: { name: 'Cayman Islands dollar', minorUnits: 2, symbol: '$' },
  KZT: { name: 'Kazakhstani tenge', minorUnits: 2, symbol: '₸' },
  LAK: { name: 'Lao kip', minorUnits: 2, symbol: '₭' },
  LBP: { name: 'Lebanese pound', minorUnits: 2, symbol: 'ل.ل' },
  LKR: { name: 'Sri Lankan rupee', minorUnits: 2, symbol: '₨' },
  LRD: { name: 'Liberian dollar', minorUnits: 2, symbol: '$' },
  LSL: { name: 'Lesotho loti', minorUnits: 2, symbol: 'L' },
  LYD: { name: 'Libyan dinar', minorUnits: 3, symbol: 'ل.د' },
  MAD: { name: 'Moroccan dirham', minorUnits: 2, symbol: 'د.م.' },
  MDL: { name: 'Moldovan leu', minorUnits: 2, symbol: 'L' },
  MGA: { name: 'Malagasy ariary', minorUnits: 2, symbol: 'Ar' },
  MKD: { name: 'Macedonian denar', minorUnits: 2, symbol: 'ден' },
  MMK: { name: 'Myanmar kyat', minorUnits: 2, symbol: 'K' },
  MNT: { name: 'Mongolian togrog', minorUnits: 2, symbol: '₮' },
  MOP: { name: 'Macanese pataca', minorUnits: 2, symbol: 'MOP$' },
  MRU: { name: 'Mauritanian ouguiya', minorUnits: 2, symbol: 'UM' },
  MUR: { name: 'Mauritian rupee', minorUnits: 2, symbol: '₨' },
  MVR: { name: 'Maldivian rufiyaa', minorUnits: 2, symbol: '.ރ' },
  MWK: { name: 'Malawian kwacha', minorUnits: 2, symbol: 'MK' },
  MXN: { name: 'Mexican peso', minorUnits: 2, symbol: '$' },
  MYR: { name: 'Malaysian ringgit', minorUnits: 2, symbol: 'RM' },
  MZN: { name: 'Mozambican metical', minorUnits: 2, symbol: 'MT' },
  NAD: { name: 'Namibian dollar', minorUnits: 2, symbol: '$' },
  NGN: { name: 'Nigerian naira', minorUnits: 2, symbol: '₦' },
  NIO: { name: 'Nicaraguan cordoba', minorUnits: 2, symbol: 'C$' },
  NOK: { name: 'Norwegian krone', minorUnits: 2, symbol: 'kr' },
  NPR: { name: 'Nepalese rupee', minorUnits: 2, symbol: '₨' },
  NZD: { name: 'New Zealand dollar', minorUnits: 2, symbol: '$' },
  OMR: { name: 'Omani rial', minorUnits: 3, symbol: 'ر.ع' },
  PAB: { name: 'Panamanian balboa', minorUnits: 2, symbol: 'B/.' },
  PEN: { name: 'Peruvian sol', minorUnits: 2, symbol: 'S/' },
  PGK: { name: 'Papua New Guinean kina', minorUnits: 2, symbol: 'K' },
  PHP: { name: 'Philippine peso', minorUnits: 2, symbol: '₱' },
  PKR: { name: 'Pakistani rupee', minorUnits: 2, symbol: '₨' },
  PLN: { name: 'Polish zloty', minorUnits: 2, symbol: 'zł' },
  PYG: { name: 'Paraguayan guarani', minorUnits: 0, symbol: '₲' },
  QAR: { name: 'Qatari riyal', minorUnits: 2, symbol: 'ر.ق' },
  RON: { name: 'Romanian leu', minorUnits: 2, symbol: 'lei' },
  RSD: { name: 'Serbian dinar', minorUnits: 2, symbol: 'дин' },
  RUB: { name: 'Russian ruble', minorUnits: 2, symbol: '₽' },
  RWF: { name: 'Rwandan franc', minorUnits: 0, symbol: 'FRw' },
  SAR: { name: 'Saudi riyal', minorUnits: 2, symbol: 'ر.س' },
  SBD: { name: 'Solomon Islands dollar', minorUnits: 2, symbol: '$' },
  SCR: { name: 'Seychellois rupee', minorUnits: 2, symbol: '₨' },
  SDG: { name: 'Sudanese pound', minorUnits: 2, symbol: 'ج.س' },
  SEK: { name: 'Swedish krona', minorUnits: 2, symbol: 'kr' },
  SGD: { name: 'Singapore dollar', minorUnits: 2, symbol: '$' },
  SHP: { name: 'Saint Helena pound', minorUnits: 2, symbol: '£' },
  SLE: { name: 'Sierra Leonean leone', minorUnits: 2, symbol: 'Le' },
  SOS: { name: 'Somali shilling', minorUnits: 2, symbol: 'Sh' },
  SRD: { name: 'Surinamese dollar', minorUnits: 2, symbol: '$' },
  SSP: { name: 'South Sudanese pound', minorUnits: 2, symbol: '£' },
  STN: { name: 'Sao Tome and Principe dobra', minorUnits: 2, symbol: 'Db' },
  SVC: { name: 'Salvadoran colon', minorUnits: 2, symbol: '₡' },
  SYP: { name: 'Syrian pound', minorUnits: 2, symbol: 'ل.س' },
  SZL: { name: 'Swazi lilangeni', minorUnits: 2, symbol: 'L' },
  THB: { name: 'Thai baht', minorUnits: 2, symbol: '฿' },
  TJS: { name: 'Tajikistani somoni', minorUnits: 2, symbol: 'SM' },
  TMT: { name: 'Turkmenistan manat', minorUnits: 2, symbol: 'm' },
  TND: { name: 'Tunisian dinar', minorUnits: 3, symbol: 'د.ت' },
  TOP: { name: 'Tongan paanga', minorUnits: 2, symbol: 'T$' },
  TRY: { name: 'Turkish lira', minorUnits: 2, symbol: '₺' },
  TTD: { name: 'Trinidad and Tobago dollar', minorUnits: 2, symbol: '$' },
  TWD: { name: 'New Taiwan dollar', minorUnits: 2, symbol: 'NT$' },
  TZS: { name: 'Tanzanian shilling', minorUnits: 2, symbol: 'TSh' },
  UAH: { name: 'Ukrainian hryvnia', minorUnits: 2, symbol: '₴' },
  UGX: { name: 'Ugandan shilling', minorUnits: 0, symbol: 'USh' },
  USD: { name: 'US dollar', minorUnits: 2, symbol: '$' },
  UYU: { name: 'Uruguayan peso', minorUnits: 2, symbol: '$' },
  UZS: { name: 'Uzbekistani sum', minorUnits: 2, symbol: 'soum' },
  VES: { name: 'Venezuelan bolivar', minorUnits: 2, symbol: 'Bs.' },
  VND: { name: 'Vietnamese dong', minorUnits: 0, symbol: '₫' },
  VUV: { name: 'Vanuatu vatu', minorUnits: 0, symbol: 'VT' },
  WST: { name: 'Samoan tala', minorUnits: 2, symbol: 'T' },
  XAF: { name: 'Central African CFA franc', minorUnits: 0, symbol: 'FCFA' },
  XCD: { name: 'East Caribbean dollar', minorUnits: 2, symbol: '$' },
  XOF: { name: 'West African CFA franc', minorUnits: 0, symbol: 'CFA' },
  XPF: { name: 'CFP franc', minorUnits: 0, symbol: '₣' },
  YER: { name: 'Yemeni rial', minorUnits: 2, symbol: '﷼' },
  ZAR: { name: 'South African rand', minorUnits: 2, symbol: 'R' },
  ZMW: { name: 'Zambian kwacha', minorUnits: 2, symbol: 'ZK' },
  ZWG: { name: 'Zimbabwe Gold', minorUnits: 2, symbol: 'ZiG' },
} as const satisfies Record<string, CurrencyInfo>

export type Currency = keyof typeof CURRENCY_INFO

/** Every code, for a picker and for validation at a route boundary. */
export const CURRENCIES = Object.keys(CURRENCY_INFO) as [Currency, ...Currency[]]

/**
 * The currencies this product is actually sold into, first in any picker.
 *
 * **A hundred and fifty-five rows is a list nobody scrolls.** The shop that
 * needs the euro will look for it; the shop that needs the dirham should not
 * have to. Not a separate vocabulary — every one of these is in the table
 * above, and this only decides what is offered first.
 */
export const PRIORITY_CURRENCIES: readonly Currency[] = [
  'AED',
  'SAR',
  'QAR',
  'KWD',
  'OMR',
  'BHD',
]

/** What each is called to an owner. Derived, so there is one list of names. */
export const CURRENCY_LABEL: Record<Currency, string> = Object.fromEntries(
  CURRENCIES.map((code) => [code, CURRENCY_INFO[code].name])
) as Record<Currency, string>

/**
 * What each currency is usually written as.
 *
 * Kept as its own export because the GCC six are written in Arabic script and
 * that is what a card in this market prints — `د.إ` far more often than `AED`.
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = Object.fromEntries(
  CURRENCIES.map((code) => [code, CURRENCY_INFO[code].symbol])
) as Record<Currency, string>

/**
 * How many digits a currency carries after the point.
 *
 * **The one function that decides what a price is.** Every other reading of the
 * table is presentation; this one is arithmetic, and it is what
 * `THREE_DECIMAL_CURRENCIES` used to answer for three of the seven currencies
 * that need it.
 */
export function minorUnits(currency: Currency): 0 | 2 | 3 {
  return CURRENCY_INFO[currency].minorUnits
}

/**
 * The three-decimal currencies.
 *
 * Derived rather than listed, and kept because it is the name the engine and
 * the schema comment have used since E6. Seven of them, and Kuwait, Bahrain and
 * Oman are core market rather than an edge case.
 */
export const THREE_DECIMAL_CURRENCIES: readonly Currency[] = CURRENCIES.filter(
  (code) => CURRENCY_INFO[code].minorUnits === 3
)

/** The currencies with no decimal part at all — a price in yen has no sen. */
export const ZERO_DECIMAL_CURRENCIES: readonly Currency[] = CURRENCIES.filter(
  (code) => CURRENCY_INFO[code].minorUnits === 0
)

/** Whether a string names a currency this product knows. */
export function isCurrency(value: string): value is Currency {
  return Object.prototype.hasOwnProperty.call(CURRENCY_INFO, value)
}

/**
 * How long a shop's own symbol may be.
 *
 * It lands in the price mark, which is the largest thing on the card, and the
 * solver sizes the whole amount cluster around it — so a long one does not
 * overflow, it *shrinks the price*. Six characters is `Dhs.` with room.
 */
export const MAX_CURRENCY_SYMBOL = 6

/**
 * What a card prints for this shop's currency.
 *
 * The owner's own symbol wins, then the currency's usual one, then the code —
 * and `CODE` short-circuits all of it. One function so the editor's preview,
 * the composer and the settings screen cannot answer it three ways.
 */
export function currencyLabelFor(
  currency: Currency,
  display: CurrencyDisplay,
  custom?: string | null
): string {
  if (display === 'CODE') return currency
  const own = custom?.trim()
  if (own !== undefined && own !== '') return own
  return CURRENCY_SYMBOLS[currency] || currency
}

/**
 * The widest a money column has to be, in digits after the point.
 *
 * Three, because seven currencies carry three and three of those seven —
 * Kuwait, Bahrain, Oman — are core market. A column of two silently rounds a
 * Kuwaiti price to the nearest ten fils, which is not a display bug: it is a
 * different number, printed on a flyer a customer takes to a till.
 */
export const MAX_MINOR_UNITS = 3

/**
 * The syntax a typed amount must have, before anything knows its currency.
 *
 * **Deliberately the loosest of the three shapes**, because a route parses a
 * body before it has read the offer that says what currency it is in. This is
 * the grammar check; `amountFitsCurrency` below is the meaning check, and it
 * runs once the currency is known.
 *
 * Not a number at any point: `12.5` and `12.50` are the same number and
 * different strings, and money that has been through a float is money that can
 * come back as `9.949999999999999`.
 */
export const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,3})?$/

/** How many digits an amount string carries after the point. */
export function decimalsOf(value: string): number {
  const dot = value.indexOf('.')
  return dot === -1 ? 0 : value.length - dot - 1
}

/**
 * Whether an amount can be expressed in this currency at all.
 *
 * **A yen has no sen and a dinar has a thousand fils**, so `1200.50` is not a
 * price in JPY and `12.75` in KWD is very probably a price someone meant to
 * type as `12.750`. Rejecting at the boundary is what stops the column doing
 * the rounding silently — the failure this exists to prevent is a shop entering
 * a three-decimal price into a two-decimal column and printing the rounded one.
 */
export function amountFitsCurrency(value: string, currency: Currency): boolean {
  return AMOUNT_PATTERN.test(value) && decimalsOf(value) <= minorUnits(currency)
}

/**
 * An amount as a whole number of minor units.
 *
 * **Never `Number(price)` for arithmetic.** Taking a percentage off a float is
 * how 9.95 becomes 9.949999999999999 in a number a customer reads off a flyer,
 * so everything that computes with money computes in whole minor units and
 * formats once at the end.
 *
 * Currency-aware, because the multiplier is not always a hundred: it is 1 for
 * yen and 1000 for a dinar.
 */
export function toMinorUnits(value: string, currency: Currency): number | null {
  if (!amountFitsCurrency(value, currency)) return null
  const scale = 10 ** minorUnits(currency)
  const [major = '0', minor = ''] = value.split('.')
  return Number(major) * scale + Number(minor.padEnd(minorUnits(currency), '0') || '0')
}

/** The inverse, to the currency's own precision. */
export function fromMinorUnits(units: number, currency: Currency): string {
  const digits = minorUnits(currency)
  return (units / 10 ** digits).toFixed(digits)
}
