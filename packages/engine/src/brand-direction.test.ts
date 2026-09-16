import { describe, expect, it } from 'vitest'
import {
  MAX_PROPOSED,
  MIN_PROPOSED,
  TYPE_MOODS,
  brandDirectionSchema,
  directionProblems,
  isOfferable,
  type BrandDirection,
} from './brand-direction'

/**
 * The contrast gate. E8-08.
 *
 * **These are the tests that stand in for the defect that shipped once.** The
 * first live magic block run produced a white product name on a white card
 * because the model was asked a question about legibility and answered it
 * plausibly and wrongly. Nothing asks here; this is what computes it instead,
 * so this file is where that class of defect gets caught.
 */

const color = (name: string, hex: string) => ({ name, hex, why: 'because' })

function direction(over: Partial<BrandDirection> = {}): BrandDirection {
  return {
    isReadable: true,
    palette: [
      color('signage green', '#1B5E20'),
      color('crate orange', '#E65100'),
      color('price red', '#B71C1C'),
      color('paper', '#F5F5F0'),
    ],
    priceIndex: 2,
    mood: 'plain',
    notes: ['A green shopfront with orange crates outside.'],
    ...over,
  }
}

describe('directionProblems', () => {
  it('passes a palette whose price colour carries white type', () => {
    expect(directionProblems(direction())).toEqual([])
    expect(isOfferable(direction())).toBe(true)
  })

  it('refuses a price colour white type cannot be read on', () => {
    // A pale yellow. Perfectly good brand colour, and a price set in white on it
    // is invisible on paper — which is the whole failure this gate exists for.
    const pale = direction({
      palette: [
        color('signage green', '#1B5E20'),
        color('crate orange', '#E65100'),
        color('lemon', '#FFF176'),
        color('paper', '#F5F5F0'),
      ],
    })

    expect(directionProblems(pale)).toContain('price_unreadable')
    expect(isOfferable(pale)).toBe(false)
  })

  it('refuses a palette that is one colour proposed several times', () => {
    const samey = direction({
      palette: [
        color('green', '#1B5E20'),
        color('green again', '#1B5E21'),
        color('price red', '#B71C1C'),
        color('paper', '#F5F5F0'),
      ],
    })

    expect(directionProblems(samey)).toContain('colors_indistinct')
  })

  it('does not call a normal palette indistinct', () => {
    expect(directionProblems(direction())).not.toContain('colors_indistinct')
  })

  it('keeps two hues of the same lightness apart', () => {
    /**
     * The regression this check was rewritten for. A dark green and a dark red
     * have nearly the same relative luminance, so a contrast ratio between them
     * is about 1 — which is WCAG correctly saying "you cannot read one on the
     * other" and has nothing to do with whether they are the same colour.
     */
    const greenAndRed = direction({
      palette: [
        color('signage green', '#1B5E20'),
        color('price red', '#B71C1C'),
        color('crate orange', '#E65100'),
        color('paper', '#F5F5F0'),
      ],
      priceIndex: 1,
    })

    expect(directionProblems(greenAndRed)).toEqual([])
  })

  it('reports a bad hex and stops, rather than reading it as a colour', () => {
    const broken = direction({
      palette: [
        color('signage green', '#1B5E20'),
        color('nonsense', 'not-a-colour'),
        color('price red', '#B71C1C'),
        color('paper', '#F5F5F0'),
      ],
    })

    // Only `bad_hex`: every other check reads a hex, and reporting three
    // problems about one malformed value would be three ways of saying it.
    expect(directionProblems(broken)).toEqual(['bad_hex'])
  })

  it('reports a price index that is not in the palette it proposed', () => {
    const outside = direction({ priceIndex: 5 })
    expect(directionProblems(outside)).toContain('price_index_out_of_range')
  })
})

describe('isOfferable', () => {
  it('refuses a direction the model itself declined', () => {
    // A clean proposal that says there was nothing to read. The palette is fine;
    // the answer is still no, and it must not be shown as a suggestion.
    expect(isOfferable(direction({ isReadable: false }))).toBe(false)
  })
})

describe('brandDirectionSchema', () => {
  it('accepts a well-formed direction', () => {
    expect(brandDirectionSchema.safeParse(direction()).success).toBe(true)
  })

  it('refuses a palette below the floor', () => {
    const thin = { ...direction(), palette: direction().palette.slice(0, MIN_PROPOSED - 1) }
    expect(brandDirectionSchema.safeParse(thin).success).toBe(false)
  })

  it('refuses a palette above the ceiling', () => {
    const fat = {
      ...direction(),
      palette: Array.from({ length: MAX_PROPOSED + 1 }, (_, i) =>
        color(`c${i}`, '#112233')
      ),
    }
    expect(brandDirectionSchema.safeParse(fat).success).toBe(false)
  })

  it('refuses a mood that is not in the vocabulary', () => {
    expect(brandDirectionSchema.safeParse({ ...direction(), mood: 'luxury' }).success).toBe(false)
  })

  it('accepts every mood it does offer', () => {
    for (const mood of TYPE_MOODS) {
      expect(brandDirectionSchema.safeParse(direction({ mood })).success).toBe(true)
    }
  })

  it('refuses a hex that is not six digits', () => {
    const short = { ...direction(), palette: [color('x', '#fff'), ...direction().palette.slice(1)] }
    expect(brandDirectionSchema.safeParse(short).success).toBe(false)
  })
})
