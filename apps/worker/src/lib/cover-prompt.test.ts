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
  const base = { scene: SCENE, person: 'staff' as const, shape: 'portrait' as const, palette: ['#123456'] }

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
    const prompt = said(base)
    expect(prompt).toContain('looks like a picture taken inside this shop')
  })

  describe('the person wears the uniform and never the occasion', () => {
    it('forbids dressing them for the theme', () => {
      const prompt = said(base)
      expect(prompt).toContain('Do not dress them for the occasion')
      expect(prompt).toContain('No costume, no themed outfit, no themed hat, no school bag')
    })

    it('forbids them consuming the stock', () => {
      const prompt = said(base)
      expect(prompt).toContain('Do not have them eat, drink or use the products')
      expect(prompt).toContain('selling the goods, not consuming them')
    })

    it('names the person and the scene as separate things', () => {
      const prompt = said(base)
      expect(prompt).toContain('THE PERSON')
      expect(prompt).toContain('THE SCENE')
      expect(prompt).toContain('never something they wear')
    })

    it('says "focal point", which is the word that did not collide', () => {
      const prompt = said(base)
      expect(prompt).toContain('one dominant focal point')
      expect(prompt).not.toContain('as the subject')
    })

    it('keeps the same person as the reference', () => {
      expect(said(base)).toContain(
        'The same person: same face, same build, same uniform'
      )
    })
  })

  it('empties the frame when the scene wants nobody', () => {
    const prompt = said({ ...base, person: 'none' })
    expect(prompt).toContain('Nobody in the frame')
    expect(prompt).not.toContain('THE PERSON')
  })

  describe('a customer is invented, never the shop\'s character', () => {
    // A staff member pushing a full trolley of shopping is not a picture of
    // anything; a customer doing it is the commonest retail cover there is.
    it('asks for an ordinary shopper in their own clothes', () => {
      const prompt = said({ ...base, person: 'customer' })
      expect(prompt).toContain('an ordinary shopper')
      expect(prompt).toContain('not a uniform, not a member of staff')
    })

    it('forbids reusing a face from the reference images', () => {
      expect(said({ ...base, person: 'customer' })).toContain(
        'Do not use any person from the reference images'
      )
    })

    it('does not carry the staff rules over', () => {
      const prompt = said({ ...base, person: 'customer' })
      expect(prompt).not.toContain('Do not dress them for the occasion')
      expect(prompt).not.toContain('same face, same build, same uniform')
    })
  })

  describe('the goods cannot carry a brand', () => {
    /**
     * An offer book is a commercial document with real prices in it. Invented
     * packaging that resembles a real brand is trademark infringement whether or
     * not anybody intended it, and the provider terms put that on whoever
     * prompted. Forbidding branding is necessary; steering to goods that cannot
     * carry one is what actually removes the problem.
     */
    it('forbids branding on every variant', () => {
      for (const person of ['staff', 'customer', 'none'] as const) {
        const prompt = said({ ...base, person })
        expect(prompt).toContain('The goods must not carry any branding')
        expect(prompt).toContain('No logo and no brand mark anywhere in the image')
      }
    })

    it('steers to goods that have no label on them', () => {
      const prompt = said(base)
      expect(prompt).toContain('Favour fresh, unpackaged goods in the foreground')
      expect(prompt).toContain('plain, generic and out of focus')
    })
  })

  it('takes the room from the shop photographs when they are sent', () => {
    expect(said({ ...base, withScene: true })).toContain('Take the room from them')
    expect(said(base)).not.toContain('Take the room from them')
  })

  it('keeps the upper third clear, which is where the name goes', () => {
    // A model told to "leave space" centres the subject and leaves none. Named
    // as a region, it composes to it.
    expect(said(base)).toContain(
      'Keep the upper third of the image clear'
    )
    expect(said({ ...base, person: 'none' })).toContain('Keep the upper third of the image clear')
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
      { person: 'staff' as const },
      { person: 'customer' as const },
      { person: 'none' as const },
      { person: 'staff' as const, withScene: true },
    ]) {
      const prompt = said({ ...base, ...extra })
      expect(prompt).toContain('**No text of any kind.**')
      expect(prompt).toContain('No logo and no brand mark anywhere in the image')
    }
  })

  describe('the ratio is a number, not a word', () => {
    // "A tall portrait image" is a description a model satisfies approximately.
    // The shape a cover is drawn at decides whether it survives `fit: 'cover'`
    // on the page it lands on, so approximately is not good enough.
    it('names the ratio for each shape', () => {
      expect(said({ ...base, shape: 'story' })).toContain('Aspect ratio 9:16')
      expect(said({ ...base, shape: 'square' })).toContain('Aspect ratio 1:1')
      expect(said({ ...base, shape: 'a4' })).toContain('Aspect ratio 1:1.414')
      expect(said({ ...base, shape: 'post' })).toContain('Aspect ratio 4:5')
      expect(said({ ...base, shape: 'wide' })).toContain('Aspect ratio 16:9')
    })
  })

  describe('an owner\'s reference images guide rather than get copied', () => {
    it('asks for the treatment and refuses the contents', () => {
      const prompt = said({ ...base, withReference: true })
      expect(prompt).toContain('Take the treatment from them')
      expect(prompt).toContain('Do not copy their contents, their layout or any mark in them')
    })

    it('says nothing about references when none are attached', () => {
      expect(said(base)).not.toContain('reference images of the look they want')
    })

    it('still forbids branding, which is what makes a borrowed reference safe', () => {
      const prompt = said({ ...base, withReference: true })
      expect(prompt).toContain('The goods must not carry any branding')
      expect(prompt).toContain('No logo and no brand mark anywhere in the image')
    })
  })

  it('carries the palette and the shape into every variant', () => {
    const prompt = said({ ...base, withScene: true })
    expect(prompt).toContain('#123456')
    expect(prompt).toContain('Aspect ratio 3:4')
  })
})
