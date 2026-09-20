import { describe, it, expect } from 'vitest'
import { layoutPriceMark, markRecipe, toPriceMark } from '@souqstudio/engine'
import type { BlockElement } from '@souqstudio/types'
import { splitPriceMark } from '@/lib/split-price-mark'
import type { ArtboardOffer } from '@/components/blocks/draw'

const W = 400
const H = 720

const offer = (over: Partial<ArtboardOffer['priceMark']> = {}): ArtboardOffer => ({
  name: 'Basmati rice 5 kg',
  spec: null,
  brand: 'Al Wadi',
  imageUrl: null,
  priceMark: toPriceMark('24.50', 'AED', 'tier', { comparePrice: '31.00', ...over }),
  tierLabel: 'Save 20%',
  tierToken: '',
  chips: [],
  unitPrice: null,
})

const mark = (style?: Extract<BlockElement, { kind: 'priceMark' }>['style']) =>
  ({
    id: 'price_1',
    kind: 'priceMark',
    box: { start: 0.1, top: 0.6, width: 0.6, height: 0.16 },
    ...(style === undefined ? {} : { style }),
  }) as Extract<BlockElement, { kind: 'priceMark' }>

describe('splitting a price mark', () => {
  it('hands over the currency and the was-price, and not the digits', () => {
    const out = splitPriceMark(mark(), offer(), W, H)
    expect(out).not.toBeNull()

    const fields = out!.parts.map((p) => (p.kind === 'text' ? p.source : null))
    expect(fields).toEqual([
      { from: 'offer', field: 'currency' },
      { from: 'offer', field: 'compare' },
    ])
    // The mark stays a mark. Major and fils never leave it.
    expect(out!.mark.kind).toBe('priceMark')
  })

  /**
   * The property the whole feature rests on.
   *
   * A split is supposed to change nothing until something is moved. If the
   * pieces come out even a few percent off, the action reads as having damaged
   * the card and no owner presses it twice.
   */
  it('places every part exactly where it was already drawn', () => {
    const element = mark()
    const o = offer()
    const before = layoutPriceMark(
      o.priceMark,
      { x: element.box.start * W, y: element.box.top * H, width: element.box.width * W, height: element.box.height * H },
      { tierLabel: o.tierLabel.toUpperCase(), recipe: markRecipe(element.style) }
    )

    const out = splitPriceMark(element, o, W, H)!
    const blockSize = Math.sqrt(W * H)

    for (const [i, piece] of [before.currency, before.compare!].entries()) {
      const part = out.parts[i]!
      if (part.kind !== 'text') throw new Error('expected a text layer')
      // Same inline start, to the pixel.
      expect(part.box.start * W).toBeCloseTo(piece.x, 6)
      // Same baseline once the painter's own 0.85 offset is applied back.
      const size = part.size! * blockSize
      expect(part.box.top * H + size * 0.85).toBeCloseTo(piece.baseline, 6)
      // And the same size it was being set at.
      expect(size).toBeCloseTo(piece.fontSize, 6)
    }
  })

  it('switches off in the mark exactly what it handed over', () => {
    const out = splitPriceMark(mark(), offer(), W, H)!
    const recipe = markRecipe(out.mark.kind === 'priceMark' ? out.mark.style : undefined)

    expect(recipe.currency.place).toBe('hidden')
    expect(recipe.compare.place).toBe('hidden')
    // Untouched — nothing was handed over for it, so nothing is hidden.
    expect(recipe.tier.place).not.toBe('hidden')
  })

  it('leaves the parts grouped with the mark, so the first drag moves the price', () => {
    const out = splitPriceMark(mark(), offer(), W, H)!
    const ids = new Set([out.mark.groupId, ...out.parts.map((p) => p.groupId)])
    expect(ids.size).toBe(1)
    expect([...ids][0]).toBeTruthy()
  })

  it('strikes the was-price as a value the owner can clear, not as a rule', () => {
    const out = splitPriceMark(mark(), offer(), W, H)!
    const compare = out.parts[1]!
    expect(compare.kind === 'text' && compare.decoration).toBe('line-through')
  })

  it('keeps a part’s own colour when the mark had set one', () => {
    const out = splitPriceMark(
      mark({ compareInk: { from: 'hex', hex: '#c0392b' } }),
      offer(),
      W,
      H
    )!
    const compare = out.parts[1]!
    expect(compare.kind === 'text' && compare.color).toEqual({ from: 'hex', hex: '#c0392b' })
  })

  it('returns null when there is nothing beside the digits to hand over', () => {
    // No was-price on the offer, and the currency already placed by hand.
    const bare = splitPriceMark(
      mark({ recipe: { currency: 'hidden' } }),
      offer({ comparePrice: undefined }),
      W,
      H
    )
    expect(bare).toBeNull()
  })
})
