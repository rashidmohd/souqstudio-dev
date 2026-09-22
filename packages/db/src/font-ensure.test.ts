import { describe, expect, it } from 'vitest'
import { REQUIRED_SUBSETS } from './font-ensure'

/**
 * The network paths need a bucket and an API key and are exercised by
 * `fonts:mirror` and `fonts:check`. What is worth pinning here is the constant
 * that decides what a save waits for, because changing it changes how long every
 * font change blocks and whether a book can draw its own catalog.
 */
describe('REQUIRED_SUBSETS', () => {
  it('carries both scripts every offer book is written in', () => {
    // The block document schema refuses a static string with `textEn` and no
    // `textAr`, so every shop's book is bilingual whether or not its owner
    // thinks of it that way. A family that cannot draw both was never offerable.
    expect(REQUIRED_SUBSETS).toContain('arabic')
    expect(REQUIRED_SUBSETS).toContain('latin')
  })

  it('includes latin-ext, at the cost of one more file to wait for', () => {
    // Accented characters in a European brand name. A product name briefly
    // falling back mid-edit is worse than one more object in the blocking set.
    expect(REQUIRED_SUBSETS).toContain('latin-ext')
  })

  it('stays small — this is what keeps a cold save near 1.5s', () => {
    // Rubik ships six subsets and 99 objects. Waiting for three of them plus the
    // bound weights is ~16 objects; waiting for all of them is 7.2s, which is
    // the spinner this design exists to avoid.
    expect(REQUIRED_SUBSETS.length).toBeLessThanOrEqual(3)
  })
})
