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

/**
 * A photo this shop supplied for a product it does not own.
 *
 * **The case the column exists for.** A contributed asset sits on a *universal*
 * product, so it is held back from every other tenant until a human accepts it
 * — but the shop that supplied it must see its own flyer finished tonight, not
 * after a reviewer gets in. `imageVisibility` in `lib/catalog.ts` is the SQL
 * half of the same rule; the query hands this function only what the shop may
 * see, and this decides which of those wins.
 */
describe('pickImage — contributed photos', () => {
  const ORG = 'org_1'
  const mine = { kind: 'ORIGINAL' as const, r2Key: 'mine.jpg', contributedBy: ORG }
  const myCutout = { kind: 'CUTOUT' as const, r2Key: 'mine-cut.png', contributedBy: ORG }
  const shared = { kind: 'ORIGINAL' as const, r2Key: 'shared.jpg', contributedBy: null }
  const sharedCutout = { kind: 'CUTOUT' as const, r2Key: 'shared-cut.png', contributedBy: null }

  it('prefers the shop own photo over the shared one, cutout or not', () => {
    // The shared row has the *better* asset — an approved cutout — and the
    // shop's own is a plain packshot. Their own still wins: they supplied it
    // because the shared picture was not the one they wanted printed.
    expect(pickImage([sharedCutout, mine], ORG)).toBe(mine)
  })

  it('still prefers a cutout among the shop own assets', () => {
    expect(pickImage([mine, myCutout], ORG)).toBe(myCutout)
  })

  it('falls back to the shared photo when this shop contributed none', () => {
    expect(pickImage([sharedCutout, shared], ORG)).toBe(sharedCutout)
  })

  it('ignores the preference with no organization, as the old callers do', () => {
    // `pickImage` is called without an organization from paths that are not
    // tenant-scoped. Those must behave exactly as before this column existed.
    expect(pickImage([sharedCutout, mine])).toBe(sharedCutout)
  })
})
