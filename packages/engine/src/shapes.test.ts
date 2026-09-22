import { describe, expect, it } from 'vitest'
import type { Rect } from './geometry'
import {
  CHIP_FIT,
  CHIP_SHAPES,
  HOLDS_PROPORTION,
  PATH_SHAPES,
  POLYGON_SIDES,
  chipPathShape,
  drawsGround,
  needsEvenOdd,
  shapePath,
  type PathShape,
} from './shapes'

/**
 * The shapes are checked by their *properties* rather than against recorded path
 * strings. A snapshot of a `d` attribute locks in the arithmetic and tells you
 * nothing when it breaks; "every point is inside the box the owner drew" is the
 * thing that actually has to hold, and it holds at every size.
 */

const BOX: Rect = { x: 10, y: 20, width: 200, height: 100 }

/**
 * Points on the outline of a path.
 *
 * **Read per command rather than by scanning for number pairs.** The tag's hole
 * is drawn with *relative* arcs whose parameters are radii and flags — a naive
 * reader takes `1,0` from a sweep flag and reports the tag as escaping its box,
 * which is a bug in the reader and not in the shape. Lower-case commands are
 * skipped for that reason; the body of every shape is absolute.
 *
 * **A quadratic is sampled, never read.** Its control point is deliberately
 * outside the curve it draws — an arch reaching the top of its box has one
 * above the box — so taking it for a point on the shape would report a correct
 * arch as escaping. Sampling is also what makes the "stays inside its rect"
 * check mean anything on a curved shape: before this it read the two ends of
 * the arch and nothing in between.
 */
function points(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  let at = { x: 0, y: 0 }

  for (const [, letter = '', rest = ''] of d.matchAll(/([MLQA])([^MLQAZa]*)/g)) {
    const n = [...rest.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number)

    if (letter === 'M' || letter === 'L') {
      at = { x: n[0] ?? 0, y: n[1] ?? 0 }
      out.push(at)
      continue
    }

    if (letter === 'A') {
      // rx ry rotation large-arc sweep x y — the endpoint is the last pair.
      at = { x: n[5] ?? 0, y: n[6] ?? 0 }
      out.push(at)
      continue
    }

    const cx = n[0] ?? 0
    const cy = n[1] ?? 0
    const end = { x: n[2] ?? 0, y: n[3] ?? 0 }
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8
      const u = 1 - t
      out.push({
        x: u * u * at.x + 2 * u * t * cx + t * t * end.x,
        y: u * u * at.y + 2 * u * t * cy + t * t * end.y,
      })
    }
    at = end
  }

  return out
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

  it.each<PathShape>(['bubble'])('%s mirrors in rtl', (shape) => {
    expect(shapePath(shape, BOX, 'rtl')).not.toBe(shapePath(shape, BOX, 'ltr'))
  })

  it.each<PathShape>(['burst', 'star', 'ribbon', 'polygon', 'arch', 'wave'])(
    '%s is the same either way',
    (shape) => {
      expect(shapePath(shape, BOX, 'rtl')).toBe(shapePath(shape, BOX, 'ltr'))
    }
  )
})

