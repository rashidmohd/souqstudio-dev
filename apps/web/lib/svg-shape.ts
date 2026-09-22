import type { ShapeArt } from '@souqstudio/types'

/**
 * Reading an uploaded drawing as geometry, and keeping nothing else. E7.
 *
 * **This is the whole security argument for uploading a shape.** The sibling
 * path in `lib/artwork.ts` rasterises SVG because an SVG served from our own
 * domain is script-bearing content, and it says the honest thing about the
 * trade: the vector is gone, and getting it back would need a sanitiser kept
 * current against the next `<foreignObject>` trick. A shape needs none of that,
 * because it needs the *outline* rather than the file. What leaves this module
 * is path commands, numbers and six named transform functions. There is no
 * document left to sanitise, nothing to serve, and nothing in the bucket at
 * all — the geometry rides on the block, which is where the owner put it.
 *
 * **Strict rather than clever.** Every construct this cannot represent honestly
 * is refused with a sentence the owner can act on, never approximated: a file
 * that comes back "unsupported" costs them one export from their drawing
 * program, and a file that comes back subtly wrong costs them a print run. So
 * `<text>` is refused rather than dropped (they outline it), a clip is refused
 * rather than ignored (it would silently draw the unclipped shape), and a
 * `<use>` is refused rather than resolved.
 *
 * **Nothing here is trusted by what comes after it.** Everything returned is
 * re-validated by `shapeArtSchema` in the engine against the same two
 * alphabets, so a bug in this scanner cannot widen what may be stored. This is
 * the convenience layer; that schema is the boundary.
 */

/** Past this it is not a drawing somebody made for a card. */
const MAX_SOURCE_BYTES = 512_000

/** Matched to `shapeArtSchema`, which refuses anything larger on the way in. */
const MAX_PATHS = 64
const MAX_PATH_BYTES = 16_384

/** Only path commands and numbers, and only the six transform functions. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/
const TRANSFORM = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+0-9eE.,\s]+\)\s*)+$/

/**
 * Elements whose contents are definitions, not drawing.
 *
 * Skipped wholesale rather than walked. A `<defs>` holds outlines that are
 * referenced, not painted — picking them up would draw a shape the owner does
 * not see in their own drawing program, which is the worst kind of wrong: it
 * looks deliberate.
 */
const SKIPPED = new Set(['defs', 'style', 'clippath', 'mask', 'symbol', 'marker', 'pattern'])

/** Constructs with no honest geometry. Each is refused by name, with a way out. */
const REFUSED: Record<string, string> = {
  text: 'That file has live text in it. Convert the text to outlines and upload it again.',
  tspan: 'That file has live text in it. Convert the text to outlines and upload it again.',
  image: 'That file has a photo inside it. Upload it with Upload artwork instead.',
  use: 'That file reuses a shape by reference. Export it with the shapes expanded and try again.',
  foreignobject: 'That file holds something that is not a drawing.',
  script: 'That file holds something that is not a drawing.',
}

