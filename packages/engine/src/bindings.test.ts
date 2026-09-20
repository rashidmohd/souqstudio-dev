/**
 * The test that walks the vocabulary. E14 §3.5.
 *
 * **`shop.phone` was in the vocabulary and absent from every painter for as
 * long as both had existed**, because a binding is declared in
 * `@souqstudio/types` and resolved in a painter and nothing checked that the
 * two lists matched. `shop.address` was the same. So were `product.origin` and
 * `product.packSize`, which nobody had noticed at all — the plan's Phase 1 does
 * not list them, and this test is what found them.
 *
 * **It iterates rather than listing cases**, and that is not a style
 * preference: a test that lists cases has to be edited when a binding is added,
 * which is the same defect as a painter that has to be edited when a binding is
 * added. Add a field to `TextSource` and this file fails on the day you add it.
 *
 * It renders through a real painter rather than calling the resolver, because
 * the resolver returning a string proves nothing about whether anything draws
 * it. `harness/svg.ts` is the painter that lives in this package;
 * `apps/web/components/blocks/draw.test.tsx` is the same test over the other one.
 */

import { describe, expect, it } from 'vitest'
import type { Block, BlockElement } from '@souqstudio/types'
import type { Placement } from './flow'
import {
  BINDING_LABEL,
  BOOK_FIELDS,
  BRAND_TEXT_FIELDS,
  IMAGE_BINDINGS,
  OFFER_FIELDS,
  PRODUCT_FIELDS,
  SHOP_FIELDS,
  TEXT_BINDINGS,
  bindingInScope,
  bindingKey,
  labelFor,
  resolveTextBinding,
  type BindingSubjects,
} from './bindings'
import { renderPage, type RenderContext } from '../harness/svg'
import type { HarnessProduct } from '../harness/product'

/**
 * A fixture where every subject is present and every value is distinctive.
 *
 * **Distinctive on purpose.** Asserting "something was drawn" catches a binding
 * nobody wired up; asserting *this* string was drawn also catches a binding
 * wired to the wrong field, which is the failure that looks like a design
 * decision rather than a bug.
 */
const PRODUCT: HarnessProduct = {
  id: 'fixture',
  nameEn: 'FIXTURE-name',
  nameAr: 'FIXTURE-name-ar',
  specEn: 'FIXTURE-spec',
  specAr: 'FIXTURE-spec-ar',
  brandEn: 'FIXTURE-brand',
  originEn: 'FIXTURE-origin',
  originAr: 'FIXTURE-origin-ar',
  packLabel: 'FIXTURE-pack',
  major: '11',
  minor: '22',
  currency: 'FIXTURE-currency',
  comparePrice: '99.00',
  tier: { labelEn: 'FIXTURE-tier', labelAr: 'FIXTURE-tier-ar', token: 'primary' },
  prefixLabel: 'PER_KG',
  unitPrice: 'FIXTURE-unit',
  source: 'dummy',
}

const IDENTITY = {
  shop: { name: 'FIXTURE-shop', address: 'FIXTURE-address', phone: 'FIXTURE-phone' },
  brand: { name: 'FIXTURE-brandname', logo: 'FIXTURE-logo' },
  book: { title: 'FIXTURE-title', validFrom: 'FIXTURE-from', validTo: 'FIXTURE-to' },
}

const SIZE = { width: 600, height: 800 }

/** One text element per binding, stacked so none overlaps and none is clipped. */
function blockOf(sources: readonly BlockElement[]): Block {
  return {
    id: 'vocabulary',
    organizationId: null,
    name: 'vocabulary',
    repeats: true,
    arrangements: [{ aspectMin: 0.1, aspectMax: 10, elements: [...sources] }],
    thumbnailUrl: null,
  }
}

function textElements(sources: readonly (typeof TEXT_BINDINGS)[number][]): BlockElement[] {
  const n = sources.length
  return sources.map((source, i) => ({
    id: `t${i}`,
    kind: 'text' as const,
    source,
    level: 'body' as const,
    align: 'start' as const,
    box: { start: 0.02, top: i / n, width: 0.96, height: 1 / n },
  }))
}

