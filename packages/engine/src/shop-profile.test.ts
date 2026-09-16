import { describe, expect, it } from 'vitest'
import {
  MAX_STORE_PHOTOS,
  isShopProfileComplete,
  isShopTrade,
  profileGaps,
  storePhotoKeysOf,
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
  trade: 'butcher',
  bio: 'A family butcher in Sharjah, mostly lamb and chicken, halal, open since 1998.',
  storePhotoKeys: [],
  ...over,
})

describe('isShopProfileComplete', () => {
  it('accepts a trade and a real description', () => {
    expect(isShopProfileComplete(profile())).toBe(true)
  })

  it('refuses a profile with no trade', () => {
    expect(isShopProfileComplete(profile({ trade: null }))).toBe(false)
  })

  it('refuses a trade this build does not know', () => {
    // A stale client, or a trade removed from the list. Either way the prompt
    // has nothing to say about it, so it is not complete.
    expect(isShopProfileComplete(profile({ trade: 'florist' }))).toBe(false)
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
    expect(profileGaps({ trade: null, bio: null, storePhotoKeys: [] })).toEqual([
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
