import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement, Box, TextSource } from '@souqstudio/types'
import {
  MIN_ELEMENT,
  addElement,
  isBound,
  moveBox,
  removeElement,
  reorderElement,
  replaceElement,
  resizeBox,
  snap,
  validateBlock,
} from './block-edit'

const box = (start: number, top: number, width: number, height: number): Box => ({
  start,
  top,
  width,
  height,
})

let seq = 0
const text = (source: TextSource) =>
  ({
    id: `t${(seq += 1)}`,
    kind: 'text',
    box: box(0.1, 0.1, 0.5, 0.2),
    source,
    level: 'h3',
    align: 'start',
  }) satisfies BlockElement

const priceMark: BlockElement = { id: 'price', kind: 'priceMark', box: box(0.1, 0.6, 0.8, 0.3) }
const surface: BlockElement = {
  id: 'surface',
  kind: 'shape',
  box: box(0, 0, 1, 1),
  fill: { from: 'role', ref: 'surface' },
  radius: 3,
}

const arrangement = (elements: BlockElement[], min = 0.5, max = 2): Arrangement => ({
  aspectMin: min,
  aspectMax: max,
  elements,
})

describe('snap', () => {
  it('lands on the lattice', () => {
    expect(snap(0.0123, 0.005)).toBeCloseTo(0.01)
    expect(snap(0.0138, 0.005)).toBeCloseTo(0.015)
  })
})

describe('moveBox', () => {
  it('translates by the delta', () => {
    expect(moveBox(box(0.1, 0.1, 0.2, 0.2), 0.1, 0.05)).toMatchObject({ start: 0.2, top: 0.15 })
  })

  it('keeps the whole box inside the block rather than only its origin', () => {
    // A wide box dragged past the end stops with its *end* on the edge. Clamping
    // the origin alone would let the far edge leave the block.
    const moved = moveBox(box(0.5, 0.5, 0.4, 0.4), 0.5, 0.5)
    expect(moved.start).toBeCloseTo(0.6)
    expect(moved.top).toBeCloseTo(0.6)
  })

  it('does not move past the start edge', () => {
    expect(moveBox(box(0.1, 0.1, 0.2, 0.2), -0.5, -0.5)).toMatchObject({ start: 0, top: 0 })
  })

  it('leaves width and height alone', () => {
    const moved = moveBox(box(0.1, 0.1, 0.2, 0.3), 0.2, 0.2)
    expect(moved.width).toBe(0.2)
    expect(moved.height).toBe(0.3)
  })
})

describe('resizeBox', () => {
  it('pins the opposite edge when dragging the start', () => {
    const resized = resizeBox(box(0.2, 0.2, 0.4, 0.4), 'start', 0.1, 0)
    expect(resized.start).toBeCloseTo(0.3)
    expect(resized.start + resized.width).toBeCloseTo(0.6)
  })

  it('grows from the end handle', () => {
    const resized = resizeBox(box(0.2, 0.2, 0.4, 0.4), 'end', 0.2, 0)
    expect(resized.start).toBeCloseTo(0.2)
    expect(resized.width).toBeCloseTo(0.6)
  })

  it('never inverts — a drag past the far edge stops at the minimum', () => {
    const resized = resizeBox(box(0.2, 0.2, 0.4, 0.4), 'start', 0.9, 0)
    expect(resized.width).toBeCloseTo(MIN_ELEMENT)
    expect(resized.width).toBeGreaterThan(0)
  })

  it('never inverts from the top handle either', () => {
    const resized = resizeBox(box(0.2, 0.2, 0.4, 0.4), 'top', 0, 0.9)
    expect(resized.height).toBeCloseTo(MIN_ELEMENT)
  })

  it('resizes both axes from a corner', () => {
    const resized = resizeBox(box(0.2, 0.2, 0.4, 0.4), 'end-bottom', 0.1, 0.1)
    expect(resized.width).toBeCloseTo(0.5)
    expect(resized.height).toBeCloseTo(0.5)
  })

  it('stops at the block edge', () => {
    const resized = resizeBox(box(0.5, 0.5, 0.4, 0.4), 'end-bottom', 0.5, 0.5)
    expect(resized.start + resized.width).toBeLessThanOrEqual(1)
    expect(resized.top + resized.height).toBeLessThanOrEqual(1)
  })
})

describe('element lists', () => {
  it('adds on top, because array order is paint order', () => {
    const next = addElement([surface], priceMark)
    expect(next[next.length - 1]).toBe(priceMark)
  })

  it('removes by index and leaves the original alone', () => {
    const elements = [surface, priceMark]
    expect(removeElement(elements, 0)).toEqual([priceMark])
    expect(elements).toHaveLength(2)
  })

  it('replaces one element', () => {
    expect(replaceElement([surface, priceMark], 1, surface)).toEqual([surface, surface])
  })

  it('reorders through the paint order', () => {
    expect(reorderElement([surface, priceMark], 1, 0)).toEqual([priceMark, surface])
  })

  it('treats an out-of-range reorder as a no-op', () => {
    expect(reorderElement([surface, priceMark], 5, 0)).toEqual([surface, priceMark])
  })
})

