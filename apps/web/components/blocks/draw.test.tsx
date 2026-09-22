/**
 * The vocabulary walk, over the app's painter. E14 §3.5.
 *
 * **The sibling of `packages/engine/src/bindings.test.ts`, and both are needed.**
 * A binding is declared in `@souqstudio/types` and resolved in a painter, and
 * there are two painters: this one and `harness/svg.ts`. They each had their own
 * `switch`, they both answered `shop.address` and `shop.phone` with `''`, and
 * they agreed with each other and with nothing else — which is precisely why
 * testing one of them is not enough. Both now delegate to one resolver, and
 * these two files are what keep that true.
 *
 * It renders rather than calling `contentFor`, because a resolver returning a
 * string proves nothing about whether anything draws it — the same argument the
 * engine-side file makes.
 */

// JSX compiles to `React.createElement` here — the app is not on the automatic
// runtime — so the import is used even though nothing names it.
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockElement, BrandKit, TextSource } from '@souqstudio/types'
import { TEXT_BINDINGS, IMAGE_BINDINGS, labelFor } from '@souqstudio/engine'
import { toPriceMark } from '@souqstudio/engine'
import { resolveScale } from '@/lib/font-catalog'
import { TEST_CATALOG } from '@/lib/font-catalog.fixture'
import { artboardIdentity } from '@/lib/artboard-identity'
import { toArtboardOffer } from '@/lib/preview-offer'
import { TYPICAL_PRODUCT } from '@/lib/preview-product'
import { FREE_ELEMENTS } from '@/lib/block-elements'
import { drawElement, estimateWidth, type ArtboardOffer, type DrawContext } from './draw'

const KIT: BrandKit = {
  primaryColor: '#1B4D3E',
  secondaryColor: '#C8A951',
  accentColor: '#B3261E',
}

/** Distinctive on purpose — see the note in the engine-side file. */
const OFFER: ArtboardOffer = {
  name: 'FIXTURE-name',
  spec: 'FIXTURE-spec',
  brand: 'FIXTURE-brand',
  origin: 'FIXTURE-origin',
  packSize: 'FIXTURE-pack',
  imageUrl: 'https://cdn.example/FIXTURE-packshot.png',
  priceMark: toPriceMark('11.22', 'AED', 'tier', {
    comparePrice: '99.00',
    prefixLabel: 'PER_KG',
  }),
  tierLabel: 'FIXTURE-tier',
  tierToken: '',
  unitPrice: 'FIXTURE-unit',
  saveAmount: '87.78',
  savePercent: '89%',
  chips: [],
  imageShadowUrls: {},
}

const CTX: DrawContext = {
  uid: 'test',
  token: () => '#1B4D3E',
  scale: resolveScale(KIT, TEST_CATALOG),
  blockSize: 400,
  ar: false,
  direction: 'ltr',
  measure: estimateWidth,
  offer: OFFER,
  shop: { name: 'FIXTURE-shop', address: 'FIXTURE-address', phone: 'FIXTURE-phone' },
  brand: { name: 'FIXTURE-brandname', logo: 'https://cdn.example/FIXTURE-logo.png' },
  book: { title: 'FIXTURE-title', validFrom: 'FIXTURE-from', validTo: 'FIXTURE-to' },
}

const BOX = { x: 0, y: 0, width: 300, height: 60 }

const drawText = (source: TextSource, ctx: DrawContext = CTX): string => {
  const element: BlockElement = {
    id: 't',
    kind: 'text',
    source,
    level: 'body',
    align: 'start',
    box: { start: 0, top: 0, width: 1, height: 1 },
  }
  return renderToStaticMarkup(<svg>{drawElement(element, BOX, ctx)}</svg>)
}

/** What the fixture makes each binding say. The same table the engine-side
 *  file keeps, against a `ComposedOffer` rather than a catalog row. */
const EXPECTED: Record<string, string> = {
  'product.name': 'FIXTURE-name',
  'product.spec': 'FIXTURE-spec',
  'product.brand': 'FIXTURE-brand',
  'product.origin': 'FIXTURE-origin',
  'product.packSize': 'FIXTURE-pack',
  'offer.price': '11.22',
  'offer.currency': 'AED',
  'offer.compare': '99.00',
  'offer.prefix': 'PER KG',
  'offer.tier': 'FIXTURE-tier',
  'offer.unitPrice': 'FIXTURE-unit',
  'offer.saveAmount': '87.78',
  'offer.savePercent': '89%',
  'shop.name': 'FIXTURE-shop',
  'shop.address': 'FIXTURE-address',
  'shop.phone': 'FIXTURE-phone',
  'brand.name': 'FIXTURE-brandname',
  'book.title': 'FIXTURE-title',
  'book.validFrom': 'FIXTURE-from',
  'book.validTo': 'FIXTURE-to',
}

