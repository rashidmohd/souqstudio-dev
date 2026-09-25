import { describe, expect, it } from 'vitest'
import { referencedAssetIds } from './block-assets'

describe('referencedAssetIds', () => {
  it('finds every assetId, however deep, and nothing else', () => {
    const document = [
      {
        background: { from: 'asset', assetId: 'library/blocks/ground' },
        elements: [
          { kind: 'image', source: { from: 'asset', assetId: 'library/blocks/badge' } },
          { kind: 'image', source: { from: 'product' } },
          { kind: 'text', text: 'assetId' },
        ],
      },
      { elements: [{ kind: 'image', source: { from: 'asset', assetId: 'library/blocks/badge' } }] },
    ]
    expect([...referencedAssetIds(document)].sort()).toEqual([
      'library/blocks/badge',
      'library/blocks/ground',
    ])
  })

  it('is empty for a document with no artwork, or no document', () => {
    expect(referencedAssetIds([{ elements: [] }]).size).toBe(0)
    expect(referencedAssetIds(null).size).toBe(0)
  })
})
