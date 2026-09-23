import { describe, expect, it } from 'vitest'
import {
  fill,
  fixed,
  hug,
  NO_PADDING,
  type FlowLayout,
  type LayoutFrame,
  type LayoutLeaf,
  type LayoutNode,
  type Padding,
  type Sizing,
} from './frame'
import {
  findSolved,
  flattenSolved,
  measureNode,
  paintOrder,
  solve,
  solvedBounds,
  type MeasureLeaf,
  type SolvedNode,
} from './solve'

/**
 * The solver's rules, from `docs/E14-layout-frames.md` §5.
 *
 * Every leaf's intrinsic size is declared on the fixture rather than computed,
 * because the engine cannot measure a glyph and these tests are about geometry.
 * `INTRINSIC` is the injected measurer's whole world.
 */

const INTRINSIC: Record<string, { width: number; height: number }> = {}

const measure: MeasureLeaf = (leaf) => INTRINSIC[leaf.id] ?? { width: 0, height: 0 }

function leaf(
  id: string,
  width: Sizing,
  height: Sizing,
  intrinsic?: { width: number; height: number },
  extra: Partial<LayoutLeaf> = {}
): LayoutLeaf {
  if (intrinsic !== undefined) INTRINSIC[id] = intrinsic
  return { id, kind: 'leaf', width, height, ...extra }
}

function row(
  id: string,
  children: LayoutNode[],
  layout: Partial<Omit<FlowLayout, 'mode'>> = {},
  size: { width?: Sizing; height?: Sizing } = {},
  extra: Partial<LayoutFrame> = {}
): LayoutFrame {
  return {
    id,
    kind: 'frame',
    width: size.width ?? hug(),
    height: size.height ?? hug(),
    layout: {
      mode: 'row',
      gap: 0,
      padding: NO_PADDING,
      justify: 'start',
      align: 'start',
      ...layout,
    },
    children,
    ...extra,
  }
}

function column(
  id: string,
  children: LayoutNode[],
  layout: Partial<Omit<FlowLayout, 'mode'>> = {},
  size: { width?: Sizing; height?: Sizing } = {},
  extra: Partial<LayoutFrame> = {}
): LayoutFrame {
  return {
    id,
    kind: 'frame',
    width: size.width ?? hug(),
    height: size.height ?? hug(),
    layout: {
      mode: 'column',
      gap: 0,
      padding: NO_PADDING,
      justify: 'start',
      align: 'start',
      ...layout,
    },
    children,
    ...extra,
  }
}

const pad = (p: Partial<Padding>): Padding => ({ ...NO_PADDING, ...p })

const LTR = { direction: 'ltr' } as const
const RTL = { direction: 'rtl' } as const

/** The x of each child, in flow order. */
const xs = (solved: SolvedNode): number[] => solved.children.map((c) => c.rect.x)
const ys = (solved: SolvedNode): number[] => solved.children.map((c) => c.rect.y)
const widths = (solved: SolvedNode): number[] => solved.children.map((c) => c.rect.width)
const heights = (solved: SolvedNode): number[] => solved.children.map((c) => c.rect.height)

// ─── §5.4 Measure, bottom-up ──────────────────────────────────────────────────

describe('measure — §5.4 bottom-up', () => {
  it('a row hugs its children plus its gaps plus its padding', () => {
    const tree = row(
      'r',
      [
        leaf('a', fixed(20), fixed(10)),
        leaf('b', fixed(30), fixed(14)),
      ],
      { gap: 10, padding: pad({ start: 5, end: 5, top: 2, bottom: 3 }) }
    )

    // 20 + 30 children, one 10 gap, 10 of inline padding.
    expect(measureNode(tree, measure, LTR)).toEqual({ width: 70, height: 19 })
  })

  it('a column sums heights and takes the widest child', () => {
    const tree = column(
      'c',
      [leaf('a', fixed(20), fixed(10)), leaf('b', fixed(30), fixed(14))],
      { gap: 6 }
    )
    expect(measureNode(tree, measure, LTR)).toEqual({ width: 30, height: 30 })
  })

  it('a leaf hugs what the measurer reports', () => {
    const node = leaf('t', hug(), hug(), { width: 42, height: 17 })
    expect(measureNode(node, measure, LTR)).toEqual({ width: 42, height: 17 })
  })

  it('nests: a frame hugging a frame hugging a leaf', () => {
    const inner = row('inner', [leaf('t', hug(), hug(), { width: 40, height: 12 })], {
      padding: pad({ start: 4, end: 4 }),
    })
    const outer = column('outer', [inner], { padding: pad({ top: 3, bottom: 3 }) })
    expect(measureNode(outer, measure, LTR)).toEqual({ width: 48, height: 18 })
  })
})