function render(elements: BlockElement[], direction: 'ltr' | 'rtl' = 'ltr'): string {
  const block = blockOf(elements)
  const placement: Placement = {
    sourceId: 'vocabulary',
    blockId: block.id,
    offerId: PRODUCT.id,
    kind: 'flow',
    rect: { x: 0, y: 0, width: SIZE.width, height: SIZE.height },
  }
  const ctx: RenderContext = {
    blocks: { [block.id]: block },
    products: { [PRODUCT.id]: PRODUCT },
    direction,
    ...IDENTITY,
  }
  return renderPage([placement], SIZE, ctx)
}

const subjects = (over: Partial<BindingSubjects> = {}): BindingSubjects => ({
  product: Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, `p-${f}`])) as BindingSubjects['product'],
  offer: Object.fromEntries(OFFER_FIELDS.map((f) => [f, `o-${f}`])) as BindingSubjects['offer'],
  shop: Object.fromEntries(SHOP_FIELDS.map((f) => [f, `s-${f}`])) as BindingSubjects['shop'],
  brand: Object.fromEntries(BRAND_TEXT_FIELDS.map((f) => [f, `b-${f}`])) as BindingSubjects['brand'],
  book: Object.fromEntries(BOOK_FIELDS.map((f) => [f, `k-${f}`])) as BindingSubjects['book'],
  ar: false,
  ...over,
})

describe('the vocabulary is enumerable', () => {
  it('lists every text binding the type permits', () => {
    // If a field is added to `TextSource` and not to the lists here, the schema
    // mirror in `document.ts` still passes and this does not.
    expect(TEXT_BINDINGS).toHaveLength(
      PRODUCT_FIELDS.length +
        OFFER_FIELDS.length +
        SHOP_FIELDS.length +
        BRAND_TEXT_FIELDS.length +
        BOOK_FIELDS.length,
    )
  })

  it('holds no duplicates', () => {
    const keys = TEXT_BINDINGS.map((b) => JSON.stringify(b))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has a label for every binding it offers', () => {
    // **The guard that keeps the designer's picker from falling behind.** Seven
    // bindings were added to `TextSource`, resolved in both painters and drawn
    // on a card while the picker went on offering the old eleven — so nothing
    // could be bound to them at all. A picker built from this list cannot
    // repeat that; a picker written as a literal list did.
    const missing = TEXT_BINDINGS.filter((b) => BINDING_LABEL[bindingKey(b)] === undefined)
    expect(missing.map(bindingKey)).toEqual([])
  })

  it('has a label for every image binding too', () => {
    const missing = IMAGE_BINDINGS.filter((b) => BINDING_LABEL[bindingKey(b)] === undefined)
    expect(missing.map(bindingKey)).toEqual([])
  })

  it('names the owner’s word rather than the schema’s', () => {
    // These are the words on the control. "spec" is a column name.
    expect(labelFor({ from: 'product', field: 'spec' })).toBe('Size or spec')
    expect(labelFor({ from: 'product', field: 'packSize' })).toBe('Pack size')
  })

  it('offers exactly one identity source', () => {
    // §3.2. `organization` is not a parallel entry and must never become one:
    // an owner asked to choose between two logos picks wrong for half their
    // branches.
    const identities = TEXT_BINDINGS.filter((b) => b.from === 'brand')
    expect(identities).toEqual([{ from: 'brand', field: 'name' }])
  })
})

describe('every text binding resolves', () => {
  for (const source of TEXT_BINDINGS) {
    it(`${source.from}.${'field' in source ? source.field : ''} resolves`, () => {
      expect(resolveTextBinding(source, subjects())).not.toBe('')
    })
  }

  it('resolves a static line from the edition, not from a subject', () => {
    const s = { from: 'static', textEn: 'EN', textAr: 'AR' } as const
    expect(resolveTextBinding(s, subjects({ ar: false }))).toBe('EN')
    expect(resolveTextBinding(s, subjects({ ar: true }))).toBe('AR')
  })

  it('returns empty rather than throwing when a subject is out of scope', () => {
    // A header has no product. That is §3.6's line, and it is not an error.
    const none = subjects({ product: undefined, offer: undefined })
    for (const source of TEXT_BINDINGS) {
      if (source.from !== 'product' && source.from !== 'offer') continue
      expect(resolveTextBinding(source, none)).toBe('')
    }
  })
})

/**
 * What the fixture makes each binding say, in the LTR edition.
 *
 * **A table rather than a loop over "is it non-empty"**, because non-empty
 * catches a binding nobody wired and misses a binding wired to the wrong field
 * — and the second failure looks like a design decision rather than a bug.
 *
 * Every entry here is derived from `PRODUCT` and `IDENTITY` above. Two are
 * computed rather than copied: the price joins the major and the minor the way
 * a single bound run holds them, and the save figures come out of the
 * arithmetic on 99.00 and 11.22.
 */
