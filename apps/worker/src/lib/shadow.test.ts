/**
 * The shadow renderer. E14 §2.4.
 *
 * **These tests render real pixels**, unlike `matte.test.ts` beside them, which
 * is pure. They have to: every failure this file exists to catch is a sharp
 * pipeline behaviour rather than an arithmetic one — an alpha extracted at the
 * wrong point comes back opaque, a mask read at the wrong stride bands, a
 * four-band image is read as CMYK and inverts. None of that is visible to a
 * unit test over numbers, and all of it has a cost measured in printed flyers.
 */

import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { SHADOW_PRESETS, type ShadowPreset } from '@souqstudio/types'
import { analyseMatte } from './matte'
import { renderShadow } from './shadow'

/**
 * A product: an opaque disc on a transparent field, off-centre so a box
 * anchored to the canvas is distinguishable from one anchored to the content.
 */
async function disc(size = 120, radius = 30, cx = 50, cy = 40): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#c0392b"/></svg>`,
  )
  return sharp(svg).png().toBuffer()
}

/** The alpha plane of a PNG, for asserting where the shadow actually landed. */
async function alphaOf(png: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const image = sharp(png).ensureAlpha()
  const meta = await image.metadata()
  const data = await sharp(png).ensureAlpha().extractChannel('alpha').raw().toBuffer()
  return { data, width: meta.width ?? 0, height: meta.height ?? 0 }
}

const at = (a: { data: Buffer; width: number }, x: number, y: number): number =>
  a.data[y * a.width + x] ?? 0

describe('renderShadow', () => {
  it('pads the canvas and leaves the source untouched inside it', async () => {
    const source = await disc()
    const result = await renderShadow(source, 'soft-drop')

    expect(result.width).toBe(120 + result.pad * 2)
    expect(result.height).toBe(120 + result.pad * 2)

    // The product is composited at (pad, pad) rather than resized — the rule
    // `apps/worker/CLAUDE.md` states, because `bboxTight` is in these pixels.
    const alpha = await alphaOf(result.png)
    expect(at(alpha, result.pad + 50, result.pad + 40)).toBe(255)
  })

  it('reports the product box, not the shadow box', async () => {
    // The whole reason this field is translated rather than recomputed: the
    // layout engine sizes cards by optical weight, and a box that grew to
    // include the shadow would shrink every product on the page.
    const source = await disc()
    const result = await renderShadow(source, 'grounded')
    expect(result.bbox).not.toBeNull()

    // Asserted as the invariant rather than as pixel literals: the source's own
    // box, moved by the padding and not resized. A literal would also be
    // hostage to where antialiasing crosses the alpha threshold.
    const sourceAlpha = await sharp(source).ensureAlpha().extractChannel('alpha').raw().toBuffer()
    const from = analyseMatte(new Uint8Array(sourceAlpha), 120, 120).bbox
    expect(from).not.toBeNull()

    expect(result.bbox).toEqual({
      x: (from?.x ?? 0) + result.pad,
      y: (from?.y ?? 0) + result.pad,
      w: from?.w,
      h: from?.h,
    })
  })

  it('traces the silhouette rather than the box', async () => {
    /*
     * The defect this whole module exists to fix. `shadowRings` grows the
     * element's rectangle, so a cutout casts a rounded-rect shadow. A traced
     * shadow leaves the canvas corners empty, because the disc never reached
     * them.
     */
    const result = await renderShadow(await disc(), 'soft-drop')
    const alpha = await alphaOf(result.png)

    // Under the disc, offset down: shadow.
    expect(at(alpha, result.pad + 50, result.pad + 75)).toBeGreaterThan(10)
    // The far corner of the padded canvas: nothing.
    expect(at(alpha, 2, 2)).toBe(0)
  })

  it('does not extract an alpha that is opaque everywhere', async () => {
    /*
     * **The sharp pipeline-order trap, pinned.** `extractChannel` runs near the
     * end of sharp's internal order regardless of where it is chained, so
     * extracting after extend and blur yields a fully opaque mask — and the
     * shadow becomes a filled rectangle covering the whole canvas. If this ever
     * regresses, the corner assertion above and this one both fail.
     */
    const result = await renderShadow(await disc(), 'soft-drop')
    const alpha = await alphaOf(result.png)

    let opaque = 0
    for (let i = 0; i < alpha.data.length; i += 1) if ((alpha.data[i] ?? 0) === 255) opaque += 1

    // The disc is ~2,800px of a ~53,000px canvas. A rectangle-shaped failure
    // puts this near 100%.
    expect(opaque / alpha.data.length).toBeLessThan(0.5)
  })

  it('puts the contact ellipse under the product, not under the canvas', async () => {
    // Anchored to the alpha box: the disc sits high and left of centre, so an
    // ellipse anchored to the canvas would be visibly low and right.
    const result = await renderShadow(await disc(), 'contact')
    const alpha = await alphaOf(result.png)

    const underProduct = at(alpha, result.pad + 50, result.pad + 72)
    const underCanvasCentre = at(alpha, result.pad + 60, result.pad + 115)
    expect(underProduct).toBeGreaterThan(underCanvasCentre)
  })

  it('renders every preset', async () => {
    const source = await disc()
    for (const preset of SHADOW_PRESETS) {
      const result = await renderShadow(source, preset as ShadowPreset)
      expect(result.png.length).toBeGreaterThan(0)
      expect(result.bbox).not.toBeNull()
    }
  })

  it('tints the shadow rather than always drawing black', async () => {
    // Pure black muddies on a warm ground; the preset takes a colour so it can
    // come from the block's palette instead of being a stored hex.
    const source = await disc()
    const warm = await renderShadow(source, 'soft-drop', { r: 58, g: 46, b: 20 })

    const { data, info } = await sharp(warm.png)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const x = warm.pad + 50
    const y = warm.pad + 78
    const p = (y * info.width + x) * info.channels
    // Warm: red above blue. A black shadow would have them equal.
    expect(data[p] ?? 0).toBeGreaterThan(data[p + 2] ?? 0)
  })
})
