import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { rasteriseVector } from '@/lib/artwork'

/**
 * The security claim this route rests on is that **nothing but a bitmap reaches
 * the bucket**, so these check the thing itself rather than the code path: a
 * drawing goes in, a PNG comes out, and what came out is not an SVG.
 */

const svg = (width: number, height: number, extra = '') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
      `${extra}<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2}" fill="#0a0"/></svg>`
  )

describe('rasteriseVector', () => {
  it('returns a PNG, not the file it was given', async () => {
    const out = await rasteriseVector(svg(100, 100))
    expect(out).not.toBeNull()
    expect((await sharp(out!).metadata()).format).toBe('png')
  })

  /**
   * The reason SVG was refused in the first place. A script in the source must
   * not survive into anything that is stored — and rasterising is what makes
   * that true by construction rather than by a sanitiser anyone has to maintain.
   */
  it('leaves no script in the output', async () => {
    const out = await rasteriseVector(svg(50, 50, '<script>alert(1)</script>'))
    expect(out).not.toBeNull()
    expect(out!.includes(Buffer.from('alert'))).toBe(false)
    expect(out!.includes(Buffer.from('<svg'))).toBe(false)
  })

  /**
   * A fixed density renders a drawing at its nominal size, so a badge authored
   * on a 100×100 viewBox would come out ~417px — softer than the PNG the owner
   * could have exported themselves, which defeats uploading a vector at all.
   */
  it('renders a small drawing at print size rather than at its nominal one', async () => {
    const meta = await sharp((await rasteriseVector(svg(100, 100)))!).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2048)
  })

  it('keeps the drawing’s proportions', async () => {
    const meta = await sharp((await rasteriseVector(svg(1200, 300)))!).metadata()
    expect(meta.width).toBe(2048)
    expect(meta.height).toBe(512)
  })

  /** A mislabelled file is refused rather than stored — the content decides. */
  it('refuses something that is not a drawing', async () => {
    expect(await rasteriseVector(Buffer.from('not a drawing at all'))).toBeNull()
  })
})
