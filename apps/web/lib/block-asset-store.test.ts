import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { assetName, measurePng } from '@/lib/block-asset-store'

/**
 * The pure half. `recordAsset` and `listAssets` are Prisma against a live
 * database and are checked by running them.
 */

describe('assetName', () => {
  it('drops the extension, which is noise in a picker', () => {
    expect(assetName('ramadan-badge.svg')).toBe('ramadan-badge')
    expect(assetName('logo.final.PNG')).toBe('logo.final')
  })

  /**
   * The file is already in the bucket by the time this runs. Losing an owner's
   * artwork over its title would be absurd, so a bad name is repaired rather
   * than refused.
   */
  it('never returns nothing', () => {
    expect(assetName('.png')).toBe('Artwork')
    expect(assetName('   ')).toBe('Artwork')
  })

  it('cuts a long name rather than rejecting the upload', () => {
    expect(assetName(`${'a'.repeat(300)}.png`)).toHaveLength(80)
  })
})

describe('measurePng', () => {
  /**
   * Measured from the bytes, not from what the client said. A tile draws each
   * asset at its own proportion, and a wrong width makes the tile the wrong
   * shape — which reads as a rendering bug rather than as bad data.
   */
  it('reads the real dimensions', async () => {
    const png = await sharp({
      create: { width: 120, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer()

    expect(await measurePng(png)).toEqual({ width: 120, height: 40 })
  })

  it('returns null for something that is not an image', async () => {
    expect(await measurePng(Buffer.from('not an image'))).toBeNull()
  })
})
