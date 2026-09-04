import { describe, it, expect } from 'vitest'
import { resolveTracks } from './tracks'

describe('resolveTracks', () => {
  it('splits evenly when every track is 1fr', () => {
    expect(resolveTracks([1, 1, 1], 300, 0)).toEqual([
      { offset: 0, size: 100 },
      { offset: 100, size: 100 },
      { offset: 200, size: 100 },
    ])
  })

  it('puts gaps between tracks and not outside them', () => {
    // Three tracks carry two gaps: 300 − 20 = 280 of content.
    const tracks = resolveTracks([1, 1, 1], 300, 10)
    expect(tracks.map((t) => t.size)).toEqual([280 / 3, 280 / 3, 280 / 3])
    expect(tracks[0]?.offset).toBe(0)
    expect(tracks[2]?.offset).toBeCloseTo((280 / 3) * 2 + 20)
    const last = tracks[2]
    expect((last?.offset ?? 0) + (last?.size ?? 0)).toBeCloseTo(300)
  })

  it('honours uneven fr sizes — a short header row above tall card rows', () => {
    const tracks = resolveTracks([0.5, 1, 1], 250, 0)
    expect(tracks.map((t) => t.size)).toEqual([50, 100, 100])
  })

  it('rejects a grid whose gaps leave no room', () => {
    expect(() => resolveTracks([1, 1, 1], 20, 10)).toThrow(/do not fit/)
  })

  it('rejects zero and negative track sizes', () => {
    expect(() => resolveTracks([1, 0], 100, 0)).toThrow(/greater than zero/)
    expect(() => resolveTracks([1, -1], 100, 0)).toThrow(/greater than zero/)
  })

  it('rejects an empty grid', () => {
    expect(() => resolveTracks([], 100, 0)).toThrow(/at least one track/)
  })
})
