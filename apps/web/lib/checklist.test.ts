import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrandKit } from '@souqstudio/types'

/**
 * The checklist's rules, with Prisma standing in for the database.
 *
 * What is worth testing is the policy: which items block completion, when the
 * list may be dismissed, and when it disappears on its own. Whether
 * `findFirst` finds a row is Prisma's business.
 */

const prisma = {
  offerBook: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  socialConnection: { findFirst: vi.fn() },
}

vi.mock('@souqstudio/db', () => ({ prisma }))

const { readChecklist } = await import('@/lib/checklist')

const COMPLETE_KIT: BrandKit = {
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  gridId: 'grid_2x2',
  templateId: 'tpl_clean',
}

/** Nothing done, nothing published, no teammates, no Instagram. */
function nothingYet() {
  prisma.offerBook.findFirst.mockResolvedValue(null)
  prisma.user.findFirst.mockResolvedValue(null)
  prisma.socialConnection.findFirst.mockResolvedValue(null)
}

function read(overrides: Partial<Parameters<typeof readChecklist>[0]> = {}) {
  return readChecklist({
    userId: 'user_1',
    organizationId: 'org_1',
    shopIds: ['shop_1'],
    brandKit: {},
    dismissedAt: null,
    ...overrides,
  })
}

const idOf = (state: Awaited<ReturnType<typeof readChecklist>>, id: string) =>
  state.items.find((item) => item.id === id)

beforeEach(() => {
  vi.clearAllMocks()
  nothingYet()
})

describe('the five items of E1-05', () => {
  it('lists them in the order the epic gives', async () => {
    const state = await read()
    expect(state.items.map((item) => item.id)).toEqual([
      'brand',
      'first_book',
      'share_book',
      'invite_team',
      'connect_instagram',
    ])
  })

  it('marks only Instagram optional', async () => {
    const state = await read()
    expect(state.items.filter((item) => item.optional).map((i) => i.id)).toEqual([
      'connect_instagram',
    ])
  })
})

describe('brand setup', () => {
  it('is done when the kit has colours, a grid and a template', async () => {
    expect(idOf(await read({ brandKit: COMPLETE_KIT }), 'brand')?.done).toBe(true)
  })

  it('is not done for a half-finished kit', async () => {
    const partial: BrandKit = { primaryColor: '#111111', gridId: 'grid_2x2' }
    expect(idOf(await read({ brandKit: partial }), 'brand')?.done).toBe(false)
  })

  it('sends an unfinished kit to the wizard', async () => {
    expect(idOf(await read(), 'brand')?.href).toBe('/onboarding')
  })

  it('sends a finished kit to the brand kit screen, not back through the wizard', async () => {
    // `/onboarding` redirects home the moment the kit is complete, so pointing
    // a done item there is a link to a bounce. E4-05 built the destination.
    expect(idOf(await read({ brandKit: COMPLETE_KIT }), 'brand')?.href).toBe('/brand')
  })

  it('always has somewhere to go', async () => {
    for (const kit of [{}, COMPLETE_KIT]) {
      expect(idOf(await read({ brandKit: kit }), 'brand')?.href).not.toBeNull()
    }
  })
})

describe('items measured from data, never remembered', () => {
  it('first book is done once any offer book exists', async () => {
    prisma.offerBook.findFirst.mockResolvedValue({ id: 'book_1' })
    const state = await read()
    expect(idOf(state, 'first_book')?.done).toBe(true)
  })

  it('sharing is done only when one is published, not merely created', async () => {
    // First call is "any book", second is "a published book".
    prisma.offerBook.findFirst
      .mockResolvedValueOnce({ id: 'book_1' })
      .mockResolvedValueOnce(null)

    const state = await read()
    expect(idOf(state, 'first_book')?.done).toBe(true)
    expect(idOf(state, 'share_book')?.done).toBe(false)
  })

  it('a teammate means another user in the same organization', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user_2' })
    expect(idOf(await read(), 'invite_team')?.done).toBe(true)
  })

  it('does not count the owner as their own teammate', async () => {
    await read()
    // The query has to exclude the asking user, or every account starts with
    // "invite a team member" already ticked.
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'user_1' } }),
      })
    )
  })

  it('Instagram is done when a connection exists', async () => {
    prisma.socialConnection.findFirst.mockResolvedValue({ id: 'conn_1' })
    expect(idOf(await read(), 'connect_instagram')?.done).toBe(true)
  })

  it('asks nothing of the database when the account has no shop', async () => {
    const state = await read({ shopIds: [] })
    expect(prisma.offerBook.findFirst).not.toHaveBeenCalled()
    expect(state.items.filter((item) => item.done)).toHaveLength(0)
  })
})

describe('completion', () => {
  it('ignores the optional item', async () => {
    // Everything required done, Instagram not connected.
    prisma.offerBook.findFirst.mockResolvedValue({ id: 'book_1' })
    prisma.user.findFirst.mockResolvedValue({ id: 'user_2' })
    prisma.socialConnection.findFirst.mockResolvedValue(null)

    const state = await read({ brandKit: COMPLETE_KIT })
    expect(state.allRequiredDone).toBe(true)
    expect(idOf(state, 'connect_instagram')?.done).toBe(false)
  })

  it('is false while any required item is outstanding', async () => {
    prisma.offerBook.findFirst.mockResolvedValue({ id: 'book_1' })
    const state = await read({ brandKit: COMPLETE_KIT })
    expect(state.allRequiredDone).toBe(false)
  })
})

describe('dismissal and visibility', () => {
  it('cannot be dismissed before an offer book is published', async () => {
    prisma.offerBook.findFirst.mockResolvedValueOnce({ id: 'book_1' }).mockResolvedValueOnce(null)
    expect((await read()).dismissible).toBe(false)
  })

  it('can be dismissed once one is published', async () => {
    prisma.offerBook.findFirst.mockResolvedValue({ id: 'book_1' })
    expect((await read()).dismissible).toBe(true)
  })

  it('hides itself once every required item is done, dismissed or not', async () => {
    prisma.offerBook.findFirst.mockResolvedValue({ id: 'book_1' })
    prisma.user.findFirst.mockResolvedValue({ id: 'user_2' })

    const state = await read({ brandKit: COMPLETE_KIT })
    expect(state.dismissed).toBe(false)
    expect(state.visible).toBe(false)
  })

  it('stays hidden after dismissal even with work outstanding', async () => {
    const state = await read({ dismissedAt: new Date() })
    expect(state.allRequiredDone).toBe(false)
    expect(state.visible).toBe(false)
  })

  it('is visible for a fresh account with work to do', async () => {
    expect((await read()).visible).toBe(true)
  })
})

describe('destinations that do not exist yet', () => {
  it('gives no href, and says why, rather than pointing at a 404', async () => {
    const state = await read()
    for (const id of ['first_book', 'share_book', 'connect_instagram']) {
      const item = idOf(state, id)
      // These are all gated on lib/features.ts flags that are false today.
      expect(item?.href).toBeNull()
      expect(item?.unavailableReason).toBeTruthy()
    }
  })

  it('links invite_team now that E2 built /settings/team', async () => {
    // This item was in the list above until E2-03 flipped TEAM_BUILT. It is
    // here rather than deleted because the pairing is the thing worth
    // protecting: a flag turning on and the link staying dead is exactly the
    // half-done state lib/features.ts exists to make impossible.
    const item = idOf(await read(), 'invite_team')
    expect(item?.href).toBe('/settings/team')
    expect(item?.unavailableReason).toBeFalsy()
  })
})
