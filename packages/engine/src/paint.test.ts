/**
 * The paint model — E14 §2.4, Phase 3.
 *
 * Three things that could not be expressed and one that must never be drawn:
 * an outline-only shape, an outline on text, a cast shadow, and any filter that
 * would rasterize on the way to a PDF.
 *
 * The filter half is not tested here — it cannot be, because the whole point is
 * that the disqualifying behaviour belongs to Chromium rather than to this
 * code. `harness/export-check.ts` renders each case to a real PDF and counts
 * the objects; the ESLint rule in `packages/config/eslint.design.cjs` stops one
 * being written. This file covers the model and the geometry.
 */

import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { toArrangements } from './document'
import { usesOnlyRoles } from './roles'
import { shadowRings } from './shadow'
import { inkOnGround } from './contrast'

const BOX = { start: 0.1, top: 0.1, width: 0.5, height: 0.3 }
const ROLE = { from: 'role' as const, ref: 'primary' as const }
const PALETTE = { from: 'palette' as const, id: 'pal_1' }

const arrange = (elements: BlockElement[]): unknown => [
  { aspectMin: 0.4, aspectMax: 6, elements },
]

const shape = (over: Record<string, unknown> = {}): BlockElement =>
  ({ id: 's1', kind: 'shape', box: BOX, radius: 3, ...over }) as BlockElement

const text = (over: Record<string, unknown> = {}): BlockElement =>
  ({
    id: 't1',
    kind: 'text',
    box: BOX,
    source: { from: 'product', field: 'name' },
    level: 'h3',
    align: 'start',
    ...over,
  }) as BlockElement

describe('a fill is optional — §2.4', () => {
  it('accepts a shape with no fill at all', () => {
    // **The case that could not be expressed at any setting.** A hairline rule
    // box around a price is the commonest piece of furniture on a printed
    // ticket, and it had to be faked with one filled rectangle on another.
    const parsed = toArrangements(
      arrange([shape({ stroke: { color: ROLE, width: 0.004 } })])
    )
    expect(parsed).not.toBeNull()
    const element = parsed?.[0]?.elements[0]
    expect(element?.kind === 'shape' && element.fill).toBeUndefined()
  })

  it('still accepts one that has a fill', () => {
    const parsed = toArrangements(arrange([shape({ fill: ROLE })]))
    expect(parsed?.[0]?.elements[0]).toMatchObject({ fill: ROLE })
  })

  it('lets a seeded block leave the fill out', () => {
    // An absent fill names no colour, so it cannot name the wrong kind of one.
    expect(usesOnlyRoles(toArrangements(arrange([shape()])) as Arrangement[])).toBe(true)
  })
})

describe('an outline on text — §2.4', () => {
  it('is accepted, with a colour and a width', () => {
    const parsed = toArrangements(arrange([text({ stroke: { color: ROLE, width: 0.01 } })]))
    expect(parsed?.[0]?.elements[0]).toMatchObject({ stroke: { width: 0.01 } })
  })

  it('refuses a gradient outline, as every stroke does', () => {
    // `Stroke.color` is a `FlatColor`. Gradient hairlines are how a card stops
    // being legible at the size a booklet prints.
    expect(
      toArrangements(
        arrange([
          text({
            stroke: {
              color: {
                from: 'gradient',
                angle: 0,
                stops: [
                  { at: 0, color: ROLE },
                  { at: 1, color: ROLE },
                ],
              },
              width: 0.01,
            },
          }),
        ])
      )
    ).toBeNull()
  })

  it('keeps a shop’s palette entry out of a seeded block’s outline', () => {
    // The hole this closes: a slot left out of `usesOnlyRoles` lets a shipped
    // block name one shop's colour. Same argument as the price mark's twelve.
    const ok = toArrangements(arrange([text({ stroke: { color: ROLE, width: 0.01 } })]))
    const bad = toArrangements(arrange([text({ stroke: { color: PALETTE, width: 0.01 } })]))
    expect(usesOnlyRoles(ok as Arrangement[])).toBe(true)
    expect(usesOnlyRoles(bad as Arrangement[])).toBe(false)
  })
})