// ─── The termination rule ─────────────────────────────────────────────────────

describe('the hug/fill termination rule — §5.4', () => {
  it('a fill child contributes nothing to a hug parent', () => {
    const tree = row(
      'r',
      [
        leaf('a', fixed(20), fixed(10)),
        // If this asked its parent how big to be, the parent would be asking it
        // for the number it is waiting for. It reports zero instead.
        leaf('grow', fill(), fixed(10), { width: 999, height: 999 }),
        leaf('b', fixed(30), fixed(10)),
      ],
      { gap: 10 }
    )

    // 20 + 0 + 30, plus two gaps. The 999 is never consulted.
    expect(measureNode(tree, measure, LTR).width).toBe(70)
  })

  it('terminates on the cross axis too', () => {
    const tree = row('r', [leaf('a', fixed(20), fill(), { width: 5, height: 999 })])
    expect(measureNode(tree, measure, LTR).height).toBe(0)
  })

  it('and the fill child then gets nothing to grow into, which is coherent', () => {
    const tree = row(
      'r',
      [leaf('a', fixed(20), fixed(10)), leaf('grow', fill(), fixed(10)), leaf('b', fixed(30), fixed(10))],
      { gap: 10 }
    )
    const solved = solve(tree, { width: 70, height: 10 }, measure, LTR)
    expect(widths(solved)).toEqual([20, 0, 30])
    // Nothing overflows: 20 + 0 + 30 + two gaps is exactly 70.
    expect(xs(solved)).toEqual([0, 30, 40])
  })

  it('a fill child in a fixed parent takes the free space', () => {
    const tree = row(
      'r',
      [leaf('a', fixed(20), fixed(10)), leaf('grow', fill(), fixed(10)), leaf('b', fixed(30), fixed(10))],
      { gap: 10 },
      { width: fixed(100) }
    )
    const solved = solve(tree, { width: 100, height: 10 }, measure, LTR)
    // 100 − 50 − 20 of gaps = 30.
    expect(widths(solved)).toEqual([20, 30, 30])
  })

  it('divides free space among fill children by weight', () => {
    const tree = row('r', [
      leaf('one', fill(1), fixed(10)),
      leaf('three', fill(3), fixed(10)),
    ])
    const solved = solve(tree, { width: 80, height: 10 }, measure, LTR)
    expect(widths(solved)).toEqual([20, 60])
  })

  it('treats fill with no weight as weight 1', () => {
    const tree = row('r', [leaf('a', fill(), fixed(10)), leaf('b', fill(), fixed(10))])
    expect(widths(solve(tree, { width: 50, height: 10 }, measure, LTR))).toEqual([25, 25])
  })
})

// ─── min / max ────────────────────────────────────────────────────────────────

describe('min and max', () => {
  it('clamps a hug up to its minimum', () => {
    const node = leaf('t', hug(), hug(), { width: 10, height: 10 }, { minWidth: 40 })
    expect(measureNode(node, measure, LTR).width).toBe(40)
  })

  it('clamps a hug down to its maximum', () => {
    const node = leaf('t', hug(), hug(), { width: 90, height: 10 }, { maxWidth: 40 })
    expect(measureNode(node, measure, LTR).width).toBe(40)
  })

  it('lets min win over max, which is CSS and the safe direction', () => {
    // A box under its minimum is unreadable; a box over its maximum is large.
    const node = leaf('t', hug(), hug(), { width: 10, height: 10 }, { minWidth: 50, maxWidth: 20 })
    expect(measureNode(node, measure, LTR).width).toBe(50)
  })

  it('clamps a fill child after its share is computed', () => {
    const tree = row('r', [
      leaf('a', fill(), fixed(10), undefined, { maxWidth: 30 }),
      leaf('b', fill(), fixed(10)),
    ])
    const solved = solve(tree, { width: 100, height: 10 }, measure, LTR)
    expect(widths(solved)).toEqual([30, 50])
  })
})

// ─── justify and align, LTR ───────────────────────────────────────────────────