const key = (source: TextSource) =>
  `${source.from}.${'field' in source ? source.field : ''}`

describe('every text binding draws on the artboard', () => {
  it('has an expectation for every binding in the vocabulary', () => {
    expect(TEXT_BINDINGS.map(key).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const source of TEXT_BINDINGS) {
    it(`${key(source)} puts its own value on the artboard`, () => {
      expect(drawText(source)).toContain(EXPECTED[key(source)])
    })
  }

  it('draws a static line from the edition rather than from a subject', () => {
    const s: TextSource = { from: 'static', textEn: 'FIXTURE-en', textAr: 'FIXTURE-ar' }
    expect(drawText(s)).toContain('FIXTURE-en')
    expect(drawText(s, { ...CTX, ar: true, direction: 'rtl' })).toContain('FIXTURE-ar')
  })

  it('draws nothing rather than throwing when there is no product in scope', () => {
    // A header is a static block. §3.6 draws that line, and it is not an error.
    const headerCtx: DrawContext = { ...CTX, offer: undefined }
    for (const source of TEXT_BINDINGS) {
      if (source.from !== 'product' && source.from !== 'offer') continue
      expect(() => drawText(source, headerCtx)).not.toThrow()
      expect(drawText(source, headerCtx)).not.toContain('FIXTURE-')
    }
  })

  it('still draws the shop and the book on a block with no product', () => {
    const headerCtx: DrawContext = { ...CTX, offer: undefined }
    for (const source of TEXT_BINDINGS) {
      if (source.from === 'product' || source.from === 'offer') continue
      expect(drawText(source, headerCtx)).toContain(EXPECTED[key(source)])
    }
  })
})

describe('every image binding draws on the artboard', () => {
  const drawImage = (source: BlockElement extends never ? never : (typeof IMAGE_BINDINGS)[number]) => {
    const element: BlockElement = {
      id: 'i',
      kind: 'image',
      source,
      box: { start: 0, top: 0, width: 1, height: 1 },
    }
    return renderToStaticMarkup(<svg>{drawElement(element, BOX, CTX)}</svg>)
  }

  it('draws the product packshot from its own url', () => {
    expect(drawImage({ from: 'product' })).toContain('FIXTURE-packshot')
  })

  it('draws the brand logo, which used to be a kind of its own', () => {
    // E14 §3.1. The whole point of folding it in is that it is an image and
    // every image property applies to it.
    expect(drawImage({ from: 'brand', field: 'logo' })).toContain('FIXTURE-logo')
  })

  it('reaches its box rather than being inset like a packshot', () => {
    // A mark inset by 12% inside a header already sized for it reads as a mark
    // that did not fit.
    const logo = drawImage({ from: 'brand', field: 'logo' })
    expect(logo).toContain(`width="${BOX.width}"`)
    expect(drawImage({ from: 'product' })).not.toContain(`width="${BOX.width}"`)
  })
})

/**
 * Paint — E14 §2.4, Phase 3.
 *
 * Two of these are rules that are invisible until they are wrong: a stroke
 * painted in the default order reads as "the bold prices look thin in the PDF",
 * and a shadow drawn with a filter reads as nothing at all until somebody
 * prints one.
 */
describe('paint', () => {
  const box = { x: 0, y: 0, width: 300, height: 80 }
  const ROLE = { from: 'role' as const, ref: 'primary' as const }

  const draw = (element: BlockElement, ctx: DrawContext = CTX) =>
    renderToStaticMarkup(<svg>{drawElement(element, box, ctx)}</svg>)

  const shape = (over: Record<string, unknown>): BlockElement =>
    ({ id: 's', kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, radius: 4, ...over }) as BlockElement

  const text = (over: Record<string, unknown>): BlockElement =>
    ({
      id: 't',
      kind: 'text',
      box: { start: 0, top: 0, width: 1, height: 1 },
      source: { from: 'static', textEn: 'SAVE 20%', textAr: 'SAVE 20%' },
      level: 'h3',
      align: 'start',
      ...over,
    }) as BlockElement

  describe('an outline-only shape', () => {
    it('draws no fill when the document names none', () => {
      const out = draw(shape({ stroke: { color: ROLE, width: 0.01 } }))
      expect(out).toContain('fill="none"')
    })

    it('still draws its stroke', () => {
      // The whole point: `opacity` cannot express this, because it fades the
      // stroke along with the fill.
      expect(draw(shape({ stroke: { color: ROLE, width: 0.01 } }))).toContain('stroke=')
    })

    it('draws a fill when there is one', () => {
      expect(draw(shape({ fill: ROLE }))).not.toContain('fill="none"')
    })
  })

  describe('an outline on text', () => {
    it('paints the stroke before the fill', () => {
      // **The rule that is invisible until it is wrong.** SVG centres a stroke,
      // so painted in the default order half of it falls inside the glyph and
      // is lost into the counters — the digits come out thin and muddy at
      // exactly the size a price is read.
      expect(draw(text({ stroke: { color: ROLE, width: 0.01 } }))).toContain(
        'paint-order="stroke fill"'
      )
    })

    it('doubles the declared width, so the width is the outline you see', () => {
      // Stroke-first, the fill covers the inner half and what survives is an
      // outside outline of half the declared width. So `stroke.width` means the
      // visible outline and the painter is what makes that true.
      const out = draw(text({ stroke: { color: ROLE, width: 0.01 } }))
      expect(out).toContain(`stroke-width="${0.01 * CTX.blockSize * 2}"`)
    })

    it('draws no stroke attributes when there is no outline', () => {
      expect(draw(text({}))).not.toContain('paint-order')
    })
  })

  describe('a shadow', () => {
    const shadow = { x: 0.01, y: 0.015, blur: 0.02, color: ROLE }

    it('draws as concentric copies rather than a filter', () => {
      // Every filter Chromium offers rasterizes at a resolution nothing in the
      // document can set, and one over text takes the font out of the PDF.
      const out = draw(shape({ fill: ROLE, shadow }))
      expect(out).not.toContain('feDropShadow')
      expect(out).not.toContain('feGaussianBlur')
      expect(out).not.toContain('drop-shadow')
      expect((out.match(/fill-opacity=/g) ?? []).length).toBeGreaterThan(8)
    })

    it('paints underneath the element', () => {
      const out = draw(shape({ fill: ROLE, shadow }))
      expect(out.indexOf('fill-opacity=')).toBeLessThan(out.lastIndexOf('<rect'))
    })

    it('becomes more paths at print resolution, for the same document', () => {
      const rings = (dpi: number) =>
        (draw(shape({ fill: ROLE, shadow }), { ...CTX, dpi }).match(/fill-opacity=/g) ?? []).length
      expect(rings(300)).toBeGreaterThan(rings(96))
    })

    it('is one copy when the blur is zero', () => {
      const out = draw(shape({ fill: ROLE, shadow: { ...shadow, blur: 0 } }))
      expect((out.match(/fill-opacity=/g) ?? []).length).toBe(1)
    })

    it('does not mirror its offset in an Arabic edition', () => {
      // §5.5: paint order, images, rotation, text runs and shadow offsets never
      // mirror. Bidi is the shaper's job; a shadow is light direction.
      const ltr = draw(shape({ fill: ROLE, shadow: { ...shadow, blur: 0 } }))
      const rtl = draw(shape({ fill: ROLE, shadow: { ...shadow, blur: 0 } }), {
        ...CTX,
        ar: true,
        direction: 'rtl',
      })
      const offset = (out: string) => /<rect x="([-0-9.]+)"/.exec(out)?.[1]
      expect(offset(rtl)).toBe(offset(ltr))
    })

    it('casts a text shadow as strokes on the string, keeping it text', () => {
      // A glyph has no box to expand, so each ring is the string again under a
      // wider stroke. It stays selectable and searchable in the PDF, which is
      // the whole reason a filter is not used.
      const out = draw(text({ shadow: { ...shadow, blur: 0 } }))
      expect((out.match(/<text/g) ?? []).length).toBe(2)
      expect(out).not.toContain('drop-shadow')
    })

    it('casts an outline-only shape from its outline, not its silhouette', () => {
      // **The rings are filled copies of the shape**, which is right while the
      // shape is filled and visibly wrong the moment it is not: the shadow
      // shows *through* the hole, so a hairline rule box comes out a grey
      // panel. What casts a shadow is whatever draws.
      const out = draw(shape({ stroke: { color: ROLE, width: 0.006 }, shadow }))
      expect(out).toContain('stroke-opacity')
      expect(out).not.toContain('fill-opacity')
    })

    it('still casts from the silhouette when there is a fill', () => {
      const out = draw(shape({ fill: ROLE, shadow }))
      expect(out).toContain('fill-opacity')
      expect(out).not.toContain('stroke-opacity')
    })

    it('casts nothing from a shape that draws nothing', () => {
      // An element with neither a fill nor a border is not
      // invisible-with-a-shadow; it is invisible. (The shape itself still
      // emits its own empty node, which draws nothing either.)
      const out = draw(shape({ shadow }))
      expect(out).not.toContain('fill-opacity')
      expect(out).not.toContain('stroke-opacity')
    })

    it('draws nothing extra when there is no shadow', () => {
      expect(draw(shape({ fill: ROLE }))).not.toContain('fill-opacity=')
    })
  })
})

/**
 * The designer canvas has something to lay out for every binding.
 *
 * **You cannot position what you cannot see.** An element bound to a field the
 * sample leaves empty draws nothing — the owner drags on a size line, gets an
 * empty dashed box, and cannot tell how tall it is, where it breaks, or how it
 * sits against its neighbours. Three bindings were in that state at once:
 * `product.origin` and `product.packSize` had no sample value, and the whole
 * `book` subject has nothing behind it because a block is designed before it
 * meets a book.
 *
 * `apps/web/CLAUDE.md` settles which way to fix it — *bound components render
 * sample data, never field names* — so this asserts a **value**, not a label.
 */
describe('the designer canvas', () => {
  const ctx: DrawContext = {
    ...CTX,
    offer: toArtboardOffer(TYPICAL_PRODUCT, false),
    ...artboardIdentity({
      shop: { name: 'Al Nakheel Market', location: null, phone: null },
      samples: true,
    }),
  }

  for (const source of TEXT_BINDINGS) {
    it(`${key(source)} has sample content to lay out`, () => {
      const element: BlockElement = {
        id: 't',
        kind: 'text',
        source,
        level: 'body',
        align: 'start',
        box: { start: 0, top: 0, width: 1, height: 1 },
      }
      const out = renderToStaticMarkup(<svg>{drawElement(element, BOX, ctx)}</svg>)
      // Something was drawn, and it is not the binding's name.
      expect(out).toContain('<text')
      expect(out).not.toContain(labelFor(source))
    })
  }

  it('fills a shop’s empty address and phone from the sample', () => {
    // A real shop may carry neither, and a header bound to one is still a
    // header somebody has to lay out.
    expect(ctx.shop.address).not.toBe('')
    expect(ctx.shop.phone).not.toBe('')
  })

  it('does not invent them for a real book', () => {
    // **The bound that makes the sample safe.** An invented address under a
    // real shop's name is a lie a customer could act on.
    const real = artboardIdentity({
      shop: { name: 'Al Nakheel Market', location: null, phone: null },
    })
    expect(real.shop.address).toBe('')
    expect(real.shop.phone).toBe('')
    expect(real.book.validFrom).toBe('')
  })
})

/**
 * The palette makes what the painter draws.
 *
 * **Three places had to learn that `logo` is an image**, and only two did: the
 * seeded library was regenerated and every stored block was converted, while
 * the palette went on making the dead kind — so every logo an owner added drew
 * a blank box that no binding reached and no control could rebind. E14 §3.1.
 */
describe('the elements the palette makes', () => {
  it('makes a logo as an image bound to the brand', () => {
    expect(FREE_ELEMENTS.logo()).toMatchObject({
      kind: 'image',
      source: { from: 'brand', field: 'logo' },
      fit: 'contain',
    })
  })

  it('draws the shop’s mark when there is one', () => {
    const out = renderToStaticMarkup(<svg>{drawElement(FREE_ELEMENTS.logo(), BOX, CTX)}</svg>)
    expect(out).toContain('FIXTURE-logo')
  })

  it('reserves a slot when the shop has no logo yet', () => {
    // **The common case on day one**, and §8 left it open between collapsing
    // and reserving. An element that draws nothing cannot be positioned, so a
    // header would be designed around a hole the owner never sees.
    const noLogo: DrawContext = { ...CTX, brand: { name: 'Al Nakheel', logo: null } }
    const out = renderToStaticMarkup(<svg>{drawElement(FREE_ELEMENTS.logo(), BOX, noLogo)}</svg>)
    expect(out).toContain('<rect')
  })

  it('does not draw a box for an upload that has not loaded', () => {
    // The distinction that keeps the rule above honest: "no photograph" is a
    // fact about the catalog, and saying it about a background the owner chose
    // would be wrong.
    const artwork: BlockElement = {
      id: 'a',
      kind: 'image',
      source: { from: 'asset', assetId: 'missing' },
      box: { start: 0, top: 0, width: 1, height: 1 },
    }
    const out = renderToStaticMarkup(<svg>{drawElement(artwork, BOX, CTX)}</svg>)
    expect(out).toBe('<svg></svg>')
  })
})
