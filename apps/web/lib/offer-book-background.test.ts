import { describe, expect, it } from 'vitest'
import { backgroundSchema, readPageBackground } from '@/lib/offer-book-background'

/**
 * A page's own paper, and the three answers the wrapper exists to keep apart.
 *
 * Absent is "this page draws the book's background"; `null` is "this page is
 * plain paper although the book has a ground"; an object is its own. Prisma's
 * two JSON nulls read back identically, so without the wrapper the second and
 * the first would be the same value — and an owner could put a background on a
 * book and never take it off a single page.
 */
describe('readPageBackground', () => {
  it('reads an absent column as inherit', () => {
    expect(readPageBackground(null)).toBeUndefined()
    expect(readPageBackground(undefined)).toBeUndefined()
  })

  it('reads a wrapped null as a deliberate none', () => {
    expect(readPageBackground({ background: null })).toBeNull()
  })

  it("reads a wrapped background as that page's own", () => {
    expect(readPageBackground({ background: { from: 'role', ref: 'surface' } })).toEqual({
      from: 'role',
      ref: 'surface',
    })
  })

  it('tells a deliberate none from an inherit, which is the point', () => {
    expect(readPageBackground({ background: null })).not.toBe(readPageBackground(null))
  })

  it('falls back to inherit on anything malformed rather than throwing', () => {
    // A page whose override cannot be read is a page that draws the book's
    // background. Refusing to open the book would leave the owner no way to fix
    // the thing that is wrong.
    expect(readPageBackground('navy')).toBeUndefined()
    expect(readPageBackground([])).toBeUndefined()
    expect(readPageBackground({})).toBeUndefined()
    expect(readPageBackground({ background: 'navy' })).toBeUndefined()
    expect(readPageBackground({ background: { from: 'wat' } })).toBeUndefined()
  })
})

describe('backgroundSchema', () => {
  it('accepts the four shapes a ground can be', () => {
    expect(backgroundSchema.safeParse({ from: 'role', ref: 'surface' }).success).toBe(true)
    expect(backgroundSchema.safeParse({ from: 'palette', id: 'c1' }).success).toBe(true)
    expect(backgroundSchema.safeParse({ from: 'hex', hex: '#102A43' }).success).toBe(true)
    expect(
      backgroundSchema.safeParse({
        from: 'gradient',
        angle: 90,
        stops: [
          { at: 0, color: { from: 'hex', hex: '#000000' } },
          { at: 1, color: { from: 'hex', hex: '#ffffff' } },
        ],
      }).success
    ).toBe(true)
    expect(backgroundSchema.safeParse({ from: 'asset', assetId: 'org_1/blocks/x' }).success).toBe(
      true
    )
  })

  it('carries a blurred background\'s provenance', () => {
    // `assetId` is always what the page draws; `blur.from` is the unblurred
    // original the editor re-renders from, so a second drag does not blur a
    // blur. Absent means the picture is the original.
    expect(
      backgroundSchema.safeParse({
        from: 'asset',
        assetId: 'org_1/blocks/blurred',
        blur: { from: 'org_1/blocks/original', radius: 0.02 },
      }).success
    ).toBe(true)
  })

  it('bounds the blur radius here, not only in the control', () => {
    // The control is not the writer — this schema is. Past the ceiling a
    // background stops being a photograph and becomes a wash.
    expect(
      backgroundSchema.safeParse({
        from: 'asset',
        assetId: 'org_1/blocks/x',
        blur: { from: 'org_1/blocks/y', radius: 0.5 },
      }).success
    ).toBe(false)
  })

  it('refuses a three-digit hex and a one-stop gradient', () => {
    expect(backgroundSchema.safeParse({ from: 'hex', hex: '#fff' }).success).toBe(false)
    expect(
      backgroundSchema.safeParse({
        from: 'gradient',
        angle: 0,
        stops: [{ at: 0, color: { from: 'hex', hex: '#000000' } }],
      }).success
    ).toBe(false)
  })
})
