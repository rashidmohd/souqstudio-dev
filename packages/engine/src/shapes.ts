/**
 * The shapes an offer card is actually made of, as paths.
 *
 * **Rectangle, ellipse and line are a wireframing kit.** A flyer is built from
 * bursts, ribbons and tags, and an owner who has to fake a starburst out of a
 * circle produces a card that looks faked. These are the six that earn their
 * place in a grocery or pharmacy book; the primitives keep their own elements
 * because a rectangle is drawn as a `<rect>` in every target and turning it into
 * a path would lose the corner radius for nothing.
 *
 * **Here rather than in a renderer, and that is the whole point of the file.**
 * `apps/web` draws these on screen and the export worker will draw them into a
 * PDF, and a burst with eleven points in one and twelve in the other is the
 * drift `packages/engine` exists to prevent — silently, because both pictures
 * look like a burst. Every renderer asks for the same `d` string.
 *
 * Everything is computed from the element's own rect, in the rect's units.
 * Nothing here knows about pixels, and nothing here knows about the block.
 */

import type { Direction, Rect } from './geometry'

/** The shapes that are a path. `rect`, `ellipse` and `line` are not. */
export type PathShape =
  | 'burst'
  | 'ribbon'
  | 'tag'
  | 'flash'
  | 'star'
  | 'arrow'
  | 'polygon'
  | 'arch'
  | 'wave'
  | 'bubble'

export const PATH_SHAPES: PathShape[] = [
  'burst',
  'ribbon',
  'tag',
  'flash',
  'star',
  'arrow',
  'polygon',
  'arch',
  'wave',
  'bubble',
]

/**
 * The shapes a price mark may sit on.
 *
 * **Named rather than subtracted**, and the difference matters every time this
 * list grows: `Exclude<PathShape, …>` would have quietly admitted the arch, the
 * wave and the bubble the moment they were added, each needing a `MARK_FIT` row
 * describing how much of a *speech bubble* a price may use. A ground is a
 * deliberate thing, so it is a deliberate list.
 */
export type MarkShape = Extract<
  PathShape,
  'burst' | 'star' | 'ribbon' | 'tag' | 'flash' | 'arrow'
>

/**
 * What a polygon's side count may be, and what it is when nobody said.
 *
 * **Two is a line and thirteen is a circle**, and both of those already exist
 * as cheaper elements. The ceiling is the more interesting of the two: a
 * twenty-sided polygon is an ellipse drawn as forty coordinates that every
 * renderer carries and the PDF stores, and no reader could tell them apart at
 * the size a card is printed.
 */
export const POLYGON_SIDES = { min: 3, max: 12, default: 6 } as const

/**
 * The parameters the parametric shapes take, and what they are when nobody
 * said.
 *
 * **Every default is a shape rather than a degenerate one.** An arch at curve 0
 * is a rectangle and a wave at 0 is a rectangle, so an owner who picked one
 * from the grid and saw a plain box would reasonably conclude it was broken.
 * The defaults are what the shape looks like when you point at it.
 */
export const SHAPE_BOUNDS = {
  /** `polygon` — how many sides. */
  sides: POLYGON_SIDES,
  /**
   * `arch` and `wave` — how deep the curve goes, as a fraction of the height.
   * Negative turns it inside out: an arch that bulges becomes one that dips.
   */
  curve: { min: -1, max: 1, default: 0.35 },
  /** `wave` — how many full waves run along the edge. */
  waves: { min: 1, max: 8, default: 3 },
  /** `bubble` — where the tail sits along the edge, from the reading start. */
  tail: { min: 0, max: 1, default: 0.25 },
} as const

/**
 * Which shapes keep their proportion, and which fill whatever box they get.
 *
 * **A star stretched to 3:1 is not a wide star, it is a broken one.** The eye
 * reads a burst and a star as circular objects, so they take the largest square
 * that fits and centre in it; a ribbon, a tag and an arrow are things whose
 * length is the point, and squashing them is what they are for.
 *
 * The owner still sizes the box. This decides what the shape does inside it,
 * which is why it is a property of the shape rather than a control — an owner
 * asking for "a star, but wider" is asking for a different shape.
 */
