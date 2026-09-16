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
    expect(prompt).toContain('Keep them the same person')
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
    expect(said({ ...base, style: 'photographic' })).toContain('commercial food advertisement')
    expect(said({ ...base, style: 'burst' })).toContain('radial sunburst')
    expect(said({ ...base, style: 'paper-craft' })).toContain('cut-paper')
    expect(said({ ...base, style: 'minimal' })).toContain('one dominant colour field')
  })

  it('falls back to the flat look every cover had before styles existed', () => {
    expect(said(base)).toContain('flat vector illustration')
  })

  it('names drawable subject matter for an occasion, not an adjective', () => {
    // A diffusion model handed "energetic and simple" returns the average of
    // everything ever labelled that. It needs objects.
    expect(said({ ...base, campaign: 'ramadan' })).toContain('dates')
    expect(said({ ...base, campaign: 'fresh' })).toContain('crates of vegetables')
    expect(said({ ...base, campaign: 'summer' })).toContain('condensation on glass')
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
