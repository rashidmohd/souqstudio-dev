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
  growCorners,
  insetRect,
  layoutChipStack,
  needsEvenOdd,
  rectCorners,
  roundedRectPath,
  shapePath,
  textGroundRect,
  textInset,
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
  /**
   * **The box the owner dragged is the shape's own bounding box.** It was not:
   * the ring sat on the largest circle inside the largest square inside the
   * box, so a triangle drew into about a third of it and could not be dragged
   * into a corner — the selection arrived there while the shape was still short
   * of it.
   */
  it.each([3, 5, 6])('fills its box at %i sides', (sides) => {
    const drawn = points(shapePath('polygon', BOX, 'ltr', { sides }))
    const xs = drawn.map((point) => point.x)
    const ys = drawn.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(BOX.x, 5)
    expect(Math.max(...xs)).toBeCloseTo(BOX.x + BOX.width, 5)
    expect(Math.min(...ys)).toBeCloseTo(BOX.y, 5)
    expect(Math.max(...ys)).toBeCloseTo(BOX.y + BOX.height, 5)
  })

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
     * **A sharper corner eats further along its edges for the same visible
     * radius**, and the trim is computed per corner rather than once for the
     * shape — which is what makes the rounding correct on a polygon that is no
     * longer regular because its box is not square.
     *
     * A triangle filling a 100 square has an apex half-angle of
     * `atan(50 / 100)`, so ten units of radius costs `10 / tan(26.57°)` = 20
     * along each edge. The four-sided case is a diamond, whose corners are
     * right angles — and there the trim is the radius, exactly as `rx`.
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
      expect(trimOf(3)).toBeCloseTo(10 / Math.tan(Math.atan(50 / 100)), 2)
      expect(trimOf(4)).toBeCloseTo(10, 2)
      expect(trimOf(3)).toBeGreaterThan(trimOf(4))
    })

    /**
     * The corners of a stretched polygon are not all the same, so one trim for
     * the shape would round half of them wrong. Nothing about the drawing says
     * which — this is the check that says it.
     */
    it('rounds every corner of a polygon whose box is not square', () => {
      const wide = shapePath('polygon', { x: 0, y: 0, width: 300, height: 100 }, 'ltr', {
        sides: 6,
        radius: 12,
      })
      // One arc per corner, and every one the *same* circle — that is what "a
      // corner radius" means and it is the property to hold on to.
      const arcs = [...wide.matchAll(/A([\d.]+),/g)].map((match) => Number(match[1]))
      expect(arcs.length).toBe(6)
      expect(new Set(arcs.map((r) => r.toFixed(2))).size).toBe(1)

      // What differs is how far each corner bites, which is the whole reason
      // the trim is computed per corner. `points` yields each corner as its
      // entry point followed by the arc's end, so the chord between them is the
      // bite — and a hexagon in a 3:1 box has two blunt corners and four sharp
      // ones, so it cannot be one number.
      const drawn = points(wide)
      const chords: string[] = []
      for (let index = 0; index + 1 < drawn.length; index += 2) {
        const enter = drawn[index] as { x: number; y: number }
        const leave = drawn[index + 1] as { x: number; y: number }
        chords.push(Math.hypot(leave.x - enter.x, leave.y - enter.y).toFixed(2))
      }
      expect(new Set(chords).size).toBeGreaterThan(1)
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

/**
 * The stack, and the reason it is in the engine at all.
 *
 * These are properties rather than recorded numbers, with one exception: the
 * tier's badge is pinned, because the whole point of the change that created
 * this function is that a short label draws exactly as it did before and only a
 * long one improves. A regression there is sixty-six blocks redrawn.
 *
 * The measurer is the estimator the harness uses. A real one is a font away and
 * the engine does not have one — `fit.ts` says why.
 */
describe('layoutChipStack', () => {
  const measure = (content: string, fontSize: number) => content.length * fontSize * 0.52
  // The slot the seeded library actually draws: 53 of its 75 are wider than 2:1
  // and this is the commonest of them.
  const SLOT: Rect = { x: 0.04, y: 0.03, width: 0.34, height: 0.09 }
  const TIER = { key: 'tier', label: 'Deal', align: 'start' as const }
  const BOGO = { key: 'mechanic', label: 'Buy 1 get 1 free', align: 'start' as const }

  it('sets a short label at the height cap, which is what it always did', () => {
    const [row] = layoutChipStack([TIER], SLOT, 'pill', 'ltr', measure)
    expect(row?.fontSize).toBeCloseTo(SLOT.height * CHIP_FIT.pill.height, 10)
  })

  /**
   * The defect this was extracted to fix. The badge was allowed to grow to twice
   * the slot and the label was fitted to one slot, so a mechanic came out at
   * about 70% of the size it could have been — smaller than the tier above it,
   * on the line that carries the actual promotion.
   */
  it('sets a long label as large as a short one when the badge may grow', () => {
    const [tier] = layoutChipStack([TIER], SLOT, 'pill', 'ltr', measure)
    const [bogo] = layoutChipStack([BOGO], SLOT, 'pill', 'ltr', measure)
    expect(bogo?.fontSize).toBeCloseTo(tier?.fontSize ?? 0, 10)
  })

  it('grows the badge for the longer label rather than the type', () => {
    const [tier] = layoutChipStack([TIER], SLOT, 'pill', 'ltr', measure)
    const [bogo] = layoutChipStack([BOGO], SLOT, 'pill', 'ltr', measure)
    expect(bogo?.rect.width).toBeGreaterThan(tier?.rect.width ?? 0)
  })

  /** Twice the slot, and never past it. A badge overhangs by design; a badge
   *  three times its slot is a block with a different design in it. */
  it('never exceeds twice the slot, at any label length', () => {
    const long = { key: 'x', label: 'x'.repeat(200), align: 'start' as const }
    for (const shape of CHIP_SHAPES) {
      for (const row of layoutChipStack([TIER, BOGO, long], SLOT, shape, 'ltr', measure)) {
        expect(row.rect.width).toBeLessThanOrEqual(SLOT.width * 2 + 1e-9)
      }
    }
  })

  /**
   * The divergence between the two painters. `draw.tsx` squared a burst and the
   * harness stretched it, so one document drew two different badges — and the
   * label was fitted to the *slot* in both, which on a wide slot set it about
   * twice as wide as the burst holding it.
   */
  it('keeps a square badge square and fits the label to that', () => {
    const [row] = layoutChipStack([BOGO], SLOT, 'burst', 'ltr', measure)
    expect(row?.rect.width).toBeCloseTo(SLOT.height, 10)
    expect(measure(BOGO.label, row?.fontSize ?? 0)).toBeLessThanOrEqual(SLOT.height)
  })

  /** The label plus the air its ground needs stays inside the badge. A label
   *  clipped by its own pill is the defect the padding exists to prevent. */
  it('leaves room for the ground’s padding inside every drawn badge', () => {
    for (const shape of CHIP_SHAPES.filter((entry) => entry !== 'none')) {
      for (const row of layoutChipStack([TIER, BOGO], SLOT, shape, 'ltr', measure)) {
        expect(measure(row.label, row.fontSize)).toBeLessThanOrEqual(row.rect.width)
      }
    }
  })

  it('stacks downward from the slot, gapped, at the slot’s height', () => {
    const rows = layoutChipStack([TIER, BOGO], SLOT, 'pill', 'ltr', measure)
    expect(rows[0]?.rect.y).toBe(SLOT.y)
    expect(rows[1]?.rect.y).toBeGreaterThan((rows[0]?.rect.y ?? 0) + SLOT.height)
    for (const row of rows) expect(row.rect.height).toBe(SLOT.height)
  })

  /**
   * The box has already been mirrored by `resolveBlock`, so alignment here is
   * about which edge of the slot a badge hangs from and not about direction.
   */
  it('hangs an end-aligned badge off the slot’s end edge', () => {
    const [row] = layoutChipStack([{ ...BOGO, align: 'end' }], SLOT, 'pill', 'ltr', measure)
    expect((row?.rect.x ?? 0) + (row?.rect.width ?? 0)).toBeCloseTo(SLOT.x + SLOT.width, 10)
  })

  /**
   * The defect the gallery found the first time it drew a mechanic in Arabic.
   * A start-aligned badge grew rightward in both editions, so in an Arabic one
   * it ran off the card away from the corner it was anchored to. The box is
   * already mirrored; the growth was not.
   */
  it('grows an overflowing badge inward from the start edge in both editions', () => {
    const [ltr] = layoutChipStack([BOGO], SLOT, 'pill', 'ltr', measure)
    const [rtl] = layoutChipStack([BOGO], SLOT, 'pill', 'rtl', measure)

    // Wider than the slot, or this proves nothing.
    expect(ltr?.rect.width).toBeGreaterThan(SLOT.width)

    // English: anchored at the slot's start, which is its left edge.
    expect(ltr?.rect.x).toBeCloseTo(SLOT.x, 10)
    // Arabic: anchored at the slot's start, which is its right edge — so it
    // reaches back across the card rather than off it.
    expect((rtl?.rect.x ?? 0) + (rtl?.rect.width ?? 0)).toBeCloseTo(SLOT.x + SLOT.width, 10)
    expect(rtl?.rect.x).toBeLessThan(SLOT.x)
  })

  it('places nothing for no rows', () => {
    expect(layoutChipStack([], SLOT, 'pill', 'ltr', measure)).toEqual([])
  })
})

describe('a rectangle with its own corners', () => {
  const has = (d: string, x: number, y: number) =>
    points(d).some((point) => point.x === x && point.y === y)
  const arcs = (d: string) => [...d.matchAll(/A(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))

  it('stays one number when the corners are absent or all the same', () => {
    expect(rectCorners(8, undefined)).toBe(8)
    expect(rectCorners(8, { topStart: 4, topEnd: 4, bottomEnd: 4, bottomStart: 4 })).toBe(4)
  })

  it('becomes the four when any corner differs', () => {
    const corners = { topStart: 12, topEnd: 0, bottomEnd: 0, bottomStart: 0 }
    expect(rectCorners(8, corners)).toEqual(corners)
  })

  it('rounds only the corner it was given, at the reading start', () => {
    const d = roundedRectPath(BOX, { topStart: 20, topEnd: 0, bottomEnd: 0, bottomStart: 0 })
    expect(arcs(d)).toEqual([20])
    // The top-left corner is cut, the other three are sharp points.
    expect(has(d, 10, 20)).toBe(false)
    expect(has(d, 210, 20)).toBe(true)
    expect(has(d, 210, 120)).toBe(true)
    expect(has(d, 10, 120)).toBe(true)
  })

  it('mirrors the corner in an Arabic edition', () => {
    const d = roundedRectPath(
      BOX,
      { topStart: 20, topEnd: 0, bottomEnd: 0, bottomStart: 0 },
      'rtl'
    )
    expect(has(d, 210, 20)).toBe(false)
    expect(has(d, 10, 20)).toBe(true)
  })

  it('shrinks every corner together when a side cannot hold its pair', () => {
    // 150 + 150 on a 200-wide top: the pair scales by 200/300, and the
    // 100-high sides then bind harder (150 + 0 over 100), so everything
    // scales by two thirds.
    const d = roundedRectPath(BOX, { topStart: 150, topEnd: 150, bottomEnd: 0, bottomStart: 0 })
    expect(arcs(d)).toEqual([100, 100])
    for (const point of points(d)) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.x)
      expect(point.x).toBeLessThanOrEqual(BOX.x + BOX.width)
      expect(point.y).toBeGreaterThanOrEqual(BOX.y)
      expect(point.y).toBeLessThanOrEqual(BOX.y + BOX.height)
    }
  })

  it('grows every corner by what a shadow ring grew', () => {
    expect(growCorners({ topStart: 12, topEnd: 0, bottomEnd: 3, bottomStart: 0 }, 2)).toEqual({
      topStart: 14,
      topEnd: 2,
      bottomEnd: 5,
      bottomStart: 2,
    })
  })
})

describe('a ground behind text', () => {
  const ground = { fill: { from: 'role' as const, ref: 'primary' as const }, padding: 0.02, radius: 3 }

  it('insets by the padding as a share of the block', () => {
    expect(textInset(ground, 400)).toBe(8)
    expect(textInset(undefined, 400)).toBe(0)
  })

  it('never pulls a box inside out', () => {
    expect(insetRect({ x: 0, y: 0, width: 10, height: 100 }, 20)).toEqual({
      x: 5,
      y: 20,
      width: 0,
      height: 60,
    })
  })

  it('fills the box unless it fits to the text', () => {
    const words = { x: 20, y: 30, width: 50, height: 10 }
    expect(textGroundRect(BOX, words, 8, undefined)).toBe(BOX)
    expect(textGroundRect(BOX, words, 8, 'box')).toBe(BOX)
    expect(textGroundRect(BOX, words, 8, 'text')).toEqual({ x: 12, y: 22, width: 66, height: 26 })
  })

  it('has nothing to wrap round no words', () => {
    expect(textGroundRect(BOX, null, 8, 'text')).toBeNull()
  })
})