export const HOLDS_PROPORTION: Record<PathShape, boolean> = {
  burst: true,
  star: true,
  // A panel, a header band and a bubble are all things whose length is the
  // point — the same side of this split as the ribbon, and for the same reason.
  arch: false,
  wave: false,
  bubble: false,
  /*
   * **It fills its box, and that is a reversal.** It held its proportion at
   * first, on the argument that a hexagon stretched to 3:1 is a hexagon in the
   * same sense a squashed circle is a circle. What that costs is a selection
   * outline standing well clear of the shape on every side — a triangle drew
   * into about a third of its box — and an element that cannot be dragged into
   * a corner because its box arrives there first.
   *
   * The deciding argument is that keeping one regular is already the default
   * gesture: a corner handle holds the ratio unless Shift says otherwise, so a
   * square box is what an owner gets without asking. Regularity is a drag away;
   * a selection that fits its shape is not.
   */
  polygon: false,
  flash: false,
  ribbon: false,
  tag: false,
  arrow: false,
}

/** The largest centred square in a rect — where a proportional shape draws. */
function square(rect: Rect): Rect {
  const side = Math.min(rect.width, rect.height)
  return {
    x: rect.x + (rect.width - side) / 2,
    y: rect.y + (rect.height - side) / 2,
    width: side,
    height: side,
  }
}

const point = (x: number, y: number) => `${round(x)},${round(y)}`

/**
 * Three decimals. A path is a string that both renderers compare against
 * nothing, but it is also a string that ends up in a PDF and in snapshots —
 * seventeen digits of float noise makes a diff unreadable and a file bigger for
 * precision no printer can hold.
 */
const round = (value: number) => Math.round(value * 1000) / 1000

const polygon = (points: string[]) => `M${points.join('L')}Z`

/**
 * A ring of alternating radii — a burst, or a star.
 *
 * `points` is the number of spikes. The first spike is straight up, because a
 * burst with a flat top reads as tilted, and every one of these that anybody has
 * ever drawn has a point at twelve o'clock.
 */
function spiked(rect: Rect, points: number, innerRatio: number): string {
  const box = square(rect)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const outer = box.width / 2
  const inner = outer * innerRatio

  const vertices: string[] = []
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner
    // Start at -90° so a spike points up; SVG's y grows downward.
    const angle = (Math.PI * index) / points - Math.PI / 2
    vertices.push(point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)))
  }
  return polygon(vertices)
}

/**
 * Round the corners of a closed polygon, in the coordinates it is drawn in.
 *
 * **`radius` means what `rx` means on a rectangle, at every corner.** A rounded
 * corner is the circle tangent to both edges: the tangent points sit `trim`
 * back from the vertex, and `radius = trim × tan(θ/2)` for an interior angle θ.
 * On a square θ is 90°, the tangent is 1, and `trim` equals the radius — which
 * is exactly `rx`. On a triangle θ is 60° and the same visual radius has to eat
 * nearly twice as far along each edge, so a version that set `trim` directly
 * would round a triangle almost twice as hard as a rectangle at the same
 * number.
 *
 * **Per corner rather than once for the shape**, because the shape is not
 * required to be regular: a hexagon in a wide box has two different interior
 * angles and four different edge lengths, and one trim would round half of its
 * corners wrong. Each corner takes at most half of each edge it sits on, so two
 * corners can never eat past each other however hard they are rounded.
 */