describe('a shadow — §2.4', () => {
  const shadow = { x: 0.01, y: 0.015, blur: 0.02, color: ROLE }

  it('is accepted on a shape, a text and an image', () => {
    for (const element of [
      shape({ fill: ROLE, shadow }),
      text({ shadow: { ...shadow, blur: 0 } }),
      { id: 'i1', kind: 'image', box: BOX, source: { from: 'product' }, shadow } as BlockElement,
    ]) {
      expect(toArrangements(arrange([element]))).not.toBeNull()
    }
  })

  it('is refused on the kinds §2.4 did not give one', () => {
    // A chip and a price mark draw their own grounds. Widening this is a
    // decision about 83 published blocks, not a convenience.
    expect(
      toArrangements(
        arrange([{ id: 'c1', kind: 'chip', box: BOX, anchor: 'TOP_END', shadow } as BlockElement])
      )
    ).toBeNull()
  })

  it('bounds the blur, because the ring count is derived from it', () => {
    // An unbounded blur is an unbounded number of paths on a page, decided by a
    // document that came out of a bucket.
    expect(toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, blur: 5 } })]))).toBeNull()
    expect(
      toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, blur: 0 } })]))
    ).not.toBeNull()
  })

  it('allows an offset in either direction', () => {
    // A shadow above and to the start of its element is unusual, not wrong.
    expect(
      toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, x: -0.02, y: -0.02 } })]))
    ).not.toBeNull()
  })

  it('refuses a gradient as the shadow colour', () => {
    expect(
      toArrangements(
        arrange([
          shape({
            fill: ROLE,
            shadow: {
              ...shadow,
              color: { from: 'gradient', angle: 0, stops: [{ at: 0, color: ROLE }, { at: 1, color: ROLE }] },
            },
          }),
        ])
      )
    ).toBeNull()
  })

  it('keeps a shop’s palette entry out of a seeded block’s shadow', () => {
    const bad = toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, color: PALETTE } })]))
    expect(usesOnlyRoles(bad as Arrangement[])).toBe(false)
  })

  it('costs more paths at print than on screen, for the same document', () => {
    // The document stores x, y, blur and a colour. How many paths that becomes
    // is the painter's answer for the surface it is drawing on.
    const rect = { x: 0, y: 0, width: 200, height: 120 }
    const px = { x: 4, y: 6, blur: 8, color: ROLE }
    expect(shadowRings(px, rect, 0, { scale: 1, dpi: 300 }).length).toBeGreaterThan(
      shadowRings(px, rect, 0, { scale: 1, dpi: 96 }).length
    )
  })

  /**
   * The bound the export harness asked for.
   *
   * A shape's ring is one path. Text's ring is the string again under a wider
   * stroke, and Chromium outlines stroked text into path geometry — about 24 kB
   * a ring, 663 kB for one softly shadowed price against 274 kB for twenty-four
   * ringed bursts together. A price wears a hard shadow or none.
   */
  describe('on text, it must be hard', () => {
    it('accepts a shadow with no blur', () => {
      expect(toArrangements(arrange([text({ shadow: { ...shadow, blur: 0 } })]))).not.toBeNull()
    })

    it('refuses any blur at all, rather than clamping it', () => {
      // Refused at the boundary, so a block cannot store one thing and render
      // another. Widening this later is safe; narrowing it would not have been.
      expect(toArrangements(arrange([text({ shadow })]))).toBeNull()
      expect(
        toArrangements(arrange([text({ shadow: { ...shadow, blur: 0.0001 } })]))
      ).toBeNull()
    })

    it('takes a darkness, so softening is not done by paling the colour', () => {
      // The gap that made a green card cast a green glow: the rings accumulated
      // to a constant, so the only way to soften a shadow was to lighten it.
      expect(
        toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, opacity: 0.2 } })]))
      ).not.toBeNull()
    })

    it('refuses a fully opaque shadow, which stops reading as one', () => {
      expect(
        toArrangements(arrange([shape({ fill: ROLE, shadow: { ...shadow, opacity: 1 } })]))
      ).toBeNull()
    })

    it('still allows a soft one on a shape', () => {
      expect(toArrangements(arrange([shape({ fill: ROLE, shadow })]))).not.toBeNull()
    })
  })

  /**
   * A blurred *picture* is the one soft thing that survives the export path,
   * because it is pixels rather than a filter: the image is rendered blurred
   * and stored, and what the painter draws carries no filter at all. What is
   * stored beside it is provenance — the unblurred original and the radius —
   * so the designer can re-render from the original instead of compounding.
   */
  describe('a blurred upload', () => {
    const image = (source: unknown): BlockElement =>
      ({ id: 'i1', kind: 'image', box: BOX, source }) as BlockElement

    it('carries the original it was rendered from', () => {
      expect(
        toArrangements(
          arrange([
            image({ from: 'asset', assetId: 'org_1/blocks/soft', blur: { from: 'org_1/blocks/sharp', radius: 0.02 } }),
          ])
        )
      ).not.toBeNull()
    })

    it('bounds the radius, because past it a picture is a wash', () => {
      expect(
        toArrangements(
          arrange([
            image({ from: 'asset', assetId: 'org_1/blocks/soft', blur: { from: 'org_1/blocks/sharp', radius: 0.5 } }),
          ])
        )
      ).toBeNull()
    })

    it('refuses it on a bound image, which has no one file to blur', () => {
      // A product image is chosen from the catalog at render time and a logo
      // belongs to whichever shop draws the block. The union is what says so;
      // this is the test that keeps it saying it.
      expect(
        toArrangements(arrange([image({ from: 'product', blur: { from: 'x', radius: 0.02 } })]))
      ).toBeNull()
      expect(
        toArrangements(
          arrange([image({ from: 'brand', field: 'logo', blur: { from: 'x', radius: 0.02 } })])
        )
      ).toBeNull()
    })
  })
})

