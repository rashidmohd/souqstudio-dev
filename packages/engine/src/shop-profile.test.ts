import { describe, expect, it } from 'vitest'
import {
  MAX_STORE_PHOTOS,
  MAX_TRADES,
  isShopProfileComplete,
  isShopTrade,
  profileGaps,
  storePhotoKeysOf,
  tradesOf,
  tradesPhrase,
  validTrades,
  type ShopProfile,
} from './shop-profile'

/**
 * The gate E8-01's flow refuses to start without. E8-01.
 *
 * Worth testing precisely because it is a *refusal*: an owner who is told their
 * profile is incomplete when it is not cannot do anything about it, and one let
 * through with nothing filled in pays ten credits for four generic characters.
 */

const profile = (over: Partial<ShopProfile> = {}): ShopProfile => ({
  trades: ['butcher'],
  bio: 'A family butcher in Sharjah, mostly lamb and chicken, halal, open since 1998.',
  storePhotoKeys: [],
  ...over,
})

describe('isShopProfileComplete', () => {
  it('accepts a trade and a real description', () => {
    expect(isShopProfileComplete(profile())).toBe(true)
  })

  it('accepts several segments — a grocery with a bakery counter', () => {
    expect(isShopProfileComplete(profile({ trades: ['grocery', 'bakery'] }))).toBe(true)
  })

  it('refuses a profile with no segment', () => {
    expect(isShopProfileComplete(profile({ trades: [] }))).toBe(false)
  })

  it('refuses a profile whose only segment this build does not know', () => {
    // A stale client, or a segment removed from the list. Either way the prompt
    // has nothing to say about it, so it is not complete.
    expect(isShopProfileComplete(profile({ trades: ['florist'] }))).toBe(false)
  })

  it('is complete when one of several segments is unknown', () => {
    // The known one still describes the shop. Dropping the stale name is what
    // `validTrades` is for; refusing the whole profile would be punishing an
    // owner for a value they cannot see.
    expect(isShopProfileComplete(profile({ trades: ['florist', 'grocery'] }))).toBe(true)
  })

  it('refuses a bio too short to say anything', () => {
    expect(isShopProfileComplete(profile({ bio: 'A shop.' }))).toBe(false)
  })

  it('refuses whitespace passed off as a bio', () => {
    expect(isShopProfileComplete(profile({ bio: '                              ' }))).toBe(false)
  })

  it('does not require photographs of the shop', () => {
    // Optional on purpose: requiring them gates the feature on a shop being
    // photogenic, and they are a scene reference rather than an input.
    expect(isShopProfileComplete(profile({ storePhotoKeys: [] }))).toBe(true)
  })
})

describe('profileGaps', () => {
  it('says nothing about a complete profile', () => {
    expect(profileGaps(profile())).toEqual([])
  })

  it('names both gaps, in the order a person would fix them', () => {
    expect(profileGaps({ trades: [], bio: null, storePhotoKeys: [] })).toEqual([
      'what the shop sells',
      'a description of the shop',
    ])
  })
})

describe('storePhotoKeysOf', () => {
  it('reads an array of keys back off the JSON column', () => {
    expect(storePhotoKeysOf(['a.png', 'b.png'])).toEqual(['a.png', 'b.png'])
  })

  it('treats anything that is not an array as none', () => {
    for (const value of [null, undefined, 'a.png', 42, {}]) {
      expect(storePhotoKeysOf(value)).toEqual([])
    }
  })

  it('drops entries that are not usable keys', () => {
    expect(storePhotoKeysOf(['a.png', '', 7, null, 'b.png'])).toEqual(['a.png', 'b.png'])
  })

  it('caps what it returns, however many were stored', () => {
    const many = Array.from({ length: MAX_STORE_PHOTOS + 3 }, (_, i) => `${i}.png`)
    expect(storePhotoKeysOf(many)).toHaveLength(MAX_STORE_PHOTOS)
  })
})

describe('isShopTrade', () => {
  it('accepts a trade on the list and refuses one that is not', () => {
    expect(isShopTrade('pharmacy')).toBe(true)
    expect(isShopTrade('florist')).toBe(false)
  })
})

describe('validTrades', () => {
  it('keeps what it knows and drops what it does not', () => {
    expect(validTrades(['grocery', 'florist', 'bakery'])).toEqual(['grocery', 'bakery'])
  })

  it('keeps the owner’s order — the first is what the shop leads with', () => {
    expect(validTrades(['bakery', 'grocery'])).toEqual(['bakery', 'grocery'])
  })

  it('drops a repeat rather than describing a shop twice', () => {
    expect(validTrades(['grocery', 'grocery'])).toEqual(['grocery'])
  })

  it('caps the list, however many were stored', () => {
    const many = ['grocery', 'bakery', 'butcher', 'pharmacy', 'fashion']
    expect(validTrades(many)).toHaveLength(MAX_TRADES)
  })
})

describe('tradesOf', () => {
  it('reads a list of strings back off the JSON column', () => {
    expect(tradesOf(['grocery', 'bakery'])).toEqual(['grocery', 'bakery'])
  })

  it('treats anything that is not an array as none', () => {
    for (const value of [null, undefined, 'grocery', 7, {}]) {
      expect(tradesOf(value)).toEqual([])
    }
  })

  it('drops entries that are not strings', () => {
    expect(tradesOf(['grocery', 3, null, 'bakery'])).toEqual(['grocery', 'bakery'])
  })
})

describe('tradesPhrase', () => {
  it('reads as a sentence for one, two and three', () => {
    expect(tradesPhrase(['grocery'])).toBe('a grocery shop or supermarket')
    expect(tradesPhrase(['grocery', 'bakery'])).toBe(
      'a grocery shop or supermarket and a bakery or sweet shop'
    )
    expect(tradesPhrase(['grocery', 'bakery', 'butcher'])).toBe(
      'a grocery shop or supermarket, a bakery or sweet shop and a butcher or fishmonger'
    )
  })

  it('falls back rather than producing an empty phrase', () => {
    // Unreachable through the gate, and the prompt still has to read as English
    // if it ever is reached.
    expect(tradesPhrase([])).toBe('a retail shop')
    expect(tradesPhrase(['florist'])).toBe('a retail shop')
  })
})