describe('justify along the flow axis', () => {
  const three = (justify: 'start' | 'center' | 'end' | 'between') =>
    solve(
      row(
        'r',
        [
          leaf('a', fixed(20), fixed(10)),
          leaf('b', fixed(20), fixed(10)),
          leaf('c', fixed(20), fixed(10)),
        ],
        { gap: 10, justify },
        { width: fixed(100) }
      ),
      { width: 100, height: 10 },
      measure,
      LTR
    )

  // 60 of children plus 20 of gaps is 80, leaving 20.
  it('start leaves the slack at the end', () => {
    expect(xs(three('start'))).toEqual([0, 30, 60])
  })

  it('center splits the slack', () => {
    expect(xs(three('center'))).toEqual([10, 40, 70])
  })

  it('end leaves the slack at the start', () => {
    expect(xs(three('end'))).toEqual([20, 50, 80])
  })

  it('between spreads the slack into the gaps and pins both ends', () => {
    const solved = three('between')
    expect(xs(solved)).toEqual([0, 40, 80])
    const last = solved.children[2]
    expect((last?.rect.x ?? 0) + (last?.rect.width ?? 0)).toBe(100)
  })

  it('puts a lone child at the start under between, with nothing to space', () => {
    const solved = solve(
      row('r', [leaf('a', fixed(20), fixed(10))], { justify: 'between' }, { width: fixed(100) }),
      { width: 100, height: 10 },
      measure,
      LTR
    )
    expect(xs(solved)).toEqual([0])
  })
})

describe('align across the flow axis', () => {
  const one = (align: 'start' | 'center' | 'end' | 'stretch') =>
    solve(
      row('r', [leaf('a', fixed(20), fixed(10))], { align }, { width: fixed(100), height: fixed(50) }),
      { width: 100, height: 50 },
      measure,
      LTR
    )

  it('start puts it at the top of a row', () => {
    expect(ys(one('start'))).toEqual([0])
  })

  it('center centres it across', () => {
    expect(ys(one('center'))).toEqual([20])
  })

  it('end pushes it to the bottom', () => {
    expect(ys(one('end'))).toEqual([40])
  })

  it('stretch does NOT override a cross size somebody set by hand', () => {
    // Flexbox stretches only items whose cross size is auto, and Figma behaves
    // the same way. An explicit height is an instruction; silently growing it
    // because the parent aligns one way would make the field a lie.
    const solved = one('stretch')
    expect(heights(solved)).toEqual([10])
    expect(ys(solved)).toEqual([0])
  })

  it('stretch takes the whole cross axis when the child hugs', () => {
    const solved = solve(
      row(
        'r',
        [leaf('a', fixed(20), hug(), { width: 20, height: 10 })],
        { align: 'stretch' },
        { width: fixed(100), height: fixed(50) }
      ),
      { width: 100, height: 50 },
      measure,
      LTR
    )
    expect(heights(solved)).toEqual([50])
    expect(ys(solved)).toEqual([0])
  })

  it('stretch still respects a maximum', () => {
    const solved = solve(
      row(
        'r',
        [leaf('a', fixed(20), hug(), { width: 20, height: 10 }, { maxHeight: 30 })],
        { align: 'stretch' },
        { width: fixed(100), height: fixed(50) }
      ),
      { width: 100, height: 50 },
      measure,
      LTR
    )
    expect(heights(solved)).toEqual([30])
  })
})

// ─── §5.5 Direction ───────────────────────────────────────────────────────────

