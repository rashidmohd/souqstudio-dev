import { describe, expect, it } from 'vitest'
import { pickArrangement } from './arrangement'
import { validateBlock } from './block-edit'
import {
  MAGIC_STRUCTURES,
  STRUCTURE_NOTE,
  type MagicChoice,
  arrangementsFromChoice,
  magicChoiceSchema,
} from './magic'
import { usesOnlyRoles } from './roles'

/**
 * Magic block, held to the bar the shipped library clears.
 *
 * **This is the test that makes the feature safe to ship**, and it is worth
 * saying why rather than leaving it to be inferred. A model chooses a structure
 * and a skin; the owner never sees the choice, only the block. So the property
 * that matters is not "the model is right" — it will sometimes be wrong, and a
 * wrong *match* is a card that is not quite the picture, which the designer
 * exists to fix. The property that matters is that **no choice it is capable of
 * making produces a block that cannot be drawn.**
 *
 * The output space is small enough to enumerate, so it is enumerated: every
 * structure against every ground, both price frames, outlined and not. If that
 * grid is clean then the schema is the only thing standing between a model and a
 * valid block, and the schema is machine-checked.
 */

const GROUNDS = ['primary', 'secondary', 'accent', 'surface', 'ink', 'inkMuted'] as const

const choice = (over: Partial<MagicChoice> = {}): MagicChoice => ({
  isOfferCard: true,
  structure: 'stacked',
  ground: 'surface',
  outlined: false,
  priceFrame: 'tag',
  name: 'Test card',
  description: '',
  notes: [],
  confidence: 'high',
  ...over,
})

/** Every choice the schema admits, modulo the free-text fields. */
function* everyChoice(): Generator<MagicChoice> {
  for (const structure of MAGIC_STRUCTURES) {
    for (const ground of GROUNDS) {
      for (const outlined of [false, true]) {
        for (const priceFrame of ['tag', 'plain'] as const) {
          // `accent` is optional, and both branches reach different code:
          // `overlay` reads it for its scrim, and `skinFromChoice` only sets
          // `chipFill` when the ground is tinted.
          for (const accent of [undefined, 'accent' as const]) {
            yield choice({
              structure,
              ground,
              outlined,
              priceFrame,
              ...(accent === undefined ? {} : { accent }),
            })
          }
        }
      }
    }
  }
}

describe('the structure registry', () => {
  it('describes every structure it offers', () => {
    // The notes are what the model reads to choose. A structure with no note is
    // one it can pick and has never been told the shape of — so it would be
    // chosen at random rather than never, which is the worse failure.
    for (const name of MAGIC_STRUCTURES) {
      expect({ name, note: STRUCTURE_NOTE[name] ?? null }).toEqual({
        name,
        note: expect.any(String),
      })
    }
  })

  it('offers no structure it cannot build', () => {
    // The schema is an enum over the registry's own keys, so this is really a
    // check that the two have not been allowed to drift apart by a rename.
    for (const name of MAGIC_STRUCTURES) {
      expect(() => arrangementsFromChoice(choice({ structure: name }))).not.toThrow()
    }
  })

  it('offers enough of the library to match against', () => {
    expect(MAGIC_STRUCTURES.length).toBeGreaterThanOrEqual(20)
  })
})

describe('the choice schema', () => {
  it('accepts a well-formed choice', () => {
    expect(magicChoiceSchema.safeParse(choice()).success).toBe(true)
  })

  it('refuses a structure that is not in the library', () => {
    // The whole safety argument rests on this: a model that could name its own
    // structure could name one nothing draws.
    expect(magicChoiceSchema.safeParse(choice({ structure: 'nonesuch' })).success).toBe(false)
  })

  it('refuses a colour that is not a role', () => {
    // A hex here would be a card permanently wearing somebody else's brand.
    const parsed = magicChoiceSchema.safeParse({ ...choice(), ground: '#ff0000' })
    expect(parsed.success).toBe(false)
  })

  it('lets the model decline the picture', () => {
    // Refusing has to be expressible, or the nearest offer card is the only
    // answer a masthead can get.
    expect(magicChoiceSchema.safeParse(choice({ isOfferCard: false })).success).toBe(true)
  })
})

