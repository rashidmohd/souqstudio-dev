import { describe, expect, it } from 'vitest'
import { typefaceHint, typefaceOptions } from '@/components/brand/TypographyFields'
import type { OfferableFont } from '@/lib/font-catalog-server'

const font = (family: string, over: Partial<OfferableFont> = {}): OfferableFont => ({
  family,
  category: 'sans-serif',
  subsets: ['arabic', 'latin'],
  mirrored: true,
  ...over,
})

describe('typefaceOptions', () => {
  it('pins the families we wrote notes for above the rest', () => {
    // A picker that opens on 57 names with no opinion serves an owner worse than
    // one that opens on ten good ones with the rest underneath.
    const options = typefaceOptions([font('Aref Ruqaa'), font('Cairo'), font('Amiri')], 'Cairo')
    expect(options[0]?.value).toBe('Cairo')
    expect(options.map((o) => o.value)).toEqual(['Cairo', 'Amiri', 'Aref Ruqaa'])
  })

  it('labels an unreviewed family with its category and a curated one without', () => {
    // The category is the only honest thing to say about a family nobody has
    // written a note for; saying it about Cairo would be noise.
    const options = typefaceOptions([font('Cairo'), font('Amiri', { category: 'serif' })], '')
    expect(options.find((o) => o.value === 'Cairo')?.label).toBe('Cairo')
    expect(options.find((o) => o.value === 'Amiri')?.label).toBe('Amiri — serif')
  })

  it('always includes the family already set, even if it is not offered', () => {
    // Otherwise opening the dialog silently changes what the style is set to.
    const options = typefaceOptions([font('Cairo')], 'Something Retired')
    expect(options.map((o) => o.value)).toContain('Something Retired')
  })

  it('does not duplicate the current family when it is already offered', () => {
    const values = typefaceOptions([font('Cairo')], 'Cairo').map((o) => o.value)
    expect(values.filter((v) => v === 'Cairo')).toHaveLength(1)
  })
})

describe('typefaceHint', () => {
  it('warns that a new typeface makes the save slow, once', () => {
    // 1.2s to 2.6s while the face is pulled from Google into our own storage —
    // once for the whole platform. Saying so turns an unexplained pause into an
    // expected one.
    expect(typefaceHint([font('Amiri', { mirrored: false })], 'Amiri')).toMatch(/take a moment/)
  })

  it('says nothing for a family already mirrored', () => {
    expect(typefaceHint([font('Cairo')], 'Cairo')).toBeUndefined()
  })

  it('says the registry is empty rather than pretending there is a choice', () => {
    expect(typefaceHint([], 'Cairo')).toMatch(/No typefaces/)
  })
})
