import { describe, expect, it } from 'vitest'
import { drawnSize, type Canvas } from './drawn-size'

/**
 * A story, which is the shape that makes the two percentages disagree hardest.
 * 1080 × 1920 at 150dpi, the same numbers `pageSizeFor` hands the engine.
 */
const STORY: Canvas = { aspect: 1080 / 1920, page: { width: 1080, height: 1920 } }

/** A block that repeats has no page of its own, only the shape it is drawn at. */
const REPEATING: Canvas = { aspect: 1080 / 1920, page: null }

const box = (width: number, height: number) => ({ start: 0.3, top: 0.3, width, height })

describe('drawnSize', () => {
  it('turns two percentages of two different edges into one pair of pixels', () => {
    expect(drawnSize(box(0.325, 0.185), STORY)).toBe('Drawn 351 × 355 px')
  })

  it('reads equal on the shape an owner dragged round by eye', () => {
    // The circle that started this: 32.5% of the width and 18.28% of the height
    // are the same length, and the panel has to be the thing that says so.
    expect(drawnSize(box(0.325, 0.1828), STORY)).toBe('Drawn 351 × 351 px')
  })

  it('does not pretend a repeating block has a size', () => {
    // It letterboxes into whatever region the grid gives it, so the proportion
    // is the whole of what can honestly be said.
    expect(drawnSize(box(0.325, 0.1828), REPEATING)).toBe('Drawn 1 : 1 at this shape')
    expect(drawnSize(box(0.4, 0.4), REPEATING)).toBe('Drawn 1 : 1.8 at this shape')
  })

  it('reads a wide shape the way anyone describes one', () => {
    // Nobody calls a landscape shape "0.6 to 1".
    expect(drawnSize(box(0.8, 0.2), REPEATING)).toBe('Drawn 2.3 : 1 at this shape')
  })

  it('says nothing rather than something wrong for a box with no size', () => {
    // A number field hands over an emptied value, and the box schema allows a
    // negative width long enough for one keystroke to produce one.
    expect(drawnSize(box(0, 0.2), STORY)).toBeNull()
    expect(drawnSize(box(0.3, 0), REPEATING)).toBeNull()
    expect(drawnSize(box(Number.NaN, 0.2), REPEATING)).toBeNull()
    expect(drawnSize(box(-0.3, 0.2), REPEATING)).toBeNull()
  })
})
