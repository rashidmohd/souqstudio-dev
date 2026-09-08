import { describe, expect, it } from 'vitest'
import type { Box } from '@souqstudio/types'
import { SNAP_RANGE, alignBoxes, snapBox } from './snap'

const box = (start: number, top: number, width = 0.2, height = 0.1): Box => ({
  start,
  top,
  width,
  height,
})

describe('snapBox', () => {
  it('leaves a box alone when nothing is near', () => {
    const anchor = box(0.05, 0.05)
    const moving = box(0.4, 0.42)
    expect(snapBox(moving, [anchor]).box).toEqual(moving)
  })

  it('snaps a leading edge to another element’s leading edge', () => {
    const anchor = box(0.3, 0.05)
    const moving = box(0.3 + SNAP_RANGE / 2, 0.5)
    expect(snapBox(moving, [anchor]).box.start).toBeCloseTo(0.3)
  })

  it('snaps trailing edges too, which is half of what alignment means', () => {
    // Offering only the leading edge would refuse to line two boxes up by their
    // right-hand sides.
    // The anchor ends at 0.5. The moving box is wide enough that only its own
    // trailing edge is anywhere near a candidate.
    const anchor = box(0.1, 0.05, 0.4)
    const moving = box(0.256, 0.5, 0.25)
    const snapped = snapBox(moving, [anchor]).box
    expect(snapped.start + snapped.width).toBeCloseTo(0.5)
  })

  it('snaps to the block’s own centre with nothing else on the card', () => {
    // The most common alignment there is, and it would be the one thing the
    // tool could not help with if it needed a second element to snap against.
    const moving = box(0.395, 0.2)
    expect(snapBox(moving, []).box.start).toBeCloseTo(0.4)
  })

  it('reports the lines it hit, so the owner can see why it moved', () => {
    const result = snapBox(box(0.395, 0.2), [])
    expect(result.guides.x).toContain(0.5)
  })

  it('does not snap past its range', () => {
    const moving = box(0.5 + SNAP_RANGE * 2, 0.2)
    expect(snapBox(moving, []).box.start).toBeCloseTo(0.5 + SNAP_RANGE * 2)
  })

  it('never changes a box’s size', () => {
    const moving = box(0.395, 0.2, 0.33, 0.17)
    const snapped = snapBox(moving, []).box
    expect(snapped.width).toBe(0.33)
    expect(snapped.height).toBe(0.17)
  })
})

describe('alignBoxes', () => {
  const three = [box(0.1, 0.1, 0.2, 0.1), box(0.5, 0.3, 0.3, 0.2), box(0.2, 0.6, 0.1, 0.05)]

  it('needs two to do anything', () => {
    expect(alignBoxes([three[0]!], 'start')).toEqual([three[0]])
  })

  it('aligns to the selection’s own extent, not to the block', () => {
    // Two elements dragged into a corner and then centred should end up centred
    // on each other; aligning them to the card is a different command.
    const aligned = alignBoxes(three, 'start')
    expect(aligned.every((entry) => entry.start === 0.1)).toBe(true)
  })

  it('aligns trailing edges by their own ends', () => {
    const aligned = alignBoxes(three, 'end')
    expect(aligned.every((entry) => Math.abs(entry.start + entry.width - 0.8) < 1e-9)).toBe(true)
  })

  it('centres on the midpoint of the extent', () => {
    const aligned = alignBoxes(three, 'center')
    const centres = aligned.map((entry) => entry.start + entry.width / 2)
    expect(centres.every((centre) => Math.abs(centre - 0.45) < 1e-9)).toBe(true)
  })

  it('distributes even gaps rather than even centres', () => {
    // Boxes of different widths spaced by their centres leave visibly different
    // gaps, which is the thing this control exists to fix.
    const spread = alignBoxes(
      [box(0, 0, 0.1), box(0.3, 0, 0.3), box(0.8, 0, 0.2)],
      'distribute-x'
    )
    const sorted = [...spread].sort((a, b) => a.start - b.start)
    const gapOne = sorted[1]!.start - (sorted[0]!.start + sorted[0]!.width)
    const gapTwo = sorted[2]!.start - (sorted[1]!.start + sorted[1]!.width)
    expect(gapOne).toBeCloseTo(gapTwo)
  })

  it('leaves the ends of a distribution where they were', () => {
    const input = [box(0, 0, 0.1), box(0.3, 0, 0.3), box(0.8, 0, 0.2)]
    const spread = alignBoxes(input, 'distribute-x')
    expect(spread[0]?.start).toBeCloseTo(0)
    expect(spread[2]?.start).toBeCloseTo(0.8)
  })

  it('does nothing to two boxes asked to distribute', () => {
    const pair = [box(0, 0), box(0.5, 0)]
    expect(alignBoxes(pair, 'distribute-x')).toEqual(pair)
  })

  it('returns the boxes in the order it was given them', () => {
    // The caller is holding a selection; handing it back sorted would reorder
    // the document as a side effect.
    const input = [box(0.8, 0, 0.1), box(0, 0, 0.1), box(0.4, 0, 0.1)]
    const spread = alignBoxes(input, 'distribute-x')
    expect(spread[0]?.start).toBeCloseTo(0.8)
    expect(spread[1]?.start).toBeCloseTo(0)
  })
})
