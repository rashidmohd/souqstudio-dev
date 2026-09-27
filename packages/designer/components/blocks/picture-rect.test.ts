import { describe, expect, it } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { paintedRect, pictureRect } from './draw'

type Image = Extract<BlockElement, { kind: 'image' }>
const image = (extra: Partial<Image> = {}): Image => ({
  id: 'i',
  kind: 'image',
  box: { start: 0, top: 0, width: 1, height: 1 },
  source: { from: 'product' },
  ...extra,
})

const box = { x: 0, y: 0, width: 100, height: 100 }

describe('pictureRect', () => {
  it('is the padded box when no scale is set', () => {
    expect(pictureRect(image(), box)).toEqual({ x: 12, y: 12, width: 76, height: 76 })
  })

  it('grows and shrinks about the centre', () => {
    const bigger = pictureRect(image({ padding: 0, scale: 1.2 }), box)
    expect(bigger).toEqual({ x: -10, y: -10, width: 120, height: 120 })

    const smaller = pictureRect(image({ padding: 0, scale: 0.5 }), box)
    expect(smaller).toEqual({ x: 25, y: 25, width: 50, height: 50 })
  })

  it('scales what the padding leaves, not the whole box', () => {
    const rect = pictureRect(image({ scale: 1.25 }), box)
    expect(rect.width).toBeCloseTo(95)
    expect(rect.x + rect.width / 2).toBeCloseTo(50)
  })
})

describe('paintedRect on an image', () => {
  // `ctx` is not read for an image, so none is built.
  const ctx = undefined as never

  it('reports a scaled picture even with no padding', () => {
    expect(paintedRect(image({ padding: 0, scale: 1.1 }), box, ctx)).not.toBeNull()
  })

  it('has nothing to report when the picture exactly reaches its box', () => {
    expect(paintedRect(image({ padding: 0 }), box, ctx)).toBeNull()
  })
})
