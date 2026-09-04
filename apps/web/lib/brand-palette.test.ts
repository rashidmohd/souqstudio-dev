import { describe, it, expect } from 'vitest'
import type { BrandKit } from '@souqstudio/types'
import {
  MAX_PALETTE,
  MIN_PALETTE,
  canAdd,
  canRemove,
  palettePatch,
  resolvePalette,
  resolveToken,
} from '@/lib/brand-palette'

const color = (id: string, name: string, hex: string) => ({ id, name, hex })

describe('resolvePalette', () => {
  it('returns the palette when the kit has one', () => {
    const kit: BrandKit = { palette: [color('a', 'Deep blue', '#1B4DB1')] }
    expect(resolvePalette(kit)).toEqual([color('a', 'Deep blue', '#1B4DB1')])
  })

  it('builds one from the legacy three when the kit predates it', () => {
    // A kit written before palettes existed reads as a three-colour palette,
    // not as an empty one.
    const kit: BrandKit = {
      primaryColor: '#111111',
      secondaryColor: '#222222',
      accentColor: '#333333',
    }
    expect(resolvePalette(kit).map((c) => c.hex)).toEqual(['#111111', '#222222', '#333333'])
    expect(resolvePalette(kit).map((c) => c.name)).toEqual(['Primary', 'Secondary', 'Accent'])
  })

  it('falls back to defaults for an empty kit rather than returning nothing', () => {
    expect(resolvePalette({})).toHaveLength(3)
  })

  it('holds more than three — a brand is not capped at three colours', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id, i) => color(id, `C${i}`, '#000000'))
    expect(resolvePalette({ palette: five })).toHaveLength(5)
  })
})

describe('palettePatch', () => {
  it('mirrors the first three into the legacy fields', () => {
    // Everything still reading primaryColor keeps working while the palette
    // becomes the real store.
    const patch = palettePatch([
      color('a', 'One', '#111111'),
      color('b', 'Two', '#222222'),
      color('c', 'Three', '#333333'),
      color('d', 'Four', '#444444'),
    ])
    expect(patch.primaryColor).toBe('#111111')
    expect(patch.secondaryColor).toBe('#222222')
    expect(patch.accentColor).toBe('#333333')
    expect(patch.palette).toHaveLength(4)
  })

  it('round-trips through resolvePalette', () => {
    const palette = [
      color('a', 'One', '#111111'),
      color('b', 'Two', '#222222'),
      color('c', 'Three', '#333333'),
    ]
    expect(resolvePalette(palettePatch(palette))).toEqual(palette)
  })
})

describe('resolveToken', () => {
  const palette = [
    color('a', 'One', '#111111'),
    color('b', 'Two', '#222222'),
    color('c', 'Three', '#333333'),
  ]

  it('binds the three block slots to the first three entries', () => {
    // A seeded block names a slot because it has never met this shop.
    expect(resolveToken(palette, 'primary')).toBe('#111111')
    expect(resolveToken(palette, 'secondary')).toBe('#222222')
    expect(resolveToken(palette, 'accent')).toBe('#333333')
  })

  it('resolves page mechanics without consulting the palette', () => {
    // A shop does not choose the ground its page is printed on.
    expect(resolveToken([], 'surface')).toBeTruthy()
    expect(resolveToken([], 'ink')).toBeTruthy()
    expect(resolveToken(palette, 'surface')).not.toBe('#111111')
  })

  it('never returns undefined for a short palette', () => {
    for (const token of ['primary', 'secondary', 'accent'] as const) {
      expect(resolveToken([], token)).toMatch(/^#/)
    }
  })
})

describe('bounds', () => {
  const of = (n: number) => Array.from({ length: n }, (_, i) => color(`${i}`, `C${i}`, '#000000'))

  it('allows adding up to the ceiling', () => {
    expect(canAdd(of(MIN_PALETTE))).toBe(true)
    expect(canAdd(of(MAX_PALETTE))).toBe(false)
  })

  it('holds the floor at three, which is what setup completion needs', () => {
    expect(canRemove(of(MIN_PALETTE))).toBe(false)
    expect(canRemove(of(MIN_PALETTE + 1))).toBe(true)
  })
})
