import { beforeEach, describe, expect, it } from 'vitest'
import type { Arrangement, BlockElement } from '@souqstudio/types'
import { useDesignerStore } from './designer-store'

const box = { start: 0.1, top: 0.1, width: 0.5, height: 0.2 }
const text = (id: string): BlockElement => ({
  id,
  kind: 'text',
  box,
  source: { from: 'static', textEn: id, textAr: id },
  level: 'h3',
  align: 'start',
})

// A block copied from the library: four layouts, and the owner has redesigned
// only the tall one.
const TALL: Arrangement = { aspectMin: 0.35, aspectMax: 0.85, elements: [text('brand pill'), text('tag')] }
const SQUARE: Arrangement = { aspectMin: 0.85, aspectMax: 1.35, elements: [text('old design')] }

const hydrate = (editable = true) =>
  useDesignerStore.getState().hydrate({
    blockId: 'b1',
    name: 'Card',
    repeats: true,
    status: 'draft',
    editable,
    arrangements: [TALL, SQUARE],
  })

describe('copying one layout into another', () => {
  beforeEach(() => hydrate())

  it('gives the open layout the other one\'s elements, and keeps its own shape', () => {
    useDesignerStore.getState().selectArrangement(1)
    useDesignerStore.getState().copyLayoutFrom(0)
    const square = useDesignerStore.getState().arrangements[1]
    expect(square?.elements.map((element) => element.id)).toEqual(['brand pill', 'tag'])
    expect([square?.aspectMin, square?.aspectMax]).toEqual([0.85, 1.35])
  })

  it('copies rather than shares, so editing one layout leaves the other alone', () => {
    useDesignerStore.getState().selectArrangement(1)
    useDesignerStore.getState().copyLayoutFrom(0)
    const [tall, square] = useDesignerStore.getState().arrangements
    expect(square?.elements[0]).not.toBe(tall?.elements[0])
  })

  it('is one step to undo', () => {
    useDesignerStore.getState().selectArrangement(1)
    useDesignerStore.getState().copyLayoutFrom(0)
    useDesignerStore.getState().undo()
    expect(useDesignerStore.getState().arrangements[1]?.elements.map((e) => e.id)).toEqual([
      'old design',
    ])
  })

  it('does nothing on a block that opens read-only', () => {
    hydrate(false)
    useDesignerStore.getState().selectArrangement(1)
    useDesignerStore.getState().copyLayoutFrom(0)
    expect(useDesignerStore.getState().arrangements[1]?.elements.map((e) => e.id)).toEqual([
      'old design',
    ])
  })
})
