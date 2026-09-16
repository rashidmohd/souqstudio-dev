import { describe, expect, it } from 'vitest'
import {
  LOGO_STRUCTURES,
  LOGO_SYMBOLS,
  drawMark,
  logoChoiceSchema,
  namesTheShop,
  skinFrom,
  type LogoChoice,
} from './logo-mark'

/**
 * Logo marks. E8-09.
 *
 * **The property worth testing is that every legal choice draws.** The model's
 * output is an enum and five bounded fields, so the set of things it can ask for
 * is enumerable — which makes this the same kind of check `magic.test.ts` makes
 * over all 2,400 block choices, and it carries the same caveat: a test over a
 * schema proves a mark is well-formed, never that it looks like anything. That
 * is a person's job, and the gallery is where they do it.
 */

const PALETTE = ['#1B5E20', '#E65100', '#B71C1C', '#F5F5F0']

function choice(over: Partial<LogoChoice> = {}): LogoChoice {
  return {
    structure: 'wordmark',
    setAs: 'Al Noor',
    initials: 'AN',
    tagline: 'Est. 1998',
    symbol: 'bag',
    inkIndex: 0,
    accentIndex: 1,
    why: 'Two strong words, so the second can carry the accent.',
    ...over,
  }
}

describe('drawMark', () => {
  it('draws every structure into one square viewBox', () => {
    const skin = skinFrom(PALETTE, choice())
    expect(skin).not.toBeNull()

    for (const structure of LOGO_STRUCTURES) {
      const svg = drawMark(choice({ structure }), skin!, 'Cairo')

      expect(svg, structure).toMatch(/^<svg /)
      expect(svg, structure).toContain('viewBox="0 0 512 512"')
      expect(svg, structure).toMatch(/<\/svg>$/)
    }
  })

  it('draws every symbol a lockup can carry', () => {
    const skin = skinFrom(PALETTE, choice())!

    for (const symbol of LOGO_SYMBOLS) {
      const svg = drawMark(choice({ structure: 'lockup', symbol }), skin, 'Cairo')
      expect(svg, symbol).toContain('<path')
    }
  })

  it('draws only in colours from the palette', () => {
    const skin = skinFrom(PALETTE, choice())!

    for (const structure of LOGO_STRUCTURES) {
      const svg = drawMark(choice({ structure }), skin, 'Cairo')
      const hexes = svg.match(/#[0-9a-fA-F]{6}/g) ?? []

      // `onAccent` is black or white by construction — it is the ink that reads
      // on the accent plate, computed rather than chosen, so it is not expected
      // to be in the shop's palette.
      const allowed = new Set([...PALETTE, '#ffffff', '#000000'])
      for (const hex of hexes) expect(allowed.has(hex), `${structure}: ${hex}`).toBe(true)
    }
  })

  it('escapes a shop name that would break the document', () => {
    const skin = skinFrom(PALETTE, choice())!
    const svg = drawMark(choice({ setAs: 'Ahmed & Sons' }), skin, 'Cairo')

    expect(svg).toContain('Ahmed &amp; Sons')
    expect(svg).not.toContain('Ahmed & Sons')
  })

  it('does not put a second colour on a one-word name', () => {
    // There is nothing for it to contrast with, so the accent would just be the
    // wrong colour for the whole name.
    const skin = skinFrom(PALETTE, choice())!
    const svg = drawMark(choice({ setAs: 'Noor' }), skin, 'Cairo')

    expect(svg).not.toContain('<tspan')
  })

  it('falls back to the name’s own initials when the model gave none', () => {
    const skin = skinFrom(PALETTE, choice())!
    const svg = drawMark(choice({ structure: 'monogram', initials: '', setAs: 'Al Noor' }), skin, 'Cairo')

    expect(svg).toContain('>AN<')
  })

  it('leaves the tagline line out of a badge that has no tagline', () => {
    const skin = skinFrom(PALETTE, choice())!
    const svg = drawMark(choice({ structure: 'badge', tagline: '' }), skin, 'Cairo')

    expect(svg).toContain('<circle')
    expect(svg).toContain('Al Noor')
  })
})

describe('skinFrom', () => {
  it('falls back rather than failing when an index points nowhere', () => {
    const skin = skinFrom(PALETTE, choice({ inkIndex: 7, accentIndex: 7 }))
    expect(skin?.ink).toBe(PALETTE[0])
  })

  it('refuses a palette with no colours in it', () => {
    expect(skinFrom([], choice())).toBeNull()
  })

  it('picks ink that reads on the accent, rather than asking', () => {
    // Pale accent wants black on it; dark accent wants white.
    expect(skinFrom(['#1B5E20', '#F5F5F0'], choice())?.onAccent).toBe('#000000')
    expect(skinFrom(['#F5F5F0', '#1B5E20'], choice())?.onAccent).toBe('#ffffff')
  })
})

describe('namesTheShop', () => {
  it('allows a legal suffix to be dropped', () => {
    expect(namesTheShop('Al Noor', 'Al Noor Trading LLC')).toBe(true)
  })

  it('allows the whole name', () => {
    expect(namesTheShop('Al Noor Trading LLC', 'Al Noor Trading LLC')).toBe(true)
  })

  it('refuses a word the shop never had', () => {
    expect(namesTheShop('Noor Market', 'Al Noor Trading LLC')).toBe(false)
  })

  it('ignores case', () => {
    expect(namesTheShop('AL NOOR', 'Al Noor Trading')).toBe(true)
  })

  it('refuses an empty mark', () => {
    expect(namesTheShop('', 'Al Noor')).toBe(false)
  })
})

describe('logoChoiceSchema', () => {
  it('accepts a well-formed choice', () => {
    expect(logoChoiceSchema.safeParse(choice()).success).toBe(true)
  })

  it('refuses a structure that is not in the vocabulary', () => {
    expect(logoChoiceSchema.safeParse(choice({ structure: 'crest' as never })).success).toBe(false)
  })

  it('refuses a name too long to set on one line', () => {
    expect(logoChoiceSchema.safeParse(choice({ setAs: 'x'.repeat(29) })).success).toBe(false)
  })
})
