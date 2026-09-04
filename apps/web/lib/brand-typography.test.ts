import { describe, it, expect } from 'vitest'
import type { BrandKit, TextStyle } from '@souqstudio/types'
import {
  MAX_STYLES,
  MIN_STYLES,
  canAddStyle,
  canRemoveStyle,
  defaultTextStyles,
  italicIsSynthetic,
  newTextStyle,
  resolveTextStyles,
  styleForSlot,
  typographyPatch,
} from '@/lib/brand-typography'

const custom = (over: Partial<TextStyle> = {}): TextStyle => ({
  id: 'x',
  name: 'Ticker',
  family: 'Cairo',
  size: 1,
  weight: 400,
  italic: false,
  colorId: null,
  lineHeight: 1.3,
  ...over,
})

describe('defaults', () => {
  it('ships at least the minimum', () => {
    expect(defaultTextStyles({}).length).toBeGreaterThanOrEqual(MIN_STYLES)
  })

  it('names styles for what they are, not how big they are', () => {
    const names = defaultTextStyles({}).map((s) => s.name)
    expect(names).toContain('Product name')
    expect(names).toContain('Headline')
    expect(names).toContain('Small print')
  })

  it('binds every slot a seeded block can name', () => {
    const slots = defaultTextStyles({}).map((s) => s.slot)
    for (const slot of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'] as const) {
      expect(slots).toContain(slot)
    }
  })

  it('keeps the headline a different face from the product name', () => {
    const kit: BrandKit = { fontHeadline: 'Lalezar', fontDisplay: 'Cairo' }
    const styles = defaultTextStyles(kit)
    expect(styles.find((s) => s.slot === 'h1')?.family).toBe('Lalezar')
    expect(styles.find((s) => s.slot === 'h3')?.family).toBe('Cairo')
  })

  it('orders the scale so a headline outranks small print', () => {
    const styles = defaultTextStyles({})
    const size = (slot: string) => styles.find((s) => s.slot === slot)?.size ?? 0
    expect(size('h1')).toBeGreaterThan(size('h3'))
    expect(size('h3')).toBeGreaterThan(size('caption'))
  })
})

describe('resolveTextStyles', () => {
  it('returns what the kit stores', () => {
    const styles = [custom()]
    expect(resolveTextStyles({ textStyles: styles })).toEqual(styles)
  })

  it('falls back to the defaults for a kit that predates styles', () => {
    expect(resolveTextStyles({}).length).toBe(defaultTextStyles({}).length)
  })

  it('holds more than the default set — a brand is not capped at eight', () => {
    const many = [...defaultTextStyles({}), custom({ id: 'a' }), custom({ id: 'b' })]
    expect(resolveTextStyles({ textStyles: many })).toHaveLength(10)
  })
})

describe('styleForSlot', () => {
  it('finds the style bound to a slot', () => {
    expect(styleForSlot({}, 'h3').name).toBe('Product name')
  })

  it('falls back rather than leaving a block with nothing to render in', () => {
    // Deleting a style does not delete the blocks that reach for it.
    const kit: BrandKit = { textStyles: [custom(), custom({ id: 'y' })] }
    expect(styleForSlot(kit, 'h3').family).toBeTruthy()
  })
})

describe('typographyPatch', () => {
  it('mirrors the bound families back into the four font slots', () => {
    const patch = typographyPatch(defaultTextStyles({ fontHeadline: 'Lalezar' }))
    expect(patch.fontHeadline).toBe('Lalezar')
    expect(patch.textStyles).toHaveLength(8)
  })

  it('carries the price face through untouched', () => {
    // No text style is set in it: a price mark is a component, not a text
    // layer, so nothing in this list can claim that slot. E6 §3.
    expect(typographyPatch([custom()]).fontPrice).toBeTruthy()
  })
})

describe('bounds', () => {
  it('refuses to remove a style a seeded block binds to', () => {
    const styles = defaultTextStyles({})
    const bound = styles.find((s) => s.slot === 'h3')!
    expect(canRemoveStyle(styles, bound)).toBe(false)
  })

  it('allows removing an owner-added style once above the floor', () => {
    const styles = [...defaultTextStyles({}), custom()]
    expect(canRemoveStyle(styles, custom())).toBe(true)
  })

  it('holds the floor at the minimum', () => {
    const five = Array.from({ length: MIN_STYLES }, (_, i) => custom({ id: `${i}` }))
    expect(canRemoveStyle(five, five[0]!)).toBe(false)
  })

  it('stops adding at the ceiling', () => {
    const full = Array.from({ length: MAX_STYLES }, (_, i) => custom({ id: `${i}` }))
    expect(canAddStyle(full)).toBe(false)
    expect(canAddStyle(defaultTextStyles({}))).toBe(true)
  })
})

describe('italic', () => {
  it('flags a synthesised slant on a family with no true italic', () => {
    // Arabic has no italic convention, so almost no Arabic-capable family
    // ships one and the browser fakes it.
    expect(italicIsSynthetic(custom({ family: 'Cairo', italic: true }))).toBe(true)
  })

  it('does not flag a family that ships one', () => {
    expect(italicIsSynthetic(custom({ family: 'Rubik', italic: true }))).toBe(false)
  })

  it('says nothing when italic is off', () => {
    expect(italicIsSynthetic(custom({ family: 'Cairo', italic: false }))).toBe(false)
  })
})

describe('newTextStyle', () => {
  it('starts from the kit rather than blank', () => {
    const style = newTextStyle({}, defaultTextStyles({}))
    expect(style.family).toBeTruthy()
    expect(style.slot).toBeUndefined()
  })
})