describe('direction — §5.5, resolved on the inline axis only', () => {
  /**
   * The trap this whole block exists for: `justify` and `align` are both spelled
   * start/end, and only the one addressing the *horizontal* axis mirrors. A
   * solver that mirrored by field name would flip every column top-to-bottom in
   * Arabic, and it would look like a vertical centering bug.
   */

  it('a row mirrors its justify: the first child sits at the right', () => {
    const tree = row(
      'r',
      [leaf('a', fixed(20), fixed(10)), leaf('b', fixed(20), fixed(10))],
      { gap: 10, justify: 'start' },
      { width: fixed(100) }
    )
    // LTR: 0 and 30. RTL: the same offsets measured from the other end.
    expect(xs(solve(tree, { width: 100, height: 10 }, measure, LTR))).toEqual([0, 30])
    expect(xs(solve(tree, { width: 100, height: 10 }, measure, RTL))).toEqual([80, 50])
  })

  it('a row does NOT mirror its align, which is vertical', () => {
    const tree = row(
      'r',
      [leaf('a', fixed(20), fixed(10))],
      { align: 'start' },
      { width: fixed(100), height: fixed(50) }
    )
    expect(ys(solve(tree, { width: 100, height: 50 }, measure, LTR))).toEqual([0])
    expect(ys(solve(tree, { width: 100, height: 50 }, measure, RTL))).toEqual([0])
  })

  it('a column does NOT mirror its justify, which is vertical', () => {
    const tree = column(
      'c',
      [leaf('a', fixed(20), fixed(10)), leaf('b', fixed(20), fixed(10))],
      { gap: 10, justify: 'start' },
      { height: fixed(100) }
    )
    expect(ys(solve(tree, { width: 20, height: 100 }, measure, LTR))).toEqual([0, 20])
    expect(ys(solve(tree, { width: 20, height: 100 }, measure, RTL))).toEqual([0, 20])
  })

  it('a column mirrors its align, which is horizontal', () => {
    const tree = column(
      'c',
      [leaf('a', fixed(20), fixed(10))],
      { align: 'start' },
      { width: fixed(100), height: fixed(50) }
    )
    expect(xs(solve(tree, { width: 100, height: 50 }, measure, LTR))).toEqual([0])
    // `start` is the reading-order start, which in Arabic is the right edge.
    expect(xs(solve(tree, { width: 100, height: 50 }, measure, RTL))).toEqual([80])
  })

  it('swaps the inline padding edges and leaves top and bottom alone', () => {
    const tree = row(
      'r',
      [leaf('a', fixed(20), fixed(10))],
      { padding: pad({ start: 12, end: 4, top: 6 }) },
      { width: fixed(100), height: fixed(50) }
    )
    expect(xs(solve(tree, { width: 100, height: 50 }, measure, LTR))).toEqual([12])
    // The start edge is now on the right: 100 − 12 − 20.
    expect(xs(solve(tree, { width: 100, height: 50 }, measure, RTL))).toEqual([68])
    expect(ys(solve(tree, { width: 100, height: 50 }, measure, RTL))).toEqual([6])
  })

  it('a pinned ltr subtree keeps its internal order inside an rtl page', () => {
    // The currency/price pair, a barcode, a Latin wordmark: the block still
    // mirrors as a whole while the pair keeps its own order.
    const pair = row(
      'pair',
      [leaf('currency', fixed(10), fixed(10)), leaf('price', fixed(30), fixed(10))],
      { gap: 2 },
      { width: fixed(42) },
      { direction: 'ltr' }
    )
    const outer = row('outer', [pair], {}, { width: fixed(100) })

    const solved = solve(outer, { width: 100, height: 10 }, measure, RTL)
    const inner = solved.children[0] as SolvedNode
    // The pair as a whole is mirrored to the right by its RTL parent.
    expect(inner.rect.x).toBe(58)
    // Inside it, currency still precedes price left to right.
    expect(inner.children.map((c) => c.rect.x)).toEqual([58, 70])
    expect(inner.direction).toBe('ltr')
  })

  it('reports the resolved direction on every node, for the painter', () => {
    const tree = row('r', [leaf('a', fixed(10), fixed(10))], {}, { width: fixed(100) })
    const solved = solve(tree, { width: 100, height: 10 }, measure, RTL)
    expect(solved.direction).toBe('rtl')
    expect(solved.children[0]?.direction).toBe('rtl')
  })
})

// ─── §3.7 whenEmpty ───────────────────────────────────────────────────────────

