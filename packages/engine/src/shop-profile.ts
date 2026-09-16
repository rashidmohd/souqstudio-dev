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

/**
 * How many segments one shop may claim.
 *
 * **Three, and the cap is the point.** A shop that is a grocery and a bakery is
 * ordinary and the product should say so; a shop claiming eight segments has
 * told a model nothing it can draw from, and "a grocery, electronics shop,
 * pharmacy, butcher, bakery, restaurant, clothing shop and hardware shop" is not
 * a sentence that produces a character. The field asks what the shop *mainly*
 * sells and this is what makes that more than a hint.
 */
export const MAX_TRADES = 3

/** How many photographs of the shop itself may be kept. */
export const MAX_STORE_PHOTOS = 4

export const MIN_BIO = 20
export const MAX_BIO = 600

export interface ShopProfile {
  /**
   * What the shop sells — one to `MAX_TRADES` of them.
   *
   * **A list rather than one, because shops are.** A grocery with a bakery
   * counter is the common case in this market, not an edge one, and forcing it
   * to pick produces a character holding the wrong thing.
   */
  trades: string[]
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
  if (validTrades(profile.trades).length === 0) return false
  const bio = profile.bio?.trim() ?? ''
  return bio.length >= MIN_BIO
}

/**
 * The segments this build understands, deduplicated and capped.
 *
 * **Everything reads the list through here.** It arrives from a JSON column and
 * from a client, so a stale name, a repeat or an eleventh entry are all things
 * that happen — and a prompt built from any of them is worse than one built from
 * fewer. Order is the owner's: the first is what the shop leads with.
 */
export function validTrades(trades: readonly string[]): ShopTrade[] {
  const seen = new Set<string>()
  const kept: ShopTrade[] = []

  for (const trade of trades) {
    if (!isShopTrade(trade) || seen.has(trade)) continue
    seen.add(trade)
    kept.push(trade)
    if (kept.length === MAX_TRADES) break
  }

  return kept
}

/** The segments as a JSON column hands them back. */
export function tradesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function isShopTrade(value: string): value is ShopTrade {
  return SHOP_TRADES.some((trade) => trade === value)
}

/** What is still missing, in the order a person would fix it. */
export function profileGaps(profile: ShopProfile): string[] {
  const gaps: string[] = []
  if (validTrades(profile.trades).length === 0) gaps.push('what the shop sells')
  if ((profile.bio?.trim().length ?? 0) < MIN_BIO) gaps.push('a description of the shop')
  return gaps
}

/**
 * The segments as one phrase, for a prompt. "a grocery shop and a bakery".
 *
 * Built here rather than in the worker so that the screen and the prompt cannot
 * describe the same shop differently — the argument `magic-prompt.ts` makes
 * about one question, one vocabulary.
 */
export function tradesPhrase(trades: readonly string[]): string {
  const parts = validTrades(trades).map((trade) => TRADE_COPY[trade].draw)
  if (parts.length === 0) return 'a retail shop'
  if (parts.length === 1) return parts[0] as string
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] as string}`
}

/** The R2 keys on a shop, read back defensively from a JSON column. */
export function storePhotoKeysOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(0, MAX_STORE_PHOTOS)
}
