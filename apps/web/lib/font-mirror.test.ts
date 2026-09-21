import { describe, expect, it } from 'vitest'
import { fontFileKey, fontSlug, fontWoff2Key, googleFontsDir } from '@souqstudio/types'
import { cssApiUrl, parseFontFaceCss, parseVariant } from '@/lib/font-mirror'

/**
 * The parsing, not the fetching. Everything here is what stands between Google's
 * reply and a key — and every failure mode in this file is silent in production:
 * a misparsed variant stores a face under a key nothing reads, and what comes
 * back is the fallback with no error anywhere.
 */

describe('parseVariant', () => {
  it('reads Google\'s vocabulary, which is not CSS\'s', () => {
    expect(parseVariant('regular')).toEqual({ weight: 400, italic: false })
    expect(parseVariant('italic')).toEqual({ weight: 400, italic: true })
    expect(parseVariant('700')).toEqual({ weight: 700, italic: false })
    expect(parseVariant('700italic')).toEqual({ weight: 700, italic: true })
    expect(parseVariant('100')).toEqual({ weight: 100, italic: false })
  })

  it('reads a four-digit weight', () => {
    // CSS defines wght to 1000 and Google names variants with bare digits, so a
    // family offering it is spelled `1000`. Three digits would drop that face
    // silently — unrecognised variants are filtered, not raised — leaving the
    // family registered complete with its heaviest weight missing.
    expect(parseVariant('1000')).toEqual({ weight: 1000, italic: false })
    expect(parseVariant('1000italic')).toEqual({ weight: 1000, italic: true })
  })

  it('refuses a weight CSS could not express', () => {
    expect(parseVariant('1001')).toBeNull()
    expect(parseVariant('0000')).toBeNull()
  })

  it('returns null rather than guessing at anything else', () => {
    // A variant we cannot name is a file stored under a key nothing looks for.
    expect(parseVariant('')).toBeNull()
    expect(parseVariant('bold')).toBeNull()
    expect(parseVariant('700oblique')).toBeNull()
    expect(parseVariant('12345')).toBeNull()
  })
})

describe('cssApiUrl', () => {
  it('drops the ital axis when a family has no italic', () => {
    const url = cssApiUrl('Cairo', [
      { weight: 700, italic: false },
      { weight: 400, italic: false },
    ])
    expect(url).toContain('family=Cairo:wght@400;700')
    expect(url).not.toContain('ital')
  })

  it('sorts ital then wght, which the API requires', () => {
    // Out of order is a 400 from Google, not a best effort.
    const url = cssApiUrl('Rubik', [
      { weight: 700, italic: true },
      { weight: 400, italic: false },
      { weight: 400, italic: true },
      { weight: 700, italic: false },
    ])
    expect(url).toContain('family=Rubik:ital,wght@0,400;0,700;1,400;1,700')
  })

  it('escapes the space in a multi-word family', () => {
    expect(cssApiUrl('Reem Kufi', [{ weight: 400, italic: false }])).toContain('family=Reem+Kufi:')
  })

  it('asks for swap', () => {
    expect(cssApiUrl('Cairo', [{ weight: 400, italic: false }])).toContain('display=swap')
  })
})

/** Google's shape, trimmed. The subset name exists only in the comment. */
const CSS_SAMPLE = `/* arabic */
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/cairo/v28/aaa.woff2) format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+FE70-FEFF;
}
/* latin */
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/cairo/v28/bbb.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`

describe('parseFontFaceCss', () => {
  it('names each rule by the subset comment above it', () => {
    const blocks = parseFontFaceCss(CSS_SAMPLE)
    expect(blocks.map((block) => block.subset)).toEqual(['arabic', 'latin'])
    expect(blocks[0]).toMatchObject({ weight: 400, italic: false })
    expect(blocks[1]).toMatchObject({ weight: 700, italic: false })
  })

  it('keeps the rule verbatim, unicode-range included', () => {
    // The ranges are the whole reason for going through the CSS API rather than
    // the Developer API — they are what stops an English page fetching Arabic.
    const arabic = parseFontFaceCss(CSS_SAMPLE)[0]!
    expect(arabic.rule).toContain('unicode-range: U+0600-06FF, U+0750-077F, U+FE70-FEFF;')
  })

  it('exposes the src so it can be swapped for an R2 url', () => {
    const arabic = parseFontFaceCss(CSS_SAMPLE)[0]!
    expect(arabic.src).toBe('https://fonts.gstatic.com/s/cairo/v28/aaa.woff2')
    expect(arabic.rule.replace(arabic.src, 'https://cdn.example.com/fonts/cairo/400-arabic.woff2'))
      .toContain('url(https://cdn.example.com/fonts/cairo/400-arabic.woff2) format')
  })

  it('reads italic as a style, not as part of the weight', () => {
    const blocks = parseFontFaceCss(`/* latin */
@font-face { font-family: 'Rubik'; font-style: italic; font-weight: 500;
  src: url(https://fonts.gstatic.com/x.woff2) format('woff2'); }`)
    expect(blocks[0]).toMatchObject({ weight: 500, italic: true })
  })

  it('throws on a rule it cannot read rather than skipping it', () => {
    // A skipped rule is a family registered as complete while missing a face.
    expect(() =>
      parseFontFaceCss(`/* latin */
@font-face { font-family: 'Cairo'; font-weight: 400; }`)
    ).toThrow(/Could not read/)
  })

  it('throws when there are no rules at all', () => {
    expect(() => parseFontFaceCss('/* nothing here */')).toThrow(/No @font-face/)
  })
})

describe('font keys', () => {
  it('slugs a family for the R2 prefix', () => {
    expect(fontSlug('Noto Sans Arabic')).toBe('noto-sans-arabic')
    expect(fontSlug('Baloo Bhaijaan 2')).toBe('baloo-bhaijaan-2')
    expect(fontSlug('Cairo')).toBe('cairo')
  })

  it('strips separators again for google/fonts, which names directories that way', () => {
    expect(googleFontsDir('Noto Sans Arabic')).toBe('notosansarabic')
    expect(googleFontsDir('Baloo Bhaijaan 2')).toBe('baloobhaijaan2')
  })

  it('separates italic from upright at the same weight', () => {
    // Without the suffix these collide and the italic silently replaces the
    // upright — one PUT, one key, and every heading comes out slanted.
    expect(fontFileKey('cairo', 400)).toBe('fonts/cairo/400.ttf')
    expect(fontFileKey('cairo', 400, true)).toBe('fonts/cairo/400i.ttf')
    expect(fontFileKey('cairo', 400)).not.toBe(fontFileKey('cairo', 400, true))
  })

  it('keys woff2 per script, because that is how Google splits it', () => {
    expect(fontWoff2Key('cairo', 400, 'arabic')).toBe('fonts/cairo/400-arabic.woff2')
    expect(fontWoff2Key('cairo', 400, 'latin')).toBe('fonts/cairo/400-latin.woff2')
    expect(fontWoff2Key('rubik', 500, 'latin', true)).toBe('fonts/rubik/500i-latin.woff2')
  })
})
