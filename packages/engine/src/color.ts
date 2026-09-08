/**
 * Resolving a colour on an artboard.
 *
 * Three sources, and the order they are tried in is the order of how tied each
 * one is to the shop — a role the kit fills, a colour from the shop's own
 * palette, or a literal the owner picked. See `ColorValue` for why the last one
 * exists at all: a designer that can only offer six slots is a designer an owner
 * cannot express their own brand in.
 *
 * Here rather than in either renderer for the reason everything else is here:
 * the browser and the export worker must resolve a colour the same way, and a
 * card whose ground is one colour on screen and another in the PDF is the exact
 * failure `packages/engine` exists to prevent.
 *
 * The role lookup is **injected**, because what `primary` means is a property of
 * the shop's kit and the engine does not read kits.
 */

import type { BrandColor, ColorValue, FlatColor, TokenRef } from '@souqstudio/types'

export function resolveColor(
  value: FlatColor,
  token: (ref: TokenRef) => string,
  palette: readonly BrandColor[] = []
): string {
  if (value.from === 'role') return token(value.ref)
  if (value.from === 'hex') return value.hex

  // **A palette entry that has been deleted falls back to the ink**, not to
  // nothing and not to a guess. A block referencing a colour the shop removed is
  // a block that should still draw — an element that disappears is harder to
  // find than one that came out the wrong colour, and the owner is one click
  // from fixing it either way.
  return palette.find((entry) => entry.id === value.id)?.hex ?? token('ink')
}

/** The role form, which is all a seeded block may use. */
export const roleColor = (ref: TokenRef): FlatColor => ({ from: 'role', ref })

/**
 * A fill a renderer can actually paint.
 *
 * **`resolveColor` returning a string is what made gradients look like a
 * rewrite, and this is the seam that makes them not one.** A flat colour is a
 * string in every target — an SVG attribute, a canvas fillStyle, a PDF colour
 * operator. A gradient is not: SVG needs a `<linearGradient>` in the document
 * and a `url(#id)` pointing at it, and CSS `linear-gradient()` syntax is not
 * valid in an SVG paint attribute, so there is no shortcut where the string
 * form quietly keeps working.
 *
 * So the resolve step hands back a discriminated value and each renderer
 * materialises it in whatever way its target demands. What it must *not* do is
 * recompute the geometry: `x1`/`y1`/`x2`/`y2` are settled here, once, in
 * `objectBoundingBox` units, for the same reason every rectangle is settled in
 * the engine. Two renderers agreeing on the stops and disagreeing on the angle
 * is the drift this package exists to prevent, and it is exactly the kind that
 * survives review because both pictures look plausible.
 */
export type Paint =
  | { kind: 'flat'; css: string }
  | {
      kind: 'gradient'
      /** In `objectBoundingBox` units — 0..1 across the element's own box. */
      x1: number
      y1: number
      x2: number
      y2: number
      stops: { at: number; css: string }[]
    }

/**
 * The gradient line for an angle, in `objectBoundingBox` units.
 *
 * Degrees clockwise from a left-to-right run, so 0 is `→` and 90 is `↓` — SVG's
 * y axis points down, and matching it here means the number an owner sees on a
 * dial is the direction they see on the card.
 *
 * The line is centred on the box and extended by `(|cos| + |sin|) / 2`, which is
 * what puts the first and last stop on the two corners the run points at. The
 * naive half-length of 0.5 leaves a diagonal gradient finishing before the
 * corner it is aimed at, so the two ends of a 45° run come out flat.
 */
export function gradientVector(angle: number): {
  x1: number
  y1: number
  x2: number
  y2: number
} {
  const radians = (angle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  const half = (Math.abs(dx) + Math.abs(dy)) / 2

  return {
    x1: 0.5 - dx * half,
    y1: 0.5 - dy * half,
    x2: 0.5 + dx * half,
    y2: 0.5 + dy * half,
  }
}

/**
 * Resolve any fill — flat or gradient — against the shop.
 *
 * **A gradient of fewer than two stops resolves to a flat colour** rather than
 * to nothing. The schema will not store one, so this is only reachable from a
 * document written by something else; the rule is the same as the deleted
 * palette entry above, and for the same reason. An element that vanishes is
 * harder to find than one that came out the wrong colour.
 *
 * Stops are sorted here rather than trusted. `<linearGradient>` renders stops in
 * document order and ignores an `offset` that goes backwards, so an unsorted
 * document draws a different picture in SVG than it would anywhere that sorts —
 * which is drift arriving through the data rather than through the code.
 */
export function resolvePaint(
  value: ColorValue,
  token: (ref: TokenRef) => string,
  palette: readonly BrandColor[] = []
): Paint {
  if (value.from !== 'gradient') return { kind: 'flat', css: resolveColor(value, token, palette) }

  const stops = [...value.stops]
    .sort((a, b) => a.at - b.at)
    .map((stop) => ({
      at: Math.min(1, Math.max(0, stop.at)),
      css: resolveColor(stop.color, token, palette),
    }))

  if (stops.length === 0) return { kind: 'flat', css: token('ink') }
  if (stops.length === 1) return { kind: 'flat', css: stops[0]!.css }

  return { kind: 'gradient', ...gradientVector(value.angle), stops }
}

/**
 * The one colour that stands for a fill where only one is available.
 *
 * A swatch in the properties panel, and any renderer that has nowhere to put a
 * gradient definition. **The first stop rather than a blend**, because the point
 * of the swatch is to be recognisable against the card, and a midpoint of a
 * two-colour run is a third colour appearing in neither place.
 */
export function flatten(
  value: ColorValue,
  token: (ref: TokenRef) => string,
  palette: readonly BrandColor[] = []
): string {
  const paint = resolvePaint(value, token, palette)
  return paint.kind === 'flat' ? paint.css : paint.stops[0]!.css
}
