import { describe, expect, it } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { imagePadding } from './draw'

type Image = Extract<BlockElement, { kind: 'image' }>
const image = (source: Image['source'], padding?: number): Image => ({
  id: 'i',
  kind: 'image',
  box: { start: 0, top: 0, width: 1, height: 1 },
  source,
  ...(padding === undefined ? {} : { padding }),
})

describe('imagePadding', () => {
  it('keeps the old defaults when none is set', () => {
    expect(imagePadding(image({ from: 'product' }))).toBe(0.12)
    expect(imagePadding(image({ from: 'asset', assetId: 'a/b' }))).toBe(0)
    expect(imagePadding(image({ from: 'brand', field: 'logo' }))).toBe(0)
  })

  it('uses the padding the element sets, including none at all', () => {
    expect(imagePadding(image({ from: 'product' }, 0))).toBe(0)
    expect(imagePadding(image({ from: 'product' }, 0.25))).toBe(0.25)
    expect(imagePadding(image({ from: 'asset', assetId: 'a/b' }, 0.1))).toBe(0.1)
  })
})
