import { describe, it, expect } from 'vitest'
import type { BlockElement } from '@souqstudio/types'
import { compactBlock, type CompactionPolicy } from './compact'
import type { ResolvedBlock, ResolvedElement } from './render'

/**
 * The stack under test is the TALL offer card at a 400×600 cell, which is the
 * arrangement a booklet grid produces most often and the one the real-catalog
 * pages are drawn from.
 *
 *   image  y  36  h 204   (0.06 → 0.40)
 *   name   y 264  h 120   (0.44 → 0.64)
 *   spec   y 390  h  42   (0.65 → 0.72)
 *   price  y 444  h 120   (0.74 → 0.94)
 */
const CARD_HEIGHT = 600

const el = (kind: BlockElement['kind'], y: number, height: number): ResolvedElement => ({
  element:
    kind === 'text'
      ? { kind: 'text', box: ZERO, source: { from: 'product', field: 'name' }, level: 'h3', align: 'start' }
      : kind === 'image'
        ? { kind: 'image', box: ZERO, source: { from: 'product' } }
        : kind === 'priceMark'
          ? { kind: 'priceMark', box: ZERO }
          : kind === 'chip'
            ? { kind: 'chip', box: ZERO, anchor: 'TOP_START' }
            : { kind: 'shape', box: ZERO, surface: 'surface', radius: 3 },
  rect: { x: 32, y, width: 336, height },
})

const ZERO = { start: 0, top: 0, width: 1, height: 1 }

const SURFACE = { ...el('shape', 0, CARD_HEIGHT), rect: { x: 0, y: 0, width: 400, height: 600 } }
const CHIP = el('chip', 12, 54)
const IMAGE = el('image', 36, 204)
const NAME = el('text', 264, 120)
const SPEC = el('text', 390, 42)
const PRICE = el('priceMark', 444, 120)

const CARD: ResolvedBlock = {
  arrangementIndex: 0,
  elements: [SURFACE, IMAGE, CHIP, NAME, SPEC, PRICE],
}

/** By kind and order, since compaction preserves the original element order. */
const rects = (block: ResolvedBlock) =>
  block.elements.map((e) => ({ kind: e.element.kind, y: e.rect.y, height: e.rect.height }))

/** Every element uses exactly its box — nothing to reclaim. */
const asDesigned = (element: ResolvedElement) => element.rect.height

/**
 * The common real card: a one-line name in a three-line box, and no spec at all.
 * 67% of the dev catalog has no spec; the median name is 17 characters.
 */
const ONE_LINE = 40
const sparse = (element: ResolvedElement, index: number): number | null => {
  if (index === 4) return null // spec — absent
  if (index === 3) return ONE_LINE // name — one line of a three-line box
  return element.rect.height
}

