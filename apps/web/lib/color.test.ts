import { describe, it, expect } from 'vitest'
import {
  toHex,
  fromHex,
  isValidHex,
  relativeLuminance,
  contrastRatio,
  whiteTextPasses,
  readableInkOn,
  isDarkBackground,
  extractPalette,
  assignBrandColors,
  WCAG_AA_NORMAL,
} from '@/lib/color'

describe('hex conversion', () => {
  it('round-trips', () => {
    expect(toHex({ r: 31, g: 79, b: 216 })).toBe('#1f4fd8')
    expect(fromHex('#1f4fd8')).toEqual({ r: 31, g: 79, b: 216 })
  })

  it('accepts shorthand, expanding each nibble', () => {
    expect(fromHex('#f0a')).toEqual({ r: 255, g: 0, b: 170 })
  })

  it('accepts a missing hash and stray whitespace', () => {
    expect(fromHex('  1f4fd8 ')).toEqual({ r: 31, g: 79, b: 216 })
  })

  it('rejects anything that is not a colour', () => {
    for (const bad of ['', '#', '#12', '#12345', 'nope', '#12345g']) {
      expect(fromHex(bad)).toBeNull()
      expect(isValidHex(bad)).toBe(false)
    }
  })

  it('clamps out-of-range channels rather than emitting a broken hex', () => {
    expect(toHex({ r: -20, g: 300, b: 127.6 })).toBe('#00ff80')
  })
})

describe('contrast — the WCAG numbers must be exact', () => {
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  it('puts luminance at the known endpoints', () => {
    expect(relativeLuminance(white)).toBeCloseTo(1, 5)
    expect(relativeLuminance(black)).toBeCloseTo(0, 5)
  })

  it('gives black on white the maximum 21:1', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2)
  })

  it('does not care which argument is which', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(contrastRatio(white, black), 10)
  })

  it('matches a known reference value', () => {
    // #767676 on white is the canonical "just passes AA" grey.
    const ratio = contrastRatio({ r: 118, g: 118, b: 118 }, white)
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
    expect(ratio).toBeLessThan(5)
  })
})

describe('whiteTextPasses — the price readability check of E4-02', () => {
  it('fails on a light accent, which is the case worth catching', () => {
    // Yellow is the classic offer colour and the classic unreadable price.
    expect(whiteTextPasses({ r: 255, g: 197, b: 0 })).toBe(false)
  })

  it('passes on a deep brand colour', () => {
    expect(whiteTextPasses({ r: 11, g: 99, b: 206 })).toBe(true)
  })

  it('is more forgiving for large text', () => {
    // Contrast against white is ~3.5 here: over the 3:1 large-text bar and
    // under the 4.5:1 normal one, which is the only range where the `large`
    // flag changes the answer.
    const midGrey = { r: 137, g: 137, b: 137 }
    expect(whiteTextPasses(midGrey, false)).toBe(false)
    expect(whiteTextPasses(midGrey, true)).toBe(true)
  })
})

describe('readableInkOn', () => {
  it('picks dark ink on a light ground and light ink on a dark one', () => {
    expect(readableInkOn({ r: 255, g: 255, b: 255 })).toBe('#000000')
    expect(readableInkOn({ r: 20, g: 20, b: 20 })).toBe('#ffffff')
  })

  it('agrees with isDarkBackground', () => {
    for (const rgb of [
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 197, b: 0 },
      { r: 11, g: 99, b: 206 },
    ]) {
      expect(isDarkBackground(rgb)).toBe(readableInkOn(rgb) !== '#000000')
    }
  })
})

/** Build a flat RGBA buffer from a list of colours, one pixel each. */
function pixels(colors: Array<[number, number, number, number?]>): Uint8Array {
  const out = new Uint8Array(colors.length * 4)
  colors.forEach(([r, g, b, a = 255], index) => {
    out.set([r, g, b, a], index * 4)
  })
  return out
}

describe('extractPalette', () => {
  it('finds the colours actually in the image', () => {
    const red: [number, number, number] = [200, 30, 40]
    const blue: [number, number, number] = [20, 60, 200]
    const palette = extractPalette(
      pixels([...Array(50).fill(red), ...Array(50).fill(blue)]),
      4,
      2
    )

    expect(palette).toHaveLength(2)
    // Median cut averages within a bucket, so check proximity rather than
    // exact equality — the point is that both colours are represented.
    const parsed = palette.map((hex) => fromHex(hex))
    expect(parsed.some((c) => c && c.r > 150 && c.b < 100)).toBe(true)
    expect(parsed.some((c) => c && c.b > 150 && c.r < 100)).toBe(true)
  })

  it('ignores transparent pixels — the whole point of background removal', () => {
    const palette = extractPalette(
      pixels([
        [200, 30, 40, 255],
        [0, 255, 0, 0],
        [0, 255, 0, 10],
      ]),
      4,
      3
    )
    // The green is invisible; suggesting it would be suggesting the background.
    expect(palette.every((hex) => (fromHex(hex)?.g ?? 0) < 200)).toBe(true)
  })

  it('ignores near-white and near-black, which are page and outline', () => {
    const palette = extractPalette(
      pixels([
        [250, 250, 250],
        [5, 5, 5],
        [200, 30, 40],
      ]),
      4,
      3
    )
    expect(palette).toHaveLength(1)
  })

  it('returns nothing for an image with no usable colour', () => {
    expect(extractPalette(pixels([[255, 255, 255], [0, 0, 0]]), 4, 3)).toEqual([])
  })

  it('orders by coverage, so the dominant colour comes first', () => {
    const rare: [number, number, number] = [20, 60, 200]
    const common: [number, number, number] = [200, 30, 40]
    const palette = extractPalette(
      pixels([...Array(90).fill(common), ...Array(10).fill(rare)]),
      4,
      2
    )
    const first = fromHex(palette[0] as string)
    expect(first && first.r > first.b).toBe(true)
  })

  it('handles RGB with no alpha channel', () => {
    const rgb = new Uint8Array([200, 30, 40, 20, 60, 200])
    expect(extractPalette(rgb, 3, 2).length).toBeGreaterThan(0)
  })

  it('never returns duplicates', () => {
    const palette = extractPalette(pixels(Array(100).fill([200, 30, 40])), 4, 5)
    expect(new Set(palette).size).toBe(palette.length)
  })
})

describe('assignBrandColors', () => {
  it('fills all three slots from a full palette', () => {
    expect(assignBrandColors(['#111111', '#222222', '#333333'])).toEqual({
      primaryColor: '#111111',
      secondaryColor: '#222222',
      accentColor: '#333333',
    })
  })

  it('cycles a single-colour logo rather than leaving slots empty', () => {
    // A one-colour wordmark is common, and an empty kit would leave the editor
    // with nothing to render.
    const assigned = assignBrandColors(['#111111'])
    expect(assigned.primaryColor).toBe('#111111')
    expect(assigned.secondaryColor).toBe('#111111')
    expect(assigned.accentColor).toBe('#111111')
  })

  it('falls back to defaults when extraction found nothing', () => {
    const assigned = assignBrandColors([])
    expect(isValidHex(assigned.primaryColor)).toBe(true)
    expect(isValidHex(assigned.secondaryColor)).toBe(true)
    expect(isValidHex(assigned.accentColor)).toBe(true)
  })
})