const EXPECTED: Record<string, string> = {
  'product.name': 'FIXTURE-name',
  'product.spec': 'FIXTURE-spec',
  'product.brand': 'FIXTURE-brand',
  'product.origin': 'FIXTURE-origin',
  'product.packSize': 'FIXTURE-pack',
  'offer.price': '11.22',
  'offer.currency': 'FIXTURE-currency',
  'offer.compare': '99.00',
  'offer.prefix': 'PER KG',
  'offer.tier': 'FIXTURE-tier',
  'offer.unitPrice': 'FIXTURE-unit',
  // 99.00 − 11.22 = 87.78, which is 89% of 99.00.
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

const key = (source: (typeof TEXT_BINDINGS)[number]) =>
  `${source.from}.${'field' in source ? source.field : ''}`

describe('every text binding draws', () => {
  it('has an expectation for every binding in the vocabulary', () => {
    // The guard on the guard. Add a binding and this fails before the loop
    // below silently skips it.
    expect(TEXT_BINDINGS.map(key).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  // The half a type system cannot see: whether a painter reads the field.
  for (const source of TEXT_BINDINGS) {
    it(`${key(source)} puts its own value on the page`, () => {
      const drawn = render(textElements([source]))
      expect(drawn).toContain(EXPECTED[key(source)])
    })
  }

  it('draws all of them together without one crowding out another', () => {
    // Rendered one per element in one block, which is how a real footer holds
    // three of these at once.
    const drawn = render(textElements([...TEXT_BINDINGS]))
    const missing = TEXT_BINDINGS.filter((s) => !drawn.includes(EXPECTED[key(s)] as string))
    expect(missing.map(key)).toEqual([])
  })

  it('leaves both save figures empty when there is no was-price', () => {
    // §3.7: conditional content without a predicate in the engine.
    // `exactOptionalPropertyTypes`: an absent was-price is the key being gone,
    // not the key holding `undefined`, and that distinction is the point here.
    const { comparePrice: _dropped, ...noCompare } = PRODUCT
    const block = blockOf(
      textElements([
        { from: 'offer', field: 'saveAmount' },
        { from: 'offer', field: 'savePercent' },
      ]),
    )
    const out = renderPage(
      [
        {
          sourceId: 'v',
          blockId: block.id,
          offerId: noCompare.id,
          kind: 'flow',
          rect: { x: 0, y: 0, width: SIZE.width, height: SIZE.height },
        },
      ],
      SIZE,
      {
        blocks: { [block.id]: block },
        products: { [noCompare.id]: noCompare },
        direction: 'ltr',
        ...IDENTITY,
      },
    )
    expect(out).not.toContain('87.78')
    expect(out).not.toContain('89%')
  })

  it('draws the Arabic side of every bilingual binding', () => {
    const ar = render(textElements([...TEXT_BINDINGS]), 'rtl')
    for (const s of ['FIXTURE-name-ar', 'FIXTURE-spec-ar', 'FIXTURE-origin-ar', 'FIXTURE-tier-ar']) {
      expect(ar).toContain(s)
    }
  })
})

describe('every image binding draws', () => {
  for (const source of IMAGE_BINDINGS) {
    it(`${source.from}${'field' in source ? `.${source.field}` : ''} puts a box on the page`, () => {
      const out = render([
        {
          id: 'i0',
          kind: 'image',
          source,
          box: { start: 0.1, top: 0.1, width: 0.8, height: 0.8 },
        },
      ])
      // The harness draws placeholders, so the assertion is that the box names
      // the binding it is standing in for rather than saying "image" for both.
      expect(out).toContain(source.from === 'brand' ? 'FIXTURE-logo' : 'FIXTURE-brand')
    })
  }
})

describe('scope', () => {
  it('withholds product and offer from a block that does not repeat', () => {
    for (const source of TEXT_BINDINGS) {
      const expected = source.from !== 'product' && source.from !== 'offer'
      expect(bindingInScope(source, false)).toBe(expected)
    }
  })

  it('offers everything to a repeating block', () => {
    for (const source of [...TEXT_BINDINGS, ...IMAGE_BINDINGS]) {
      expect(bindingInScope(source, true)).toBe(true)
    }
  })
})