describe('compactBlock', () => {
  it('changes nothing under the none policy, which is what makes it a baseline', () => {
    expect(rects(compactBlock(CARD, sparse, 'none'))).toEqual(rects(CARD))
  })

  it('changes nothing when every element filled its box', () => {
    for (const policy of ['image', 'price', 'balance'] as CompactionPolicy[]) {
      expect(rects(compactBlock(CARD, asDesigned, policy))).toEqual(rects(CARD))
    }
  })

  describe('a card with a short name and no spec', () => {
    it('drops the absent element rather than drawing an empty box', () => {
      const out = compactBlock(CARD, sparse, 'balance')
      // Six elements in, five out: the spec is gone.
      expect(CARD.elements).toHaveLength(6)
      expect(out.elements).toHaveLength(5)
      expect(out.elements.filter((e) => e.element.kind === 'text')).toHaveLength(1)
    })

    it('leaves the surface and the chip alone', () => {
      // The surface is the card itself and the chip deliberately overhangs the
      // corner. Neither is in the vertical flow.
      const out = compactBlock(CARD, sparse, 'image')
      const surface = out.elements.find((e) => e.element.kind === 'shape')
      const chip = out.elements.find((e) => e.element.kind === 'chip')
      expect(surface?.rect).toEqual(SURFACE.rect)
      expect(chip?.rect).toEqual(CHIP.rect)
    })

    it('still ends where it ended — a compacted card is not a shorter card', () => {
      for (const policy of ['image', 'price', 'balance'] as CompactionPolicy[]) {
        const out = compactBlock(CARD, sparse, policy)
        const last = out.elements[out.elements.length - 1]
        expect(last?.rect.y ?? 0).toBeCloseTo(PRICE.rect.y + PRICE.rect.height - (last?.rect.height ?? 0), 5)
      }
    })

    it('starts where it started', () => {
      const out = compactBlock(CARD, sparse, 'price')
      const image = out.elements.find((e) => e.element.kind === 'image')
      expect(image?.rect.y).toBe(IMAGE.rect.y)
    })

    it('gives the reclaimed height to the packshot under image', () => {
      const out = compactBlock(CARD, sparse, 'image')
      const image = out.elements.find((e) => e.element.kind === 'image')
      // 80 unused by the name, plus the spec's 42 and the 6px gap above it.
      expect(image?.rect.height).toBeCloseTo(204 + 80 + 42 + 6, 5)
      // And the price mark is untouched — this is a redistribution, not a resize
      // of everything.
      const price = out.elements.find((e) => e.element.kind === 'priceMark')
      expect(price?.rect.height).toBe(PRICE.rect.height)
    })

    it('gives it to the price mark under price', () => {
      const out = compactBlock(CARD, sparse, 'price')
      const price = out.elements.find((e) => e.element.kind === 'priceMark')
      expect(price?.rect.height).toBeCloseTo(120 + 80 + 42 + 6, 5)
      const image = out.elements.find((e) => e.element.kind === 'image')
      expect(image?.rect.height).toBe(IMAGE.rect.height)
    })

    it('spreads it into the gaps under balance, changing no heights', () => {
      const out = compactBlock(CARD, sparse, 'balance')
      const image = out.elements.find((e) => e.element.kind === 'image')
      const price = out.elements.find((e) => e.element.kind === 'priceMark')
      const name = out.elements.find((e) => e.element.kind === 'text')
      expect(image?.rect.height).toBe(IMAGE.rect.height)
      expect(price?.rect.height).toBe(PRICE.rect.height)
      expect(name?.rect.height).toBe(ONE_LINE)
    })
  })

  it('falls back to balance when the beneficiary is the element that went away', () => {
    // A card whose image is absent cannot give the image the space.
    const noImage = (element: ResolvedElement, index: number) =>
      index === 1 ? null : element.rect.height
    const out = compactBlock(CARD, noImage, 'image')
    expect(out.elements.find((e) => e.element.kind === 'image')).toBeUndefined()
    // Nothing grew; the space went into the gaps.
    expect(out.elements.find((e) => e.element.kind === 'priceMark')?.rect.height).toBe(
      PRICE.rect.height
    )
  })

  describe('refusing what it cannot do', () => {
    it('leaves a side-by-side arrangement alone', () => {
      // The WIDE arrangement: image on the left, name and price beside it. It
      // has the same empty-space problem and a different answer; moving these
      // vertically would push them into each other.
      const wide: ResolvedBlock = {
        arrangementIndex: 2,
        elements: [
          { ...el('image', 60, 480), rect: { x: 16, y: 60, width: 120, height: 480 } },
          { ...el('text', 96, 144), rect: { x: 152, y: 96, width: 144, height: 144 } },
          { ...el('priceMark', 144, 312), rect: { x: 280, y: 144, width: 108, height: 312 } },
        ],
      }
      expect(rects(compactBlock(wide, () => null, 'image'))).toEqual(rects(wide))
    })

    it('leaves a block with nothing left alone rather than returning an empty one', () => {
      expect(rects(compactBlock(CARD, () => null, 'balance'))).toEqual(rects(CARD))
    })

    it('does not let content grow past its box', () => {
      // An overflowing string is the fit ladder's problem. Reporting 400 for a
      // 120 box must not make the box 400 tall.
      const overflowing = (element: ResolvedElement, index: number) =>
        index === 3 ? 400 : element.rect.height
      const out = compactBlock(CARD, overflowing, 'balance')
      expect(out.elements[3]?.rect.height).toBe(NAME.rect.height)
    })
  })

  it('is stable — compacting an already compacted card changes nothing further', () => {
    const once = compactBlock(CARD, sparse, 'image')
    const twice = compactBlock(once, (element) => element.rect.height, 'image')
    expect(rects(twice)).toEqual(rects(once))
  })
})
