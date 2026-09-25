import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import {
  applyFill,
  charBudget,
  designAspect,
  fillSlots,
  fillTargets,
  interpretFill,
  isFreeText,
  type FreeTextElement,
} from './copy-fill'

/**
 * Generative fill. What it may write over is the part worth testing: a fill
 * that rewrote a bound line or a locked one would put a model's words where
 * the owner's data or the owner's decision was.
 */

const box = { start: 0, top: 0, width: 1, height: 0.2 }

function text(
  id: string,
  source: Extract<BlockElement, { kind: 'text' }>['source'],
  extra: Partial<Extract<BlockElement, { kind: 'text' }>> = {}
): BlockElement {
  return { id, kind: 'text', box, level: 'h1', align: 'start', source, ...extra }
}

const headline = text('headline', { from: 'static', textEn: 'Your text', textAr: 'النص' })
const shopName = text('shop', { from: 'shop', field: 'name' })
const brandName = text('brand', { from: 'brand', field: 'name' })
const locked = text('legal', { from: 'static', textEn: 'T&Cs apply', textAr: 'تطبق الشروط' }, {
  locked: true,
})
const logo: BlockElement = { id: 'logo', kind: 'logo', box }

const all = [headline, shopName, brandName, locked, logo]

describe('fillTargets', () => {
  it('takes every free line when nothing is selected', () => {
    expect(fillTargets(all, []).map((e) => e.id)).toEqual(['headline'])
  })

  it('never takes bound text, whatever it is bound to', () => {
    // `isBound` in block-edit says shop and brand text is not bound, on
    // purpose, for a different question. It is not the test here.
    expect(isFreeText(shopName)).toBe(false)
    expect(isFreeText(brandName)).toBe(false)
  })

  it('leaves locked text alone', () => {
    expect(isFreeText(locked)).toBe(false)
  })

  it('takes only the selection when there is one', () => {
    const second = text('second', { from: 'static', textEn: 'More', textAr: 'المزيد' })
    expect(fillTargets([headline, second], [second]).map((e) => e.id)).toEqual(['second'])
  })

  it('does not widen a selection with no free text to the whole block', () => {
    expect(fillTargets(all, [logo, shopName])).toEqual([])
  })
})

describe('charBudget', () => {
  const h1 = headline as FreeTextElement

  it('gives a wide band more room than a square at the same fraction', () => {
    expect(charBudget(h1, 6)).toBeGreaterThan(charBudget(h1, 1))
  })

  it('gives small print more room than a headline in the same box', () => {
    expect(charBudget({ ...h1, level: 'caption' }, 1)).toBeGreaterThan(charBudget(h1, 1))
  })

  it('stays inside the column limit and above a usable floor', () => {
    expect(charBudget({ ...h1, level: 'caption' }, 400)).toBe(280)
    expect(charBudget({ ...h1, box: { ...box, width: 0.01 } }, 1)).toBe(6)
  })

  it('falls back to square for an open range', () => {
    expect(designAspect({ aspectMin: 0, aspectMax: Infinity })).toBe(1)
    expect(designAspect({ aspectMin: 4, aspectMax: 9 })).toBe(6)
  })
})

describe('interpretFill', () => {
  const slots = fillSlots([headline as FreeTextElement], 1)

  it('keeps lines for the ids that were asked about', () => {
    const reply = {
      lines: [
        { id: 'headline', textEn: 'Fresh every morning', textAr: 'طازج كل صباح' },
        { id: 'shop', textEn: 'Not asked', textAr: 'لم يطلب' },
      ],
    }
    expect(interpretFill(reply, slots)).toEqual([
      { id: 'headline', textEn: 'Fresh every morning', textAr: 'طازج كل صباح' },
    ])
  })

  it('drops a line missing either language', () => {
    const reply = { lines: [{ id: 'headline', textEn: 'Fresh', textAr: '  ' }] }
    expect(interpretFill(reply, slots)).toEqual([])
  })

  it('recasts em dashes in each script, and keeps a numeric range', () => {
    const reply = {
      lines: [{ id: 'headline', textEn: 'Fresh — daily, 2–4 kg', textAr: 'طازج — يوميا' }],
    }
    expect(interpretFill(reply, slots)).toEqual([
      { id: 'headline', textEn: 'Fresh, daily, 2–4 kg', textAr: 'طازج، يوميا' },
    ])
  })

  it('returns nothing for a reply that is not the shape', () => {
    expect(interpretFill({ text: 'hello' }, slots)).toEqual([])
    expect(interpretFill(null, slots)).toEqual([])
  })
})

describe('applyFill', () => {
  const line = { id: 'headline', textEn: 'Weekend deals', textAr: 'عروض نهاية الأسبوع' }

  it('writes every layout the element appears in, and marks it', () => {
    const arrangements: Arrangement[] = [
      { aspectMin: 1, aspectMax: 2, elements: [headline, shopName] },
      { aspectMin: 2, aspectMax: 6, elements: [structuredClone(headline)] },
    ]

    const filled = applyFill(arrangements, [line])

    for (const arrangement of filled) {
      const written = arrangement.elements.find((e) => e.id === 'headline')
      expect(written?.kind === 'text' ? written.source : null).toEqual({
        from: 'static',
        textEn: 'Weekend deals',
        textAr: 'عروض نهاية الأسبوع',
        machine: true,
      })
    }
    expect(filled[0]?.elements[1]).toBe(shopName)
  })

  it('does not write over text that became bound or locked while the job ran', () => {
    const rebound = text('headline', { from: 'book', field: 'title' })
    const relocked = { ...headline, locked: true } as BlockElement
    const arrangements: Arrangement[] = [{ aspectMin: 1, aspectMax: 1, elements: [rebound] }]

    expect(applyFill(arrangements, [line])[0]?.elements[0]).toBe(rebound)
    expect(
      applyFill([{ aspectMin: 1, aspectMax: 1, elements: [relocked] }], [line])[0]?.elements[0]
    ).toBe(relocked)
  })
})
