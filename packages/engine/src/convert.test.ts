import { describe, expect, it } from 'vitest'
import type { Arrangement, Block, BlockElement } from '@souqstudio/types'
import { convertArrangement, conversionNotes, convertBlock } from './convert'
import { resolveBlock } from './render'
import { solve, findSolved, type MeasureLeaf } from './solve'
import { validateFrame } from './frame'

const DESIGN = { width: 400, height: 500 }

const NEVER_MEASURED: MeasureLeaf = (leaf) => {
  throw new Error(`nothing in a converted tree should be measured: ${leaf.id}`)
}

/** A real text element, not a cast: every field the union requires is here. */
function textElement(id: string, box: BlockElement['box']): BlockElement {
  return {
    id,
    box,
    kind: 'text',
    // Both languages: the schema refuses a static string carrying one without
    // the other, because every shop's book is bilingual.
    source: { from: 'static', textEn: id, textAr: id },
    level: 'body',
    align: 'start',
  }
}

function arrangement(elements: BlockElement[]): Arrangement {
  return { aspectMin: 0.1, aspectMax: 10, elements }
}

function blockOf(elements: BlockElement[]): Block {
  return {
    id: 'blk_test',
    organizationId: null,
    name: 'Test',
    repeats: true,
    arrangements: [arrangement(elements)],
    thumbnailUrl: null,
  }
}

describe('convertArrangement', () => {
  it('makes a free frame at the design size', () => {
    const { converted } = convertArrangement(
      'blk_test',
      arrangement([textElement('a', { start: 0, top: 0, width: 1, height: 1 })]),
      0,
      DESIGN
    )
    expect(converted.root.layout).toEqual({ mode: 'free' })
    expect(converted.root.width).toEqual({ kind: 'fixed', value: 400 })
    expect(converted.root.height).toEqual({ kind: 'fixed', value: 500 })
  })

  it('carries the aspect range through unchanged', () => {
    const { converted } = convertArrangement('blk_test', arrangement([]), 0, DESIGN)
    expect(converted.aspectMin).toBe(0.1)
    expect(converted.aspectMax).toBe(10)
  })

  it('gives every leaf the element id as its ref, which is the painter join', () => {
    const { converted } = convertArrangement(
      'blk_test',
      arrangement([textElement('price', { start: 0, top: 0, width: 0.5, height: 0.2 })]),
      0,
      DESIGN
    )
    const leaf = converted.root.children[0]
    expect(leaf?.id).toBe('price')
    expect(leaf?.kind === 'leaf' ? leaf.ref : null).toBe('price')
  })

  it('keeps the element box untouched, because that is what makes it lossless', () => {
    const box = { start: 0.25, top: 0.1, width: 0.5, height: 0.3 }
    const { converted } = convertArrangement('blk_test', arrangement([textElement('a', box)]), 0, DESIGN)
    expect(converted.root.children[0]?.box).toEqual(box)
  })

  it('produces a tree that validates', () => {
    const { converted } = convertArrangement(
      'blk_test',
      arrangement([
        textElement('a', { start: 0, top: 0, width: 0.5, height: 0.5 }),
        textElement('b', { start: 0.5, top: 0.5, width: 0.5, height: 0.5 }),
      ]),
      0,
      DESIGN
    )
    expect(validateFrame(converted.root)).toEqual([])
  })
})