const TAG = /<\/?([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
const ATTR = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export type ParsedShape = { ok: true; art: ShapeArt } | { ok: false; reason: string }

/** Shorter numbers, because every one of these rides on the block document. */
const round = (value: number): number => Math.round(value * 1e4) / 1e4

const attributes = (source: string): Record<string, string> => {
  const found: Record<string, string> = {}
  for (const match of source.matchAll(ATTR)) {
    found[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? ''
  }
  return found
}

/** A length, with the unit thrown away. Only the ratio is ever used. */
const num = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const numbers = (value: string): number[] =>
  value
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part))

/**
 * The primitives, as the path each one already is.
 *
 * **Converted rather than refused**, because a designer's export is full of
 * them — a bubble is a rounded rect and a dot is a circle — and refusing a file
 * for holding a rectangle would send the owner away over nothing. The maths is
 * the SVG specification's own, not an approximation: a rounded rectangle is
 * four lines and four elliptical arcs, and a circle is two half-arcs, which is
 * how a renderer draws them anyway.
 */
function primitivePath(tag: string, attrs: Record<string, string>): string | null {
  if (tag === 'rect') {
    const x = num(attrs['x'])
    const y = num(attrs['y'])
    const w = num(attrs['width'])
    const h = num(attrs['height'])
    if (w <= 0 || h <= 0) return null
    // A radius given on one axis applies to both, and neither may exceed half
    // the side — the specification's own clamp, and without it a rounded corner
    // on a thin bar draws inside out.
    const rawX = attrs['rx'] === undefined ? num(attrs['ry']) : num(attrs['rx'])
    const rawY = attrs['ry'] === undefined ? num(attrs['rx']) : num(attrs['ry'])
    const rx = Math.min(Math.max(rawX, 0), w / 2)
    const ry = Math.min(Math.max(rawY, 0), h / 2)
    if (rx === 0 || ry === 0) {
      return `M${round(x)},${round(y)}H${round(x + w)}V${round(y + h)}H${round(x)}Z`
    }
    return [
      `M${round(x + rx)},${round(y)}`,
      `H${round(x + w - rx)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(x + w)},${round(y + ry)}`,
      `V${round(y + h - ry)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(x + w - rx)},${round(y + h)}`,
      `H${round(x + rx)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(x)},${round(y + h - ry)}`,
      `V${round(y + ry)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(x + rx)},${round(y)}`,
      'Z',
    ].join('')
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(attrs['cx'])
    const cy = num(attrs['cy'])
    const rx = tag === 'circle' ? num(attrs['r']) : num(attrs['rx'])
    const ry = tag === 'circle' ? num(attrs['r']) : num(attrs['ry'])
    if (rx <= 0 || ry <= 0) return null
    return [
      `M${round(cx - rx)},${round(cy)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(cx + rx)},${round(cy)}`,
      `A${round(rx)},${round(ry)} 0 0 1 ${round(cx - rx)},${round(cy)}`,
      'Z',
    ].join('')
  }

  if (tag === 'line') {
    const x1 = round(num(attrs['x1']))
    const y1 = round(num(attrs['y1']))
    const x2 = round(num(attrs['x2']))
    const y2 = round(num(attrs['y2']))
    if (x1 === x2 && y1 === y2) return null
    return `M${x1},${y1}L${x2},${y2}`
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const points = numbers(attrs['points'] ?? '')
    if (points.length < 4) return null
    const pairs: string[] = []
    for (let i = 0; i + 1 < points.length; i += 2) {
      pairs.push(`${round(points[i]!)},${round(points[i + 1]!)}`)
    }
    return `M${pairs.join('L')}${tag === 'polygon' ? 'Z' : ''}`
  }

  return null
}

/**
 * `fill-rule`, from the attribute or from an inline style.
 *
 * A rule set through a CSS class is not read — this module never looks at the
 * stylesheet, because the only thing a stylesheet carries that matters here is
 * a fill, and the fill is thrown away. A donut authored with an even-odd rule
 * in a class comes out solid; that is the one approximation kept, because the
 * alternative is refusing the commonest export there is.
 */
const evenOddFrom = (attrs: Record<string, string>): boolean =>
  attrs['fill-rule'] === 'evenodd' || /fill-rule\s*:\s*evenodd/.test(attrs['style'] ?? '')

export function parseSvgShape(source: string): ParsedShape {
  if (source.length > MAX_SOURCE_BYTES) {
    return { ok: false, reason: 'That file is too big to use as a shape.' }
  }

  // Comments can hold anything, including a `<path>` nobody means to draw.
  const body = source.replace(/<!--[\s\S]*?-->/g, '')

  const root = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(body)
  if (root === null) return { ok: false, reason: 'That file is not an SVG.' }

  const rootAttrs = attributes(root[1] ?? '')
  const view = numbers(rootAttrs['viewbox'] ?? '')
  const width = view.length === 4 ? view[2]! : num(rootAttrs['width'])
  const height = view.length === 4 ? view[3]! : num(rootAttrs['height'])
  if (!(width > 0) || !(height > 0)) {
    return { ok: false, reason: 'That drawing does not say what size it is.' }
  }

  // A viewBox that does not start at the origin shifts every coordinate in the
  // file. Carried as the outermost transform rather than subtracted from each
  // number, for the same reason every other transform is carried.
  const originX = view.length === 4 ? view[0]! : 0
  const originY = view.length === 4 ? view[1]! : 0
  const rootTransform =
    originX === 0 && originY === 0 ? [] : [`translate(${round(-originX)} ${round(-originY)})`]

  const paths: ShapeArt['paths'] = []
  const stack: string[][] = [rootTransform]
  /** Name and depth of the definitions block being skipped, if any. */
  let skipping: { tag: string; depth: number } | null = null
  let depth = 0

  for (const match of body.matchAll(TAG)) {
    const tag = match[1]!.toLowerCase().replace(/^.*:/, '')
    const closing = match[0].startsWith('</')
    const selfClosing = match[3] === '/'

    if (skipping !== null) {
      if (!closing && !selfClosing) depth += 1
      if (closing) {
        depth -= 1
        if (tag === skipping.tag && depth <= skipping.depth) skipping = null
      }
      continue
    }

    if (closing) {
      depth -= 1
      if (tag === 'g' || tag === 'svg') stack.pop()
      continue
    }

    if (SKIPPED.has(tag)) {
      if (!selfClosing) {
        skipping = { tag, depth }
        depth += 1
      }
      continue
    }

    const refusal = REFUSED[tag]
    if (refusal !== undefined) return { ok: false, reason: refusal }

    const attrs = attributes(match[2] ?? '')

    // A clip or a mask changes what is drawn, and this carries neither. Drawing
    // the unclipped outline would look deliberate and be wrong.
    if (attrs['clip-path'] !== undefined || attrs['mask'] !== undefined) {
      return {
        ok: false,
        reason: 'That drawing uses a clipping mask. Flatten it and upload it again.',
      }
    }

    const own = attrs['transform']
    if (own !== undefined && !TRANSFORM.test(own.trim())) {
      return { ok: false, reason: 'That drawing is positioned in a way this cannot read.' }
    }

    const inherited = stack[stack.length - 1] ?? []
    const here = own === undefined ? inherited : [...inherited, own.trim()]

    if ((tag === 'g' || tag === 'svg') && !selfClosing) {
      stack.push(here)
      if (tag !== 'svg') depth += 1
      continue
    }
    if (!selfClosing && tag !== 'path' && !SKIPPED.has(tag)) depth += 1

    const d = tag === 'path' ? (attrs['d'] ?? '').trim() : primitivePath(tag, attrs)
    if (d === null || d === '') continue
    if (!PATH_DATA.test(d)) {
      return { ok: false, reason: 'That drawing has an outline this cannot read.' }
    }
    if (paths.length >= MAX_PATHS) {
      return { ok: false, reason: 'That drawing has too many separate pieces to use as a shape.' }
    }

    const composed = here.join(' ').trim()
    paths.push({
      d,
      ...(composed === '' ? {} : { transform: composed }),
      ...(evenOddFrom(attrs) ? { evenOdd: true } : {}),
    })
  }

  if (paths.length === 0) {
    return { ok: false, reason: 'There is nothing to draw in that file.' }
  }
  if (paths.reduce((total, path) => total + path.d.length, 0) > MAX_PATH_BYTES) {
    return { ok: false, reason: 'That drawing has too much detail to use as a shape.' }
  }

  return { ok: true, art: { width: round(width), height: round(height), paths } }
}
