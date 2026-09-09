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
export type PathShape = 'burst' | 'ribbon' | 'tag' | 'flash' | 'star' | 'arrow'

export const PATH_SHAPES: PathShape[] = ['burst', 'ribbon', 'tag', 'flash', 'star', 'arrow']

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
 * The path for a shape, in the rect's own coordinates.
 *
 * `direction` mirrors the shapes that have a reading direction — the corner
 * flash sits in the corner a reader starts from, and the arrow points the way a
 * line of text runs. **This is deliberately unlike a gradient's angle**, which
 * does not mirror: an owner who aimed a run at the bottom-right corner meant
 * that corner, while an owner who put a flash "in the corner" meant the corner
 * the eye lands on first, and that corner moves.
 */
export function shapePath(shape: PathShape, rect: Rect, direction: Direction = 'ltr'): string {
  const { x, y, width: w, height: h } = rect
  const rtl = direction === 'rtl'

  switch (shape) {
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
export type ChipShape = 'pill' | 'burst' | 'ribbon' | 'tag'

export const CHIP_SHAPES: ChipShape[] = ['pill', 'burst', 'ribbon', 'tag']

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
  pill: { width: 0.86, height: 0.52, square: false },
  burst: { width: 0.52, height: 0.34, square: true },
  ribbon: { width: 0.7, height: 0.46, square: false },
  tag: { width: 0.74, height: 0.48, square: false },
}

/** The path shape a badge draws as. A pill is a rounded rect, not a path. */
export function chipPathShape(shape: ChipShape): PathShape | null {
  return shape === 'pill' ? null : shape
}