function rounded(vertices: readonly { x: number; y: number }[], radius: number): string {
  const count = vertices.length

  // Shoelace, in a coordinate system whose y grows downward: negative is
  // clockwise on screen, and every corner of a convex shape then turns the same
  // way. An arc that swept the other way would bite into the shape and draw a
  // flower.
  const area = vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % count] as { x: number; y: number }
    return sum + (next.x - vertex.x) * (next.y + vertex.y)
  }, 0)
  const sweep = area < 0 ? 1 : 0

  let d = ''
  for (let index = 0; index < count; index += 1) {
    const vertex = vertices[index] as { x: number; y: number }
    const before = vertices[(index + count - 1) % count] as { x: number; y: number }
    const after = vertices[(index + 1) % count] as { x: number; y: number }

    const back = { x: before.x - vertex.x, y: before.y - vertex.y }
    const on = { x: after.x - vertex.x, y: after.y - vertex.y }
    const backLength = Math.hypot(back.x, back.y) || 1
    const onLength = Math.hypot(on.x, on.y) || 1

    const cosine = (back.x * on.x + back.y * on.y) / (backLength * onLength)
    const interior = Math.acos(Math.min(1, Math.max(-1, cosine)))
    const tangent = Math.tan(interior / 2)

    const trim = Math.min(radius / tangent, backLength / 2, onLength / 2)
    const r = trim * tangent

    const enter = {
      x: vertex.x + (back.x / backLength) * trim,
      y: vertex.y + (back.y / backLength) * trim,
    }
    const leave = {
      x: vertex.x + (on.x / onLength) * trim,
      y: vertex.y + (on.y / onLength) * trim,
    }

    d += `${index === 0 ? 'M' : 'L'}${point(enter.x, enter.y)}`
    d += `A${round(r)},${round(r)} 0 0,${sweep} ${point(leave.x, leave.y)}`
  }

  return `${d}Z`
}

/**
 * A polygon with `sides` equal corners, filling the box it was given.
 *
 * **A vertex at twelve o'clock, for the same reason a burst has one.** The
 * alternative is a flat top, which puts a *point* at the bottom: a triangle
 * standing on its tip reads as falling over, and a pentagon drawn that way is
 * the one nobody recognises. An owner who wants it turned has the rotation
 * control.
 *
 * **Its bounding box is the box the owner dragged, and that was not true at
 * first.** The ring was laid out on the largest circle inside the largest
 * square inside the box, so a triangle occupied about a third of it — the
 * selection outline stood a long way off the shape on every side, and dragging
 * the triangle into a corner was impossible because the *box* reached the
 * corner while the triangle was still short of it. Normalising the ring onto
 * the rect costs the shape its regularity in a box that is not square, and
 * that is the right trade now that a corner drag holds the ratio by default:
 * keeping a hexagon regular is what the handles already do, while a selection
 * that does not fit its shape is wrong in a way nothing can work around.
 *
 * A side count outside the bounds is brought inside them rather than refused.
 * This is called by four renderers on documents a schema has already checked,
 * and the one case that reaches here dirty is a hand-written seed — where a
 * shape drawn with two sides is an invisible element rather than an error
 * anybody sees.
 */
function regular(rect: Rect, sides: number, corner = 0): string {
  const count = Math.max(POLYGON_SIDES.min, Math.min(POLYGON_SIDES.max, Math.round(sides)))

  const ring: { x: number; y: number }[] = []
  for (let index = 0; index < count; index += 1) {
    // Start at -90° so a vertex points up; SVG's y grows downward.
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    ring.push({ x: Math.cos(angle), y: Math.sin(angle) })
  }

  const xs = ring.map((vertex) => vertex.x)
  const ys = ring.map((vertex) => vertex.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)

  const vertices = ring.map((vertex) => ({
    x: rect.x + ((vertex.x - minX) / spanX) * rect.width,
    y: rect.y + ((vertex.y - minY) / spanY) * rect.height,
  }))

  return corner > 0
    ? rounded(vertices, corner)
    : polygon(vertices.map((vertex) => point(vertex.x, vertex.y)))
}

const clampTo = (value: number, bounds: { min: number; max: number }) =>
  Math.min(bounds.max, Math.max(bounds.min, value))

/**
 * A panel whose top edge is one smooth curve — the band a leaflet lays its
 * headline on, with a photograph above it.
 *
 * **One curve and not two, which is what keeps it a shape rather than a
 * drawing.** The obvious generalisation is a left height, a right height and a
 * bulge, and it is the wrong one: three numbers is a path editor with a bad
 * interface, and an owner who wants the sweep to lean has the rotation control
 * every element already carries. One control, and the shape is symmetric.
 *
 * **The whole of it stays inside the box at every setting.** A bulge lowers the
 * edge's ends by the depth and reaches the top of the box at its apex; a dip
 * keeps the ends at the top and sinks by the depth. That is not a detail — an
 * element that draws outside its rectangle is clipped by its neighbour on
 * screen and by the trim on paper, and the owner sized the box.
 */
