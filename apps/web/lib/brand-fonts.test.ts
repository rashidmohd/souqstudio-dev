import { describe, it, expect } from 'vitest'
import type { BrandKit } from '@souqstudio/types'
import {
  BRAND_FONTS,
  DEFAULT_LEVEL_FAMILY,
  familyForLevel,
  resolveScale,
  DEFAULT_FONTS,
  FONT_ROLES,
  fontStack,
  fontsForRole,
  findFont,
  googleFontsHref,
  resolveFont,
  resolveFonts,
} from '@/lib/brand-fonts'

describe('the catalog', () => {
  it('offers every family for at least one role', () => {
    for (const font of BRAND_FONTS) {
      expect(font.roles.length).toBeGreaterThan(0)
    }
  })

  it('has a candidate for every role', () => {
    for (const role of FONT_ROLES) {
      expect(fontsForRole(role).length).toBeGreaterThan(0)
    }
  })

  it('defaults to families that are actually in the catalog', () => {
    // A default we do not load renders as something else, silently.
    for (const role of FONT_ROLES) {
      const family = DEFAULT_FONTS[role]
      expect(findFont(family)).toBeDefined()
      expect(fontsForRole(role).map((f) => f.family)).toContain(family)
    }
  })

  it('declares weights for every family', () => {
    for (const font of BRAND_FONTS) {
      expect(font.weights.length).toBeGreaterThan(0)
      expect(font.weights.every((w) => w >= 100 && w <= 900)).toBe(true)
    }
  })

  it('has no duplicate families', () => {
    const families = BRAND_FONTS.map((f) => f.family)
    expect(new Set(families).size).toBe(families.length)
  })
})

describe('resolveFont', () => {
  it('returns the stored family when it is in the catalog', () => {
    const kit: BrandKit = { fontDisplay: 'Rubik' }
    expect(resolveFont(kit, 'display')).toBe('Rubik')
  })

  it('falls back to the default when nothing is stored', () => {
    expect(resolveFont({}, 'price')).toBe(DEFAULT_FONTS.price)
  })

  it('falls back when the stored family has left the catalog', () => {
    // A name we do not load renders as something else. The owner should see the
    // fallback in the picker rather than discover it in print.
    const kit: BrandKit = { fontBody: 'Comic Sans MS' }
    expect(resolveFont(kit, 'body')).toBe(DEFAULT_FONTS.body)
  })

  it('resolves all four slots together', () => {
    expect(resolveFonts({ fontDisplay: 'Cairo' })).toEqual({
      headline: DEFAULT_FONTS.headline,
      display: 'Cairo',
      price: DEFAULT_FONTS.price,
      body: DEFAULT_FONTS.body,
    })
  })
})

describe('googleFontsHref', () => {
  it('builds one request for several families, with their weights', () => {
    const href = googleFontsHref(['Cairo', 'Changa'])
    expect(href).toContain('family=Cairo:wght@400;600;700;800')
    expect(href).toContain('family=Changa:wght@500;700;800')
    expect(href).toContain('display=swap')
  })

  it('escapes spaces in a family name', () => {
    expect(googleFontsHref(['Readex Pro'])).toContain('family=Readex+Pro')
  })

  it('deduplicates, so three roles on one family make one request', () => {
    const href = googleFontsHref(['Cairo', 'Cairo', 'Cairo'])
    expect(href.match(/family=/g)).toHaveLength(1)
  })

  it('drops families that are not in the catalog', () => {
    // Never build a request from a stored value: it comes from a JSON column.
    expect(googleFontsHref(['Cairo', 'Comic Sans MS'])).not.toContain('Comic')
  })

  it('returns an empty string rather than a bare URL when nothing is loadable', () => {
    expect(googleFontsHref([])).toBe('')
    expect(googleFontsHref(['Comic Sans MS'])).toBe('')
  })
})

describe('fontStack', () => {
  it('quotes the family and keeps an Arabic-capable fallback', () => {
    expect(fontStack('Readex Pro')).toBe(
      "'Readex Pro', 'IBM Plex Sans Arabic', system-ui, sans-serif"
    )
  })
})

describe('the headline slot', () => {
  it('is separate from display, so a hero is a different voice and not just a size', () => {
    // One slot for both made "RAMADAN KAREEM" and a product name the same face.
    const kit: BrandKit = { fontHeadline: 'Lalezar', fontDisplay: 'Cairo' }
    expect(familyForLevel(kit, 'h1')).toBe('Lalezar')
    expect(familyForLevel(kit, 'h3')).toBe('Cairo')
  })

  it('binds the hero range to headline and the product range to display', () => {
    expect(DEFAULT_LEVEL_FAMILY.h1).toBe('headline')
    expect(DEFAULT_LEVEL_FAMILY.h2).toBe('headline')
    expect(DEFAULT_LEVEL_FAMILY.h3).toBe('display')
  })

  it('offers a candidate for the headline slot', () => {
    expect(fontsForRole('headline').length).toBeGreaterThan(0)
  })
})

describe('resolveScale', () => {
  it('fills every level, whatever the kit holds', () => {
    const scale = resolveScale({})
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'] as const) {
      expect(scale.levels[level].size).toBeGreaterThan(0)
      expect(scale.levels[level].family).toBeDefined()
    }
  })

  it('keeps the hierarchy ordered — h1 is always larger than h2', () => {
    const { levels } = resolveScale({})
    expect(levels.h1.size).toBeGreaterThan(levels.h2.size)
    expect(levels.h2.size).toBeGreaterThan(levels.h3.size)
    expect(levels.h3.size).toBeGreaterThan(levels.body.size)
    expect(levels.body.size).toBeGreaterThan(levels.caption.size)
  })

  it('lets a level be re-bound to any slot', () => {
    // The scale is not card-shaped: an owner who wants a ticker band set in the
    // headline face can have it without a new level or a new block kind.
    const kit: BrandKit = {
      fontHeadline: 'Lalezar',
      typeScale: {
        ...resolveScale({}),
        levels: { ...resolveScale({}).levels, h5: { ...resolveScale({}).levels.h5, family: 'headline' } },
      },
    }
    expect(familyForLevel(kit, 'h5')).toBe('Lalezar')
  })

  it('sizes relative to the block, never in pixels', () => {
    // A px size would be right in a 1080 post and wrong in a 380 booklet cell.
    expect(resolveScale({}).base).toBeLessThan(1)
  })
})
