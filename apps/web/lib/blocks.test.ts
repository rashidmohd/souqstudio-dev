import { describe, expect, it } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { SEED_BLOCKS } from '@souqstudio/engine'
import {
  MAX_ELEMENTS,
  MAX_GRADIENT_STOPS,
  arrangementsSchema,
  toArrangements,
} from '@/lib/block-document'
import { usesOnlyRoles } from '@/lib/block-document'
import { blockErrorMessage, blockErrors, blockUpdateSchema } from '@/lib/block-write'
import { copyName, importName, planReaches } from '@/lib/blocks'

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
      {
        id: 'surface',
        kind: 'shape',
        box: { start: 0, top: 0, width: 1, height: 1 },
        fill: { from: 'role', ref: 'surface' },
        radius: 3,
      },
      {
        id: 'name',
        kind: 'text',
        box: { start: 0.08, top: 0.4, width: 0.84, height: 0.2 },
        source: { from: 'product', field: 'name' },
        level: 'h3',
        align: 'start',
      },
      { id: 'price', kind: 'priceMark', box: { start: 0.08, top: 0.7, width: 0.84, height: 0.2 } },
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

  it('refuses a bare string where a colour belongs', () => {
    // A colour is `{ from, … }` now — a role, a palette entry or a literal —
    // and a naked hex is a document written against the old shape.
    const hex = [
      {
        ...card[0],
        elements: [
          {
            id: 'ground',
            kind: 'shape',
            box: { start: 0, top: 0, width: 1, height: 1 },
            fill: '#143CD2',
            radius: 3,
          },
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
            id: 'headline',
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
    const alien = [
      {
        ...card[0],
        elements: [{ id: 'v', kind: 'video', box: { start: 0, top: 0, width: 1, height: 1 } }],
      },
    ]
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
        elements: Array.from({ length: MAX_ELEMENTS + 1 }, (_, index) => ({
          id: `l${index}`,
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
            id: 'name',
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
            id: 'name',
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

describe('importName', () => {
  it('keeps the library block\u2019s own name', () => {
    // An import is not a copy of anything the owner can see. "Ramadan band copy"
    // describes a relationship to a block they have never had.
    expect(importName('Ramadan band', [])).toBe('Ramadan band')
    expect(importName('Ramadan band', ['Offer card', 'Footer'])).toBe('Ramadan band')
  })

  it('falls back to a copy name only on a real collision', () => {
    expect(importName('Offer card', ['Offer card'])).toBe('Offer card copy')
    expect(importName('Offer card', ['Offer card', 'Offer card copy'])).toBe('Offer card copy 2')
  })

  it('names every seeded block distinctly, so importing the library collides with nothing', () => {
    // The failure this rules out: two blocks arriving from one click with the
    // same name, which leaves an owner two rows they cannot tell apart. The
    // route decides each name against the ones it has already added, so this is
    // the same walk the import does.
    const taken: string[] = []
    for (const block of SEED_BLOCKS) {
      const name = importName(block.name, taken)
      expect(taken).not.toContain(name)
      taken.push(name)
    }
    expect(taken).toHaveLength(SEED_BLOCKS.length)
  })
})

describe('colours, and who may use which', () => {
  const withFill = (fill: unknown): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        { id: 'ground', kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, fill, radius: 3 },
      ],
    },
  ]

  it('takes a role, a palette entry or a literal', () => {
    expect(toArrangements(withFill({ from: 'role', ref: 'primary' }))).not.toBeNull()
    expect(toArrangements(withFill({ from: 'palette', id: 'col_1' }))).not.toBeNull()
    expect(toArrangements(withFill({ from: 'hex', hex: '#143CD2' }))).not.toBeNull()
  })

  it('refuses shorthand and alpha', () => {
    // The picker writes six digits; alpha belongs to the element's own opacity,
    // where it is one control an owner can find rather than two that disagree.
    expect(toArrangements(withFill({ from: 'hex', hex: '#f0a' }))).toBeNull()
    expect(toArrangements(withFill({ from: 'hex', hex: '#143CD2FF' }))).toBeNull()
  })

  it('holds a seeded block to roles alone', () => {
    // A block shipped before it has met a shop cannot name that shop's palette
    // entry, and must not name a literal — it would stop looking like whichever
    // account loaded it.
    const roles = toArrangements(withFill({ from: 'role', ref: 'primary' }))
    const literal = toArrangements(withFill({ from: 'hex', hex: '#143CD2' }))
    expect(usesOnlyRoles(roles!)).toBe(true)
    expect(usesOnlyRoles(literal!)).toBe(false)
  })

  it('lets every seeded block through its own rule', () => {
    for (const block of SEED_BLOCKS) {
      expect(usesOnlyRoles(block.arrangements)).toBe(true)
    }
  })
})

describe('the offer shapes', () => {
  const withVariant = (variant: unknown): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        {
          id: 'ground',
          kind: 'shape',
          box: { start: 0, top: 0, width: 1, height: 1 },
          fill: { from: 'role', ref: 'primary' },
          variant,
          radius: 3,
        },
      ],
    },
  ]

  it('stores the three primitives and the six an offer card is made of', () => {
    for (const variant of ['rect', 'ellipse', 'line', 'burst', 'ribbon', 'tag', 'flash', 'star', 'arrow']) {
      expect(toArrangements(withVariant(variant))).not.toBeNull()
    }
  })

  /**
   * The schema is the mirror of the type, and a variant the renderers do not
   * know draws as a plain rectangle with nothing failing — which is what the
   * new shapes did before both painters learned about them.
   */
  it('refuses a variant nothing can draw', () => {
    expect(toArrangements(withVariant('hexagon'))).toBeNull()
  })

  it('lets a seeded block use one, since a shape names no colour of its own', () => {
    const parsed = toArrangements(withVariant('burst'))
    expect(parsed).not.toBeNull()
    expect(usesOnlyRoles(parsed!)).toBe(true)
  })
})

describe('the offer badge', () => {
  const withChip = (shape: unknown): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        {
          id: 'chip',
          kind: 'chip',
          box: { start: 0, top: 0, width: 0.4, height: 0.12 },
          anchor: 'TOP_START',
          shape,
        },
      ],
    },
  ]

  it('takes the four shapes a badge may be', () => {
    for (const shape of ['pill', 'burst', 'ribbon', 'tag']) {
      expect(toArrangements(withChip(shape))).not.toBeNull()
    }
  })

  /**
   * A corner flash has no interior, an arrow's is a shaft and a star's is a
   * third of its box. They are shapes, not badges, and the schema says so.
   */
  it('refuses the shape-element variants that cannot hold a word', () => {
    for (const shape of ['flash', 'arrow', 'star', 'rect']) {
      expect(toArrangements(withChip(shape))).toBeNull()
    }
  })

  it('is a pill when it says nothing, which is every block already drawn', () => {
    expect(toArrangements(withChip(undefined))).not.toBeNull()
  })
})