describe('whenEmpty — §3.7', () => {
  it('collapses an empty node by default, and its gap with it', () => {
    const tree = row(
      'r',
      [
        leaf('was', fixed(20), fixed(10), undefined, { empty: true }),
        leaf('now', fixed(30), fixed(10)),
      ],
      { gap: 10 }
    )
    // Not 20 + 10 + 30. The gap beside the missing was-price goes too.
    expect(measureNode(tree, measure, LTR).width).toBe(30)

    const solved = solve(tree, { width: 30, height: 10 }, measure, LTR)
    expect(solved.children.map((c) => c.id)).toEqual(['now'])
  })

  it('reserve keeps the space, which is what a row of cards needs', () => {
    // One card has a was-price and the others do not; every price must still
    // set at the same height.
    const tree = row(
      'r',
      [
        leaf('was', fixed(20), fixed(10), undefined, { empty: true, whenEmpty: 'reserve' }),
        leaf('now', fixed(30), fixed(10)),
      ],
      { gap: 10 }
    )
    expect(measureNode(tree, measure, LTR).width).toBe(60)

    const solved = solve(tree, { width: 60, height: 10 }, measure, LTR)
    expect(solved.children.map((c) => c.id)).toEqual(['was', 'now'])
    expect(solved.children[0]?.reserved).toBe(true)
    expect(solved.children[1]?.reserved).toBeUndefined()
  })

  it('collapses a middle child without leaving a double gap', () => {
    const tree = row(
      'r',
      [
        leaf('a', fixed(10), fixed(10)),
        leaf('gone', fixed(10), fixed(10), undefined, { empty: true }),
        leaf('c', fixed(10), fixed(10)),
      ],
      { gap: 5 }
    )
    expect(measureNode(tree, measure, LTR).width).toBe(25)
    expect(xs(solve(tree, { width: 25, height: 10 }, measure, LTR))).toEqual([0, 15])
  })
})

// ─── §2.3 ignoreLayout, and free frames ───────────────────────────────────────

