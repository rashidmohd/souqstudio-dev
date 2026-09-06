import { describe, expect, it } from 'vitest'
import { MATTE_APPROVAL_THRESHOLD, analyseMatte } from './matte'

/**
 * The matte analysis, E5 §3.
 *
 * These numbers decide whether a cutout reaches a printed page, and the failure
 * they exist to stop is silent: a haloed matte looks fine at thumbnail size in
 * the editor and shows a grey ghost of the removed background at A3.
 *
 * Alpha canvases are built by hand rather than loaded from fixtures — the
 * function takes a byte per pixel, so a test can state the exact shape it means
 * and nobody has to open an image to know what is being asserted.
 */

/** A `width × height` canvas with a solid rectangle, optionally softly edged. */
function canvas(
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
  options: { edge?: number } = {}
): Uint8Array {
  const alpha = new Uint8Array(width * height)
  const edge = options.edge ?? 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const insideSolid =
        x >= box.x + edge &&
        x < box.x + box.w - edge &&
        y >= box.y + edge &&
        y < box.y + box.h - edge
      const insideBox =
        x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h

      // 128 is the mid-alpha a soft edge carries: neither background nor subject.
      alpha[y * width + x] = insideSolid ? 255 : insideBox ? 128 : 0
    }
  }
  return alpha
}

describe('bbox', () => {
  it('is the content box within the canvas, not a crop of it', () => {
    // The canvas is left at 100×100 on purpose. The layout engine scales cards
    // to optical weight and needs to know where the content sits inside the
    // image it is handed.
    const alpha = canvas(100, 100, { x: 20, y: 30, w: 40, h: 25 })
    expect(analyseMatte(alpha, 100, 100).bbox).toEqual({ x: 20, y: 30, w: 40, h: 25 })
  })

  it('includes the soft edge, because that is part of the product as drawn', () => {
    const alpha = canvas(100, 100, { x: 20, y: 20, w: 40, h: 40 }, { edge: 3 })
    expect(analyseMatte(alpha, 100, 100).bbox).toEqual({ x: 20, y: 20, w: 40, h: 40 })
  })

  it('is null when nothing survived the matte', () => {
    const result = analyseMatte(new Uint8Array(100 * 100), 100, 100)
    expect(result.bbox).toBeNull()
    expect(result.quality).toBe(0)
  })

  it('ignores the alpha-1 speckle every PNG encoder leaves behind', () => {
    const alpha = canvas(100, 100, { x: 40, y: 40, w: 20, h: 20 })
    alpha[0] = 3 // stray, below TRANSPARENT_MAX
    expect(analyseMatte(alpha, 100, 100).bbox).toEqual({ x: 40, y: 40, w: 20, h: 20 })
  })
})

describe('quality', () => {
  it('is near 1 for a clean, hard-edged cutout', () => {
    const alpha = canvas(200, 200, { x: 50, y: 50, w: 100, h: 100 })
    const { quality } = analyseMatte(alpha, 200, 200)
    expect(quality).toBe(1)
    expect(quality).toBeGreaterThan(MATTE_APPROVAL_THRESHOLD)
  })

  it('still approves an ordinary one-pixel antialiased edge', () => {
    // Every real cutout has one. A threshold that refused these would send
    // every product to review and the queue would be abandoned.
    const alpha = canvas(400, 400, { x: 100, y: 100, w: 200, h: 200 }, { edge: 1 })
    expect(analyseMatte(alpha, 400, 400).quality).toBeGreaterThan(
      MATTE_APPROVAL_THRESHOLD
    )
  })

  it('refuses a wide halo — the failure that reaches a printed page', () => {
    // A ghost of the removed background, invisible at thumbnail size in the
    // editor and plainly there at A3.
    const alpha = canvas(200, 200, { x: 50, y: 50, w: 100, h: 100 }, { edge: 12 })
    expect(analyseMatte(alpha, 200, 200).quality).toBeLessThan(
      MATTE_APPROVAL_THRESHOLD
    )
  })

  it('is zero when the model removed the product too', () => {
    // What happens to packshots already on white, which is most of what the
    // public datasets and brand portals carry.
    const alpha = canvas(1000, 1000, { x: 0, y: 0, w: 20, h: 20 })
    expect(analyseMatte(alpha, 1000, 1000).quality).toBe(0)
  })

  it('is zero when the model removed nothing at all', () => {
    // An opaque canvas is the original with an alpha channel bolted on. Shipped
    // onto a tinted panel it reads as a printing fault.
    const alpha = canvas(100, 100, { x: 0, y: 0, w: 100, h: 100 })
    expect(analyseMatte(alpha, 100, 100).quality).toBe(0)
  })

  it('still reports a bbox for a zero-quality matte', () => {
    // The row is written either way — PENDING, for a human to look at. Throwing
    // the geometry away would mean re-deriving it to review the thing.
    const alpha = canvas(100, 100, { x: 0, y: 0, w: 100, h: 100 })
    expect(analyseMatte(alpha, 100, 100).bbox).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })

  it('degrades rather than stepping, so the review queue can be sorted', () => {
    const at = (edge: number) =>
      analyseMatte(canvas(300, 300, { x: 50, y: 50, w: 200, h: 200 }, { edge }), 300, 300)
        .quality

    expect(at(1)).toBeGreaterThan(at(4))
    expect(at(4)).toBeGreaterThan(at(8))
  })
})