function arch(rect: Rect, curve: number): string {
  const { x, y, width: w, height: h } = rect
  const amount = clampTo(curve, SHAPE_BOUNDS.curve)
  const depth = Math.min(Math.abs(amount) * h, h * 0.9)
  if (depth === 0) {
    return polygon([point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)])
  }

  const up = amount > 0
  const top = up ? y + depth : y
  // A quadratic passes through (P0 + 2·P1 + P2) / 4, so the control point sits
  // twice as far out as the apex is meant to reach.
  const control = up ? top - depth * 2 : top + depth * 2

  return (
    `M${point(x, top)}` +
    `Q${point(x + w / 2, control)} ${point(x + w, top)}` +
    `L${point(x + w, y + h)}L${point(x, y + h)}Z`
  )
}

/**
 * A panel whose top edge runs in waves — the scalloped header a grocery flyer
 * has had since before anybody printed one on a computer.
 *
 * The edge oscillates about a centre line one amplitude below the top of the
 * box, so a crest touches the top and a trough sits two amplitudes down and
 * both stay inside. `curve`'s sign decides whether it opens on a crest or a
 * trough, which is the difference between a scallop and a row of tabs.
 */
function wave(rect: Rect, curve: number, waves: number): string {
  const { x, y, width: w, height: h } = rect
  const count = Math.round(clampTo(waves, SHAPE_BOUNDS.waves))
  const amount = clampTo(curve, SHAPE_BOUNDS.curve)
  const amplitude = Math.min((Math.abs(amount) * h) / 2, h * 0.45)
  if (amplitude === 0) {
    return polygon([point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)])
  }

  const centre = y + amplitude
  const halves = count * 2
  const span = w / halves

  let d = `M${point(x, centre)}`
  for (let index = 0; index < halves; index += 1) {
    // Crest, then trough, then crest — and the sign flips which comes first.
    const towardTop = (index % 2 === 0) === amount > 0
    const control = centre + (towardTop ? -amplitude * 2 : amplitude * 2)
    d += `Q${point(x + span * (index + 0.5), control)} ${point(x + span * (index + 1), centre)}`
  }

  return `${d}L${point(x + w, y + h)}L${point(x, y + h)}Z`
}

/**
 * A speech bubble: a rounded box with a tail under it.
 *
 * **The tail mirrors and the box does not.** A bubble points at whoever is
 * speaking, and in an Arabic edition that person is on the other side — so
 * `tail` is a fraction measured from the *reading* start, which is the right
 * edge there. Same rule as the corner flash, and the same reason.
 *
 * It reuses `radius` rather than growing a second corner control, because the
 * corners of a bubble are the corners of a box and an owner who has already
 * set that number on a panel means the same thing by it here.
 */
function bubble(rect: Rect, radius: number, tail: number, rtl: boolean): string {
  const { x, y, width: w, height: h } = rect

  // The tail takes a bounded share of the height, so a short wide bubble keeps
  // a body to write in and a tall one does not grow a spike.
  const drop = Math.min(h * 0.22, w * 0.18)
  const bottom = y + h - drop
  const body = bottom - y
  const r = Math.max(0, Math.min(radius, w / 2, body / 2))
  const half = Math.min(drop * 0.55, w * 0.1)

  const along = clampTo(tail, SHAPE_BOUNDS.tail)
  const from = rtl ? 1 - along : along
  // Kept clear of the corners: a tail growing out of a rounded corner is a
  // shape with a nick in it rather than a bubble.
  const centre = Math.min(Math.max(x + from * w, x + r + half), x + w - r - half)

  return (
    `M${point(x + r, y)}` +
    `L${point(x + w - r, y)}A${round(r)},${round(r)} 0 0,1 ${point(x + w, y + r)}` +
    `L${point(x + w, bottom - r)}A${round(r)},${round(r)} 0 0,1 ${point(x + w - r, bottom)}` +
    `L${point(centre + half, bottom)}L${point(centre, y + h)}L${point(centre - half, bottom)}` +
    `L${point(x + r, bottom)}A${round(r)},${round(r)} 0 0,1 ${point(x, bottom - r)}` +
    `L${point(x, y + r)}A${round(r)},${round(r)} 0 0,1 ${point(x + r, y)}Z`
  )
}

