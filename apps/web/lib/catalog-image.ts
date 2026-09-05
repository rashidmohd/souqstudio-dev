import 'server-only'

import sharp from 'sharp'

/**
 * Verifying an uploaded product photo. E5-04, and the first of E5-05's quality
 * gates.
 *
 * Separate from `lib/logo.ts` because the two do opposite things. A logo is
 * *normalized* — rasterised to PNG at a bounded edge, because the artboard
 * composites it and an SVG from an upload is script-bearing content we would
 * then serve from our own domain. A packshot is **stored as it arrived**: it is
 * the input to background removal, and re-encoding it before the matte would
 * throw away detail the matte needs at its edges.
 *
 * So this only reads. It answers "is this an image, and is it big enough" and
 * hands back the dimensions the `image_assets` row needs.
 */

/**
 * E5-05's first quality gate. Also the floor for a usable cutout: a 400px
 * packshot placed on an A3 page at 300dpi is about 34mm wide, which is roughly
 * the smallest a product can be printed and still be recognised.
 */
export const MIN_PRODUCT_IMAGE_EDGE = 400

export type ProductImageMeta = { width: number; height: number }

export type ProductImageResult =
  | { ok: true; meta: ProductImageMeta }
  | { ok: false; reason: 'unreadable' | 'too_small' }

/**
 * A presigned PUT pins the declared content type but cannot prove the body
 * matches it, so this is the first time the server sees the bytes and the point
 * at which a renamed file stops being a possibility — sharp simply fails to
 * parse one.
 *
 * `too_small` is separated from `unreadable` because they are different things
 * to tell an owner: one is "that file is not a photo", the other is "that photo
 * will not print", and the second has an obvious fix.
 */
export async function readProductImage(input: Buffer): Promise<ProductImageResult> {
  let meta
  try {
    meta = await sharp(input).metadata()
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  const { width, height } = meta
  if (!width || !height) return { ok: false, reason: 'unreadable' }

  if (width < MIN_PRODUCT_IMAGE_EDGE || height < MIN_PRODUCT_IMAGE_EDGE) {
    return { ok: false, reason: 'too_small' }
  }

  return { ok: true, meta: { width, height } }
}
