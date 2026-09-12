import { describe, expect, it } from 'vitest'
import { pinPageOptions } from '@/components/editor/PinsPanel'

/**
 * The page select offered a flat 1 to 12 whatever the book was, which on a
 * single-page square post is eleven choices pointing at pages that do not
 * exist. It did not error: `flowBook` generates pages far enough to reach the
 * last pin, so the book silently grew eleven empty ones.
 */
describe('pinPageOptions', () => {
  it('offers a one-page book its page and the next one', () => {
    expect(pinPageOptions(1)).toEqual([
      { value: '1', label: '1' },
      { value: '2', label: '2 (adds a page)' },
    ])
  })

  it('never offers a page more than one past the end', () => {
    for (const pages of [1, 2, 5, 34]) {
      const options = pinPageOptions(pages)
      expect(options).toHaveLength(pages + 1)
      expect(Number(options[options.length - 1]?.value)).toBe(pages + 1)
    }
  })

  /* Extending the book is a real thing to do, so the option stays and says so. */
  it('marks the one that would add a page, and only that one', () => {
    const labelled = pinPageOptions(3).filter((o) => o.label.includes('adds a page'))
    expect(labelled).toEqual([{ value: '4', label: '4 (adds a page)' }])
  })

  /* A book with no offers still has somewhere to put a panel. */
  it('offers page one even when the book has no pages yet', () => {
    expect(pinPageOptions(0)[0]).toEqual({ value: '1', label: '1' })
  })
})
