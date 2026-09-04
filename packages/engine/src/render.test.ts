import { describe, it, expect } from 'vitest'
import type { Block, BlockElement } from '@souqstudio/types'
import { resolveBlock } from './render'

const image: BlockElement = {
  kind: 'image',
  box: { start: 0, top: 0, width: 1, height: 0.5 },
  source: { from: 'product' },
}
const name: BlockElement = {
  kind: 'text',
  box: { start: 0.05, top: 0.55, width: 0.9, height: 0.2 },
  source: { from: 'product', field: 'name' },
  style: 'display',
  align: 'start',
}

const block = (over: Partial<Block> = {}): Block => ({
  id: 'blk_card',
  organizationId: null,
  name: 'Standard card',
  repeats: true,
  thumbnailUrl: null,
  arrangements: [
    { aspectMin: 0.4, aspectMax: 1.2, elements: [image, name] },
    { aspectMin: 1.2, aspectMax: 8, elements: [image] },
  ],
  ...over,
})

const CONTAINER = { x: 100, y: 200, width: 400, height: 800 }

describe('resolveBlock', () => {
  it('maps fractions onto the container and offsets by its origin', () => {
    const { elements } = resolveBlock(block(), CONTAINER, 'ltr')
    expect(elements[0]?.rect).toEqual({ x: 100, y: 200, width: 400, height: 400 })
    expect(elements[1]?.rect).toEqual({ x: 120, y: 640, width: 360, height: 160 })
  })

  it('selects the arrangement by container aspect', () => {
    expect(resolveBlock(block(), CONTAINER, 'ltr').arrangementIndex).toBe(0)
    const wide = { x: 0, y: 0, width: 800, height: 200 }
    expect(resolveBlock(block(), wide, 'ltr').arrangementIndex).toBe(1)
  })

  it('mirrors element boxes in RTL', () => {
    const { elements } = resolveBlock(block(), CONTAINER, 'rtl')
    // A full-width image is unmoved; an inset one flips to the far edge.
    expect(elements[0]?.rect.x).toBe(100)
    expect(elements[1]?.rect.x).toBe(120)
  })

  it('mirrors an asymmetric element to the opposite edge', () => {
    const asymmetric = block({
      arrangements: [
        {
          aspectMin: 0,
          aspectMax: 10,
          elements: [{ ...image, box: { start: 0, top: 0, width: 0.25, height: 1 } }],
        },
      ],
    })
    expect(resolveBlock(asymmetric, CONTAINER, 'ltr').elements[0]?.rect.x).toBe(100)
    expect(resolveBlock(asymmetric, CONTAINER, 'rtl').elements[0]?.rect.x).toBe(400)
  })

  it('does not clamp an overhanging chip', () => {
    // Chips may overhang by up to half their width; the engine reserves the
    // bleed in gap calculation. Clamping here would delete the design.
    const chipped = block({
      arrangements: [
        {
          aspectMin: 0,
          aspectMax: 10,
          elements: [
            { kind: 'chip', box: { start: -0.1, top: -0.05, width: 0.3, height: 0.1 }, anchor: 'TOP_START' },
          ],
        },
      ],
    })
    const rect = resolveBlock(chipped, CONTAINER, 'ltr').elements[0]?.rect
    expect(rect?.x).toBe(60)
    expect(rect?.y).toBe(160)
  })
})
