import 'server-only'

import sharp from 'sharp'
import { VECTOR_RASTER_EDGE } from '@/lib/r2'

/**
 * Turn uploaded vector artwork into a PNG. E7.
 *
 * **The point is what is *not* stored.** `docs/E5-04` and the artwork route both
 * refuse SVG on the rule that an SVG served from our own domain is
 * script-bearing content — a manager who can upload one can plant a stored XSS
 * that any shared link then delivers. Rasterising removes the question rather
 * than managing it: no sanitiser to keep current against the next `<foreignObject>`
 * trick, no reliance on browsers refusing to run scripts in an `<img>`, and
 * nothing in the bucket that is not a bitmap.
 *
 * The same trade `lib/logo.ts` made, for the same reason and with the same loss:
 * the vector is gone. That is affordable because the only consumer is a printed
 * page — 2048px on the long edge is past A4 at 300dpi for artwork that occupies
 * part of a card — and because there is no vector consumer in the product to
 * disappoint. If the export worker ever wants true vector, this is the decision
 * to revisit, and it will need a sanitiser to do it.
 */
export async function rasteriseVector(input: Buffer): Promise<Buffer | null> {
  try {
    /**
     * **The density is computed, not fixed, and this is the whole quality
     * question.** `density` is the only lever sharp gives for how large a vector
     * renders, and a fixed 300 renders a drawing at its *nominal* size — a badge
     * authored on a 100×100 viewBox comes out 417px however big it is printed.
     * With `withoutEnlargement` it then stays 417px, and the owner who uploaded
     * a vector precisely so it would be crisp gets something softer than the
     * PNG they could have exported themselves.
     *
     * So: read the nominal size, then pick the density that lands the long edge
     * on the target. The cap is a memory guard for a drawing authored at 8px.
     */
    const nominal = await sharp(input).metadata()
    const longEdge = Math.max(nominal.width ?? 1, nominal.height ?? 1)
    const density = Math.min(2400, Math.max(72, Math.round((72 * VECTOR_RASTER_EDGE) / longEdge)))

    return await sharp(input, {
      density,
      // **A decompression guard, not a formality.** An SVG declaring enormous
      // dimensions is a few bytes that ask for gigabytes of raster, and the
      // size cap on the upload cannot see it — the file is small, the drawing
      // is not.
      limitInputPixels: 40_000_000,
    })
      .resize({
        width: VECTOR_RASTER_EDGE,
        height: VECTOR_RASTER_EDGE,
        fit: 'inside',
        // No `withoutEnlargement`: the input is a vector and has the detail to
        // fill this. The guard against a runaway raster is the density cap and
        // the pixel limit above, not a refusal to draw the thing at a useful
        // size.
      })
      .png()
      .toBuffer()
  } catch {
    // Anything sharp refuses — a mislabelled file, a malformed document, a
    // drawing past the pixel guard. The caller's only useful question is
    // whether it got a PNG, and every no is the same no.
    return null
  }
}
