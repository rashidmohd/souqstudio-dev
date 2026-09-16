import { describe, expect, it } from 'vitest'
import { pickImage } from '@/lib/offer-book'

/**
 * Which image a card draws. E5 §3.
 *
 * **This exists because the bug it pins could not be seen from anywhere else.**
 * The precedence was `orderBy: { kind: 'asc' }` on a Postgres enum, whose
 * declaration order is ORIGINAL, CUTOUT, THUMB — so ascending returned the
 * ORIGINAL and every product with a good cutout was drawn with its background
 * still on. The composer is pure and draws the row it is handed, so its tests
 * passed; the query had no test at all. Pulling the rule into a function is what
 * makes it testable.
 */

const cutout = { kind: 'CUTOUT' as const, r2Key: 'cutout.png' }
const original = { kind: 'ORIGINAL' as const, r2Key: 'original.jpg' }

describe('pickImage', () => {
  it('prefers a cutout over an original, whatever order they arrive in', () => {
    expect(pickImage([original, cutout])).toBe(cutout)
    expect(pickImage([cutout, original])).toBe(cutout)
  })

  it('falls back to the original when there is no cutout', () => {
    expect(pickImage([original])).toBe(original)
  })

  it('takes the newest of several originals — the query orders them', () => {
    const newer = { kind: 'ORIGINAL' as const, r2Key: 'newer.jpg' }
    expect(pickImage([newer, original])).toBe(newer)
  })

  it('has nothing to draw when the product has no images', () => {
    expect(pickImage([])).toBeUndefined()
  })
})
