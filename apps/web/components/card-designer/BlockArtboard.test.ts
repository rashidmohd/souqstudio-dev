import { describe, expect, it } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { handleCursor, sharedTurn, wrapTurn } from '@/components/card-designer/BlockArtboard'

/**
 * The selection did not turn with the element it was describing: the outline,
 * the handles and the hit target all stayed upright over a shape that was not,
 * so a rotated element was selected by clicking beside it and resized by a
 * handle that pointed somewhere else. These are the pieces of that which can be
 * checked without a canvas.
 */

describe('wrapTurn', () => {
  it('leaves an angle already in range alone', () => {
    expect(wrapTurn(0)).toBe(0)
    expect(wrapTurn(90)).toBe(90)
    expect(wrapTurn(-90)).toBe(-90)
  })

  /**
   * **Wrapped rather than clamped.** Clamping means a shape turned to 180°
   * stops dead and will not come round the other side, at the one angle where
   * carrying on is the obvious thing to do.
   */
  it('comes round the far side instead of sticking', () => {
    expect(wrapTurn(190)).toBe(-170)
    expect(wrapTurn(-190)).toBe(170)
    expect(wrapTurn(540)).toBe(-180)
  })

  it('always lands inside what the schema stores', () => {
    for (const angle of [-1000, -359, -181, 181, 359, 1000]) {
      expect(wrapTurn(angle)).toBeGreaterThanOrEqual(-180)
      expect(wrapTurn(angle)).toBeLessThanOrEqual(180)
    }
  })
})

describe('handleCursor', () => {
  it('names the direction a handle actually resizes in, upright', () => {
    expect(handleCursor(0.5, 0, 0)).toBe('ns-resize')
    expect(handleCursor(0, 0.5, 0)).toBe('ew-resize')
    expect(handleCursor(0, 0, 0)).toBe('nwse-resize')
    expect(handleCursor(1, 0, 0)).toBe('nesw-resize')
  })

  /**
   * A quarter turn swaps the axes: the handle on top of a shape turned 90° is
   * out to its side, and it now resizes left to right.
   */
  it('follows the shape round', () => {
    expect(handleCursor(0.5, 0, 90)).toBe('ew-resize')
    expect(handleCursor(0, 0.5, 90)).toBe('ns-resize')
    expect(handleCursor(0, 0, 90)).toBe('nesw-resize')
  })

  /** A resize cursor is a double-headed arrow, so half a turn changes nothing. */
  it('reads a half turn as no turn', () => {
    for (const [fx, fy] of [
      [0.5, 0],
      [0, 0.5],
      [0, 0],
      [1, 0],
    ] as const) {
      expect(handleCursor(fx, fy, 180)).toBe(handleCursor(fx, fy, 0))
    }
  })

  it('rounds an odd angle to the nearest of the four', () => {
    expect(handleCursor(0.5, 0, 10)).toBe('ns-resize')
    expect(handleCursor(0.5, 0, 40)).toBe('nesw-resize')
  })
})

describe('sharedTurn', () => {
  const at = (rotation?: number): BlockElement => ({
    id: `e${rotation ?? 'x'}`,
    kind: 'shape',
    box: { start: 0, top: 0, width: 0.2, height: 0.2 },
    radius: 0,
    ...(rotation === undefined ? {} : { rotation }),
  })

  it('is the turn they agree on', () => {
    expect(sharedTurn([at(30), at(30)])).toBe(30)
  })

  it('reads an unset rotation as upright', () => {
    expect(sharedTurn([at(), at(0)])).toBe(0)
  })

  /**
   * Two elements at different angles have no common frame to draw a box in, so
   * the handles go back to an upright one around both — which is what the
   * resize arithmetic assumed before anything could be rotated at all.
   */
  it('gives up when the selection disagrees', () => {
    expect(sharedTurn([at(30), at(-10)])).toBe(0)
  })

  it('has nothing to say about an empty selection', () => {
    expect(sharedTurn([])).toBe(0)
  })
})
