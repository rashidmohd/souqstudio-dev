import { describe, expect, it } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { SEED_BLOCKS } from '@souqstudio/engine'
import { MAX_ELEMENTS, arrangementsSchema, toArrangements } from '@/lib/block-document'
import { blockErrorMessage, blockErrors, blockUpdateSchema } from '@/lib/block-write'
import { copyName, planReaches } from '@/lib/blocks'

/**
 * The pure half of E7: what a block document may contain, when a write is
 * refused, and the plan gate. The reads themselves are Prisma against a live
 * database and are checked by running them.
 */

const card: Arrangement[] = [
  {
    aspectMin: 0.5,
    aspectMax: 1.5,
    elements: [
      { kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, surface: 'surface', radius: 3 },
      {
        kind: 'text',
        box: { start: 0.08, top: 0.4, width: 0.84, height: 0.2 },
        source: { from: 'product', field: 'name' },
        level: 'h3',
        align: 'start',
      },
      { kind: 'priceMark', box: { start: 0.08, top: 0.7, width: 0.84, height: 0.2 } },
    ],
  },
]

describe('the block document', () => {
  it('accepts every seeded block, which is the library that ships', () => {
    // The strongest case available: if the schema and the seeded library ever
    // disagree, `pnpm db:seed` writes rows this route would then refuse to
    // read back.
    for (const block of SEED_BLOCKS) {
      expect(arrangementsSchema.safeParse(block.arrangements).success).toBe(true)
    }
  })

  it('round-trips a document unchanged', () => {
    expect(toArrangements(card)).toEqual(card)
  })

  it('refuses a colour that is not a role', () => {
    const hex = [
      {
        ...card[0],
        elements: [
          { kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, surface: '#143CD2', radius: 3 },
        ],
      },
    ]
    expect(toArrangements(hex)).toBeNull()
  })

  it('refuses a static line with only one language', () => {
    const oneLanguage = [
      {
        ...card[0],
        elements: [
          {
            kind: 'text',
            box: { start: 0, top: 0, width: 1, height: 0.2 },
            source: { from: 'static', textEn: 'Ramadan Kareem' },
            level: 'h1',
            align: 'start',
          },
        ],
      },
    ]
    expect(toArrangements(oneLanguage)).toBeNull()
  })

  it('refuses an unknown element kind rather than dropping it', () => {
    const alien = [{ ...card[0], elements: [{ kind: 'video', box: { start: 0, top: 0, width: 1, height: 1 } }] }]
    expect(toArrangements(alien)).toBeNull()
  })

  it('refuses a block with no arrangements at all', () => {
    expect(toArrangements([])).toBeNull()
  })

  it('refuses an arrangement whose range runs backwards', () => {
    expect(toArrangements([{ aspectMin: 2, aspectMax: 0.5, elements: [] }])).toBeNull()
  })

  it('caps the element count', () => {
    const many = [
      {
        ...card[0],
        elements: Array.from({ length: MAX_ELEMENTS + 1 }, () => ({
          kind: 'logo' as const,
          box: { start: 0, top: 0, width: 0.1, height: 0.1 },
        })),
      },
    ]
    expect(toArrangements(many)).toBeNull()
  })

  it('keeps a declared overflow policy', () => {
    const clamped = [
      {
        ...card[0],
        elements: [
          {
            kind: 'text',
            box: { start: 0, top: 0, width: 1, height: 0.2 },
            source: { from: 'product', field: 'name' },
            level: 'h3',
            align: 'start',
            overflow: { mode: 'clamp', lines: 2 },
          },
        ],
      },
    ]
    const parsed = toArrangements(clamped)
    expect(parsed?.[0]?.elements[0]).toMatchObject({ overflow: { mode: 'clamp', lines: 2 } })
  })

  it('refuses a clamp of zero lines, which would hide the text', () => {
    const zero = [
      {
        ...card[0],
        elements: [
          {
            kind: 'text',
            box: { start: 0, top: 0, width: 1, height: 0.2 },
            source: { from: 'product', field: 'name' },
            level: 'h3',
            align: 'start',
            overflow: { mode: 'clamp', lines: 0 },
          },
        ],
      },
    ]
    expect(toArrangements(zero)).toBeNull()
  })
})

describe('blockUpdateSchema', () => {
  it('takes a partial change', () => {
    expect(blockUpdateSchema.safeParse({ name: 'Ramadan card' }).success).toBe(true)
  })

  it('refuses a status it does not know', () => {
    expect(blockUpdateSchema.safeParse({ status: 'live' }).success).toBe(false)
  })
})

describe('blockErrors', () => {
  it('passes a well-formed card', () => {
    expect(blockErrors({ repeats: true, arrangements: card })).toEqual([])
  })

  it('refuses a product binding on a block that is placed once', () => {
    expect(blockErrors({ repeats: false, arrangements: card })).toContain(
      'product-binding-on-static-block'
    )
  })

  it('reports an unreadable document as one error rather than throwing', () => {
    expect(blockErrors({ repeats: true, arrangements: 'not a block' })).toEqual(['invalid-document'])
  })

  it('does not refuse a save over a warning', () => {
    // A card with no price still renders. Refusing it would be refusing a design
    // that works — the designer shows the warning beside the canvas instead.
    const priceless = [{ ...card[0], elements: card[0]!.elements.slice(0, 2) }]
    expect(blockErrors({ repeats: true, arrangements: priceless })).toEqual([])
  })
})

describe('blockErrorMessage', () => {
  it('names the rule that was broken, not the code', () => {
    expect(blockErrorMessage(['product-binding-on-static-block'])).toContain('once per product')
    expect(blockErrorMessage(['duplicate-price-mark'])).toContain('One offer has one price')
  })

  it('falls back to something an owner can act on', () => {
    expect(blockErrorMessage(['something-new'])).toContain('beside the canvas')
  })
})

describe('planReaches', () => {
  it('opens everything at or below the plan', () => {
    expect(planReaches('business', 'pro')).toBe(true)
    expect(planReaches('business', 'business')).toBe(true)
  })

  it('locks what is above it', () => {
    expect(planReaches('starter', 'pro')).toBe(false)
  })

  it('treats no plan as the floor', () => {
    expect(planReaches(null, 'starter')).toBe(true)
    expect(planReaches(null, 'pro')).toBe(false)
  })

  it('opens rather than locks on a tier nobody recognises', () => {
    // A block nobody can reach because of a typo in a seed is worse than one
    // everybody can.
    expect(planReaches('starter', 'platinum')).toBe(true)
  })
})

describe('copyName', () => {
  it('is the name plus copy', () => {
    expect(copyName('Offer card', [])).toBe('Offer card copy')
  })

  it('numbers the second one rather than colliding', () => {
    expect(copyName('Offer card', ['Offer card copy'])).toBe('Offer card copy 2')
    expect(copyName('Offer card', ['Offer card copy', 'Offer card copy 2'])).toBe('Offer card copy 3')
  })
})
