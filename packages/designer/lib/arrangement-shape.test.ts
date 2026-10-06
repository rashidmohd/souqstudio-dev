import { describe, expect, it } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { reshapeArrangement } from './arrangement-shape'

/**
 * Trimming a card must move its edge, not its content: what was drawn at a
 * place on the old card is drawn at the same place, at the same size, on the
 * new one.
 */

const card: Arrangement = {
  aspectMin: 0.4,
  aspectMax: 0.9,
  shape: 0.6,
  elements: [
    {
      id: 'price',
      kind: 'text',
      box: { start: 0.1, top: 0.67, width: 0.8, height: 0.16 },
      source: { from: 'product', field: 'name' },
      level: 'h4',
      align: 'start',
    },
  ],
}

describe('reshapeArrangement', () => {
  it('cuts the empty bottom off and keeps the content where it was', () => {
    const next = reshapeArrangement(card, 0.6, 1, 0.83)
    const box = next.elements[0]!.box
    // The price ended at 0.83 of the old card; it now ends at the new bottom.
    expect(box.top + box.height).toBeCloseTo(1, 5)
    // Same physical height: 0.16 of the old card is 0.16 / 0.83 of the new.
    expect(box.height * 0.83).toBeCloseTo(0.16, 5)
    // A shorter card is a wider shape.
    expect(next.shape).toBeCloseTo(0.6 / 0.83, 5)
  })

  it('narrows from the end and leaves the vertical untouched', () => {
    const next = reshapeArrangement(card, 0.6, 0.9, 1)
    const box = next.elements[0]!.box
    expect(box.start + box.width).toBeCloseTo(1, 5)
    expect(box.top).toBeCloseTo(0.67, 5)
    expect(next.shape).toBeCloseTo(0.54, 5)
  })

  it('keeps the range that decides which cells use the layout', () => {
    const next = reshapeArrangement(card, 0.6, 1, 0.83)
    expect([next.aspectMin, next.aspectMax]).toEqual([0.4, 0.9])
  })
})
