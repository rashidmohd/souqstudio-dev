import { describe, expect, it } from 'vitest'
import {
  MAX_EXTRUDE_COPIES,
  SHADOW_PEAK,
  SHADOW_SPREAD,
  extrudeCopies,
  ringAlpha,
  ringCount,
  shadowRings,
  type Shadow,
} from './shadow'

const BLACK = { from: 'hex' as const, hex: '#000000' }
const shadow = (over: Partial<Shadow> = {}): Shadow => ({ x: 0, y: 0, blur: 8, color: BLACK, ...over })
const RECT = { x: 100, y: 100, width: 200, height: 120 }
const SCREEN = { scale: 1, dpi: 96 }

describe('ringCount', () => {
  it('derives from blur and output, never from the document', () => {
    // The whole reason `n` is not a stored field: the same shadow is a
    // different number of paths on a screen and on a press.
    expect(ringCount(8, 1, 96)).toBeLessThan(ringCount(8, 1, 300))
  })

  it('is about 16 on screen and about 48 at 300dpi for the same card', () => {
    // §2.4's two numbers. The blur that produces them is the calibration.
    const blur = 4.8
    expect(ringCount(blur, 1, 96)).toBe(16)
    expect(ringCount(blur, 1, 300)).toBe(50)
  })

  it('scales with placement, because `s` is what sizes the card', () => {
    expect(ringCount(8, 2, 96)).toBe(ringCount(16, 1, 96))
  })

  it('gives a hard shadow exactly one ring', () => {
    expect(ringCount(0, 1, 300)).toBe(1)
    expect(ringCount(-1, 1, 300)).toBe(1)
  })

  it('never returns zero, however small the blur', () => {
    expect(ringCount(0.001, 1, 96)).toBe(1)
  })
})

describe('ringAlpha', () => {
  it('accumulates to the peak under n rings', () => {
    for (const n of [1, 2, 8, 16, 48, 200]) {
      const a = ringAlpha(n)
      // A point just outside the shape is covered by every ring.
      expect(1 - Math.pow(1 - a, n)).toBeCloseTo(SHADOW_PEAK, 10)
    }
  })

  it('is constant per ring rather than weighted', () => {
    // A quadratic weighting banded visibly at every count. This asserts the
    // constant, so the next person who tries a curve fails a test.
    const rings = shadowRings(shadow(), RECT, 0, SCREEN)
    const alphas = new Set(rings.map((r) => r.alpha))
    expect(alphas.size).toBe(1)
  })

  it('is the peak itself when there is one ring', () => {
    expect(ringAlpha(1)).toBe(SHADOW_PEAK)
  })
})

describe('shadowRings', () => {
  it('reaches 2.5 × blur past the shape at its widest', () => {
    const rings = shadowRings(shadow({ blur: 10 }), RECT, 0, SCREEN)
    const widest = rings[0]!
    expect(widest.rect.width).toBeCloseTo(RECT.width + 2 * SHADOW_SPREAD * 10, 6)
  })

  it('draws largest first, so the narrow rings sit on top', () => {
    const rings = shadowRings(shadow(), RECT, 0, SCREEN)
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.rect.width).toBeLessThan(rings[i - 1]!.rect.width)
    }
  })

  it('offsets by x and y without mirroring them', () => {
    // §5.5: a shadow offset never mirrors. This is the geometry half of that.
    const rings = shadowRings(shadow({ x: 6, y: 9, blur: 0 }), RECT, 0, SCREEN)
    expect(rings).toHaveLength(1)
    expect(rings[0]!.rect.x).toBe(RECT.x + 6)
    expect(rings[0]!.rect.y).toBe(RECT.y + 9)
  })

  it('grows the radius with the rect, so the corners stay concentric', () => {
    const rings = shadowRings(shadow({ blur: 10 }), RECT, 12, SCREEN)
    for (const ring of rings) {
      const grow = (ring.rect.width - RECT.width) / 2
      expect(ring.radius).toBeCloseTo(12 + grow, 6)
    }
  })

  it('makes blur: 0 the same path with one ring', () => {
    const hard = shadowRings(shadow({ x: 4, y: 4, blur: 0 }), RECT, 0, SCREEN)
    expect(hard).toHaveLength(1)
    expect(hard[0]!.rect.width).toBe(RECT.width)
    expect(hard[0]!.alpha).toBe(SHADOW_PEAK)
  })

  it('reaches further at print scale but no further in design units', () => {
    // The spread is the design's; only the *count* answers to the surface.
    const screen = shadowRings(shadow(), RECT, 0, { scale: 1, dpi: 96 })
    const print = shadowRings(shadow(), RECT, 0, { scale: 1, dpi: 300 })
    expect(print.length).toBeGreaterThan(screen.length)
    expect(print[0]!.rect.width).toBeCloseTo(screen[0]!.rect.width, 6)
  })

  it('takes a peak override without storing one', () => {
    const rings = shadowRings(shadow(), RECT, 0, { ...SCREEN, peak: 0.6 })
    expect(1 - Math.pow(1 - rings[0]!.alpha, rings.length)).toBeCloseTo(0.6, 10)
  })
})

/**
 * An extrusion — the side of the letters, as copies of the string.
 *
 * **Copies rather than a filter, and the count derived rather than stored**, for
 * the two reasons this file's own note gives about rings: a filter over text
 * takes the font out of the PDF, and a count baked into a document is a price
 * that reads solid on screen and striped at 300 dpi.
 */
describe('extrudeCopies', () => {
  const screen = { scale: 1, dpi: 96 }

  it('draws nothing when there is nowhere to travel', () => {
    expect(extrudeCopies({ x: 0, y: 0 }, screen)).toEqual([])
  })

  it('makes about one copy per device pixel of travel', () => {
    // Solid rather than striped is the whole requirement, and a copy a pixel is
    // what meets it. 12px at 96dpi is 16 device pixels.
    expect(extrudeCopies({ x: 12, y: 0 }, screen)).toHaveLength(16)
  })

  it('asks for more copies at print resolution, from the same document', () => {
    const print = extrudeCopies({ x: 12, y: 0 }, { scale: 1, dpi: 300 })
    expect(print.length).toBeGreaterThan(extrudeCopies({ x: 12, y: 0 }, screen).length)
  })

  it('walks from the far end back toward the face', () => {
    const copies = extrudeCopies({ x: 8, y: 4 }, screen)
    const first = copies[0]
    const last = copies[copies.length - 1]

    // Furthest first, so nearer copies paint over it and the face lands on top.
    expect(first!.dx).toBeCloseTo(8, 5)
    expect(first!.dy).toBeCloseTo(4, 5)
    // And the nearest copy is one step out, never at zero: a copy at zero is the
    // face drawn again underneath in the side colour.
    expect(last!.dx).toBeGreaterThan(0)
    expect(last!.dx).toBeLessThan(8)
  })

  it('keeps the direction it was given, including backwards', () => {
    // An extrusion up and to the start is unusual and not wrong, exactly as a
    // shadow's negative offsets are.
    const copies = extrudeCopies({ x: -6, y: -6 }, screen)
    expect(copies.every((copy) => copy.dx <= 0 && copy.dy <= 0)).toBe(true)
  })

  it('caps the count, whatever the document asks for', () => {
    // The offset is a fraction of the block, so a large block at 300 dpi would
    // otherwise ask for hundreds — and past the cap the copies are closer
    // together than the output can resolve.
    expect(extrudeCopies({ x: 900, y: 0 }, { scale: 4, dpi: 300 })).toHaveLength(
      MAX_EXTRUDE_COPIES
    )
  })
})
