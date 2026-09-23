import { describe, expect, it } from 'vitest'
import {
  classScale,
  fitScale,
  MIN_LEGIBLE_PT,
  place,
  placeRect,
  points,
  sourcePixels,
  type TextFloor,
} from './place'

describe('fitScale — §5.2, a single uniform scalar', () => {
  it('takes the tighter of the two axes', () => {
    // Width allows 2x, height allows 1.5x. The card must fit both.
    expect(fitScale({ width: 100, height: 100 }, { width: 200, height: 150 })).toBe(1.5)
  })

  it('is 1 when the region is the design size', () => {
    expect(fitScale({ width: 400, height: 500 }, { width: 400, height: 500 })).toBe(1)
  })

  it('scales down as readily as up', () => {
    expect(fitScale({ width: 400, height: 400 }, { width: 100, height: 100 })).toBe(0.25)
  })

  it('is zero for a degenerate design or region, never infinite', () => {
    expect(fitScale({ width: 0, height: 10 }, { width: 10, height: 10 })).toBe(0)
    expect(fitScale({ width: 10, height: 10 }, { width: 0, height: 10 })).toBe(0)
    expect(fitScale({ width: 10, height: 10 }, { width: 10, height: -5 })).toBe(0)
  })
})

describe('classScale — §5.3, one scale for the whole slot class', () => {
  it('sizes for the worst case, not for each instance', () => {
    // The tall card is what every card in the row is sized against. This is the
    // part a design tool structurally cannot copy: the generator has every
    // record before it paints.
    const members = [
      { width: 100, height: 100 },
      { width: 100, height: 200 },
      { width: 100, height: 120 },
    ]
    // Into a 400 square: alone these would take 4x, 2x and 3.33x. The tall card
    // caps the row at 2x and the other two are set to match it.
    expect(classScale(members, { width: 400, height: 400 })).toBe(2)
  })

  it('gives every member the same number, which is the point', () => {
    const members = [
      { width: 100, height: 100 },
      { width: 100, height: 200 },
    ]
    const region = { width: 400, height: 400 }
    const shared = classScale(members, region)
    for (const member of members) {
      expect(shared).toBeLessThanOrEqual(fitScale(member, region))
    }
  })

  it('matches fitScale for a class of one', () => {
    const one = { width: 100, height: 50 }
    const region = { width: 300, height: 300 }
    expect(classScale([one], region)).toBe(fitScale(one, region))
  })

  it('is zero for an empty class rather than inventing 1', () => {
    expect(classScale([], { width: 100, height: 100 })).toBe(0)
  })
})

describe('points', () => {
  it('converts at 72 to the inch', () => {
    expect(points(6, 300)).toBe(25)
    expect(points(72, 300)).toBe(300)
  })

  it('carries the floor the design settled on', () => {
    expect(MIN_LEGIBLE_PT).toBe(6)
  })
})

describe('place — the legibility floor triggers reflow, not more scaling', () => {
  const floors: TextFloor[] = [
    { nodeId: 'name', role: 'name', fontSize: 20, minLegible: 10 },
    { nodeId: 'spec', role: 'spec', fontSize: 10, minLegible: 10 },
  ]

  it('reports nothing when everything clears its floor', () => {
    const result = place([{ width: 100, height: 100 }], { width: 100, height: 100 }, floors)
    expect(result.scale).toBe(1)
    expect(result.reflow).toEqual([])
  })

  it('names the text that has gone under, and only that text', () => {
    // At half scale the spec is 5 units against a floor of 10; the name is 10.
    const result = place([{ width: 100, height: 100 }], { width: 50, height: 50 }, floors)
    expect(result.scale).toBe(0.5)
    expect(result.reflow.map((f) => f.nodeId)).toEqual(['spec'])
  })

  it('does not change the scale to rescue it', () => {
    // §5.3: the block reflows rather than scaling further. Scaling up to save a
    // spec line would push the card out of its slot.
    const result = place([{ width: 100, height: 100 }], { width: 50, height: 50 }, floors)
    expect(result.scale).toBe(fitScale({ width: 100, height: 100 }, { width: 50, height: 50 }))
  })

  it('treats a text exactly on its floor as legible', () => {
    const exact: TextFloor[] = [{ nodeId: 't', role: 'name', fontSize: 20, minLegible: 10 }]
    expect(place([{ width: 100, height: 100 }], { width: 50, height: 50 }, exact).reflow).toEqual(
      []
    )
  })

  it('carries the role through, because that is what the caller reflows on', () => {
    const result = place([{ width: 100, height: 100 }], { width: 10, height: 10 }, floors)
    expect(result.reflow.map((f) => f.role).sort()).toEqual(['name', 'spec'])
  })

  it('needs no floors at all', () => {
    expect(place([{ width: 100, height: 100 }], { width: 50, height: 50 }).reflow).toEqual([])
  })

  it('uses the worst case across the class, so one long name reflows the row', () => {
    const members = [
      { width: 100, height: 100 },
      { width: 100, height: 400 },
    ]
    const result = place(members, { width: 100, height: 400 }, floors)
    // The tall card caps the row at 1x... and the short card is scaled to match.
    expect(result.scale).toBe(1)
    expect(result.reflow).toEqual([])
  })
})

describe('placeRect — where a solved box lands', () => {
  const design = { width: 100, height: 100 }

  it('scales and centres the slack', () => {
    // 2x into a 300-wide region leaves 100 of slack, 50 each side.
    const rect = placeRect({ x: 0, y: 0, width: 100, height: 100 }, design, {
      width: 300,
      height: 200,
    }, 2)
    expect(rect).toEqual({ x: 50, y: 0, width: 200, height: 200 })
  })

  it('keeps the offset of a child proportional', () => {
    const rect = placeRect({ x: 25, y: 10, width: 50, height: 20 }, design, design, 1)
    expect(rect).toEqual({ x: 0 + 25, y: 0 + 10, width: 50, height: 20 })
  })

  it('carries an overhanging box outside the region, rather than clipping it', () => {
    const rect = placeRect({ x: -10, y: 0, width: 20, height: 20 }, design, design, 1)
    expect(rect.x).toBe(-10)
  })
})

describe('sourcePixels — §5.2, raster sizing becomes computable', () => {
  it('asks for the pixels the placement actually needs', () => {
    // A 100-unit box at 2x wants 200 source pixels, not the 2000 of the original.
    expect(sourcePixels({ x: 0, y: 0, width: 100, height: 50 }, 2, 300)).toEqual({
      width: 200,
      height: 100,
    })
  })

  it('rounds up, because a fractional pixel is a soft edge', () => {
    expect(sourcePixels({ x: 0, y: 0, width: 33.3, height: 10 }, 1, 300).width).toBe(34)
  })

  it('scales with the output density when design units are not output pixels', () => {
    // Design units at 72 per inch, printed at 300.
    expect(
      sourcePixels({ x: 0, y: 0, width: 100, height: 100 }, 1, 300, 72).width
    ).toBe(417)
  })
})
