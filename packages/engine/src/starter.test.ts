/**
 * A starter is held to the bar a shipped block is held to.
 *
 * **"Always seed" said a blank artboard produces something worse than the
 * default.** That argument is only answered if a starter is a design — so this
 * file asserts the same things `library.test.ts` asserts about the sixty-six:
 * it validates, it draws no warning, every binding is in scope, and a repeating
 * card has an arrangement for every shape a merge can produce.
 */

import { describe, expect, it } from 'vitest'
import { MAGIC_CATEGORIES, categoryRepeats } from './block-category'
import { starterBlock } from './starter'
import { validateBlock } from './block-edit'
import { pickArrangement } from './arrangement'
import { TEXT_BINDINGS, bindingInScope, bindingKey } from './bindings'

describe('starterBlock', () => {
  for (const category of MAGIC_CATEGORIES) {
    describe(category, () => {
      const block = starterBlock(category)

      it('validates with no problems at all', () => {
        // Not "no errors": the loader refuses a block that draws any warning,
        // and a starter is written into the same table a published one is.
        expect(validateBlock(block)).toEqual([])
      })

      it('repeats exactly when its kind does', () => {
        expect(block.repeats).toBe(categoryRepeats(category))
      })

      it('has something on it', () => {
        // The whole point. An empty artboard is what this exists instead of.
        for (const arrangement of block.arrangements) {
          expect(arrangement.elements.length).toBeGreaterThan(1)
        }
      })

      it('binds only what is in scope for its kind', () => {
        // A static block has no product, which is what `repeats: false` means —
        // and `validateBlock` reports crossing it, so this would fail twice.
        const known = new Set(TEXT_BINDINGS.map(bindingKey))
        for (const element of block.arrangements.flatMap((a) => a.elements)) {
          if (element.kind === 'text' && element.source.from !== 'static') {
            expect(known.has(bindingKey(element.source))).toBe(true)
            expect(bindingInScope(element.source, block.repeats)).toBe(true)
          }
          if (element.kind === 'image') {
            expect(bindingInScope(element.source, block.repeats)).toBe(true)
          }
        }
      })

      it('carries both languages on every line it types', () => {
        // A static line with only an English value is a hole in the Arabic
        // edition, and the owner who typed it will never see that edition.
        for (const element of block.arrangements.flatMap((a) => a.elements)) {
          if (element.kind !== 'text' || element.source.from !== 'static') continue
          expect(element.source.textEn).not.toBe('')
          expect(element.source.textAr).not.toBe('')
        }
      })
    })
  }

  it('designs every shape a merge can produce, for the card that repeats', () => {
    // **A block that declines a shape does not avoid it.** `pickArrangement`
    // falls back to the nearest range, so the layout is crushed into it rather
    // than skipped — which is a defect the gallery found in a shipped block and
    // the tests could not.
    const card = starterBlock('offer-card')
    for (const aspect of [0.5, 1, 2, 5]) {
      const index = pickArrangement(card.arrangements, aspect)
      const arrangement = card.arrangements[index]
      expect(arrangement).toBeDefined()
      expect(aspect).toBeGreaterThanOrEqual(arrangement!.aspectMin)
      expect(aspect).toBeLessThanOrEqual(arrangement!.aspectMax)
    }
  })

  it('offers no seasonal starter', () => {
    // A seasonal block is a design *plus an occasion*, and nothing here can
    // pick the occasion — a wrong one is a shop wishing its customers Eid
    // Mubarak in March. `MagicCategory` draws the same line for the same reason.
    expect([...MAGIC_CATEGORIES]).not.toContain('seasonal')
  })
})