/** What a shape needs to know beyond its rectangle. */
export interface ShapeOptions {
  /** `polygon` only — how many sides. Defaults to `POLYGON_SIDES.default`. */
  sides?: number | undefined
  /** `arch` and `wave` — how deep the curve runs. See `SHAPE_BOUNDS.curve`. */
  curve?: number | undefined
  /** `wave` — how many full waves. See `SHAPE_BOUNDS.waves`. */
  waves?: number | undefined
  /** `bubble` — where its tail sits, from the reading start. */
  tail?: number | undefined
  /**
   * `polygon` and `bubble` — the corner radius, in the rect's own units and
   * meaning exactly what `rx` means on a rectangle. Zero is a sharp corner.
   *
   * **The other path shapes do not take one and that is deliberate.** A burst's
   * spikes and a tag's punched corner are the shape; rounding them is asking
   * for a different shape, and the designer hides the control on them rather
   * than offering a number that does nothing.
   */
  radius?: number | undefined
}

/**
 * The path for a shape, in the rect's own coordinates.
 *
 * `direction` mirrors the shapes that have a reading direction — the corner
 * flash sits in the corner a reader starts from, and the arrow points the way a
 * line of text runs. **This is deliberately unlike a gradient's angle**, which
 * does not mirror: an owner who aimed a run at the bottom-right corner meant
 * that corner, while an owner who put a flash "in the corner" meant the corner
 * the eye lands on first, and that corner moves.
 */
