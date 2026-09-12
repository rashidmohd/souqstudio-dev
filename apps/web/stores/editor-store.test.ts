import { beforeEach, describe, expect, it } from 'vitest'
import type { ComposedOffer } from '@/lib/offer-book-compose'
import { useEditorStore } from '@/stores/editor-store'

/**
 * The editor's undo stack and the quality flag the renderer feeds back into it.
 *
 * A plain Zustand store, so it is testable without a DOM — which is most of why
 * E6-01 puts the *logical* state here and leaves the visual state to the canvas.
 */

const offer = (id: string, over: Partial<ComposedOffer> = {}): ComposedOffer => ({
  id,
  position: 0,
  name: 'Basmati rice',
  spec: null,
  brand: null,
  imageUrl: null,
  priceMark: {
    tierId: 'tier_deal',
    major: '24',
    minor: '50',
    currency: 'AED',
    currencyPlacement: 'PREFIX',
    shape: 'TAG',
  },
  tierLabel: 'Deal',
  tierToken: 'accent',
  unitPrice: null,
  unitPriceMode: 'AUTO',
  unitPriceValue: null,
  unitPriceUnit: null,
  legalLines: [],
  chips: [],
  footnotes: [],
  flags: [],
  items: [],
  ...over,
})

const step = (offerId: string) => ({
  offerId,
  label: 'the price',
  undo: { price: '10.00' },
  redo: { price: '12.00' },
  before: { flags: ['no-price'] as ComposedOffer['flags'] },
  after: { flags: [] as ComposedOffer['flags'] },
})

beforeEach(() => {
  useEditorStore.setState({
    bookId: '',
    offers: {},
    order: [],
    selectedOfferId: null,
    save: 'idle',
    savedAt: null,
    failed: [],
    past: [],
    future: [],
  })
  useEditorStore.getState().hydrate({ bookId: 'book_1', offers: [offer('off_1'), offer('off_2')] })
})

describe('undo and redo', () => {
  it('starts with nothing to undo', () => {
    expect(useEditorStore.getState().takeUndo()).toBeNull()
    expect(useEditorStore.getState().takeRedo()).toBeNull()
  })

  it('hands back the last step and applies what the card looked like before', () => {
    useEditorStore.getState().push(step('off_1'))

    const taken = useEditorStore.getState().takeUndo()
    expect(taken?.undo).toEqual({ price: '10.00' })
    expect(useEditorStore.getState().offers.off_1?.flags).toEqual(['no-price'])
  })

  it('selects the card it changed, so the owner can see which one moved', () => {
    useEditorStore.getState().push(step('off_2'))
    useEditorStore.getState().takeUndo()
    expect(useEditorStore.getState().selectedOfferId).toBe('off_2')
  })

  it('redoes what it undid', () => {
    useEditorStore.getState().push(step('off_1'))
    useEditorStore.getState().takeUndo()

    const redone = useEditorStore.getState().takeRedo()
    expect(redone?.redo).toEqual({ price: '12.00' })
    expect(useEditorStore.getState().offers.off_1?.flags).toEqual([])
    expect(useEditorStore.getState().past).toHaveLength(1)
  })

  it('abandons the redo branch on a new edit', () => {
    // Otherwise an owner can redo their way into a book that never existed.
    useEditorStore.getState().push(step('off_1'))
    useEditorStore.getState().takeUndo()
    useEditorStore.getState().push(step('off_2'))

    expect(useEditorStore.getState().future).toEqual([])
  })

  it('holds at most fifty steps', () => {
    for (let i = 0; i < 60; i += 1) useEditorStore.getState().push(step('off_1'))
    expect(useEditorStore.getState().past).toHaveLength(50)
  })

  it('survives a re-hydration of the same book', () => {
    // The server component re-renders after adding an offer or reordering, and
    // dropping the history there would take away the undo for the price the
    // owner typed thirty seconds ago.
    useEditorStore.getState().push(step('off_1'))
    useEditorStore.getState().hydrate({ bookId: 'book_1', offers: [offer('off_1')] })

    expect(useEditorStore.getState().past).toHaveLength(1)
  })

  it('drops steps for offers that are gone, and everything on a different book', () => {
    useEditorStore.getState().push(step('off_2'))
    useEditorStore.getState().hydrate({ bookId: 'book_1', offers: [offer('off_1')] })
    expect(useEditorStore.getState().past).toEqual([])

    useEditorStore.getState().push(step('off_1'))
    useEditorStore.getState().hydrate({ bookId: 'book_2', offers: [offer('off_1')] })
    expect(useEditorStore.getState().past).toEqual([])
  })
})

