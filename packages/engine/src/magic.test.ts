import { describe, expect, it } from 'vitest'
import { pickArrangement } from './arrangement'
import { MAGIC_CATEGORIES, type MagicCategory, categoryRepeats } from './block-category'
import { validateBlock } from './block-edit'
import {
  MAGIC_STRUCTURES,
  STRUCTURE_NOTE,
  type MagicCardChoice,
  type MagicStillChoice,
  arrangementsFromChoice,
  magicOptions,
  magicSchemaFor,
} from './magic'
import { usesOnlyRoles } from './roles'

/** Every kind except the cards, which are matched to a structure instead. */
const STILL_CATEGORIES = MAGIC_CATEGORIES.filter(
  (category): category is Exclude<MagicCategory, 'offer-card'> => category !== 'offer-card'
)

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
 *
 * **The same argument, twice, because there are two halves.** A card is matched
 * to a generated structure and enumerated below; a header, panel, footer or
 * square post is matched to a block the library already ships, and the last
 * block here enumerates those. Their bar is *no problems at all* rather than no
 * errors — a shipped design that draws a warning is one `library.test.ts` would
 * already be failing on, so anything this finds is a block the match could reach
 * and the library never could.
 */

const GROUNDS = ['primary', 'secondary', 'accent', 'surface', 'ink', 'inkMuted'] as const

const choice = (over: Partial<MagicCardChoice> = {}): MagicCardChoice => ({
  isMatch: true,
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
function* everyChoice(): Generator<MagicCardChoice> {
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
      expect(() => arrangementsFromChoice('offer-card', choice({ structure: name }))).not.toThrow()
    }
  })

  it('offers enough of the library to match against', () => {
    expect(MAGIC_STRUCTURES.length).toBeGreaterThanOrEqual(20)
  })
})

describe('the choice schema', () => {
  it('accepts a well-formed choice', () => {
    expect(magicSchemaFor('offer-card').safeParse(choice()).success).toBe(true)
  })

  it('refuses a structure that is not in the library', () => {
    // The whole safety argument rests on this: a model that could name its own
    // structure could name one nothing draws.
    expect(magicSchemaFor('offer-card').safeParse(choice({ structure: 'nonesuch' })).success).toBe(false)
  })

  it('refuses a colour that is not a role', () => {
    // A hex here would be a card permanently wearing somebody else's brand.
    const parsed = magicSchemaFor('offer-card').safeParse({ ...choice(), ground: '#ff0000' })
    expect(parsed.success).toBe(false)
  })

  it('lets the model decline the picture', () => {
    // Refusing has to be expressible, or the nearest offer card is the only
    // answer a masthead can get.
    expect(magicSchemaFor('offer-card').safeParse(choice({ isMatch: false })).success).toBe(true)
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
      const arrangements = arrangementsFromChoice('offer-card', c)
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
      const arrangements = arrangementsFromChoice('offer-card', c)
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
      expect({ structure: c.structure, rolesOnly: usesOnlyRoles(arrangementsFromChoice('offer-card', c)) }).toEqual(
        { structure: c.structure, rolesOnly: true }
      )
    }
  })

  it('reflows into any shape a merge can produce', () => {
    // The reason a match beats a free-form document. A photograph shows one
    // aspect; the block has to work in a merged region too, and it does because
    // the structure it was matched to already carried every shape it claims.
    for (const c of all) {
      const arrangements = arrangementsFromChoice('offer-card', c)
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
    const textColours = (c: MagicCardChoice) =>
      arrangementsFromChoice('offer-card', c)
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
      const chips = arrangementsFromChoice('offer-card', c)
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

describe('every kind that is placed once', () => {
  const still = (structure: string): MagicStillChoice => ({
    isMatch: true,
    structure,
    name: 'Test block',
    description: '',
    notes: [],
    confidence: 'high',
  })

  it('offers something to match against, for every kind on the picker', () => {
    // A kind with an empty vocabulary is one an owner can choose and nothing can
    // answer — every picture uploaded under it comes back unreadable, and the
    // credits are spent finding that out.
    for (const category of MAGIC_CATEGORIES) {
      expect({ category, offered: magicOptions(category).length > 0 }).toEqual({
        category,
        offered: true,
      })
    }
  })

  it('describes everything it offers', () => {
    // Same rule as the structure notes: an option the model is never told the
    // shape of is one it picks at random rather than never.
    for (const category of MAGIC_CATEGORIES) {
      for (const option of magicOptions(category)) {
        expect({ category, name: option.name, described: option.note.trim().length > 0 }).toEqual({
          category,
          name: option.name,
          described: true,
        })
      }
    }
  })

  it('builds a block with no problems at all', () => {
    for (const category of STILL_CATEGORIES) {
      for (const option of magicOptions(category)) {
        const arrangements = arrangementsFromChoice(category, still(option.name))
        const problems = validateBlock({ repeats: categoryRepeats(category), arrangements })
        expect({ category, block: option.name, problems }).toEqual({
          category,
          block: option.name,
          problems: [],
        })
      }
    }
  })

  it('names every colour by role, never by value', () => {
    for (const category of STILL_CATEGORIES) {
      for (const option of magicOptions(category)) {
        const rolesOnly = usesOnlyRoles(arrangementsFromChoice(category, still(option.name)))
        expect({ category, block: option.name, rolesOnly }).toEqual({
          category,
          block: option.name,
          rolesOnly: true,
        })
      }
    }
  })

  it('refuses a block that belongs to another kind', () => {
    /**
     * **The property that makes the owner's choice binding rather than a hint.**
     *
     * Every kind is a separate enum over its own blocks, so a model shown the
     * headers cannot answer with a footer — not because it was asked not to, but
     * because that answer does not validate. Without this the narrowing is a
     * suggestion, and the whole reason the picker exists is that a model
     * choosing between eight things beats one choosing between fifty-nine.
     */
    const footer = magicOptions('footer')[0]
    expect(footer).toBeDefined()
    expect(magicSchemaFor('header').safeParse(still(footer?.name ?? '')).success).toBe(false)
    expect(magicSchemaFor('footer').safeParse(still(footer?.name ?? '')).success).toBe(true)
  })

  it('hands back a copy rather than the shipped design itself', () => {
    /**
     * The arrangements go into a row and then into a designer the owner edits.
     * Handing out the library's own object would put every shop that matched the
     * same footer on one shared document — and the harness, the gallery and the
     * seed are all holding it too.
     */
    const option = magicOptions('footer')[0]
    const first = arrangementsFromChoice('footer', still(option?.name ?? ''))
    const second = arrangementsFromChoice('footer', still(option?.name ?? ''))

    expect(first).not.toBe(second)
    expect(first[0]?.elements).not.toBe(second[0]?.elements)
    expect(first).toEqual(second)
  })
})
