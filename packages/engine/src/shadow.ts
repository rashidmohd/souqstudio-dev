/**
 * Soft shadows, as concentric vector rings.
 *
 * **Here, beside `shapePath`, and every painter calls it.** A shadow drawn by
 * the screen and a shadow drawn by the export worker have to be the same
 * shadow, and the ring count depends on the output scale — exactly the kind of
 * thing two implementations get subtly different. Same argument `shapes.ts`
 * already makes. E14 §2.4.
 *
 * **Why rings rather than a blur.** Nine cases were rendered to PDF through
 * headless Chrome and the PDF objects counted; `harness/export-check.ts` is
 * that measurement and it still runs. `feDropShadow` and `feGaussianBlur`
 * rasterize the element they are applied to, at a resolution Chromium picks
 * (~220dpi for a card on an A4 page) that **nothing in the document can set**.
 * `filter: drop-shadow()` on text is worse: the font leaves the PDF and the
 * price becomes a picture. A radial gradient with alpha stops is worst of all
 * and rasterizes the whole page at 72dpi. Concentric rings are vector at any
 * size, and that is the only option on this list that survives print.
 *
 * **The falloff needs no curve.** A point just outside the shape is covered by
 * every ring and a point at the outer edge by one, so accumulated cover is
 * `1 − (1 − a)ⁿ` and the per-ring alpha is a constant. A first attempt weighted
 * the rings quadratically and banded visibly at every count; the constant is
 * both simpler and correct.
 */

import type { Shadow } from '@souqstudio/types'
import type { Rect } from './geometry'

export type { Shadow }

/** How dark the shadow is where every ring overlaps. */
export const SHADOW_PEAK = 0.3

/**
 * How far the shadow reaches past the shape, as a multiple of `blur`.
 *
 * Measured against `feGaussianBlur` at matched visual weight, not derived — a
 * Gaussian has no edge, and 2.5σ is where its remaining cover stops reading.
 */
export const SHADOW_SPREAD = 2.5

/**
 * **Derived at paint, never stored.** Banding disappears once the rings are
 * about a device pixel apart, so the count follows the surface being drawn on:
 * about 16 on screen and about 48 for the same card at 300 dpi. The document
 * stores `x`, `y`, `blur` and `color`; the painter decides how many paths that
 * becomes.
 *
 * `scale` is §5.2's `s` — design units to CSS pixels. `dpi` is the output
 * device's, 96 for a screen.
 */
export function ringCount(blur: number, scale: number, dpi: number): number {
  if (blur <= 0) return 1
  const devicePixels = blur * SHADOW_SPREAD * scale * (dpi / 72)
  return Math.max(1, Math.round(devicePixels))
}

/**
 * The per-ring alpha that accumulates to `peak` under `n` rings.
 *
 * `1 − (1 − a)ⁿ = peak`, solved for `a`.
 */
export function ringAlpha(n: number, peak: number = SHADOW_PEAK): number {
  if (n <= 1) return peak
  return 1 - Math.pow(1 - peak, 1 / n)
}

/** One ring, as the geometry a painter draws. Largest first, so smaller sit on top. */
export interface ShadowRing {
  rect: Rect
  /** The element's radius grown by the same amount as the rect. */
  radius: number
  alpha: number
}

/**
 * Expand a shadow into the rings that draw it.
 *
 * The rect grows outward by up to `SHADOW_SPREAD × blur` and is offset by the
 * shadow's `x`/`y`. **The caller decides what geometry a rect becomes** — a
 * `<rect>` with an `rx`, or `shapePath` for a burst — which is what makes this
 * work on an arbitrary path: a twelve-point burst offsets by growing its
 * radius, and the shadow follows its points.
 *
 * Every value is in the same units as `rect`.
 */
export function shadowRings(
  shadow: Shadow,
  rect: Rect,
  radius: number,
  output: { scale: number; dpi: number; peak?: number },
): ShadowRing[] {
  const n = ringCount(shadow.blur, output.scale, output.dpi)
  const alpha = ringAlpha(n, output.peak ?? SHADOW_PEAK)
  const spread = shadow.blur * SHADOW_SPREAD
  const rings: ShadowRing[] = []
  // Largest first. The composite is order-independent — every ring is the same
  // constant alpha — but a painter that draws outward would put the widest ring
  // over the narrowest and lose the stacking in any renderer that groups.
  for (let i = n; i >= 1; i--) {
    const grow = (i / n) * spread
    rings.push({
      rect: {
        x: rect.x + shadow.x - grow,
        y: rect.y + shadow.y - grow,
        width: rect.width + grow * 2,
        height: rect.height + grow * 2,
      },
      radius: radius + grow,
      alpha,
    })
  }
  return rings
}

// ─── Extrusion ────────────────────────────────────────────────────────────────

/**
 * An extrusion, as copies of the element offset toward a vanishing point.
 *
 * **Here beside the rings, and both painters call it, for the same reason the
 * rings are here**: the count depends on the output scale, and a count decided
 * twice is a price that reads solid on screen and striped in the PDF.
 *
 * **Copies rather than a filter, and that is not a stylistic preference.** A
 * ring on text is the string again under a *stroke*, and Chromium outlines
 * stroked text into explicit path geometry — 24 kB a ring, which is why a
 * blurred text shadow is refused at the schema. A copy needs no stroke: it is
 * another text run, the font stays in the PDF, and it costs about a fifth of a
 * kilobyte. Measured through headless Chromium at 0/4/8/16 copies: 4.7, 5.6,
 * 6.4, 8.1 kB, every one vector and still text. `feSpecularLighting` — a real
 * bevel — rasterises the element and takes the font out of the PDF altogether,
 * which is the one disqualifying class of result `export-check.ts` exists for.
 *
 * **One copy per device pixel of travel**, which is what makes the side solid
 * rather than a comb: below that the copies separate and the letters look
 * striped. Capped, because the offset is a fraction of the block and a large
 * block at 300 dpi would otherwise ask for hundreds — and past the cap the
 * copies are closer together than the output can resolve anyway.
 */
export const MAX_EXTRUDE_COPIES = 64

export function extrudeCopies(
  offset: { x: number; y: number },
  output: { scale: number; dpi: number }
): { dx: number; dy: number }[] {
  const travel = Math.hypot(offset.x, offset.y)
  if (travel <= 0) return []

  const devicePixels = travel * output.scale * (output.dpi / 72)
  const count = Math.min(MAX_EXTRUDE_COPIES, Math.max(1, Math.round(devicePixels)))

  /*
   * Far end first, so nearer copies paint over it and the face lands last. The
   * step starts at 1 rather than 0: a copy at zero offset is the face itself,
   * drawn again underneath in the side colour, which is a glyph with a dirty
   * edge wherever the face is not perfectly opaque.
   */
  return Array.from({ length: count }, (_, index) => {
    const t = (count - index) / count
    return { dx: offset.x * t, dy: offset.y * t }
  })
}
