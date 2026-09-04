import { describe, it, expect } from 'vitest'
import type { PageGrid, Region } from '@souqstudio/types'
import { validateGrid } from './validate'

const region = (over: Partial<Region> & Pick<Region, 'id'>): Region => ({
  colStart: 0,
  colEnd: 0,
  rowStart: 0,
  rowEnd: 0,
  blockId: 'blk_card',
  fill: 'flow',
  ...over,
})

const grid = (over: Partial<PageGrid> = {}): PageGrid => ({
  cols: [1, 1],
  rows: [1, 1],
  gap: 0.02,
  regions: [
    region({ id: 'r0', colStart: 0, colEnd: 0, rowStart: 0, rowEnd: 0 }),
    region({ id: 'r1', colStart: 1, colEnd: 1, rowStart: 0, rowEnd: 0 }),
  ],
  ...over,
})

const codes = (g: PageGrid) => validateGrid(g).map((p) => p.code)

describe('validateGrid', () => {
  it('passes a well-formed grid', () => {
    expect(validateGrid(grid())).toEqual([])
  })

  it('accepts uncovered cells — a hole is a design, not an error', () => {
    expect(validateGrid(grid({ regions: [region({ id: 'r0' })] }))).toEqual([])
  })

  it('refuses overlapping regions rather than resolving by z-order', () => {
    // A card silently under another card is a product the shop paid to print
    // and nobody can see.
    const overlapping = grid({
      regions: [
        region({ id: 'r0', colStart: 0, colEnd: 1 }),
        region({ id: 'r1', colStart: 1, colEnd: 1 }),
      ],
    })
    expect(codes(overlapping)).toContain('overlapping-regions')
  })

  it('catches a region outside the grid', () => {
    expect(codes(grid({ regions: [region({ id: 'r0', colEnd: 9 })] }))).toContain('out-of-bounds')
  })

  it('catches an inverted span', () => {
    expect(codes(grid({ regions: [region({ id: 'r0', colStart: 1, colEnd: 0 })] }))).toContain(
      'inverted-span'
    )
  })

  it('catches duplicate region ids', () => {
    const dupes = grid({
      regions: [region({ id: 'same' }), region({ id: 'same', colStart: 1, colEnd: 1 })],
    })
    expect(codes(dupes)).toContain('duplicate-region-id')
  })

  it('requires at least one flow region on a master', () => {
    const allStatic = grid({ regions: [region({ id: 'r0', fill: 'static' })] })
    expect(codes(allStatic)).toContain('no-flow-region')
  })

  it('rejects empty tracks and stops there', () => {
    expect(codes(grid({ cols: [] }))).toEqual(['empty-tracks'])
  })

  it('rejects zero-sized tracks and a negative gap', () => {
    expect(codes(grid({ cols: [1, 0] }))).toContain('track-size')
    expect(codes(grid({ gap: -1 }))).toContain('negative-gap')
  })
})
