import { describe, expect, it } from 'vitest'
import type { BlockElement, SlotOverride } from '@souqstudio/types'
import { SLOT_OVERRIDE_LIMITS } from '@souqstudio/types'
import { applyOverride, clampOverride, findOverride, isEmptyOverride } from './override'
import type { ResolvedBlock } from './render'

const CONTAINER = { x: 100, y: 200, width: 400, height: 600 }

const image: BlockElement = {
  id: 'photo',
  kind: 'image',
  box: { start: 0.1, top: 0.1, width: 0.8, height: 0.3 },
  source: { from: 'product' },
}
const price: BlockElement = {
  id: 'price',
  kind: 'priceMark',
  box: { start: 0.1, top: 0.7, width: 0.8, height: 0.2 },
}

const resolved: ResolvedBlock = {
  arrangementIndex: 0,
  elements: [
    { element: image, rect: { x: 140, y: 260, width: 320, height: 180 } },
    { element: price, rect: { x: 140, y: 620, width: 320, height: 120 } },
  ],
}

const override = (over: Partial<SlotOverride> = {}): SlotOverride => ({
  regionId: 'r0c0',
  offerId: 'off_1',
  ...over,
})

describe('clampOverride', () => {
  it('holds a nudge inside ±8% of the region', () => {
    const clamped = clampOverride(override({ offsetX: 0.5, offsetY: -0.5 }))
    expect(clamped.offsetX).toBe(SLOT_OVERRIDE_LIMITS.offset)
    expect(clamped.offsetY).toBe(-SLOT_OVERRIDE_LIMITS.offset)
  })

  it('holds an image scale inside 0.8..1.25', () => {
    expect(clampOverride(override({ imageScale: 4 })).imageScale).toBe(
      SLOT_OVERRIDE_LIMITS.imageScaleMax
    )
    expect(clampOverride(override({ imageScale: 0.1 })).imageScale).toBe(
      SLOT_OVERRIDE_LIMITS.imageScaleMin
    )
  })

  it('treats a value that is not a number as no nudge at all', () => {
    expect(clampOverride(override({ offsetX: Number.NaN })).offsetX).toBe(0)
  })

  it('leaves an absent field absent rather than defaulting it', () => {
    const clamped = clampOverride(override())
    expect('offsetX' in clamped).toBe(false)
    expect('imageScale' in clamped).toBe(false)
  })
})

describe('isEmptyOverride', () => {
  it('is empty when nothing was set', () => {
    expect(isEmptyOverride(override())).toBe(true)
  })

  it('is empty when everything was set back to neutral', () => {
    // "Reset to template" writes zeroes; the caller drops the row rather than
    // storing a delta that changes nothing.
    expect(isEmptyOverride(override({ offsetX: 0, offsetY: 0, imageScale: 1 }))).toBe(true)
  })

  it('is not empty for a real nudge', () => {
    expect(isEmptyOverride(override({ offsetY: 0.02 }))).toBe(false)
  })
})

describe('findOverride', () => {
  const list = [override({ offsetX: 0.02 }), override({ regionId: 'r0c1', offerId: 'off_2' })]

  it('matches on both halves of the key', () => {
    expect(findOverride(list, 'r0c0', 'off_1')?.offsetX).toBe(0.02)
  })

  it('does not apply a nudge to whatever moved into that region', () => {
    // The whole reason the key carries the offer: next week's product in last
    // week's cell is a different card, and inheriting the nudge would be the
    // engine quietly applying an edit nobody made for it.
    expect(findOverride(list, 'r0c0', 'off_9')).toBeUndefined()
  })

  it('matches a static region, whose override has no offer', () => {
    const statics = [override({ regionId: 'footer', offerId: null, offsetY: 0.01 })]
    expect(findOverride(statics, 'footer', null)?.offsetY).toBe(0.01)
  })
})

describe('applyOverride', () => {
  it('returns the block untouched when there is nothing to apply', () => {
    expect(applyOverride(resolved, CONTAINER, undefined)).toBe(resolved)
    expect(applyOverride(resolved, CONTAINER, override())).toBe(resolved)
  })

  it('moves the whole card, not its elements individually', () => {
    // A nudge means "this card sits low in its cell", never "the price has
    // moved relative to the name" — per-element offsets are the unbounded
    // positioning E6 §1 refuses.
    const moved = applyOverride(resolved, CONTAINER, override({ offsetX: 0.05, offsetY: -0.05 }))
    expect(moved.elements[0]?.rect.x).toBeCloseTo(140 + 0.05 * 400)
    expect(moved.elements[1]?.rect.x).toBeCloseTo(140 + 0.05 * 400)
    expect(moved.elements[0]?.rect.y).toBeCloseTo(260 - 0.05 * 600)
    expect(moved.elements[1]?.rect.y).toBeCloseTo(620 - 0.05 * 600)
  })

  it('measures the nudge against the container, so it means the same at any size', () => {
    const small = applyOverride(
      resolved,
      { ...CONTAINER, width: 200 },
      override({ offsetX: 0.05 })
    )
    expect(small.elements[0]?.rect.x).toBeCloseTo(140 + 0.05 * 200)
  })

  it('scales an image about its own centre', () => {
    // Scaling from the origin drags the packshot into the corner, which is what
    // the owner reaching for this control is usually trying to fix.
    const scaled = applyOverride(resolved, CONTAINER, override({ imageScale: 1.25 }))
    const before = resolved.elements[0]!.rect
    const after = scaled.elements[0]!.rect

    expect(after.width).toBeCloseTo(before.width * 1.25)
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2)
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2)
  })

  it('scales the image and nothing else', () => {
    const scaled = applyOverride(resolved, CONTAINER, override({ imageScale: 1.2 }))
    expect(scaled.elements[1]?.rect).toEqual(resolved.elements[1]?.rect)
  })

  it('clamps what it was handed rather than trusting storage', () => {
    // Storage is not a trust boundary: a row written before a limit changed
    // must not be able to move a card out of its region.
    const wild = applyOverride(resolved, CONTAINER, override({ offsetX: 10 }))
    expect(wild.elements[0]?.rect.x).toBeCloseTo(140 + SLOT_OVERRIDE_LIMITS.offset * 400)
  })
})
