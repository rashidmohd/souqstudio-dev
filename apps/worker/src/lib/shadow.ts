import sharp from 'sharp'
import {
  SHADOW_PRESET_SPECS,
  type ContactSpec,
  type DropSpec,
  type ShadowPreset,
} from '@souqstudio/types'
import { analyseMatte, type Bbox } from './matte'

/**
 * Shadows for a product cutout, traced from its own alpha channel. E14 §2.4.
 *
 * **Why this is pixels and the engine's shadows are vector.** §2.4 rendered nine
 * cases to PDF and counted objects: a filter rasterises its own element at a
 * resolution Chromium picks, so `packages/engine/src/shadow.ts` draws soft
 * shadows as concentric vector rings instead. That works because a *shape* has a
 * path to expand — a burst's shadow follows its points.
 *
 * A photograph has no path. `shadowRings` grows the element's **box**, so a
 * cutout of a bottle currently casts the shadow of a rounded rectangle, and no
 * amount of ring maths fixes that: the silhouette lives in the alpha channel.
 * Tracing it means reading pixels, so the shadow is baked into a PNG here and
 * the page draws an ordinary `<image>` carrying no filter. Print-safe by the
 * same rule, because it was already raster.
 *
 * **Everything is a fraction of the shorter edge.** The numbers came off the
 * shadow lab tuned against a 369px render; stored as pixels they would be a
 * heavy margin on a 400px thumbnail and invisible on a 3000px packshot. The
 * comment on each preset gives the lab's pixel value so the two can be compared.
 *
 * **One caution before trusting a number from the lab.** `sharp.blur(sigma)`
 * takes a Gaussian *standard deviation*. A preview that blurs in a browser must
 * mean the same thing by σ, or every preset is out by a constant that looks
 * right on screen and wrong on paper. `shadow.test.ts` pins the relationship
 * against a known input rather than assuming it.
 */

export type RGB = { r: number; g: number; b: number }

export type { ShadowPreset } from '@souqstudio/types'

export interface ShadowResult {
  /** PNG bytes: the shadow, with the product composited on top. */
  png: Buffer
  width: number
  height: number
  /**
   * **Where the *product* sits in the padded canvas — never where the shadow
   * does.** The layout engine scales cards to optical weight from
   * `image_assets.bboxTight`, so a box that included the shadow would shrink
   * every product on the page by the padding with nothing to explain it. It is
   * the source's own box, moved by `pad`.
   */
  bbox: Bbox | null
  /** The padding applied on each side, in this image's pixels. */
  pad: number
}

/**
 * Render `input` with `preset`'s shadow behind it.
 *
 * The output is larger than the input by `pad` on every side and the product is
 * composited at `(pad, pad)`, so nothing about the source is resized — the rule
 * `apps/worker/CLAUDE.md` states for cutouts, and the reason `bbox` above is
 * translated rather than recomputed.
 */
export async function renderShadow(
  input: Buffer | string,
  preset: ShadowPreset,
  color: RGB = { r: 0, g: 0, b: 0 },
): Promise<ShadowResult> {
  const spec = SHADOW_PRESET_SPECS[preset]

  const meta = await sharp(input).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w === 0 || h === 0) throw new Error('shadow: the source has no dimensions')

  const edge = Math.min(w, h)
  const pad = Math.max(1, Math.round(spec.pad * edge))
  const W = w + pad * 2
  const H = h + pad * 2

  /**
   * **The alpha channel, materialised into its own buffer first.**
   *
   * sharp runs its operations in a fixed internal order rather than the order
   * they are chained, and `extractChannel` runs near the *end* of it — so
   * chaining extract with extend and blur in one call silently extends and
   * blurs the whole RGBA image and then extracts an alpha that is opaque
   * everywhere. The bug looks like a shadow that is a filled rectangle.
   *
   * It is read once and used twice: as the shadow's shape, and by
   * `analyseMatte` for the box the contact ellipse is anchored to. A second
   * scan would be a second answer to "where is the product", which is how the
   * ellipse and `bboxTight` would start disagreeing.
   */
  const alpha = await sharp(input).ensureAlpha().extractChannel('alpha').raw().toBuffer()
  const { bbox } = analyseMatte(new Uint8Array(alpha), w, h)

  const layers: sharp.OverlayOptions[] = []

  /*
   * Contact first, so it sits under the cast shadow. A ground plane is beneath
   * everything; the drop reads as falling across it.
   */
  if (spec.contact !== undefined && bbox !== null) {
    layers.push({ input: await contactLayer(spec.contact, bbox, edge, pad, W, H, color), left: 0, top: 0 })
  }

  if (spec.drop !== undefined) {
    layers.push({ input: await dropLayer(spec.drop, alpha, w, h, edge, pad, W, H, color), left: 0, top: 0 })
  }

  // The product last and unmodified, at the padding's origin.
  layers.push({
    input: await sharp(input).ensureAlpha().png().toBuffer(),
    left: pad,
    top: pad,
  })

  const png = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer()

  return {
    png,
    width: W,
    height: H,
    bbox: bbox === null ? null : { x: bbox.x + pad, y: bbox.y + pad, w: bbox.w, h: bbox.h },
    pad,
  }
}