describe('the polygon', () => {
  /** One vertex per side, and the path closes — `M` plus n−1 `L`. */
  it.each([3, 5, 6, 12])('draws %i corners', (sides) => {
    expect(points(shapePath('polygon', BOX, 'ltr', { sides })).length).toBe(sides)
  })

  it('is a hexagon when nobody said', () => {
    expect(shapePath('polygon', BOX)).toBe(
      shapePath('polygon', BOX, 'ltr', { sides: POLYGON_SIDES.default })
    )
    expect(POLYGON_SIDES.default).toBe(6)
  })

  /**
   * Apex up. A triangle standing on its point reads as falling over, and it is
   * the one polygon where the difference is unmistakable — so it is the one
   * worth pinning rather than asserting over the whole range.
   */
  it('puts a vertex at the top', () => {
    const drawn = points(shapePath('polygon', { x: 0, y: 0, width: 100, height: 100 }, 'ltr', {
      sides: 3,
    }))
    const top = drawn.reduce((lowest, point) => (point.y < lowest.y ? point : lowest))
    expect(top.x).toBeCloseTo(50)
    expect(top.y).toBeCloseTo(0)
  })

  describe('rounded', () => {
    /**
     * **A radius means on a polygon what `rx` means on a rectangle.** Set both
     * to 10 and the corner is the same circle — which is the whole reason one
     * control governs both, and the property that breaks the moment somebody
     * "simplifies" the trim distance to equal the radius.
     */
    it('trims a square by the radius, exactly as rx does', () => {
      const drawn = shapePath('polygon', { x: 0, y: 0, width: 100, height: 100 }, 'ltr', {
        sides: 4,
        radius: 10,
      })
      // The top vertex is (50, 0); its tangent points sit 10 back along each
      // edge, which on a 90° corner is 10 / tan(45°) = 10 in each direction.
      expect(drawn.startsWith('M42.929,7.071')).toBe(true)
      expect(drawn).toContain('A10,10 0 0,1')
    })

    /**
     * A triangle's corner is 60°, so the same visual radius has to eat further
     * along each edge — `radius / tan(30°)`, about 1.73 times as far. A control
     * that set the trim directly would round a triangle nearly twice as hard as
     * a rectangle at the same number.
     */
    it('eats further along the edge on a sharper corner', () => {
      const trimOf = (sides: number) => {
        const apex = { x: 50, y: 0 }
        const first = points(
          shapePath('polygon', { x: 0, y: 0, width: 100, height: 100 }, 'ltr', {
            sides,
            radius: 10,
          })
        )[0] ?? { x: 0, y: 0 }
        return Math.hypot(first.x - apex.x, first.y - apex.y)
      }
      expect(trimOf(3)).toBeCloseTo(10 / Math.tan(Math.PI / 6), 2)
      expect(trimOf(4)).toBeCloseTo(10, 2)
      expect(trimOf(3)).toBeGreaterThan(trimOf(4))
    })

    it('stays inside its rect however hard it is rounded', () => {
      for (const point of points(
        shapePath('polygon', BOX, 'ltr', { sides: 3, radius: 900 })
      )) {
        expect(point.x).toBeGreaterThanOrEqual(BOX.x - 0.01)
        expect(point.x).toBeLessThanOrEqual(BOX.x + BOX.width + 0.01)
        expect(point.y).toBeGreaterThanOrEqual(BOX.y - 0.01)
        expect(point.y).toBeLessThanOrEqual(BOX.y + BOX.height + 0.01)
      }
    })

    it('is the sharp polygon at zero', () => {
      expect(shapePath('polygon', BOX, 'ltr', { sides: 5, radius: 0 })).toBe(
        shapePath('polygon', BOX, 'ltr', { sides: 5 })
      )
    })

    /** Every other path computes its own corners and ignores the number. */
    it.each<PathShape>(['burst', 'star', 'ribbon', 'tag', 'flash', 'arrow'])(
      '%s is unchanged by a radius',
      (shape) => {
        expect(shapePath(shape, BOX, 'ltr', { radius: 20 })).toBe(shapePath(shape, BOX))
      }
    )
  })

  /**
   * A count outside the range is brought inside it. This is reached by a
   * hand-written seed rather than by the designer — the schema stops those —
   * and a two-sided polygon is an invisible element rather than an error
   * anybody sees.
   */
  it('brings an impossible count into range rather than drawing nothing', () => {
    expect(points(shapePath('polygon', BOX, 'ltr', { sides: 1 })).length).toBe(POLYGON_SIDES.min)
    expect(points(shapePath('polygon', BOX, 'ltr', { sides: 99 })).length).toBe(POLYGON_SIDES.max)
  })
})

describe('the curved panel', () => {
  const R: Rect = { x: 0, y: 0, width: 100, height: 100 }
  const topOf = (d: string) => Math.min(...points(d).map((point) => point.y))
  const bottomEdge = (d: string) => Math.max(...points(d).map((point) => point.y))

  it('reaches the top of its box at the apex and no further', () => {
    const drawn = shapePath('arch', R, 'ltr', { curve: 0.4 })
    expect(topOf(drawn)).toBeCloseTo(0, 1)
    expect(bottomEdge(drawn)).toBeCloseTo(100, 1)
  })

  /**
   * The sign is the whole control: an arch and the dish it becomes are one
   * continuous adjustment rather than a depth plus an up/down switch.
   */
  it('turns the other way below zero', () => {
    const up = shapePath('arch', R, 'ltr', { curve: 0.4 })
    const down = shapePath('arch', R, 'ltr', { curve: -0.4 })
    expect(up).not.toBe(down)
    // Bulging: the ends sit below the apex. Dipping: the ends are the top.
    expect(points(up)[0]?.y).toBeGreaterThan(0)
    expect(points(down)[0]?.y).toBeCloseTo(0, 5)
  })

  it('is a rectangle at zero, which is what a curve of nothing means', () => {
    expect(shapePath('arch', R, 'ltr', { curve: 0 })).toBe(
      shapePath('arch', R, 'ltr', { curve: -0 })
    )
    expect(points(shapePath('arch', R, 'ltr', { curve: 0 })).length).toBe(4)
  })

  it('stays inside its box at the deepest setting', () => {
    for (const point of points(shapePath('arch', R, 'ltr', { curve: 1 }))) {
      expect(point.y).toBeGreaterThanOrEqual(-0.01)
      expect(point.y).toBeLessThanOrEqual(100.01)
    }
  })
})

