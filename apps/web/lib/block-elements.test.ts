import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { PATH_SHAPES, usesOnlyRoles } from '@souqstudio/engine'
import { FREE_ELEMENTS, SHAPE_VARIANTS, shapeElement } from '@/lib/block-elements'

/**
 * The shape kit, as the two things that mint it have to agree about it.
 *
 * The rail drops a burst and the shapes panel drops all thirteen, and both now
 * read one table. These are the three ways that table can be wrong in a way the
 * compiler cannot see: a shape the engine draws that nothing offers, a shape
 * that lands outside the card, and a fill that freezes a colour instead of
 * following the shop's palette.
 */

const shape = (element: BlockElement): Extract<BlockElement, { kind: 'shape' }> => {
  if (element.kind !== 'shape') throw new Error(`expected a shape, got ${element.kind}`)
  return element
}

describe('SHAPE_VARIANTS', () => {
  /**
   * **The check the `Record` cannot make.** `SHAPE_SEEDS` is keyed by the type,
   * so a fourteenth shape added to the schema fails the build until it has a
   * box — but the *list* is an array, and an array that is one short just
   * quietly stops offering a shape. Which is the failure this whole change is
   * fixing, arriving again by a different door.
   */
  it('offers every shape the engine can draw', () => {
    expect([...SHAPE_VARIANTS.map((entry) => entry.value)].sort()).toEqual(
      [...PATH_SHAPES, 'rect', 'ellipse', 'line'].sort()
    )
  })

  it('names each one once', () => {
    const values = SHAPE_VARIANTS.map((entry) => entry.value)
    expect(new Set(values).size).toBe(values.length)
  })

  /** Sentence case, per the global rule. "Corner flash", never "Corner Flash". */
  it('labels in sentence case', () => {
    for (const entry of SHAPE_VARIANTS) {
      expect(entry.label.slice(1)).toBe(entry.label.slice(1).toLowerCase())
    }
  })
})

describe('shapeElement', () => {
  it('mints the variant it was asked for', () => {
    for (const entry of SHAPE_VARIANTS) {
      expect(shape(shapeElement(entry.value)).variant).toBe(entry.value)
    }
  })

  /**
   * **Inside the card, every one of them.** Coordinates are fractions of the
   * block, so a box that runs past 1 is a shape the owner has to go and find
   * before they can do anything with it — and a corner flash, which is the one
   * that lands at an edge on purpose, is exactly the kind of entry that gets
   * that wrong.
   */
  it('lands inside the card', () => {
    for (const entry of SHAPE_VARIANTS) {
      const { box } = shape(shapeElement(entry.value))
      expect(box.start).toBeGreaterThanOrEqual(0)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.width).toBeGreaterThan(0)
      expect(box.height).toBeGreaterThan(0)
      expect(box.start + box.width).toBeLessThanOrEqual(1)
      expect(box.top + box.height).toBeLessThanOrEqual(1)
    }
  })

  /**
   * **Role references, not literals.** A dropped shape follows the shop's
   * palette rather than freezing a colour nobody picked, which is also what
   * makes the fill control's "the shop's palette" row the obvious first move
   * when they want a different one.
   */
  it('colours every shape from the palette rather than a literal', () => {
    const arrangement: Arrangement = {
      aspectMin: 0.1,
      aspectMax: 30,
      elements: SHAPE_VARIANTS.map((entry) => shapeElement(entry.value)),
    }
    expect(usesOnlyRoles([arrangement])).toBe(true)
  })

  it('gives every shape its own identity', () => {
    const ids = SHAPE_VARIANTS.map((entry) => shapeElement(entry.value).id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * The rail's four shape tools read the same table now. A burst that starts
 * square from the rail and oblong from the panel is the drift the table exists
 * to prevent, so these pin what the rail drops.
 */
describe('the rail shape tools', () => {
  it('drop the shape the table describes', () => {
    expect(shape(FREE_ELEMENTS.rectangle()).variant).toBe('rect')
    expect(shape(FREE_ELEMENTS.ellipse()).variant).toBe('ellipse')
    expect(shape(FREE_ELEMENTS.line()).variant).toBe('line')
    expect(shape(FREE_ELEMENTS.burst()).variant).toBe('burst')
    expect(shape(FREE_ELEMENTS.burst()).box).toEqual(shape(shapeElement('burst')).box)
  })

  /** A line draws its stroke along its own middle, so it is the one that keeps one. */
  it('keeps the line its stroke', () => {
    expect(shape(FREE_ELEMENTS.line()).stroke).toBeDefined()
    expect(shape(FREE_ELEMENTS.rectangle()).stroke).toBeUndefined()
  })
})
