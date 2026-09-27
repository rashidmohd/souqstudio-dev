import { describe, expect, it } from 'vitest'
import { arrangementsSchema } from './document'

/** One product image in one arrangement, with whatever padding is given. */
const doc = (padding?: unknown) => [
  {
    aspectMin: 0.5,
    aspectMax: 1,
    elements: [
      {
        id: 'photo',
        kind: 'image',
        box: { start: 0, top: 0, width: 1, height: 0.6 },
        source: { from: 'product' },
        ...(padding === undefined ? {} : { padding }),
      },
    ],
  },
]

describe('image padding in the block document', () => {
  it('is optional, so every document written before it still parses', () => {
    expect(arrangementsSchema.safeParse(doc()).success).toBe(true)
  })

  it('accepts 0 to 0.3', () => {
    for (const padding of [0, 0.12, 0.3]) {
      expect(arrangementsSchema.safeParse(doc(padding)).success).toBe(true)
    }
  })

  it('refuses a padding outside that range', () => {
    for (const padding of [-0.1, 0.31, 1, '10%']) {
      expect(arrangementsSchema.safeParse(doc(padding)).success).toBe(false)
    }
  })
})

describe('image scale in the block document', () => {
  const scaled = (scale: unknown) => {
    const [arrangement] = doc()
    return [{ ...arrangement, elements: [{ ...arrangement!.elements[0], scale }] }]
  }

  it('accepts the photo size range', () => {
    for (const scale of [0.5, 1, 1.15, 1.5]) {
      expect(arrangementsSchema.safeParse(scaled(scale)).success).toBe(true)
    }
  })

  it('refuses a scale outside it', () => {
    for (const scale of [0.4, 1.51, 0, '120%']) {
      expect(arrangementsSchema.safeParse(scaled(scale)).success).toBe(false)
    }
  })
})
