import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FONTS,
  familyForLevel,
  findFont,
  fontStack,
  fontsForRole,
  orderForPicker,
  resolveFont,
  resolveFonts,
  resolveScale,
  supportsItalic,
  type CatalogFont,
} from '@/lib/font-catalog'
import { EMPTY_CATALOG, TEST_CATALOG } from '@/lib/font-catalog.fixture'
import { rolesForCategory } from '@/lib/font-editorial'

describe('findFont', () => {
  it('finds by exact family name', () => {
    expect(findFont('Cairo', TEST_CATALOG)?.family).toBe('Cairo')
  })

  it('is undefined for a family we hold no files for', () => {
    expect(findFont('Comic Sans MS', TEST_CATALOG)).toBeUndefined()
    expect(findFont(null, TEST_CATALOG)).toBeUndefined()
    expect(findFont(undefined, TEST_CATALOG)).toBeUndefined()
  })
})

describe('fontsForRole', () => {
  it('offers a family only for the slots it suits', () => {
    const price = fontsForRole('price', TEST_CATALOG).map((f) => f.family)
    // Almarai is body-only: dense small print, not a price mark.
    expect(price).not.toContain('Almarai')
    expect(price).toContain('Changa')
  })

  it('offers nothing from an empty catalog', () => {
    expect(fontsForRole('body', EMPTY_CATALOG)).toEqual([])
  })
})

describe('resolveFont', () => {
  it('honours a stored family we hold', () => {
    expect(resolveFont({ fontBody: 'Tajawal' }, 'body', TEST_CATALOG)).toBe('Tajawal')
  })

  it('falls back when the stored family is not in the registry', () => {
    // The condition that matters is "are the files in R2", not "did we list the
    // name". A family we cannot draw would otherwise render as something else
    // with nothing failing, and the owner would find out in print.
    expect(resolveFont({ fontBody: 'Comic Sans MS' }, 'body', TEST_CATALOG)).toBe(
      DEFAULT_FONTS.body
    )
  })

  it('falls back again when the default itself is not mirrored', () => {
    // A sparse registry — somebody mirrored one family by name. The default for
    // the role is only a name, and nothing guarantees it was mirrored.
    const sparse = TEST_CATALOG.filter((font) => font.family === 'Cairo')
    expect(resolveFont({}, 'body', sparse)).toBe('Cairo')
  })

  it('lands on a chrome face when nothing is mirrored at all', () => {
    // A page drawn in this looks unstyled, which is the correct signal for an
    // empty registry. Drawing something plausible would hide it until export.
    expect(resolveFont({ fontBody: 'Cairo' }, 'body', EMPTY_CATALOG)).toBe(
      'IBM Plex Sans Arabic'
    )
  })
})

describe('resolveFonts', () => {
  it('resolves all four slots', () => {
    const fonts = resolveFonts({}, TEST_CATALOG)
    expect(Object.keys(fonts).sort()).toEqual(['body', 'display', 'headline', 'price'])
    expect(fonts.headline).toBe(DEFAULT_FONTS.headline)
  })
})

describe('supportsItalic', () => {
  it('reads what the registry holds, not a hand-typed boolean', () => {
    expect(supportsItalic('Rubik', TEST_CATALOG)).toBe(true)
    expect(supportsItalic('Cairo', TEST_CATALOG)).toBe(false)
  })

  it('is false for an unknown family rather than throwing', () => {
    expect(supportsItalic('Nothing', TEST_CATALOG)).toBe(false)
  })
})

describe('resolveScale', () => {
  it('binds h1 to headline and body to body by default', () => {
    const scale = resolveScale({}, TEST_CATALOG)
    expect(scale.levels.h1.family).toBe('headline')
    expect(scale.levels.body.family).toBe('body')
  })

  it('lets any level be re-bound to any slot', () => {
    // What stops the scale being card-shaped: a ticker band set in the headline
    // face is a different voice, not a bigger product name.
    const scale = resolveScale(
      { typeScale: { levels: { h5: { family: 'headline' } } } } as never,
      TEST_CATALOG
    )
    expect(scale.levels.h5.family).toBe('headline')
  })

  it('familyForLevel follows the binding through to a real family', () => {
    expect(familyForLevel({ fontHeadline: 'Reem Kufi' }, 'h1', TEST_CATALOG)).toBe('Reem Kufi')
  })
})

describe('fontStack', () => {
  it('names the family first and falls back to a face that carries both scripts', () => {
    const stack = fontStack('Cairo')
    expect(stack.startsWith("'Cairo'")).toBe(true)
    expect(stack).toContain('IBM Plex Sans Arabic')
  })
})

describe('orderForPicker', () => {
  it('pins the families we have an opinion about above the rest', () => {
    const unreviewed: CatalogFont = {
      family: 'Aardvark Sans',
      slug: 'aardvark-sans',
      roles: ['body'],
      weights: [400],
      italicWeights: [],
      subsets: ['latin'],
      category: 'sans-serif',
      note: 'sans serif.',
      hasItalic: false,
      recommended: false,
    }
    const ordered = orderForPicker([unreviewed, ...TEST_CATALOG])
    // Alphabetically first, but it sorts below every recommended family.
    expect(ordered[0]?.recommended).toBe(true)
    expect(ordered[ordered.length - 1]?.family).toBe('Aardvark Sans')
  })
})

describe('rolesForCategory', () => {
  it('keeps a handwriting face out of a price', () => {
    // A price has to be readable at a glance; that is the one thing it must do.
    expect(rolesForCategory('handwriting')).not.toContain('price')
    expect(rolesForCategory('handwriting')).toEqual(['headline'])
  })

  it('keeps a display face out of body copy', () => {
    // Small print in a display face is the commonest way an owner makes their
    // own book unreadable.
    expect(rolesForCategory('display')).not.toContain('body')
  })

  it('lets a plain text face fill any slot', () => {
    expect(rolesForCategory('sans-serif')).toHaveLength(4)
  })
})
