import { describe, expect, it } from 'vitest'
import { bandBlocks, isBandBlock } from '@/lib/band-blocks'

/**
 * What may run along the top or bottom of every page.
 *
 * **Tested because the rule is now load-bearing in two places** — the panel that
 * says what a book has, and the picker an owner browses. It used to be a filter
 * written out on the server beside the props it built, where being wrong meant
 * one dropdown was wrong; it is now the answer both surfaces read.
 */
describe('isBandBlock', () => {
  it('refuses a repeating card, whatever it is labelled', () => {
    // The one that matters: a card in a band is handed no offer, so it draws
    // an empty card across every page rather than failing.
    expect(isBandBlock({ repeats: true, category: 'header' }, 'header')).toBe(false)
    expect(isBandBlock({ repeats: true, category: null }, 'footer')).toBe(false)
  })

  it('takes a static block labelled for that end of the page', () => {
    expect(isBandBlock({ repeats: false, category: 'header' }, 'header')).toBe(true)
    expect(isBandBlock({ repeats: false, category: 'footer' }, 'footer')).toBe(true)
  })

  it('keeps our own labels apart', () => {
    expect(isBandBlock({ repeats: false, category: 'footer' }, 'header')).toBe(false)
    expect(isBandBlock({ repeats: false, category: 'panel' }, 'footer')).toBe(false)
  })

  it("offers the shop's own unlabelled blocks at both ends", () => {
    // Nothing tags a block an owner authored. Refusing their strip as a footer
    // because our taxonomy never labelled it is our problem, not theirs.
    expect(isBandBlock({ repeats: false, category: null }, 'header')).toBe(true)
    expect(isBandBlock({ repeats: false, category: null }, 'footer')).toBe(true)
  })

  it('filters a list and keeps the rows themselves', () => {
    const blocks = [
      { id: 'a', repeats: false, category: 'header' as const },
      { id: 'b', repeats: true, category: null },
      { id: 'c', repeats: false, category: null },
    ]
    expect(bandBlocks(blocks, 'header').map((block) => block.id)).toEqual(['a', 'c'])
  })
})
