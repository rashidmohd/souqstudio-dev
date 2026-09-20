import { describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { countLogoElements, foldLogoElement, foldLogoElements } from './convert-logo'

const BOX = { start: 0.04, top: 0.04, width: 0.18, height: 0.14 }
const logo = (over: Partial<BlockElement> = {}): BlockElement =>
  ({ id: 'l1', kind: 'logo', box: BOX, ...over }) as BlockElement

describe('foldLogoElement', () => {
  it('becomes an image bound to the brand logo', () => {
    const out = foldLogoElement(logo())
    expect(out).toEqual({
      id: 'l1',
      kind: 'image',
      box: BOX,
      source: { from: 'brand', field: 'logo' },
      fit: 'contain',
    })
  })

  it('keeps every field the old kind carried', () => {
    // All of them are on `ElementBase`, which is why the conversion is exact.
    const out = foldLogoElement(
      logo({ opacity: 0.6, rotation: -4, locked: true, groupId: 'g1' }),
    )
    expect(out).toMatchObject({ opacity: 0.6, rotation: -4, locked: true, groupId: 'g1' })
  })

  it('says `contain` rather than relying on the painter default', () => {
    // A mark cropped to fill its box has its edges cut off, and nobody would
    // read that as a regression in a converter.
    expect(foldLogoElement(logo())).toMatchObject({ fit: 'contain' })
  })

  it('returns anything else unchanged and identical', () => {
    // Identity, not equality: a converter that rebuilt every element would make
    // the gallery diff meaningless.
    const text: BlockElement = {
      id: 't1',
      kind: 'text',
      box: BOX,
      source: { from: 'shop', field: 'name' },
      level: 'h4',
      align: 'start',
    }
    expect(foldLogoElement(text)).toBe(text)
  })

  it('is idempotent — a converted block converts to itself', () => {
    // It runs over the seeded library at build and over stored documents once.
    // Running it twice must not be a second conversion.
    const once = foldLogoElement(logo())
    expect(foldLogoElement(once)).toBe(once)
  })
})

describe('foldLogoElements', () => {
  const arrangements = (): Arrangement[] => [
    { aspectMin: 0.4, aspectMax: 1, elements: [logo(), logo({ id: 'l2' })] },
    { aspectMin: 1, aspectMax: 6, elements: [logo({ id: 'l3' })] },
  ]

  it('converts every arrangement', () => {
    const out = foldLogoElements(arrangements())
    expect(countLogoElements(out)).toBe(0)
    expect(out.flatMap((a) => a.elements).every((e) => e.kind === 'image')).toBe(true)
  })

  it('leaves the aspect range alone', () => {
    const out = foldLogoElements(arrangements())
    expect(out.map((a) => [a.aspectMin, a.aspectMax])).toEqual([
      [0.4, 1],
      [1, 6],
    ])
  })

  it('counts what is left to do', () => {
    expect(countLogoElements(arrangements())).toBe(3)
    expect(countLogoElements(foldLogoElements(arrangements()))).toBe(0)
  })
})