describe('out of flow — §2.3', () => {
  it('positions an ignoreLayout child by its box and keeps it out of the hug', () => {
    const tree = row(
      'r',
      [
        leaf('a', fixed(20), fixed(10)),
        leaf('chip', fixed(50), fixed(50), undefined, {
          ignoreLayout: true,
          box: { start: -0.1, top: -0.1, width: 0.5, height: 0.5 },
        }),
      ],
      { gap: 10 }
    )

    // The overhanging chip contributes nothing, and takes no gap.
    expect(measureNode(tree, measure, LTR).width).toBe(20)

    const solved = solve(tree, { width: 20, height: 10 }, measure, LTR)
    const chip = findSolved(solved, 'chip')
    expect(chip?.rect).toEqual({ x: -2, y: -1, width: 10, height: 5 })
  })

  it('keeps an out-of-flow child in its authored place, because paint order is flow order', () => {
    /*
     * Found by Phase 4's gate, not by a unit test. The burst card authors its
     * star last so it paints on top of the packshot; a solver that emitted
     * every out-of-flow child first put the star underneath, and the card
     * rendered with a gold sliver where a badge should be.
     */
    const tree = row('r', [
      leaf('under', fixed(10), fixed(10)),
      leaf('chip', fixed(1), fixed(1), undefined, {
        ignoreLayout: true,
        box: { start: 0, top: 0, width: 1, height: 1 },
      }),
      leaf('over', fixed(10), fixed(10)),
    ])
    const solved = solve(tree, { width: 20, height: 10 }, measure, LTR)
    expect(solved.children.map((c) => c.id)).toEqual(['under', 'chip', 'over'])
  })

  it('keeps the flow positions right with an out-of-flow child among them', () => {
    // The chip takes no gap and no space; the two flow children still sit as
    // though it were not there.
    const tree = row(
      'r',
      [
        leaf('a', fixed(10), fixed(10)),
        leaf('chip', fixed(1), fixed(1), undefined, {
          ignoreLayout: true,
          box: { start: 0, top: 0, width: 1, height: 1 },
        }),
        leaf('b', fixed(10), fixed(10)),
      ],
      { gap: 4 }
    )
    const solved = solve(tree, { width: 24, height: 10 }, measure, LTR)
    expect(solved.children.map((c) => [c.id, c.rect.x])).toEqual([
      ['a', 0],
      ['chip', 0],
      ['b', 14],
    ])
  })

  it('keeps authored order when a collapsed child sits between two others', () => {
    const tree = row('r', [
      leaf('a', fixed(10), fixed(10)),
      leaf('gone', fixed(10), fixed(10), undefined, { empty: true }),
      leaf('b', fixed(10), fixed(10)),
    ])
    const solved = solve(tree, { width: 20, height: 10 }, measure, LTR)
    expect(solved.children.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('mirrors an out-of-flow box on the inline axis', () => {
    const tree = row('r', [
      leaf('chip', fixed(1), fixed(1), undefined, {
        ignoreLayout: true,
        box: { start: 0, top: 0, width: 0.25, height: 1 },
      }),
    ])
    const solved = solve(tree, { width: 100, height: 10 }, measure, RTL)
    // start 0 in Arabic is the right edge: 100 − 0 − 25.
    expect(findSolved(solved, 'chip')?.rect.x).toBe(75)
  })

  it('a free frame positions every child by its fractional box', () => {
    const free: LayoutFrame = {
      id: 'g',
      kind: 'frame',
      width: fixed(100),
      height: fixed(100),
      layout: { mode: 'free' },
      children: [
        leaf('a', fixed(1), fixed(1), undefined, {
          box: { start: 0.25, top: 0.5, width: 0.5, height: 0.25 },
        }),
      ],
    }
    const solved = solve(free, { width: 100, height: 100 }, measure, LTR)
    expect(solved.children[0]?.rect).toEqual({ x: 25, y: 50, width: 50, height: 25 })
  })

  it('a free frame has no intrinsic size, because hugging it would be circular', () => {
    const free: LayoutFrame = {
      id: 'g',
      kind: 'frame',
      width: hug(),
      height: hug(),
      layout: { mode: 'free' },
      children: [leaf('a', fixed(10), fixed(10))],
    }
    // Its children are fractions of the size being measured. Zero rather than
    // an invented number; `validateFrame` is what reports it.
    expect(measureNode(free, measure, LTR)).toEqual({ width: 0, height: 0 })
  })
})

// ─── Aspect, §2 ───────────────────────────────────────────────────────────────

describe('aspect', () => {
  it('derives the flexible axis from the fixed one', () => {
    const node = leaf('img', fixed(60), hug(), { width: 10, height: 10 }, { aspect: 2 })
    expect(measureNode(node, measure, LTR)).toEqual({ width: 60, height: 30 })
  })

  it('derives width when the height is the fixed axis', () => {
    const node = leaf('img', hug(), fixed(30), { width: 10, height: 10 }, { aspect: 2 })
    expect(measureNode(node, measure, LTR)).toEqual({ width: 60, height: 30 })
  })

  it('leaves a fully fixed node alone, rather than losing to a rounding error', () => {
    const node = leaf('img', fixed(60), fixed(17), { width: 10, height: 10 }, { aspect: 2 })
    expect(measureNode(node, measure, LTR)).toEqual({ width: 60, height: 17 })
  })

  it('treats fit and cover as absent, since only the measurer knows the ratio', () => {
    const node = leaf('img', fixed(60), hug(), { width: 10, height: 44 }, { aspect: 'cover' })
    expect(measureNode(node, measure, LTR)).toEqual({ width: 60, height: 44 })
  })
})

// ─── Text that wraps ──────────────────────────────────────────────────────────

describe('a hugging height re-measures against the width the flow gave it', () => {
  it('asks the measurer again when the width changed', () => {
    // A measurer that wraps: half the width costs twice the height.
    const wrapping: MeasureLeaf = (node, constraint) => {
      const natural = { width: 100, height: 10 }
      if (constraint.width === undefined || constraint.width >= natural.width) return natural
      const lines = Math.ceil(natural.width / constraint.width)
      return { width: constraint.width, height: natural.height * lines }
    }

    const tree = row(
      'r',
      [leaf('text', fill(), hug())],
      {},
      { width: fixed(50), height: fixed(40) }
    )
    const solved = solve(tree, { width: 50, height: 40 }, wrapping, LTR)
    expect(solved.children[0]?.rect.width).toBe(50)
    expect(solved.children[0]?.rect.height).toBe(20)
  })

  it('wraps a filling text inside a COLUMN, where the width is the cross axis', () => {
    /*
     * Found by Phase 4's gate. A column is the commonest layout there is — name
     * over spec over price — and a text filling its width reported the height of
     * a single unwrapped line, so it drew straight through its neighbour.
     */
    const wrapping: MeasureLeaf = (node, constraint) => {
      const natural = { width: 200, height: 10 }
      if (constraint.width === undefined || constraint.width >= natural.width) return natural
      return { width: constraint.width, height: natural.height * Math.ceil(natural.width / constraint.width) }
    }

    const tree = column(
      'c',
      [leaf('text', fill(), hug())],
      { align: 'stretch' },
      { width: fixed(50), height: fixed(100) }
    )
    const solved = solve(tree, { width: 50, height: 100 }, wrapping, LTR)
    expect(solved.children[0]?.rect.width).toBe(50)
    // 200 natural over 50 available is four lines, not one.
    expect(solved.children[0]?.rect.height).toBe(40)
  })

  it('lets the wrapped height drive the column, so the next child sits below it', () => {
    const wrapping: MeasureLeaf = (node, constraint) => {
      if (node.id !== 'text') return { width: 20, height: 10 }
      const natural = { width: 200, height: 10 }
      if (constraint.width === undefined || constraint.width >= natural.width) return natural
      return { width: constraint.width, height: natural.height * Math.ceil(natural.width / constraint.width) }
    }

    const tree = column(
      'c',
      [leaf('text', fill(), hug()), leaf('below', fixed(20), fixed(10))],
      { align: 'stretch', gap: 5 },
      { width: fixed(50), height: fixed(100) }
    )
    const solved = solve(tree, { width: 50, height: 100 }, wrapping, LTR)
    // The wrapped text is 40 tall, so its neighbour starts at 45 rather than 15.
    expect(ys(solved)).toEqual([0, 45])
  })

  it('does not re-measure when the width is what it asked for', () => {
    let calls = 0
    const counting: MeasureLeaf = () => {
      calls += 1
      return { width: 30, height: 10 }
    }
    const tree = row('r', [leaf('text', hug(), hug())])
    solve(tree, { width: 30, height: 10 }, counting, LTR)
    const before = calls
    solve(tree, { width: 30, height: 10 }, counting, LTR)
    // The second solve costs the same as the first: no extra constrained call.
    expect(calls - before).toBe(before)
  })
})

// ─── Reading the result ───────────────────────────────────────────────────────

describe('reading a solved tree', () => {
  const tree = row('r', [
    leaf('a', fixed(10), fixed(10)),
    leaf('b', fixed(10), fixed(10)),
    leaf('c', fixed(10), fixed(10)),
  ])
  const solved = solve(tree, { width: 30, height: 10 }, measure, LTR)

  it('keeps children in flow order', () => {
    expect(solved.children.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('paints last on top by default', () => {
    expect(paintOrder(solved).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('reverses when the frame asked for first on top', () => {
    expect(paintOrder(solved, true).map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('flattens depth first', () => {
    expect(flattenSolved(solved).map((n) => n.id)).toEqual(['r', 'a', 'b', 'c'])
  })

  it('finds a node by id and returns null for one that is not there', () => {
    expect(findSolved(solved, 'b')?.rect.x).toBe(10)
    expect(findSolved(solved, 'nope')).toBeNull()
  })

  it('carries a leaf ref through for the painter to join on', () => {
    const withRef = row('r', [leaf('a', fixed(10), fixed(10), undefined, { ref: 'el_7' })])
    const out = solve(withRef, { width: 10, height: 10 }, measure, LTR)
    expect(out.children[0]?.ref).toBe('el_7')
  })

  it('bounds include anything that overhangs the root', () => {
    const tree2 = row('r', [
      leaf('a', fixed(10), fixed(10)),
      leaf('chip', fixed(1), fixed(1), undefined, {
        ignoreLayout: true,
        box: { start: -0.5, top: 0, width: 0.5, height: 1 },
      }),
    ])
    const out = solve(tree2, { width: 10, height: 10 }, measure, LTR)
    expect(solvedBounds(out)).toEqual({ x: -5, y: 0, width: 15, height: 10 })
  })

  it('records a baseline request without acting on it', () => {
    const tree2 = row('r', [leaf('a', fixed(10), fixed(10))], { baselineAlign: true })
    const out = solve(tree2, { width: 10, height: 10 }, measure, LTR)
    // A baseline is a font metric; Phase 3's painter is what resolves it.
    expect(out.baselineAlign).toBe(true)
  })
})

// ─── Overflow ─────────────────────────────────────────────────────────────────

describe('overflow', () => {
  it('lets children run past a frame too small for them rather than shrinking them', () => {
    // Shrinking silently is how a card ends up with text nobody can read. The
    // fit ladder and §5.3's floor are what handle this, above the solver.
    const tree = row(
      'r',
      [leaf('a', fixed(60), fixed(10)), leaf('b', fixed(60), fixed(10))],
      { gap: 10 },
      { width: fixed(50) }
    )
    const solved = solve(tree, { width: 50, height: 10 }, measure, LTR)
    expect(widths(solved)).toEqual([60, 60])
    expect(xs(solved)).toEqual([0, 70])
  })
})
