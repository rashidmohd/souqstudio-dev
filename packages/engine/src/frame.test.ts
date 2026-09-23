import { describe, expect, it } from 'vitest'
import {
  fill,
  fillWeight,
  fixed,
  frameSchema,
  hug,
  isFlow,
  MAX_FRAME_DEPTH,
  NO_PADDING,
  nodeSchema,
  validateFrame,
  type LayoutFrame,
  type LayoutLeaf,
  type LayoutNode,
} from './frame'

const leaf = (id: string, extra: Partial<LayoutLeaf> = {}): LayoutLeaf => ({
  id,
  kind: 'leaf',
  width: fixed(10),
  height: fixed(10),
  ...extra,
})

const frame = (
  id: string,
  children: LayoutNode[],
  extra: Partial<LayoutFrame> = {}
): LayoutFrame => ({
  id,
  kind: 'frame',
  width: hug(),
  height: hug(),
  layout: { mode: 'row', gap: 0, padding: NO_PADDING, justify: 'start', align: 'start' },
  children,
  ...extra,
})

const codes = (problems: { code: string }[]): string[] => problems.map((p) => p.code)

describe('fillWeight', () => {
  it('reads 1 for a fill with no weight, and 0 for anything else', () => {
    expect(fillWeight(fill())).toBe(1)
    expect(fillWeight(fill(3))).toBe(3)
    expect(fillWeight(hug())).toBe(0)
    expect(fillWeight(fixed(10))).toBe(0)
  })

  it('reads an explicit zero weight as zero, not as the default', () => {
    // A zero-weight fill takes none of the free space. It is a strange thing to
    // author and it must not silently become 1.
    expect(fillWeight(fill(0))).toBe(0)
  })
})

describe('isFlow', () => {
  it('separates the two frames that lay out from the one that does not', () => {
    expect(isFlow({ mode: 'free' })).toBe(false)
    expect(
      isFlow({ mode: 'row', gap: 0, padding: NO_PADDING, justify: 'start', align: 'start' })
    ).toBe(true)
  })
})

describe('validateFrame — the rules the designer UI must not be able to break', () => {
  it('accepts an ordinary tree', () => {
    expect(validateFrame(frame('r', [leaf('a'), leaf('b')]))).toEqual([])
  })

  it('refuses fill on the root, which has no parent to divide space from', () => {
    expect(codes(validateFrame(frame('r', [], { width: fill() })))).toContain(
      'fill-outside-flow'
    )
  })

  it('refuses fill inside a free frame', () => {
    const tree = frame('r', [leaf('a', { width: fill(), box: { start: 0, top: 0, width: 1, height: 1 } })], {
      layout: { mode: 'free' },
      width: fixed(10),
      height: fixed(10),
    })
    expect(codes(validateFrame(tree))).toContain('fill-outside-flow')
  })

  it('refuses fill on a child that has taken itself out of the flow', () => {
    const tree = frame('r', [
      leaf('chip', {
        width: fill(),
        ignoreLayout: true,
        box: { start: 0, top: 0, width: 1, height: 1 },
      }),
    ])
    expect(codes(validateFrame(tree))).toContain('fill-outside-flow')
  })

  it('refuses hug on a free frame, because hugging fractions of itself is circular', () => {
    const tree = frame('r', [], { layout: { mode: 'free' }, width: hug(), height: hug() })
    expect(codes(validateFrame(tree))).toContain('hug-on-free-frame')
  })

  it('refuses hug on a leaf that cannot report an intrinsic size', () => {
    const tree = frame('r', [leaf('rect', { width: hug() })])
    // Only text and frames can hug. The caller says which leaves those are,
    // because the solver has no idea what a leaf contains.
    const problems = validateFrame(tree, { canHug: (l) => l.id.startsWith('text') })
    expect(codes(problems)).toContain('hug-on-leaf-without-intrinsic')
    expect(validateFrame(frame('r', [leaf('text1', { width: hug() })]), {
      canHug: (l) => l.id.startsWith('text'),
    })).toEqual([])
  })

  it('refuses between on an axis that hugs, rather than letting it mean start', () => {
    const tree = frame('r', [leaf('a')], {
      width: hug(),
      layout: { mode: 'row', gap: 0, padding: NO_PADDING, justify: 'between', align: 'start' },
    })
    expect(codes(validateFrame(tree))).toContain('between-on-hug')
  })

  it('allows between on a fixed axis, which is the wide band that wanted it', () => {
    const tree = frame('r', [leaf('a'), leaf('b')], {
      width: fixed(200),
      layout: { mode: 'row', gap: 0, padding: NO_PADDING, justify: 'between', align: 'start' },
    })
    expect(validateFrame(tree)).toEqual([])
  })

  it('refuses between on a hugging column measured down its own flow axis', () => {
    // The flow axis of a column is its height, so a hugging *width* is fine.
    const tree = frame('c', [leaf('a')], {
      width: fixed(100),
      height: hug(),
      layout: { mode: 'column', gap: 0, padding: NO_PADDING, justify: 'between', align: 'start' },
    })
    expect(codes(validateFrame(tree))).toContain('between-on-hug')
  })

  it('caps nesting at three', () => {
    const deep = frame('one', [frame('two', [frame('three', [frame('four', [])])])])
    expect(codes(validateFrame(deep))).toContain('nesting-too-deep')
    expect(MAX_FRAME_DEPTH).toBe(3)
  })

  it('allows exactly three', () => {
    const ok = frame('one', [frame('two', [frame('three', [leaf('a')])])])
    expect(validateFrame(ok)).toEqual([])
  })

  it('catches a duplicate id, because an id addresses a solved box', () => {
    expect(codes(validateFrame(frame('r', [leaf('same'), leaf('same')])))).toContain(
      'duplicate-id'
    )
  })

  it('requires a box on a node positioned by one', () => {
    const free = frame('r', [leaf('a')], {
      layout: { mode: 'free' },
      width: fixed(10),
      height: fixed(10),
    })
    expect(codes(validateFrame(free))).toContain('missing-box')
  })

  it('exempts the root, which is handed the design rect and never reads a box', () => {
    expect(codes(validateFrame(frame('r', [leaf('a')])))).not.toContain('missing-box')
  })

  it('names the node in every message, so a report is actionable', () => {
    const problems = validateFrame(frame('r', [], { width: fill() }))
    expect(problems[0]?.nodeId).toBe('r')
    expect(problems[0]?.message).toContain('"r"')
  })
})

