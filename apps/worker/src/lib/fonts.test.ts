import { describe, expect, it } from 'vitest'
import { localFontFaceCss, nearestWeight, type FontFile } from './fonts'

describe('nearestWeight', () => {
  it('returns the weight itself when the family ships it', () => {
    expect(nearestWeight([400, 700], 700)).toBe(700)
  })

  it('falls to the nearest when the family does not', () => {
    // A kit binds a level to 600 and Lalezar ships only 400. The page still has
    // to render, so the choice is made once, here, where the PDF and the shaper
    // both see the same answer.
    expect(nearestWeight([400], 600)).toBe(400)
    expect(nearestWeight([300, 800], 500)).toBe(300)
  })

  it('prefers the lighter neighbour on an exact tie', () => {
    // 400 is a better stand-in for 500 than 700 is: overweight text looks like a
    // mistake, slightly light text reads as the same voice.
    expect(nearestWeight([400, 600], 500)).toBe(400)
  })

  it('is null for a family with no weights at all', () => {
    expect(nearestWeight([], 400)).toBeNull()
  })
})

describe('localFontFaceCss', () => {
  const face: FontFile = {
    family: 'Cairo',
    weight: 700,
    italic: false,
    path: '/tmp/souqstudio-fonts/cairo-700.ttf',
    bytes: Buffer.alloc(0),
  }

  it('points at a local file, never at the network', () => {
    // The entire reason this module exists: an export that fetched a face over
    // the network would be an export that can fail for reasons outside the
    // container, on a critical path.
    const css = localFontFaceCss([face])
    expect(css).toContain("src: url('file:///tmp/souqstudio-fonts/cairo-700.ttf')")
    expect(css).not.toContain('http')
  })

  it('declares the weight it actually loaded', () => {
    expect(localFontFaceCss([face])).toContain('font-weight: 700')
  })

  it('blocks rather than swaps', () => {
    // The opposite of the browser rule, for the opposite reason: no user is
    // watching, and a swap halfway through pagination is a book set in two
    // typefaces.
    expect(localFontFaceCss([face])).toContain('font-display: block')
  })

  it('marks an italic face as italic', () => {
    expect(localFontFaceCss([{ ...face, italic: true }])).toContain('font-style: italic')
  })

  it('is empty for no faces rather than emitting a stray rule', () => {
    expect(localFontFaceCss([])).toBe('')
  })
})