/**
 * The cast shadow: the product's own silhouette, offset, blurred and tinted.
 */
async function dropLayer(
  drop: DropSpec,
  alpha: Buffer,
  w: number,
  h: number,
  edge: number,
  pad: number,
  W: number,
  H: number,
  color: RGB,
): Promise<Buffer> {
  const offsetX = Math.round(drop.offsetX * edge)
  const offsetY = Math.round(drop.offsetY * edge)

  if (Math.abs(offsetX) >= pad || Math.abs(offsetY) >= pad) {
    // Unreachable with the presets above, and worth refusing rather than
    // clipping: a shadow cut off square has no recovery downstream.
    throw new Error(`shadow: pad (${pad}) must exceed both offsets`)
  }

  /*
   * **Padded before it is blurred**, or the kernel is clipped at the edge and
   * the fade stops in a straight line. The padding is asymmetric, which is what
   * produces the offset while keeping the canvas the same size as every other
   * layer.
   */
  const mask = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .extend({
      top: pad + offsetY,
      bottom: pad - offsetY,
      left: pad + offsetX,
      right: pad - offsetX,
      background: { r: 0, g: 0, b: 0 },
    })
    .blur(Math.max(0.3, drop.blur * edge))
    .linear(drop.opacity, 0)
    .raw()
    .toBuffer({ resolveWithObject: true })

  /*
   * **`blur` and `linear` promote the greyscale mask back to three channels**,
   * so the stride comes from `info` rather than being assumed to be one.
   * Assuming it produces horizontal banding as the rows drift out of alignment
   * — the kind of artefact that looks like a corrupt file rather than a bug.
   */
  const stride = mask.info.channels

  /*
   * **The RGBA bytes are built directly.** `create` a three-channel image and
   * `joinChannel` the mask yields a four-band image that sharp interprets as
   * CMYK, and the result comes out silently inverted.
   */
  const rgba = Buffer.allocUnsafe(W * H * 4)
  for (let p = 0; p < W * H; p += 1) {
    const j = p * 4
    rgba[j] = color.r
    rgba[j + 1] = color.g
    rgba[j + 2] = color.b
    rgba[j + 3] = mask.data[p * stride] ?? 0
  }

  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer()
}

/**
 * The ellipse beneath the product.
 *
 * **Anchored to the product's alpha box, not the canvas and not the composite.**
 * A packshot with transparent margin would otherwise put the ellipse somewhere
 * under empty space — and deriving it from an already-shadowed image, which is
 * the obvious way to stack the two passes, anchors it to the *shadow's* box and
 * drops the ellipse too low and too wide. Both layers are built from the same
 * `bbox` for that reason.
 */
async function contactLayer(
  contact: ContactSpec,
  bbox: Bbox,
  edge: number,
  pad: number,
  W: number,
  H: number,
  color: RGB,
): Promise<Buffer> {
  const cx = pad + bbox.x + bbox.w / 2
  const cy = pad + bbox.y + bbox.h
  const rx = (bbox.w / 2) * contact.spread * 2
  const ry = bbox.h * contact.squash

  const fill = `rgb(${color.r},${color.g},${color.b})`
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ` +
      `fill="${fill}" fill-opacity="${contact.opacity}"/></svg>`,
  )

  return sharp(svg)
    .blur(Math.max(0.3, contact.blur * edge))
    .png()
    .toBuffer()
}
