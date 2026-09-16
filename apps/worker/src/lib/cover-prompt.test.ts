import { describe, expect, it } from 'vitest'
import { coverPrompt } from './character-prompt'

/**
 * The cover prompt, which says a different thing depending on what is being sent
 * alongside it.
 *
 * **The first build had one prompt and it said "no people".** That was correct
 * while the spec had the character composited on afterwards by E9 and wrong the
 * moment the character became a reference image — a prompt forbidding people
 * while a picture of one is attached is a contradiction the model resolves
 * however it likes.
 */
describe('coverPrompt', () => {
  const base = { campaign: 'weekend' as const, shape: 'portrait' as const, palette: ['#123456'] }

  /**
   * Asserted against collapsed whitespace, because the prompt is a template
   * literal wrapped to the source's column width — so "keep them the same
   * person" contains a newline that means nothing to a model and would make
   * every assertion here break on a reflow.
   */
  const said = (input: Parameters<typeof coverPrompt>[0]) =>
    coverPrompt(input).replace(/\s+/g, ' ')

  it('forbids people when nothing is sent to draw from', () => {
    const prompt = said(base)
    expect(prompt).toContain('No people')
    expect(prompt).not.toContain('reference image')
  })

  it('asks for the character when one is sent, and stops forbidding people', () => {
    const prompt = said({ ...base, withCharacter: true })
    expect(prompt).toContain('reference image')
    expect(prompt).toContain('The same person: same face, same build, same uniform')
    // The contradiction this test exists for.
    expect(prompt).not.toContain('No people')
  })

  it('takes the setting from the shop when photographs are sent', () => {
    const prompt = said({ ...base, withScene: true })
    expect(prompt).toContain('actual shop')
    expect(prompt).toContain('rather than inventing a generic store')
  })

  it('says nothing about a shop when no photographs are sent', () => {
    expect(said(base)).not.toContain('actual shop')
  })

  it('never permits text, whatever it is drawn from', () => {
    // The one rule that survives every combination: a model asked for a shop's
    // name produces misspelled words in a typeface nobody chose.
    for (const extra of [{}, { withCharacter: true }, { withScene: true }, { withCharacter: true, withScene: true }]) {
      const prompt = said({ ...base, ...extra })
      expect(prompt).toContain('**No text of any kind.**')
      expect(prompt).toContain('No logo and no brand mark.')
    }
  })

  it('keeps the upper third clear, which is where the name goes', () => {
    // The composition rule every account of a promotional cover converges on,
    // and the reason it names a *region* rather than asking for "space": a model
    // told to leave space centres the subject and leaves none.
    const prompt = said({ ...base, withCharacter: true })
    expect(prompt).toContain('Keep the upper third of the image clear')
  })

  it('draws the chosen style rather than one hard-coded look', () => {
    expect(said({ ...base, style: 'photographic' })).toContain('commercial product advertisement')
    expect(said({ ...base, style: 'burst' })).toContain('radial sunburst')
    expect(said({ ...base, style: 'paper-craft' })).toContain('cut-paper')
    expect(said({ ...base, style: 'minimal' })).toContain('one dominant colour field')
  })

  it('falls back to the flat look every cover had before styles existed', () => {
    expect(said(base)).toContain('flat vector illustration')
  })

  /**
   * The two failures an owner actually hit on the first live run, and the reason
   * both happened: the occasion was stated as the image's *subject* and the
   * character was stated as the *subject*, so the model merged them.
   */
  describe('the character presents the occasion and is never dressed as it', () => {
    it('does not let back-to-school put a school bag on the shop assistant', () => {
      const prompt = said({ ...base, campaign: 'back-to-school', withCharacter: true })
      expect(prompt).toContain('Do not dress them for the occasion')
      expect(prompt).toContain('No costume, no themed outfit, no themed hat, no school bag')
      // And the occasion copy itself no longer offers a wearable noun to reach
      // for. A prohibition arguing with the copy is a fight it can lose.
      expect(prompt).not.toContain('a backpack')
    })

    it('does not let summer have the assistant drinking the stock', () => {
      const prompt = said({ ...base, campaign: 'summer', withCharacter: true })
      expect(prompt).toContain('Do not have them eat, drink or use the products')
      expect(prompt).toContain('selling the goods, not consuming them')
      expect(prompt).not.toContain('condensation on glass')
      expect(prompt).toContain('tub of ice')
    })

    it('gives the person and the occasion separate declared roles', () => {
      const prompt = said({ ...base, campaign: 'eid', withCharacter: true })
      expect(prompt).toContain('THE PERSON')
      expect(prompt).toContain('THE OCCASION')
      expect(prompt).toContain('never the person themselves')
    })

    it('says "focal point" rather than "subject", which is the word that collided', () => {
      const prompt = said({ ...base, withCharacter: true })
      expect(prompt).toContain('one dominant focal point')
      expect(prompt).not.toContain('as the subject')
    })

    it('leaves the no-character branch free to make the occasion the subject', () => {
      // Nothing to confuse it with, so the occasion may lead.
      const prompt = said({ ...base, campaign: 'back-to-school' })
      expect(prompt).toContain('A cover image for a retail offer book: back to school')
      expect(prompt).toContain('No people')
    })
  })

  it('names drawable subject matter for an occasion, not an adjective', () => {
    // A diffusion model handed "energetic and simple" returns the average of
    // everything ever labelled that. It needs objects.
    expect(said({ ...base, campaign: 'ramadan' })).toContain('dates')
    expect(said({ ...base, campaign: 'fresh' })).toContain('crates of vegetables')
    expect(said({ ...base, campaign: 'summer' })).toContain('bottles of cold drinks')
  })

  it('carries the palette and the shape into every variant', () => {
    const prompt = said({ ...base, withCharacter: true, withScene: true })
    expect(prompt).toContain('#123456')
    expect(prompt).toContain('portrait')
  })

  it('uses the owner\'s own words for a custom campaign', () => {
    const prompt = said({
      ...base,
      campaign: 'custom',
      described: 'a mango season promotion',
      withCharacter: true,
    })
    expect(prompt).toContain('a mango season promotion')
  })
})
