import { describe, expect, it } from 'vitest'
import type { Arrangement } from '@souqstudio/types'
import { nextStillShape, shapeFor } from '@/components/card-designer/DesignerShell'

/**
 * The shape a block placed once is designed at used to be React state that the
 * designer threw away on close: an owner drew a story, closed the window and
 * reopened on a band, because the only shape anything had written down was the
 * one the block was seeded with. The shape lives on the layout now, and these
 * are the two functions that have to agree about what it says.
 */

const at = (aspectMin: number, aspectMax: number): Arrangement => ({
  aspectMin,
  aspectMax,
  elements: [],
})

describe('shapeFor', () => {
  it('reads back every shape the picker writes', () => {
    expect(shapeFor(at(0.45, 0.62))).toBe('story')
    expect(shapeFor(at(0.62, 0.85))).toBe('a4')
    expect(shapeFor(at(0.85, 1.2))).toBe('square')
    expect(shapeFor(at(1.2, 2.2))).toBe('half')
    expect(shapeFor(at(2.2, 30))).toBe('band')
    expect(shapeFor(at(0.1, 30))).toBe('any')
  })

  /**
   * The seeded ranges are `library-kit`'s, not the picker's, and they have to
   * land on the shape they were named for — `PAGE` on the page rather than the
   * story it is also wide enough to cover, and `OPEN` on `any` rather than on
   * the half page its middle happens to sit in.
   */
  it('places the seeded ranges on the shape they were named for', () => {
    expect(shapeFor(at(0.55, 0.85))).toBe('a4')
    expect(shapeFor(at(0.86, 1.2))).toBe('square')
    expect(shapeFor(at(1.25, 2.2))).toBe('half')
    expect(shapeFor(at(2.4, 30))).toBe('band')
    expect(shapeFor(at(0.1, 30))).toBe('any')
  })

  /** This is the block in the report: a header seeded at `STRIP`, drawn at a story. */
  it('opens a header on the band its range still claims', () => {
    expect(shapeFor(at(2.4, 30))).toBe('band')
  })

  it('falls to an end of the list rather than refusing to draw', () => {
    expect(shapeFor(at(0.05, 0.2))).toBe('story')
    expect(shapeFor(at(30, 40))).toBe('band')
    expect(shapeFor(undefined)).toBe('a4')
  })
})

describe('nextStillShape', () => {
  it('opens a second layout on a shape nothing claims yet', () => {
    expect(nextStillShape([at(0.45, 0.62)])).toBe('a4')
    expect(nextStillShape([at(2.2, 30)])).toBe('story')
  })

  it('walks the list rather than repeating a claimed shape', () => {
    expect(nextStillShape([at(0.45, 0.62), at(0.62, 0.85)])).toBe('square')
  })

  /** Five shapes and five layouts: the band, rather than a sixth name. */
  it('settles on the band once every shape is taken', () => {
    const every = [at(0.45, 0.62), at(0.62, 0.85), at(0.85, 1.2), at(1.2, 2.2), at(2.2, 30)]
    expect(nextStillShape(every)).toBe('band')
  })
})