describe('markEscalated', () => {
  it('adds the flag to the offers the ladder gave up on', () => {
    useEditorStore.getState().markEscalated(['off_1'])
    expect(useEditorStore.getState().offers.off_1?.flags).toEqual(['fit-escalated'])
    expect(useEditorStore.getState().offers.off_2?.flags).toEqual([])
  })

  it('clears the flag when the card starts fitting again', () => {
    useEditorStore.getState().markEscalated(['off_1'])
    useEditorStore.getState().markEscalated([])
    expect(useEditorStore.getState().offers.off_1?.flags).toEqual([])
  })

  it('leaves the other flags alone', () => {
    useEditorStore.getState().hydrate({
      bookId: 'book_1',
      offers: [offer('off_1', { flags: ['no-price'] })],
    })
    useEditorStore.getState().markEscalated(['off_1'])
    expect(useEditorStore.getState().offers.off_1?.flags).toEqual(['no-price', 'fit-escalated'])
  })

  it('returns the same object when nothing changed', () => {
    // A new object every page paint would re-render the tray and the panel on
    // every frame, which is the one thing the store exists to avoid.
    const before = useEditorStore.getState().offers
    useEditorStore.getState().markEscalated([])
    expect(useEditorStore.getState().offers).toBe(before)
  })
})

describe('save status', () => {
  it('stamps the time on a successful save, for “Saved 14:32”', () => {
    useEditorStore.getState().setSave('saved')
    expect(useEditorStore.getState().savedAt).not.toBeNull()
  })

  it('does not stamp a failure', () => {
    useEditorStore.getState().setSave('error')
    expect(useEditorStore.getState().savedAt).toBeNull()
  })
})

/**
 * Cell selection, which is two corners and nothing else.
 *
 * The rectangle they imply — and the growing it does to swallow a merge it only
 * half covers — is derived in `EditorShell`, where the master's merges are. This
 * store holds the gesture.
 */
describe('cell selection', () => {
  const cell = (col: number, row: number) => ({
    colStart: col,
    colEnd: col,
    rowStart: row,
    rowEnd: row,
  })

  beforeEach(() => {
    useEditorStore.getState().clearCells()
  })

  it('anchors on a plain click', () => {
    useEditorStore.getState().selectCell(cell(1, 0), false)

    const { cellAnchor, cellFocus } = useEditorStore.getState()
    expect(cellAnchor).toEqual(cell(1, 0))
    expect(cellFocus).toEqual(cell(1, 0))
  })

  it('moves the focus and keeps the anchor when extending', () => {
    const store = useEditorStore.getState()
    store.selectCell(cell(0, 0), false)
    store.selectCell(cell(2, 1), true)

    expect(useEditorStore.getState().cellAnchor).toEqual(cell(0, 0))
    expect(useEditorStore.getState().cellFocus).toEqual(cell(2, 1))
  })

  it('re-anchors on a plain click after a range', () => {
    const store = useEditorStore.getState()
    store.selectCell(cell(0, 0), false)
    store.selectCell(cell(2, 1), true)
    store.selectCell(cell(3, 2), false)

    expect(useEditorStore.getState().cellAnchor).toEqual(cell(3, 2))
    expect(useEditorStore.getState().cellFocus).toEqual(cell(3, 2))
  })

  it('anchors when asked to extend from nothing', () => {
    // The first pointer event of a drag arrives before anything is selected.
    // Refusing it would make the gesture start on the second cell.
    useEditorStore.getState().selectCell(cell(1, 1), true)
    expect(useEditorStore.getState().cellAnchor).toEqual(cell(1, 1))
  })

  it('clears', () => {
    const store = useEditorStore.getState()
    store.selectCell(cell(0, 0), false)
    store.clearCells()

    expect(useEditorStore.getState().cellAnchor).toBeNull()
    expect(useEditorStore.getState().cellFocus).toBeNull()
  })
})
