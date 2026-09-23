import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { PATH_SHAPES, usesOnlyRoles } from '@souqstudio/engine'
import { arrangementsSchema } from '@souqstudio/engine'
import {
  FREE_ELEMENTS,
  SHAPE_VARIANTS,
  artShapeElement,
  intrinsicAspect,
  proportioned,
  shapeElement,
} from './block-elements'

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

  /**
   * **An uploaded outline is not something the grid can offer.** There is
   * nothing to draw on a button and no box to seed until a file has been read,
   * which is what `PickableShape` says in the types and what this says at
   * runtime — a list that grew an `art` entry would render a button that mints
   * an element the schema then refuses.
   */
  it('does not offer the uploaded shape as something to pick', () => {
    expect(SHAPE_VARIANTS.map((entry) => entry.value)).not.toContain('art')
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

/**
 * An uploaded outline, as an element.
 *
 * The drawing itself is `svg-shape.test.ts`'s subject. What is checked here is
 * the pairing the document schema enforces, because either half alone is an
 * element that draws nothing and neither half is visible to the compiler.
 */
describe('artShapeElement', () => {
  const ART = { width: 102.84, height: 88.07, paths: [{ d: 'M0,0H10V10H0Z' }] }

  const arrangement = (elements: BlockElement[]) => [
    { aspectMin: 0.1, aspectMax: 30, elements },
  ]

  it('names the variant that the outline belongs to', () => {
    const element = shape(artShapeElement(ART))
    expect(element.variant).toBe('art')
    expect(element.art).toEqual(ART)
  })

  /**
   * **Fitted, not stretched.** A viewBox is whatever units the owner's drawing
   * program used, so the numbers mean nothing on a card — but the *ratio* is
   * theirs, and a drawing squashed on arrival is one they have to fix before
   * they can judge it.
   */
  it('keeps the drawing its proportion when it lands', () => {
    const element = shape(artShapeElement(ART))
    const landed = element.box.width / element.box.height
    expect(landed).toBeCloseTo(ART.width / ART.height, 5)
  })

  it('lands a tall drawing inside the card too', () => {
    const element = shape(artShapeElement({ ...ART, width: 40, height: 160 }))
    expect(element.box.top + element.box.height).toBeLessThanOrEqual(1)
    expect(element.box.start + element.box.width).toBeLessThanOrEqual(1)
  })

  it('colours it from the palette, not from the file', () => {
    expect(shape(artShapeElement(ART)).fill).toEqual({ from: 'role', ref: 'accent' })
  })

  it('is accepted by the document schema', () => {
    expect(() => arrangementsSchema.parse(arrangement([artShapeElement(ART)]))).not.toThrow()
  })

  it('refuses an outline whose variant does not name it', () => {
    const element = { ...shape(artShapeElement(ART)), variant: 'rect' as const }
    expect(() => arrangementsSchema.parse(arrangement([element]))).toThrow()
  })

  it('refuses the variant without an outline', () => {
    const { art: _dropped, ...element } = shape(artShapeElement(ART))
    expect(() => arrangementsSchema.parse(arrangement([element]))).toThrow()
  })
})

describe('proportioned', () => {
  // What a box actually draws at on a block of the given shape.
  const drawn = (box: { width: number; height: number }, block: number) =>
    (box.width * block) / box.height

  it('draws a circle round on a wide, a tall and a square block', () => {
    for (const block of [1.4, 0.56, 1, 3.2]) {
      const circle = proportioned(shapeElement('ellipse'), 1, block)
      expect(drawn(circle.box, block)).toBeCloseTo(1, 6)
    }
  })

  it('keeps an uploaded drawing at its own shape', () => {
    const art = { width: 300, height: 100, paths: [{ d: 'M0 0 L300 0 L300 100 Z' }] }
    for (const block of [1.4, 0.56]) {
      const shape = proportioned(artShapeElement(art), 3, block)
      expect(drawn(shape.box, block)).toBeCloseTo(3, 6)
    }
  })

  it('never lands bigger than the seed box', () => {
    const seed = shapeElement('star')
    const star = proportioned(seed, 1, 0.56)
    expect(star.box.width).toBeLessThanOrEqual(seed.box.width + 1e-9)
    expect(star.box.height).toBeLessThanOrEqual(seed.box.height + 1e-9)
  })

  it('keeps the corner flash in its corner', () => {
    const flash = proportioned(shapeElement('flash'), 1, 1.4)
    expect(flash.box.start).toBe(0)
    expect(flash.box.top).toBe(0)
  })

  it('leaves the element alone for a nonsense aspect', () => {
    const seed = shapeElement('ellipse')
    expect(proportioned(seed, 0, 1.4)).toBe(seed)
    expect(proportioned(seed, 1, Number.NaN)).toBe(seed)
  })
})

describe('intrinsicAspect', () => {
  it('is 1 for round and square shapes and null for stretchy ones', () => {
    expect(intrinsicAspect(shapeElement('ellipse'))).toBe(1)
    expect(intrinsicAspect(shapeElement('burst'))).toBe(1)
    expect(intrinsicAspect(shapeElement('ribbon'))).toBeNull()
    expect(intrinsicAspect(shapeElement('rect'))).toBeNull()
  })

  it("is an uploaded drawing's own width over height", () => {
    const art = { width: 200, height: 50, paths: [{ d: 'M0 0 L200 0 L200 50 Z' }] }
    expect(intrinsicAspect(artShapeElement(art))).toBe(4)
  })

  it('is null for artwork, which the designer measures instead', () => {
    expect(intrinsicAspect(FREE_ELEMENTS.artwork('a/b'))).toBeNull()
  })
})
