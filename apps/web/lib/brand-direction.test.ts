import { describe, expect, it } from 'vitest'
import { TYPE_MOODS } from '@souqstudio/engine'
import { FONT_ROLES, findFont } from '@souqstudio/designer/lib/font-catalog'
import { TEST_CATALOG } from '@souqstudio/designer/lib/font-catalog.fixture'
import { fontsForMood, isProposal, patchFromProposal, type DirectionProposal } from '@/lib/brand-direction'

/**
 * Turning an accepted proposal into a brand kit. E8-08.
 *
 * The half of the feature the model does not touch — which is why it is the half
 * that can be tested without one.
 */

const color = (name: string, hex: string) => ({ name, hex, why: 'because' })

function proposal(over: Partial<DirectionProposal> = {}): DirectionProposal {
  return {
    palette: [
      color('signage green', '#1B5E20'),
      color('crate orange', '#E65100'),
      color('price red', '#B71C1C'),
      color('paper', '#F5F5F0'),
    ],
    priceIndex: 2,
    mood: 'plain',
    notes: ['A green shopfront.'],
    ...over,
  }
}

describe('fontsForMood', () => {
  it('names a real family for every slot of every mood', () => {
    /**
     * The module throws at import if this is false, so reaching this assertion
     * at all is most of the test. It is written out anyway because the throw is
     * easy to delete and this says what it was for: a family we do not load
     * renders as something else without ever failing.
     */
    for (const mood of TYPE_MOODS) {
      const fonts = fontsForMood(mood)
      for (const role of FONT_ROLES) {
        const font = findFont(fonts[role], TEST_CATALOG)
        expect(font, `${mood}/${role}`).toBeDefined()
        expect(font?.roles, `${mood}/${role}`).toContain(role)
      }
    }
  })

  it('gives every mood its own pairing', () => {
    const headlines = TYPE_MOODS.map((mood) => fontsForMood(mood).headline)
    expect(new Set(headlines).size).toBe(TYPE_MOODS.length)
  })
})

describe('patchFromProposal', () => {
  it('puts the price colour first, so primaryColor is the one that was checked', () => {
    const patch = patchFromProposal(proposal())

    expect(patch.palette?.[0]?.hex).toBe('#B71C1C')
    expect(patch.primaryColor).toBe('#B71C1C')
  })

  it('keeps the rest of the palette in the order it was proposed', () => {
    const patch = patchFromProposal(proposal())

    expect(patch.palette?.map((c) => c.hex)).toEqual([
      '#B71C1C',
      '#1B5E20',
      '#E65100',
      '#F5F5F0',
    ])
  })

  it('mints its own ids rather than taking any from the model', () => {
    const patch = patchFromProposal(proposal())
    expect(patch.palette?.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('keeps the names the model chose', () => {
    const patch = patchFromProposal(proposal())
    expect(patch.palette?.map((c) => c.name)).toContain('signage green')
  })

  it('writes all four font slots from the mood', () => {
    const patch = patchFromProposal(proposal({ mood: 'bold-retail' }))
    const fonts = fontsForMood('bold-retail')

    expect(patch.fontHeadline).toBe(fonts.headline)
    expect(patch.fontDisplay).toBe(fonts.display)
    expect(patch.fontPrice).toBe(fonts.price)
    expect(patch.fontBody).toBe(fonts.body)
  })
})

describe('isProposal', () => {
  it('accepts what the worker writes', () => {
    expect(isProposal(proposal())).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'palette'],
    ['an empty object', {}],
    ['a palette that is not an array', { ...proposal(), palette: 'green' }],
  ])('refuses %s', (_label, value) => {
    expect(isProposal(value)).toBe(false)
  })

  it('refuses a palette shorter than the floor', () => {
    expect(isProposal({ ...proposal(), palette: proposal().palette.slice(0, 2) })).toBe(false)
  })

  it('refuses a hex that is not a colour', () => {
    const bad = proposal()
    bad.palette[1] = color('nonsense', 'rebeccapurple')
    expect(isProposal(bad)).toBe(false)
  })

  it('refuses a mood this version does not know', () => {
    expect(isProposal({ ...proposal(), mood: 'brutalist' })).toBe(false)
  })

  it('refuses a price index pointing outside the palette', () => {
    /**
     * The one field where a stale worker could write something structurally
     * fine and semantically wrong, and the one that decides which colour leads
     * the palette. `patchFromProposal` would silently fall back; this refuses.
     */
    expect(isProposal({ ...proposal(), priceIndex: 9 })).toBe(false)
  })
})