describe('isBound', () => {
  it('is the catalog that decides, not the element kind alone', () => {
    expect(isBound(text({ from: 'product', field: 'name' }))).toBe(true)
    expect(isBound(text({ from: 'static', textEn: 'Sale', textAr: 'تخفيض' }))).toBe(false)
    expect(isBound(text({ from: 'shop', field: 'name' }))).toBe(false)
    expect(isBound(priceMark)).toBe(true)
    expect(isBound(surface)).toBe(false)
  })
})

describe('validateBlock', () => {
  const codes = (problems: { code: string }[]) => problems.map((problem) => problem.code)

  it('accepts a well-formed repeating card', () => {
    const problems = validateBlock({
      repeats: true,
      arrangements: [arrangement([surface, text({ from: 'product', field: 'name' }), priceMark])],
    })
    expect(problems).toEqual([])
  })

  it('refuses a block with no arrangements', () => {
    expect(codes(validateBlock({ repeats: true, arrangements: [] }))).toEqual(['no-arrangements'])
  })

  it('refuses two price marks in one arrangement', () => {
    const problems = validateBlock({
      repeats: true,
      arrangements: [arrangement([priceMark, priceMark])],
    })
    expect(codes(problems)).toContain('duplicate-price-mark')
  })

  it('refuses a product binding on a block that is placed once', () => {
    const problems = validateBlock({
      repeats: false,
      arrangements: [arrangement([text({ from: 'product', field: 'name' })])],
    })
    expect(codes(problems)).toContain('product-binding-on-static-block')
    expect(problems[0]?.severity).toBe('error')
  })

  it('warns about a repeating card with no price on it', () => {
    const problems = validateBlock({
      repeats: true,
      arrangements: [arrangement([surface, text({ from: 'product', field: 'name' })])],
    })
    expect(codes(problems)).toContain('no-price-mark')
    expect(problems.every((problem) => problem.severity === 'warning')).toBe(true)
  })

  it('refuses a box with no area', () => {
    const problems = validateBlock({
      repeats: true,
      arrangements: [arrangement([{ ...priceMark, box: box(0.1, 0.1, 0, 0.2) }])],
    })
    expect(codes(problems)).toContain('degenerate-box')
  })

  it('lets a chip overhang and does not let anything else', () => {
    const chip: BlockElement = {
      id: 'chip',
      kind: 'chip',
      box: box(-0.06, 0.02, 0.3, 0.1),
      anchor: 'TOP_START',
    }
    const overhanging = validateBlock({
      repeats: true,
      arrangements: [arrangement([chip, priceMark])],
    })
    expect(codes(overhanging)).not.toContain('out-of-bounds')

    const escaped = validateBlock({
      repeats: true,
      arrangements: [arrangement([{ ...surface, box: box(0.8, 0.1, 0.5, 0.2) }, priceMark])],
    })
    expect(codes(escaped)).toContain('out-of-bounds')
  })

  it('reports a hole between two aspect ranges', () => {
    const problems = validateBlock({
      repeats: false,
      arrangements: [
        arrangement([surface], 0.5, 1),
        arrangement([surface], 2, 4),
      ],
    })
    expect(codes(problems)).toContain('aspect-gap')
  })

  it('reports two arrangements claiming the same shape', () => {
    const problems = validateBlock({
      repeats: false,
      arrangements: [
        arrangement([surface], 0.5, 1.5),
        arrangement([surface], 1, 2),
      ],
    })
    expect(codes(problems)).toContain('overlapping-aspects')
  })

  it('accepts ranges that meet exactly, which is what the seeded library ships', () => {
    const problems = validateBlock({
      repeats: false,
      arrangements: [
        arrangement([surface], 0.35, 0.85),
        arrangement([surface], 0.85, 1.35),
      ],
    })
    expect(codes(problems)).not.toContain('aspect-gap')
  })
})

describe('validateBlock — the seeded library is the case that matters', () => {
  const range = (min: number, max: number): Arrangement =>
    arrangement([surface, priceMark], min, max)

  it('does not call touching ranges an overlap', () => {
    // The seeded offer card's four ranges meet exactly, which is how a set of
    // ranges covers the line without a hole. Reading that as an overlap put
    // three warnings on the block every shop starts from.
    const problems = validateBlock({
      repeats: true,
      arrangements: [range(0.35, 0.85), range(0.85, 1.35), range(1.35, 2.6), range(2.6, 12)],
    })
    expect(problems).toEqual([])
  })

  it('still reports a real overlap', () => {
    const problems = validateBlock({ repeats: true, arrangements: [range(0.5, 1.5), range(1, 2)] })
    expect(problems.map((problem) => problem.code)).toContain('overlapping-aspects')
  })

  it('refuses two elements sharing an id', () => {
    const problems = validateBlock({
      repeats: true,
      arrangements: [arrangement([surface, { ...priceMark, id: 'surface' }])],
    })
    expect(problems.map((problem) => problem.code)).toContain('duplicate-element-id')
  })
})
