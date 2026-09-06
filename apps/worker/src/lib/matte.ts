/**
 * Judging a cutout from its alpha channel. E5 §3.
 *
 * Pure — a byte per pixel in, two numbers out. No sharp, no network, no R2, so
 * the rules here are testable without an image, which matters because they
 * decide whether a matte reaches a printed page.
 *
 * **Rembg returns no confidence score.** It returns a PNG. So `quality` is
 * derived here, and it is a *proxy* rather than a model's own opinion — that
 * distinction is worth keeping in mind before anyone tunes the threshold
 * against it. What it measures is stated below; what it cannot see is stated
 * too, because a number between 0 and 1 invites more trust than this one has
 * earned.
 */

export type Bbox = { x: number; y: number; w: number; h: number }

export type MatteAnalysis = {
  /**
   * The trimmed content box within the canvas, in the cutout's own pixels.
   *
   * **The canvas is not cropped to it.** The layout engine scales cards to
   * optical weight, so it needs to know where the content sits inside the image
   * it is given; cropping would throw that away and leave every consumer
   * guessing again. Null when there is no content at all.
   */
  bbox: Bbox | null
  /** 0..1. See the note above — a proxy, not a confidence. */
  quality: number
}

/**
 * Below this, a pixel is background. Above the other, it is subject. Between
 * them is the edge band that this whole module is really about.
 *
 * Not 0 and 255: PNG encoders and the model itself both leave a scattering of
 * alpha-1 and alpha-254 pixels across an otherwise clean matte, and counting
 * those as fuzz would make every cutout look bad.
 */
const TRANSPARENT_MAX = 8
const OPAQUE_MIN = 248

/**
 * The soft-edge ratio at which a cutout scores exactly 0.5.
 *
 * The score decays as `1 / (1 + ratio / HALF)` rather than falling linearly to
 * zero. **That shape is the point, not a flourish:** a linear score clamped at
 * zero gives every badly haloed matte the same 0, and the review queue then has
 * no way to put the worst ones first. An asymptotic one keeps ordering all the
 * way down, so a reviewer works from the most damaged image rather than from
 * whichever happened to be uploaded first.
 *
 * Calibrated against square subjects, where the ratio is the edge band as a
 * fraction of solid area: a one-pixel antialiased rim on a 200px product scores
 * about 0.86, a four-pixel band lands on the approval threshold, and a
 * twelve-pixel halo — the ghost-of-the-background failure — scores about 0.3.
 */
const FUZZ_HALF_LIFE = 0.125

/**
 * A subject smaller than this fraction of the canvas means the model removed
 * the product along with the background — which happens on packshots that are
 * already on white, the most common kind Open Food Facts and brand portals
 * carry.
 */
const MIN_COVERAGE = 0.005

/**
 * And a subject larger than this means it removed nothing: the result is the
 * original with an alpha channel bolted on, which would ship a white box onto a
 * tinted panel and look like a printing fault.
 */
const MAX_COVERAGE = 0.99

/**
 * Above this a cutout is `APPROVED` and cards may use it; below it the asset is
 * written as `PENDING` and the card falls back to the ORIGINAL with a visible
 * flag. **A worker constant, not a column** — E5 §3 is explicit, and for good
 * reason: a per-product threshold is a per-product argument nobody can settle.
 */
export const MATTE_APPROVAL_THRESHOLD = 0.6

/**
 * Walk the alpha channel once, and answer both questions from the same pass.
 *
 * One pass rather than two because these images are large and the second pass
 * is free if the counters are kept together — a 2000×2000 cutout is four
 * million bytes and the difference is measurable at the concurrency this worker
 * runs at.
 *
 * **What this catches:** a matte that removed everything, a matte that removed
 * nothing, and a matte with a wide soft halo where the background used to be.
 * Those are the three failures that actually reach a printed page.
 *
 * **What it cannot catch:** a clean-edged cutout of the wrong thing. If the
 * model confidently removes the product and keeps the packaging behind it, this
 * returns a high score for a useless image. Only a human looking at it catches
 * that, which is what the review queue in E5-05 is for.
 */
export function analyseMatte(alpha: Uint8Array, width: number, height: number): MatteAnalysis {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  let opaque = 0
  let fuzzy = 0

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const value = alpha[row + x] ?? 0
      if (value <= TRANSPARENT_MAX) continue

      if (value >= OPAQUE_MIN) opaque += 1
      else fuzzy += 1

      // The box covers everything that is not background, soft edges included:
      // it is what the engine draws, and a cutout's feathered rim is part of
      // the product as it appears.
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0 || maxY < 0) {
    // Nothing survived the matte at all.
    return { bbox: null, quality: 0 }
  }

  const bbox: Bbox = {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }

  const canvas = width * height
  const coverage = canvas > 0 ? (opaque + fuzzy) / canvas : 0
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
    return { bbox, quality: 0 }
  }

  // Measured against the solid area rather than the whole canvas: a small
  // product photographed on a large background would otherwise score well
  // simply for having little of anything.
  const fuzzRatio = opaque > 0 ? fuzzy / opaque : 1
  const quality = 1 / (1 + fuzzRatio / FUZZ_HALF_LIFE)

  // Rounded because it is stored as a float and read by a human in a review
  // queue. Three decimals is more precision than the measurement deserves and
  // still enough to sort by.
  return { bbox, quality: Math.round(quality * 1000) / 1000 }
}
