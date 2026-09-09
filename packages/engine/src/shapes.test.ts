import { describe, expect, it } from 'vitest'
import type { Rect } from './geometry'
import { HOLDS_PROPORTION, PATH_SHAPES, needsEvenOdd, shapePath, type PathShape } from './shapes'

/**
 * The shapes are checked by their *properties* rather than against recorded path
 * strings. A snapshot of a `d` attribute locks in the arithmetic and tells you
 * nothing when it breaks; "every point is inside the box the owner drew" is the
 * thing that actually has to hold, and it holds at every size.
 */

const BOX: Rect = { x: 10, y: 20, width: 200, height: 100 }

/**
 * Every coordinate pair in a path.
 *
 * **Only the pairs that follow `M` or `L`.** The tag's hole is drawn with arcs,
 * whose parameters are radii, flags and *relative* deltas — a naive "every
 * number pair" reader takes `1,0` from a sweep flag and reports the tag as
 * escaping its box, which is a bug in the reader and not in the shape.
 */
function points(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }))
}

const extent = (drawn: { x: number; y: number }[]) => {
  const xs = drawn.map((point) => point.x)
  const ys = drawn.map((point) => point.y)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    startSlack: Math.min(...xs),
    endSlack: Math.max(...xs),
  }
}

describe('every shape', () => {
  it.each(PATH_SHAPES)('%s draws a closed path', (shape) => {
    const d = shapePath(shape, BOX)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(points(d).length).toBeGreaterThan(2)
  })

  /**
   * **The box the owner dragged is the box the shape occupies.** A burst that
   * overflows its rect would sit under a neighbouring element with nothing in
   * the layer list or the selection outline to explain it — `validateBlock`
   * checks boxes, not paths, so nothing downstream would catch it.
   */
  it.each(PATH_SHAPES)('%s stays inside its rect', (shape) => {
    for (const point of points(shapePath(shape, BOX))) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.x - 0.001)
      expect(point.x).toBeLessThanOrEqual(BOX.x + BOX.width + 0.001)
      expect(point.y).toBeGreaterThanOrEqual(BOX.y - 0.001)
      expect(point.y).toBeLessThanOrEqual(BOX.y + BOX.height + 0.001)
    }
  })

  it.each(PATH_SHAPES)('%s moves with its rect', (shape) => {
    const here = shapePath(shape, BOX)
    const there = shapePath(shape, { ...BOX, x: BOX.x + 5, y: BOX.y + 7 })
    expect(there).not.toBe(here)
  })
})

describe('the shapes that hold their proportion', () => {
  const wide: Rect = { x: 0, y: 0, width: 400, height: 100 }

  /**
   * A star stretched to 4:1 is not a wide star, it is a broken one. These take
   * the largest centred square and draw in that.
   */
  it.each(PATH_SHAPES.filter((shape) => HOLDS_PROPORTION[shape]))(
    '%s is the same shape however wide the box gets',
    (shape) => {
      const square = extent(points(shapePath(shape, { x: 0, y: 0, width: 100, height: 100 })))
      const stretched = extent(points(shapePath(shape, wide)))

      // Not "its bounding box is square" — a five-point star's is not, and
      // asserting that would be testing the arithmetic rather than the rule.
      // The rule is that widening the box does not change the shape.
      expect(stretched.width).toBeCloseTo(square.width, 1)
      expect(stretched.height).toBeCloseTo(square.height, 1)
    }
  )

  it.each(PATH_SHAPES.filter((shape) => HOLDS_PROPORTION[shape]))(
    '%s centres in the box rather than sitting at one end',
    (shape) => {
      const drawn = extent(points(shapePath(shape, wide)))
      expect(drawn.startSlack - wide.x).toBeCloseTo(wide.x + wide.width - drawn.endSlack, 1)
    }
  )

  it.each(PATH_SHAPES.filter((shape) => !HOLDS_PROPORTION[shape]))(
    '%s fills the width it is given',
    (shape) => {
      const xs = points(shapePath(shape, wide)).map((point) => point.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(wide.width, 1)
    }
  )
})

describe('the shapes that read in a direction', () => {
  /**
   * A corner flash sits in the corner the eye lands on first and an arrow points
   * the way the line runs, so both mirror in an Arabic edition. Deliberately
   * unlike a gradient's angle, which does not — see `shapePath`.
   */
  it.each<PathShape>(['flash', 'arrow', 'tag'])('%s mirrors in rtl', (shape) => {
    expect(shapePath(shape, BOX, 'rtl')).not.toBe(shapePath(shape, BOX, 'ltr'))
  })

  it.each<PathShape>(['burst', 'star', 'ribbon'])('%s is the same either way', (shape) => {
    expect(shapePath(shape, BOX, 'rtl')).toBe(shapePath(shape, BOX, 'ltr'))
  })
})

describe('the tag', () => {
  /** Its hole is a second subpath, so its fill needs the even-odd rule. */
  it('is the only shape that needs even-odd', () => {
    expect(needsEvenOdd('tag')).toBe(true)
    for (const shape of PATH_SHAPES.filter((entry) => entry !== 'tag')) {
      expect(needsEvenOdd(shape)).toBe(false)
    }
  })

  it('carries a second subpath for the hole', () => {
    // Two `M` commands: the body, then the punch.
    expect([...shapePath('tag', BOX).matchAll(/M/g)].length).toBe(2)
  })
})

describe('the ribbon', () => {
  /**
   * The notch is a fraction of the *height*. Taking it from the width cuts a
   * band four times longer than it is tall deeper than the band is wide, which
   * draws a bow tie rather than a ribbon.
   */
  it('keeps its notch shallow on a long band', () => {
    const long: Rect = { x: 0, y: 0, width: 600, height: 40 }
    const xs = points(shapePath('ribbon', long)).map((point) => point.x)
    const notch = xs.filter((x) => x > 0 && x < 300).sort((a, b) => a - b)[0] ?? 0
    expect(notch).toBeLessThan(long.width / 4)
  })
})
