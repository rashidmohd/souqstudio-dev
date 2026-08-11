import 'server-only'

import sharp from 'sharp'
import { extractPalette } from '@/lib/color'

/**
 * Turning an uploaded file into a logo and a palette. E4-01 and E4-02.
 *
 * sharp lives here and nowhere else on the web side, so lib/color.ts stays
 * testable without an image and this stays the only place that has to think
 * about image formats.
 */

/**
 * Longest edge of the stored logo. A logo is placed at a few hundred pixels on
 * an artboard and at most a couple of thousand on an A3 print; anything beyond
 * this is bytes the shop owner uploads on 4G and nobody ever sees.
 */
const MAX_LOGO_EDGE = 1024

/**
 * Colours are quantized from a small copy. A 1024px logo is a million pixels to
 * walk for an answer that does not change — 128px is ~16k and gives the same
 * palette, because we are looking for large flat areas by definition.
 */
const SAMPLE_EDGE = 128

export type ProcessedLogo = {
  /** Normalized PNG, transparency preserved. */
  png: Buffer
  width: number
  height: number
  palette: string[]
}

/**
 * Normalize an uploaded logo to PNG and pull its palette.
 *
 * Everything becomes PNG, including SVG. The artboard composites the logo over
 * template colours and the print pipeline rasterises it anyway, so carrying
 * four input formats downstream buys nothing — and an SVG accepted from an
 * upload is script-bearing content we would then be serving from our own
 * domain. Rasterising removes that question entirely.
 */
export async function processLogo(input: Buffer): Promise<ProcessedLogo> {
  // `density` only affects vector input; it makes an SVG rasterise at a usable
  // size instead of its nominal one, which is often 16px.
  const image = sharp(input, { density: 300 }).rotate()

  const png = await image
    .clone()
    .resize({
      width: MAX_LOGO_EDGE,
      height: MAX_LOGO_EDGE,
      fit: 'inside',
      // Never scale a small logo up — it would only add blur and bytes.
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()

  const meta = await sharp(png).metadata()

  const sample = await sharp(png)
    .resize({ width: SAMPLE_EDGE, height: SAMPLE_EDGE, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    png,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    palette: extractPalette(sample.data, sample.info.channels),
  }
}

/** Palette for an image already stored — used after background removal. */
export async function paletteOf(input: Buffer): Promise<string[]> {
  const sample = await sharp(input)
    .resize({ width: SAMPLE_EDGE, height: SAMPLE_EDGE, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return extractPalette(sample.data, sample.info.channels)
}
