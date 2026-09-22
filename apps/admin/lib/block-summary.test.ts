import { describe, expect, it } from 'vitest'
import { summarize } from './block-summary'

/**
 * The document is JSONB, so every one of these is a shape that can actually
 * reach the function from the database.
 */
describe('summarize', () => {
  it('reports an unreadable document rather than throwing', () => {
    expect(summarize(null).unreadable).toBe(true)
    expect(summarize({}).unreadable).toBe(true)
    expect(summarize([]).unreadable).toBe(true)
    expect(summarize('[]').unreadable).toBe(true)
  })

  it('counts arrangements and prints their aspect ranges', () => {
    const summary = summarize([
      { aspectMin: 0.5, aspectMax: 1, elements: [] },
      { aspectMin: 1, aspectMax: 2.5, elements: [] },
    ])
    expect(summary.arrangements).toBe(2)
    expect(summary.ranges).toEqual(['0.50 to 1.00', '1.00 to 2.50'])
    expect(summary.unreadable).toBe(false)
  })

  it('separates bound elements from static ones', () => {
    const summary = summarize([
      {
        aspectMin: 0.5,
        aspectMax: 2,
        elements: [
          { kind: 'text', source: { from: 'product', field: 'name' } },
          { kind: 'text', source: { from: 'static', text: 'Offer' } },
          { kind: 'image', source: { from: 'product' } },
          { kind: 'rect' },
        ],
      },
    ])
    expect(summary.boundElements).toBe(2)
    expect(summary.staticElements).toBe(2)
    expect(summary.bindings).toEqual(['product', 'product.name'])
  })

  it('counts an uploaded asset as bound, because it resolves at draw time', () => {
    const summary = summarize([
      { aspectMin: 1, aspectMax: 1, elements: [{ kind: 'image', source: { from: 'asset', assetId: 'k' } }] },
    ])
    expect(summary.bindings).toEqual(['asset'])
    expect(summary.boundElements).toBe(1)
  })

  it('deduplicates a binding used in several arrangements', () => {
    const element = { kind: 'text', source: { from: 'offer', field: 'tier' } }
    const summary = summarize([
      { aspectMin: 0.5, aspectMax: 1, elements: [element] },
      { aspectMin: 1, aspectMax: 2, elements: [element] },
    ])
    expect(summary.bindings).toEqual(['offer.tier'])
    expect(summary.boundElements).toBe(2)
  })

  it('survives an arrangement whose elements are missing or the wrong type', () => {
    const summary = summarize([
      { aspectMin: 1, aspectMax: 1 },
      { aspectMin: 1, aspectMax: 1, elements: 'nope' },
      null,
    ])
    expect(summary.arrangements).toBe(3)
    expect(summary.boundElements).toBe(0)
    expect(summary.unreadable).toBe(false)
  })
})