export function shapePath(
  shape: PathShape,
  rect: Rect,
  direction: Direction = 'ltr',
  options: ShapeOptions = {}
): string {
  const { x, y, width: w, height: h } = rect
  const rtl = direction === 'rtl'

  switch (shape) {
    /**
     * **The one shape the owner sets the geometry of**, rather than picking a
     * drawing somebody else made. Three is a triangle, six a hexagon, twelve a
     * coin — which is the range a panel, a badge ground and a seal between them
     * actually want, and it is one control instead of eight more pictures in
     * the shape picker.
     *
     * It does not mirror. A regular polygon has no reading direction: there is
     * no corner it sits in and nothing it points at, so flipping it in an
     * Arabic edition would rotate the card's furniture for no reason.
     */
    case 'polygon':
      return regular(rect, options.sides ?? POLYGON_SIDES.default, options.radius ?? 0)

    /** The headline band, with a photograph sitting in the curve above it. */
    case 'arch':
      return arch(rect, options.curve ?? SHAPE_BOUNDS.curve.default)

    /** The scalloped header. */
    case 'wave':
      return wave(
        rect,
        options.curve ?? SHAPE_BOUNDS.curve.default,
        options.waves ?? SHAPE_BOUNDS.waves.default
      )

    /** A quote, a shout, or the shop's own aside. */
    case 'bubble':
      return bubble(rect, options.radius ?? 0, options.tail ?? SHAPE_BOUNDS.tail.default, rtl)

    /** Twelve spikes: enough to read as a splat, few enough to survive print. */
    case 'burst':
      return spiked(rect, 12, 0.76)

    case 'star':
      // 0.382 is the ratio a five-point star has to have to look like one —
      // any other inner radius reads as a flower or as a caltrop.
      return spiked(rect, 5, 0.382)

    /**
     * A band with a swallowtail cut into each end. The notch is a fraction of
     * the *height*, not the width: cutting 8% off a band four times as long as
     * it is tall gives a notch deeper than the band, which draws a bow tie.
     */
    case 'ribbon': {
      const notch = Math.min(h * 0.4, w / 2)
      return polygon([
        point(x, y),
        point(x + w, y),
        point(x + w - notch, y + h / 2),
        point(x + w, y + h),
        point(x, y + h),
        point(x + notch, y + h / 2),
      ])
    }

    /**
     * A price tag: one corner cut across, and a punched hole.
     *
     * The hole is a second subpath, so this is the one shape whose fill needs
     * `evenodd` — both renderers pass it, and a renderer that forgets draws a
     * tag with a filled disc where the hole is.
     */
    case 'tag': {
      const cut = Math.min(w, h) * 0.32
      const holeR = Math.min(w, h) * 0.08
      const body = rtl
        ? polygon([
            point(x + w, y),
            point(x + w, y + h),
            point(x, y + h),
            point(x, y + cut),
            point(x + cut, y),
          ])
        : polygon([
            point(x, y),
            point(x + w - cut, y),
            point(x + w, y + cut),
            point(x + w, y + h),
            point(x, y + h),
          ])

      const holeX = rtl ? x + cut * 0.55 : x + w - cut * 0.55
      const holeY = y + cut * 0.55
      // Two arcs rather than a circle element, so the hole travels inside the
      // same `d` and the shape stays one path in every target.
      const hole =
        `M${point(holeX - holeR, holeY)}` +
        `a${round(holeR)},${round(holeR)} 0 1,0 ${round(holeR * 2)},0` +
        `a${round(holeR)},${round(holeR)} 0 1,0 ${round(-holeR * 2)},0Z`

      return `${body}${hole}`
    }

    /** A right triangle filling the corner the reader starts from. */
    case 'flash':
      return rtl
        ? polygon([point(x + w, y), point(x + w, y + h), point(x, y)])
        : polygon([point(x, y), point(x + w, y), point(x, y + h)])

    /**
     * A block arrow, pointing the way the text runs. The head takes a bounded
     * share of the length so a short wide arrow is still an arrow rather than a
     * triangle with a stub behind it.
     */
    case 'arrow': {
      const head = Math.min(w * 0.4, h)
      const shaft = h * 0.28
      const points = rtl
        ? [
            point(x, y + h / 2),
            point(x + head, y),
            point(x + head, y + h / 2 - shaft),
            point(x + w, y + h / 2 - shaft),
            point(x + w, y + h / 2 + shaft),
            point(x + head, y + h / 2 + shaft),
            point(x + head, y + h),
          ]
        : [
            point(x + w, y + h / 2),
            point(x + w - head, y),
            point(x + w - head, y + h / 2 - shaft),
            point(x, y + h / 2 - shaft),
            point(x, y + h / 2 + shaft),
            point(x + w - head, y + h / 2 + shaft),
            point(x + w - head, y + h),
          ]
      return polygon(points)
    }
  }
}

/**
 * The rectangle a shape actually draws in, which is not always the one it was
 * given.
 *
 * **A burst in a 3:1 box paints into the middle third of it** — `square` is
 * what `HOLDS_PROPORTION` means — so the selection outline round that box
 * stands a long way off the ink on both sides, and nothing on screen explains
 * why. The designer draws this as a faint inner mark so the ring can go on
 * saying *what a handle moves* while the mark says *what is there*.
 *
 * The square rather than the ink: a twelve-point burst has points at the top,
 * the bottom and both sides so the two are the same thing, and a five-point
 * star is within a few percent of it. Tracing the exact hull of every shape
 * would be a second path implementation to keep in step with the first, for a
 * difference no eye could find on a dashed line.
 */
export function shapeExtent(shape: PathShape, rect: Rect): Rect {
  return HOLDS_PROPORTION[shape] ? square(rect) : rect
}

/** `tag` punches a hole, so it is the one shape that needs the even-odd rule. */
export const needsEvenOdd = (shape: PathShape): boolean => shape === 'tag'

/**
 * The shapes an offer badge may take. E7.
 *
 * **Four, not nine.** A badge is a container for a word, and most of the shape
 * kit is a bad one: a corner flash has no interior to speak of, an arrow's is a
 * shaft, and a star's usable area is about a third of its box — a badge drawn as
 * a star is a badge whose label is illegible or whose star is enormous. These
 * four hold a word.
 */
