/**
 * What a shop is, beyond its name. E8-01.
 *
 * **The prerequisite the character flow is gated on.** A generated character for
 * a butcher is not a character for an electronics shop — different uniform,
 * different props, different register — and until this existed the only thing
 * the product knew about a shop was its name and a logo. The flow refuses to
 * start without it, which is the point: the alternative is four generic
 * characters and an owner paying ten credits to learn that.
 *
 * **In the engine because two processes read it.** The web app renders the
 * picker and computes completeness; the worker turns the trade into a sentence
 * in a prompt.
 */

export const SHOP_TRADES = [
  'grocery',
  'electronics',
  'pharmacy',
  'butcher',
  'bakery',
  'restaurant',
  'fashion',
  'hardware',
  'beauty',
  'other',
] as const

export type ShopTrade = (typeof SHOP_TRADES)[number]

/** What the owner sees, and what the model is told the shop is. */
export const TRADE_COPY: Readonly<Record<ShopTrade, { label: string; draw: string }>> = {
  grocery: { label: 'Grocery or supermarket', draw: 'a grocery shop or supermarket' },
  electronics: { label: 'Electronics', draw: 'an electronics shop' },
  pharmacy: { label: 'Pharmacy', draw: 'a pharmacy' },
  butcher: { label: 'Butcher or fishmonger', draw: 'a butcher or fishmonger' },
  bakery: { label: 'Bakery or sweets', draw: 'a bakery or sweet shop' },
  restaurant: { label: 'Restaurant or café', draw: 'a restaurant or café' },
  fashion: { label: 'Clothing or fashion', draw: 'a clothing shop' },
  hardware: { label: 'Hardware or DIY', draw: 'a hardware shop' },
  beauty: { label: 'Beauty or perfume', draw: 'a beauty and perfume shop' },
  other: { label: 'Something else', draw: 'a retail shop' },
}

/** How many photographs of the shop itself may be kept. */
export const MAX_STORE_PHOTOS = 4

export const MIN_BIO = 20
export const MAX_BIO = 600

export interface ShopProfile {
  trade: string | null
  bio: string | null
  storePhotoKeys: string[]
}

/**
 * Whether the profile is complete enough to generate a character from.
 *
 * **The trade and the bio, and not the photographs.** The two text fields are
 * what make one shop's character different from another's, and both are free to
 * provide. Store photographs are a scene reference for owners who want their
 * character shown inside their own shop — genuinely optional, and requiring them
 * would gate the feature on a shop being photogenic.
 */
export function isShopProfileComplete(profile: ShopProfile): boolean {
  if (profile.trade === null || !isShopTrade(profile.trade)) return false
  const bio = profile.bio?.trim() ?? ''
  return bio.length >= MIN_BIO
}

export function isShopTrade(value: string): value is ShopTrade {
  return SHOP_TRADES.some((trade) => trade === value)
}

/** What is still missing, in the order a person would fix it. */
export function profileGaps(profile: ShopProfile): string[] {
  const gaps: string[] = []
  if (profile.trade === null || !isShopTrade(profile.trade)) gaps.push('what the shop sells')
  if ((profile.bio?.trim().length ?? 0) < MIN_BIO) gaps.push('a description of the shop')
  return gaps
}

/** The R2 keys on a shop, read back defensively from a JSON column. */
export function storePhotoKeysOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(0, MAX_STORE_PHOTOS)
}