describe('every choice a model can make', () => {
  const all = [...everyChoice()]

  it('covers the whole output space', () => {
    // 25 structures × 6 grounds × outlined × priceFrame × accent.
    expect(all.length).toBe(MAGIC_STRUCTURES.length * GROUNDS.length * 8)
  })

  it('builds a block with no structural errors', () => {
    for (const c of all) {
      const arrangements = arrangementsFromChoice(c)
      const errors = validateBlock({ repeats: true, arrangements }).filter(
        (problem) => problem.severity === 'error'
      )
      expect({ structure: c.structure, ground: c.ground, errors }).toEqual({
        structure: c.structure,
        ground: c.ground,
        errors: [],
      })
    }
  })

  it('builds a block with no warnings either', () => {
    // The bar for a block *we* ship, and a generated block is no less shipped
    // for having been matched from a photograph. `library.test.ts` holds the
    // seeded arm to exactly this.
    for (const c of all) {
      const arrangements = arrangementsFromChoice(c)
      const warnings = validateBlock({ repeats: true, arrangements }).filter(
        (problem) => problem.severity === 'warning'
      )
      expect({ structure: c.structure, ground: c.ground, warnings }).toEqual({
        structure: c.structure,
        ground: c.ground,
        warnings: [],
      })
    }
  })

  it('names every colour by role, never by value', () => {
    // True by construction — there is no path through `skinFromChoice` that
    // emits a literal. Asserted because "by construction" is the property a
    // refactor breaks without failing anything else.
    for (const c of all) {
      expect({ structure: c.structure, rolesOnly: usesOnlyRoles(arrangementsFromChoice(c)) }).toEqual(
        { structure: c.structure, rolesOnly: true }
      )
    }
  })

  it('reflows into any shape a merge can produce', () => {
    // The reason a match beats a free-form document. A photograph shows one
    // aspect; the block has to work in a merged region too, and it does because
    // the structure it was matched to already carried every shape it claims.
    for (const c of all) {
      const arrangements = arrangementsFromChoice(c)
      for (const aspect of [0.5, 1, 1.8, 4]) {
        const picked = arrangements[pickArrangement(arrangements, aspect)]
        expect({ structure: c.structure, aspect, elements: (picked?.elements.length ?? 0) > 0 }).toEqual({
          structure: c.structure,
          aspect,
          elements: true,
        })
      }
    }
  })

  it('never paints bound text the colour of the ground it sits on', () => {
    /**
     * **The defect a real model produced on its first live run.**
     *
     * Shown a white card with a red price band, it was asked whether the card
     * inverts its type, saw white type *on the band*, and answered yes. That is
     * a fair reading of the picture and the wrong answer to the question:
     * `onTint` inverts every bound string at once, so the result was a white
     * product name on a white card.
     *
     * `onTint` is no longer asked for — it follows from the ground — and this
     * pins it in both directions. `stacked` is the probe because it paints its
     * product text through `ink(skin)`, which is the helper the inversion runs
     * through.
     */
    const textColours = (c: MagicChoice) =>
      arrangementsFromChoice(c)
        .flatMap((arrangement) => arrangement.elements)
        .filter((element) => element.kind === 'text')
        .map((element) => (element.kind === 'text' ? element.color : undefined))

    const onWhite = textColours(choice({ structure: 'stacked', ground: 'surface' }))
    for (const colour of onWhite) {
      expect(colour?.from === 'role' && colour.ref === 'surface').toBe(false)
    }

    // And the other way: a brand-grounded card has to invert, or the same text
    // is ink on a dark ground.
    const onTinted = textColours(choice({ structure: 'stacked', ground: 'primary' }))
    expect(onTinted.some((colour) => colour?.from === 'role' && colour.ref === 'surface')).toBe(true)
  })

  it('gives a tinted card a pill that is not the colour of its ground', () => {
    // The defect the gallery found and the tests did not: a "Half price" chip
    // whose token is `primary`, on a primary-grounded card. Derived rather than
    // chosen, so a model cannot reintroduce it.
    for (const c of all.filter((entry) => entry.ground !== 'surface')) {
      const chips = arrangementsFromChoice(c)
        .flatMap((arrangement) => arrangement.elements)
        .filter((element) => element.kind === 'chip')

      for (const chip of chips) {
        if (chip.kind !== 'chip' || chip.fill === undefined) continue
        expect({ structure: c.structure, ground: c.ground, collides: false }).toEqual({
          structure: c.structure,
          ground: c.ground,
          collides: chip.fill.from === 'role' && chip.fill.ref === c.ground,
        })
      }
    }
  })
})