describe('the conversion is lossless', () => {
  const elements = [
    textElement('a', { start: 0, top: 0, width: 0.4, height: 0.2 }),
    textElement('b', { start: 0.5, top: 0.3, width: 0.5, height: 0.25 }),
    // A chip anchored past the edge: overhang has to survive the move.
    textElement('over', { start: -0.1, top: -0.05, width: 0.3, height: 0.2 }),
  ]

  for (const direction of ['ltr', 'rtl'] as const) {
    it(`puts every element exactly where resolveBlock did (${direction})`, () => {
      const block = blockOf(elements)
      const old = resolveBlock(block, { x: 0, y: 0, ...DESIGN }, direction)
      const root = convertBlock(block, DESIGN).arrangements[0]?.root

      expect(root).toBeDefined()
      if (root === undefined) return
      const solved = solve(root, DESIGN, NEVER_MEASURED, { direction })

      for (const entry of old.elements) {
        const after = findSolved(solved, entry.element.id)
        // Exactly equal, not close: both paths run the same arithmetic on the
        // same numbers, so a difference would mean one of them changed.
        expect(after?.rect).toEqual(entry.rect)
      }
    })
  }

  it('never asks the measurer anything, because nothing in the tree hugs', () => {
    const block = blockOf(elements)
    const root = convertBlock(block, DESIGN).arrangements[0]?.root
    if (root === undefined) throw new Error('no root')
    // NEVER_MEASURED throws. Reaching the end is the assertion.
    expect(() => solve(root, DESIGN, NEVER_MEASURED, { direction: 'ltr' })).not.toThrow()
  })
})

describe('composite elements', () => {
  const priceMark: BlockElement = {
    id: 'mark',
    box: { start: 0, top: 0, width: 0.5, height: 0.3 },
    kind: 'priceMark',
  }

  it('records a note rather than converting silently', () => {
    const { notes } = convertArrangement('blk_test', arrangement([priceMark]), 0, DESIGN)
    expect(notes).toHaveLength(1)
    expect(notes[0]?.kind).toBe('priceMark')
    expect(notes[0]?.elementId).toBe('mark')
    // The reason names why, so Phase 6 does not rediscover it.
    expect(notes[0]?.reason).toMatch(/amount/)
  })

  it('still places it at its own box, so the geometry is unchanged', () => {
    const block = blockOf([priceMark])
    const old = resolveBlock(block, { x: 0, y: 0, ...DESIGN }, 'ltr')
    const root = convertBlock(block, DESIGN).arrangements[0]?.root
    if (root === undefined) throw new Error('no root')
    const solved = solve(root, DESIGN, NEVER_MEASURED, { direction: 'ltr' })
    expect(findSolved(solved, 'mark')?.rect).toEqual(old.elements[0]?.rect)
  })

  it('writes no note for an ordinary element', () => {
    const { notes } = convertArrangement(
      'blk_test',
      arrangement([textElement('a', { start: 0, top: 0, width: 1, height: 1 })]),
      0,
      DESIGN
    )
    expect(notes).toEqual([])
  })
})

describe('convertBlock', () => {
  it('converts every arrangement and indexes the root by block and index', () => {
    const block: Block = {
      ...blockOf([textElement('a', { start: 0, top: 0, width: 1, height: 1 })]),
      arrangements: [
        arrangement([textElement('a', { start: 0, top: 0, width: 1, height: 1 })]),
        arrangement([textElement('b', { start: 0, top: 0, width: 1, height: 1 })]),
      ],
    }
    const converted = convertBlock(block, DESIGN)
    expect(converted.arrangements).toHaveLength(2)
    expect(converted.arrangements[0]?.root.id).toBe('blk_test#0')
    expect(converted.arrangements[1]?.root.id).toBe('blk_test#1')
  })

  it('collects every element so the painter can look one up by ref', () => {
    const block = blockOf([
      textElement('a', { start: 0, top: 0, width: 1, height: 1 }),
      textElement('b', { start: 0, top: 0, width: 1, height: 1 }),
    ])
    expect(Object.keys(convertBlock(block, DESIGN).elements).sort()).toEqual(['a', 'b'])
  })

  it('carries the design size on the result', () => {
    expect(convertBlock(blockOf([]), DESIGN).designSize).toEqual(DESIGN)
  })

  it('gathers notes across a library', () => {
    const block = blockOf([
      { id: 'm', box: { start: 0, top: 0, width: 1, height: 1 }, kind: 'priceMark' },
    ])
    expect(conversionNotes([convertBlock(block, DESIGN)])).toHaveLength(1)
  })
})