describe('gradients', () => {
  const gradient = (stops: unknown, angle: unknown = 90): unknown => ({
    from: 'gradient',
    angle,
    stops,
  })

  const two = [
    { at: 0, color: { from: 'role', ref: 'primary' } },
    { at: 1, color: { from: 'hex', hex: '#d4af37' } },
  ]

  const withFill = (fill: unknown): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        { id: 'ground', kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, fill, radius: 3 },
      ],
    },
  ]

  const withTextColor = (color: unknown): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        {
          id: 'name',
          kind: 'text',
          box: { start: 0, top: 0, width: 1, height: 0.2 },
          source: { from: 'product', field: 'name' },
          level: 'h1',
          align: 'start',
          color,
        },
      ],
    },
  ]

  it('takes one on a shape fill', () => {
    expect(toArrangements(withFill(gradient(two)))).not.toBeNull()
  })

  it('refuses one stop — that is a flat colour written the expensive way', () => {
    expect(toArrangements(withFill(gradient([two[0]])))).toBeNull()
  })

  it('refuses more stops than a card can read', () => {
    const many = Array.from({ length: MAX_GRADIENT_STOPS + 1 }, (_, index) => ({
      at: index / (MAX_GRADIENT_STOPS + 1),
      color: { from: 'hex', hex: '#143CD2' },
    }))
    expect(toArrangements(withFill(gradient(many)))).toBeNull()
  })

  it('refuses a stop outside the run, and an angle outside a turn', () => {
    expect(
      toArrangements(withFill(gradient([{ at: -0.2, color: two[0]!.color }, two[1]])))
    ).toBeNull()
    expect(toArrangements(withFill(gradient(two, 400)))).toBeNull()
  })

  /**
   * The stops are colours the same three ways everything else is, so a gradient
   * built on the shop's palette follows the shop. What a stop may not be is
   * another gradient — the type says so and the schema has to agree, or a
   * document could nest until the renderer gives up.
   */
  it('refuses a gradient inside a gradient', () => {
    expect(
      toArrangements(withFill(gradient([{ at: 0, color: gradient(two) }, two[1]])))
    ).toBeNull()
  })

  /**
   * Gradient text and gradient hairlines are how a card stops being legible at
   * the size a booklet prints. The decision is in `ColorValue`; this is the
   * check that it survives contact with the edge.
   */
  it('refuses one anywhere but a shape fill', () => {
    expect(toArrangements(withTextColor(gradient(two)))).toBeNull()
  })

  it('keeps a gradient out of the seeded library, whatever its stops name', () => {
    // Every stop is a role here, and it is still refused: the shipped library
    // is flat, and `from` is 'gradient' rather than 'role' by construction.
    const roles = toArrangements(
      withFill(
        gradient([
          { at: 0, color: { from: 'role', ref: 'primary' } },
          { at: 1, color: { from: 'role', ref: 'accent' } },
        ])
      )
    )
    expect(roles).not.toBeNull()
    expect(usesOnlyRoles(roles!)).toBe(false)
  })

  it('takes a per-stop opacity — the one place alpha exists', () => {
    expect(
      toArrangements(
        withFill(
          gradient([
            { at: 0, color: { from: 'role', ref: 'primary' } },
            { at: 1, color: { from: 'role', ref: 'primary' }, opacity: 0 },
          ])
        )
      )
    ).not.toBeNull()
  })

  it('refuses an opacity outside 0 to 1', () => {
    expect(
      toArrangements(withFill(gradient([{ at: 0, color: two[0]!.color, opacity: 2 }, two[1]])))
    ).toBeNull()
  })

  /**
   * Alpha on a *flat* colour is still refused. A colour at half alpha and an
   * element at half opacity are the same picture, and two controls that say the
   * same thing are two that eventually disagree — the rule only bends where an
   * element-wide opacity genuinely cannot express the design.
   */
  it('still refuses an eight-digit hex, inside a gradient and out', () => {
    expect(toArrangements(withFill({ from: 'hex', hex: '#143CD2FF' }))).toBeNull()
    expect(
      toArrangements(withFill(gradient([{ at: 0, color: { from: 'hex', hex: '#143CD2FF' } }, two[1]])))
    ).toBeNull()
  })

  it('reads an out-of-order document rather than refusing it', () => {
    // An owner drags one stop past another and the array stops being sorted.
    // Sorting belongs to `resolvePaint`, which every renderer goes through.
    expect(
      toArrangements(withFill(gradient([{ at: 1, color: two[0]!.color }, { at: 0, color: two[1]!.color }])))
    ).not.toBeNull()
  })
})

