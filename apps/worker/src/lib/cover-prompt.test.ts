import { describe, expect, it } from 'vitest'
import { coverPrompt } from './character-prompt'

/**
 * The cover prompt.
 *
 * **Three versions of this have been wrong, and each failure is a test here.**
 * It asked for an adjective and got stock art; it named wearable nouns and the
 * model put a school bag on the shop assistant; it called two different things
 * "the subject" and they merged. The scenes themselves live in `cover_prompts`
 * now and are tuned without a deploy — what stays pinned is the scaffolding
 * around them, which is the part that decides whether a scene is read as a
 * *place* or as a costume.
 */
describe('coverPrompt', () => {
  const SCENE =
    'In the frozen food aisle. The person holds one glass freezer door open, cold blue light spilling out.'
  const base = { scene: SCENE, shape: 'portrait' as const, palette: ['#123456'] }

  /**
   * Asserted against collapsed whitespace: the prompt is a template literal
   * wrapped to the source's column width, so a phrase can carry a newline that
   * means nothing to a model and would break every assertion on a reflow.
   */
  const said = (input: Parameters<typeof coverPrompt>[0]) =>
    coverPrompt(input).replace(/\s+/g, ' ')

  it('puts the scene in, whatever it says', () => {
    // The scene is a row now, so the prompt must carry it through untouched
    // rather than matching it against anything it knows.
    expect(said(base)).toContain(SCENE)
  })

  it('asks for a photograph of this shop, not a themed graphic', () => {
    const prompt = said({ ...base, withCharacter: true })
    expect(prompt).toContain('looks like a picture taken inside this shop')
  })

  describe('the person wears the uniform and never the occasion', () => {
    it('forbids dressing them for the theme', () => {
      const prompt = said({ ...base, withCharacter: true })
      expect(prompt).toContain('Do not dress them for the occasion')
      expect(prompt).toContain('No costume, no themed outfit, no themed hat, no school bag')
    })

    it('forbids them consuming the stock', () => {
      const prompt = said({ ...base, withCharacter: true })
      expect(prompt).toContain('Do not have them eat, drink or use the products')
      expect(prompt).toContain('selling the goods, not consuming them')
    })

    it('names the person and the scene as separate things', () => {
      const prompt = said({ ...base, withCharacter: true })
      expect(prompt).toContain('THE PERSON')
      expect(prompt).toContain('THE SCENE')
      expect(prompt).toContain('never something they wear')
    })

    it('says "focal point", which is the word that did not collide', () => {
      const prompt = said({ ...base, withCharacter: true })
      expect(prompt).toContain('one dominant focal point')
      expect(prompt).not.toContain('as the subject')
    })

    it('keeps the same person as the reference', () => {
      expect(said({ ...base, withCharacter: true })).toContain(
        'The same person: same face, same build, same uniform'
      )
    })
  })

  it('empties the frame when there is no character', () => {
    const prompt = said(base)
    expect(prompt).toContain('Nobody in the frame')
    expect(prompt).not.toContain('THE PERSON')
  })

  it('takes the room from the shop photographs when they are sent', () => {
    expect(said({ ...base, withScene: true })).toContain('Take the room from them')
    expect(said(base)).not.toContain('Take the room from them')
  })

  it('keeps the upper third clear, which is where the name goes', () => {
    // A model told to "leave space" centres the subject and leaves none. Named
    // as a region, it composes to it.
    expect(said({ ...base, withCharacter: true })).toContain(
      'Keep the upper third of the image clear'
    )
    expect(said(base)).toContain('leave the upper third calm')
  })

  it('draws the chosen style rather than one hard-coded look', () => {
    expect(said({ ...base, style: 'photographic' })).toContain('not a studio set and not a stock image')
    expect(said({ ...base, style: 'burst' })).toContain('radial sunburst')
    expect(said({ ...base, style: 'paper-craft' })).toContain('cut-paper')
    expect(said({ ...base, style: 'minimal' })).toContain('one dominant colour field')
  })

  it('falls back to the flat look every cover had before styles existed', () => {
    expect(said(base)).toContain('flat vector illustration')
  })

  it('never permits text, whatever it is drawn from', () => {
    for (const extra of [
      {},
      { withCharacter: true },
      { withScene: true },
      { withCharacter: true, withScene: true },
    ]) {
      const prompt = said({ ...base, ...extra })
      expect(prompt).toContain('**No text of any kind.**')
      expect(prompt).toContain('No logo and no brand mark.')
    }
  })

  it('carries the palette and the shape into every variant', () => {
    const prompt = said({ ...base, withCharacter: true, withScene: true })
    expect(prompt).toContain('#123456')
    expect(prompt).toContain('portrait')
  })
})