describe('the wave', () => {
  const R: Rect = { x: 0, y: 0, width: 120, height: 100 }

  it('draws the number of waves it was asked for', () => {
    // Two quadratics per wave — a crest and a trough — so the count of curve
    // segments is what says whether the control did anything.
    const count = (waves: number) =>
      [...shapePath('wave', R, 'ltr', { curve: 0.4, waves }).matchAll(/Q/g)].length
    expect(count(1)).toBe(2)
    expect(count(3)).toBe(6)
    expect(count(8)).toBe(16)
  })

  it('keeps every crest and trough inside the box', () => {
    for (const point of points(shapePath('wave', R, 'ltr', { curve: 1, waves: 8 }))) {
      expect(point.y).toBeGreaterThanOrEqual(-0.01)
      expect(point.y).toBeLessThanOrEqual(100.01)
    }
  })

  it('opens on the other side of the line below zero', () => {
    expect(shapePath('wave', R, 'ltr', { curve: 0.4, waves: 3 })).not.toBe(
      shapePath('wave', R, 'ltr', { curve: -0.4, waves: 3 })
    )
  })
})

describe('the speech bubble', () => {
  const R: Rect = { x: 0, y: 0, width: 200, height: 100 }
  const tipOf = (d: string) => points(d).reduce((low, point) => (point.y > low.y ? point : low))

  it('points its tail down, at the bottom of the box', () => {
    expect(tipOf(shapePath('bubble', R, 'ltr', { tail: 0.25 })).y).toBeCloseTo(100, 1)
  })

  it('moves the tail along the edge', () => {
    const near = tipOf(shapePath('bubble', R, 'ltr', { tail: 0.2 })).x
    const far = tipOf(shapePath('bubble', R, 'ltr', { tail: 0.8 })).x
    expect(far).toBeGreaterThan(near)
  })

  /**
   * A bubble points at whoever is speaking, and in an Arabic edition that
   * person is on the other side — the same rule as the corner flash.
   */
  it('mirrors its tail in rtl, and only its tail', () => {
    const ltr = tipOf(shapePath('bubble', R, 'ltr', { tail: 0.2 })).x
    const rtl = tipOf(shapePath('bubble', R, 'rtl', { tail: 0.2 })).x
    expect(ltr + rtl).toBeCloseTo(R.width, 0)
  })

  it('keeps the tail clear of the rounded corners', () => {
    // Asked for the very start of the edge, with corners eating a quarter of
    // the width: a tail growing out of a corner is a nick, not a bubble.
    const tip = tipOf(shapePath('bubble', R, 'ltr', { tail: 0, radius: 50 }))
    expect(tip.x).toBeGreaterThan(R.x + 20)
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

describe('badge shapes', () => {
  it('offers no badge, and the four shapes that can hold a word', () => {
    expect(CHIP_SHAPES).toEqual(['none', 'pill', 'burst', 'ribbon', 'tag'])
  })

  /**
   * The same option the price mark has had since E6, where `frame: 'plain'`
   * drops the ground. `chipPathShape` returns null for both `none` and `pill`
   * and they are not the same thing — one draws a rect, the other draws
   * nothing — so a caller that only asks for the path gets it wrong.
   */
  it('separates “no path” from “no ground”', () => {
    expect(chipPathShape('none')).toBeNull()
    expect(chipPathShape('pill')).toBeNull()
    expect(drawsGround('none')).toBe(false)
    expect(drawsGround('pill')).toBe(true)
  })

  it('lets a bare label use the whole box, since there is no outline to sit inside', () => {
    expect(CHIP_FIT.none.width).toBe(1)
    expect(CHIP_FIT.none.height).toBeGreaterThan(CHIP_FIT.pill.height)
  })

  /** A pill is a rounded rect in every target — it never becomes a path. */
  it('draws a pill as a rect and every drawn shape as a path', () => {
    expect(chipPathShape('pill')).toBeNull()
    for (const shape of CHIP_SHAPES.filter((entry) => entry !== 'pill' && entry !== 'none')) {
      expect(chipPathShape(shape)).not.toBeNull()
    }
  })

  /**
   * The pill's numbers are the ones the badge used before it had company.
   * Changing them would silently restyle every block already drawn.
   */
  it('leaves the pill exactly as it was', () => {
    expect(CHIP_FIT.pill).toEqual({ width: 0.86, height: 0.52, square: false })
  })

  /**
   * A burst holds its proportion, so a badge that grew sideways for a long
   * label would draw the same burst with empty space beside it.
   */
  it('makes the burst square and nothing else', () => {
    expect(CHIP_FIT.burst.square).toBe(true)
    for (const shape of CHIP_SHAPES.filter((entry) => entry !== 'burst')) {
      expect(CHIP_FIT[shape].square).toBe(false)
    }
  })

  /** Every drawn badge leaves less room than a pill: they all take a bite. */
  it('gives every shaped badge a tighter label box than the pill', () => {
    for (const shape of CHIP_SHAPES.filter((entry) => entry !== 'pill' && entry !== 'none')) {
      expect(CHIP_FIT[shape].width).toBeLessThan(CHIP_FIT.pill.width)
      expect(CHIP_FIT[shape].height).toBeLessThan(CHIP_FIT.pill.height)
    }
  })
})
