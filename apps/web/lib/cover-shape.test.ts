import { describe, expect, it } from 'vitest'
import { shapeFor } from '@/lib/cover-shape'

/**
 * The shape a generated ground is drawn at, from the page's own proportions.
 *
 * **Asked of the page rather than of the owner**, because the owner answered it
 * already when they chose what they were making, and a second asking is a second
 * chance to get it wrong. The failure is not an error either: a story-shaped
 * ground under `fit: 'cover'` on an A4 page is cropped to a sliver of itself, and
 * an owner sees a bad drawing rather than a mismatch.
 */
describe('shapeFor', () => {
  it('draws a square post square', () => {
    expect(shapeFor(1)).toBe('square')
    // 4:5, the other Instagram shape, is nearer square than portrait.
    expect(shapeFor(0.8)).toBe('portrait')
  })

  it('draws A4 and US Letter as portrait', () => {
    expect(shapeFor(210 / 297)).toBe('portrait')
    expect(shapeFor(8.5 / 11)).toBe('portrait')
  })

  it('draws a story tall', () => {
    expect(shapeFor(9 / 16)).toBe('story')
    expect(shapeFor(1080 / 1920)).toBe('story')
  })

  it('draws a landscape page square rather than inventing a shape', () => {
    // There is no landscape ground to ask for. A square one cropped to a wide
    // page loses its top and bottom; a portrait one loses its subject.
    expect(shapeFor(1.4)).toBe('square')
    expect(shapeFor(297 / 210)).toBe('square')
  })

  it('puts the boundaries where the formats actually sit', () => {
    // Just inside square, and just outside it.
    expect(shapeFor(0.86)).toBe('square')
    expect(shapeFor(0.85)).toBe('portrait')
    // Portrait holds A4 (0.707) and gives way before a story.
    expect(shapeFor(0.63)).toBe('portrait')
    expect(shapeFor(0.62)).toBe('story')
  })
})