describe('corners and a ground behind text', () => {
  const one = { topStart: 12, topEnd: 0, bottomEnd: 0, bottomStart: 0 }
  const ground = { fill: ROLE, padding: 0.02, radius: 3 }

  it('accepts a rectangle with its own corners', () => {
    expect(toArrangements(arrange([shape({ corners: one })]))).not.toBeNull()
  })

  it('refuses a corner past the bound a radius has', () => {
    expect(toArrangements(arrange([shape({ corners: { ...one, topStart: 65 } })]))).toBeNull()
  })

  it('accepts text with a ground, its corners and its fit', () => {
    const parsed = toArrangements(
      arrange([text({ background: { ...ground, corners: one, fit: 'text' } })])
    )
    expect(parsed?.[0]?.elements[0]).toMatchObject({ background: { fit: 'text' } })
  })

  it('refuses a padding that would bury the words', () => {
    expect(toArrangements(arrange([text({ background: { ...ground, padding: 0.3 } })]))).toBeNull()
  })

  it('still accepts every text written before the ground existed', () => {
    expect(toArrangements(arrange([text()]))).not.toBeNull()
  })
})

describe('the ink on a ground', () => {
  it('keeps the first ink when it reads best', () => {
    expect(inkOnGround(['#101010'], ['#FFFFFF', '#111111'])).toBe('#FFFFFF')
  })

  it('judges a gradient by its weakest stop', () => {
    // White clears the black end and vanishes into the pale one; mid-grey is
    // mediocre on both and so the better answer across the label.
    expect(inkOnGround(['#000000', '#F0F0F0'], ['#FFFFFF', '#777777'])).toBe('#777777')
  })

  it('gives no answer when nothing can be read', () => {
    expect(inkOnGround(['url(#g)'], ['#FFFFFF'])).toBeNull()
  })
})