export type ChipShape = 'none' | 'pill' | 'burst' | 'ribbon' | 'tag'

export const CHIP_SHAPES: ChipShape[] = ['none', 'pill', 'burst', 'ribbon', 'tag']

/**
 * How much of a badge its label may use, and whether the badge is square.
 *
 * **This table is the shared contract, and that is why it is here.** A badge's
 * outline comes from `shapePath`, so every renderer already agrees about the
 * drawing — but a label centred in the *bounding box* of a burst runs straight
 * over the spikes, and each painter guessing its own padding is two badges that
 * disagree about where the text sits. The formula stays with the renderer; the
 * numbers do not.
 *
 * `width` and `height` are fractions of the badge's rect. `pill`'s reproduce
 * exactly what the pill did before it had company, so nothing that already
 * exists moved.
 *
 * `square` is the burst's, and it is the reason a burst badge does not grow
 * sideways for a long label: a burst holds its proportion, so a wide rect would
 * draw the same burst with empty space beside it. It stays the slot's height
 * across and the label shrinks — which is what the fit ladder does everywhere
 * else in this system.
 */
export const CHIP_FIT: Record<ChipShape, { width: number; height: number; square: boolean }> = {
  /**
   * No badge at all — the tier as words on the card.
   *
   * **The same option the price mark has had since E6**, where `frame: 'plain'`
   * drops the ground and the outline and leaves the digits alone. A badge is the
   * loudest thing on a card and not every design wants one; an owner who has
   * drawn their own ground does not want ours on top of it.
   *
   * It may use the whole box, because there is no outline to stay inside — and a
   * taller cap than the pill's for the same reason: the pill's 0.52 is mostly
   * the space its own rounded ends need.
   */
  none: { width: 1, height: 0.62, square: false },
  pill: { width: 0.86, height: 0.52, square: false },
  burst: { width: 0.52, height: 0.34, square: true },
  ribbon: { width: 0.7, height: 0.46, square: false },
  tag: { width: 0.74, height: 0.48, square: false },
}

/**
 * How much of its box the **price mark's digits** may use inside each ground.
 *
 * The same idea as `CHIP_FIT` and deliberately a separate table, because a badge
 * holds a short word and a mark holds the biggest thing on the card. A burst
 * that fits "BOGO" comfortably crushes "AED 24.50", so the price is given more
 * of the shape and the shape is expected to be drawn larger to compensate.
 *
 * `square` is the same rule: a burst and a star are read as circular objects, so
 * they take the largest square in the box and centre; a ribbon, a tag and an
 * arrow are things whose length is the point.
 */
export const MARK_FIT: Record<
  'none' | 'box' | MarkShape,
  { width: number; height: number; square: boolean }
> = {
  /** No ground. The digits own the whole box — this is `frame: 'plain'`. */
  none: { width: 1, height: 1, square: false },
  /** The rounded rectangle. Padding only, which is what it always had. */
  box: { width: 0.86, height: 0.82, square: false },
  burst: { width: 0.6, height: 0.42, square: true },
  star: { width: 0.5, height: 0.36, square: true },
  ribbon: { width: 0.76, height: 0.52, square: false },
  tag: { width: 0.7, height: 0.54, square: false },
  flash: { width: 0.64, height: 0.46, square: false },
  arrow: { width: 0.66, height: 0.52, square: false },
}

/**
 * The path a badge draws as, or null when it does not draw one.
 *
 * Null covers two different things and the caller has to tell them apart: a
 * `pill` is a rounded rect — an SVG element rather than a path — and `none`
 * draws nothing at all. `drawsGround` is the question most callers actually
 * have.
 */
export function chipPathShape(shape: ChipShape): PathShape | null {
  return shape === 'pill' || shape === 'none' ? null : shape
}

/** Whether the badge paints anything behind its label. */
export const drawsGround = (shape: ChipShape): boolean => shape !== 'none'