describe('element ids', () => {
  it('fills them in for a document written before elements had them', () => {
    // Refusing to read one would be losing a shop's work over a field they
    // never saw. Deterministic by position, so the same document always yields
    // the same ids and a selection does not move between reads.
    const legacy = [
      {
        aspectMin: 0.5,
        aspectMax: 1.5,
        elements: [
          { kind: 'logo', box: { start: 0, top: 0, width: 0.2, height: 0.2 } },
          { kind: 'priceMark', box: { start: 0, top: 0.5, width: 0.5, height: 0.2 } },
        ],
      },
    ]
    const parsed = toArrangements(legacy)
    expect(parsed?.[0]?.elements.map((element) => element.id)).toEqual(['e0', 'e1'])
    expect(toArrangements(legacy)).toEqual(parsed)
  })

  it('leaves an id that is already there alone', () => {
    expect(toArrangements(card)?.[0]?.elements[0]?.id).toBe('surface')
  })
})

describe('the freedoms the designer needs', () => {
  const textWith = (extra: Record<string, unknown>): unknown => [
    {
      aspectMin: 0.5,
      aspectMax: 1.5,
      elements: [
        {
          id: 'headline',
          kind: 'text',
          box: { start: 0, top: 0, width: 1, height: 0.2 },
          source: { from: 'static', textEn: 'Sale', textAr: 'تخفيض' },
          level: 'h1',
          align: 'start',
          ...extra,
        },
      ],
    },
  ]

  it('takes a size set by hand, a weight, italics and letter spacing', () => {
    const parsed = toArrangements(
      textWith({ size: 0.09, weight: 700, italic: true, letterSpacing: 0.02 })
    )
    expect(parsed?.[0]?.elements[0]).toMatchObject({ size: 0.09, weight: 700, italic: true })
  })

  it('refuses a size that would print one glyph across a page', () => {
    expect(toArrangements(textWith({ size: 4 }))).toBeNull()
  })

  it('takes rotation and opacity on anything', () => {
    const parsed = toArrangements(textWith({ rotation: -12, opacity: 0.4 }))
    expect(parsed?.[0]?.elements[0]).toMatchObject({ rotation: -12, opacity: 0.4 })
  })

  it('refuses a rotation that is not a rotation', () => {
    expect(toArrangements(textWith({ rotation: 900 }))).toBeNull()
  })

  it('takes a price mark styled but not composed', () => {
    // Colour, ground and frame are the shop's. What the digits do is not, and
    // there is nowhere in the schema to say otherwise.
    const styled = [
      {
        aspectMin: 0.5,
        aspectMax: 1.5,
        elements: [
          {
            id: 'price',
            kind: 'priceMark',
            box: { start: 0, top: 0, width: 1, height: 0.3 },
            style: { tint: { from: 'hex', hex: '#143CD2' }, frame: 'plain', tab: 'none' },
          },
        ],
      },
    ]
    expect(toArrangements(styled)).not.toBeNull()

    const composed = [
      {
        aspectMin: 0.5,
        aspectMax: 1.5,
        elements: [
          {
            id: 'price',
            kind: 'priceMark',
            box: { start: 0, top: 0, width: 1, height: 0.3 },
            style: { minorSize: 0.5 },
          },
        ],
      },
    ]
    expect(toArrangements(composed)).toBeNull()
  })
})
