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
import { TEXT_BINDINGS, IMAGE_BINDINGS } from '@souqstudio/engine'
import { toPriceMark } from '@souqstudio/engine'
import { resolveScale } from '@/lib/brand-fonts'
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
}

const CTX: DrawContext = {
  uid: 'test',
  token: () => '#1B4D3E',
  scale: resolveScale(KIT),
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