describe('the schema', () => {
  it('accepts a nested frame', () => {
    const tree = frame('r', [frame('inner', [leaf('a')]), leaf('b')])
    expect(frameSchema.safeParse(tree).success).toBe(true)
  })

  it('accepts a leaf on its own', () => {
    expect(nodeSchema.safeParse(leaf('a')).success).toBe(true)
  })

  it('refuses a negative gap', () => {
    const tree = frame('r', [], {
      layout: { mode: 'row', gap: -4, padding: NO_PADDING, justify: 'start', align: 'start' },
    })
    expect(frameSchema.safeParse(tree).success).toBe(false)
  })

  it('refuses a sizing kind it has never heard of', () => {
    const tree = frame('r', [])
    const bad = { ...tree, width: { kind: 'grow' } }
    expect(frameSchema.safeParse(bad).success).toBe(false)
  })

  it('refuses a justify value it has never heard of', () => {
    const tree = frame('r', [], {
      layout: { mode: 'row', gap: 0, padding: NO_PADDING, justify: 'around', align: 'start' } as never,
    })
    expect(frameSchema.safeParse(tree).success).toBe(false)
  })

  it('refuses a node with no id', () => {
    expect(nodeSchema.safeParse({ ...leaf(''), id: '' }).success).toBe(false)
  })

  it('accepts a box outside 0 to 1, because a chip overhangs by design', () => {
    const node = leaf('chip', { box: { start: -0.2, top: -0.2, width: 0.5, height: 0.5 } })
    expect(nodeSchema.safeParse(node).success).toBe(true)
  })

  it('refuses a box far enough out to be a typo', () => {
    const node = leaf('chip', { box: { start: 9, top: 0, width: 0.5, height: 0.5 } })
    expect(nodeSchema.safeParse(node).success).toBe(false)
  })

  it('round-trips a tree through the schema unchanged', () => {
    const tree = frame('r', [leaf('a', { whenEmpty: 'reserve', empty: true })], {
      width: fixed(100),
    })
    const parsed = frameSchema.parse(tree)
    expect(parsed).toEqual(tree)
  })
})
