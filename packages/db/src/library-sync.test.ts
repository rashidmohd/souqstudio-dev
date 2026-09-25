import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeedBlock } from '@souqstudio/engine'

/**
 * The prune is the part of the sync that deletes things, and the admin
 * designer's drafts are platform rows that are in no library by definition.
 * These pin the one rule that keeps them: drafts are never considered.
 */

const block = {
  upsert: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}

vi.mock('./client', () => ({
  prisma: {
    block,
    pageGrid: { findMany: vi.fn(async () => []) },
    bookPin: { findMany: vi.fn(async () => []) },
  },
}))

const { syncLibrary } = await import('./library-sync')

// Only `id` is read by the prune and the upsert's `where`; the rest is written
// through. A partial document is enough to exercise both.
const seed = (id: string) =>
  ({
    id,
    name: id,
    description: '',
    repeats: true,
    arrangements: [],
    isSeasonal: false,
    category: 'offer-card',
  }) as unknown as SeedBlock

describe('syncLibrary prune', () => {
  beforeEach(() => {
    block.findMany.mockReset()
  })

  it('asks only for platform rows that are not drafts', async () => {
    block.findMany.mockResolvedValue([])

    await syncLibrary([seed('blk_kept')])

    expect(block.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: null, NOT: { status: 'draft' } },
      })
    )
  })

  it('deletes a retired published block and nothing else', async () => {
    block.findMany.mockResolvedValue([
      { id: 'blk_kept', name: 'Kept', status: 'published' },
      { id: 'blk_retired', name: 'Retired', status: 'published' },
    ])

    const result = await syncLibrary([seed('blk_kept')])

    expect(result.deleted).toBe(1)
    expect(block.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['blk_retired'] } } })
  })
})

describe('syncLibrary occasion', () => {
  beforeEach(() => {
    block.findMany.mockResolvedValue([])
    block.upsert.mockReset()
  })

  it("writes the document's own occasion over the compiled-in map", async () => {
    await syncLibrary([{ ...seed('blk_season_ramadan'), occasion: 'eid-al-fitr' as const }])
    expect(block.upsert.mock.calls[0]?.[0].create.occasion).toBe('eid-al-fitr')
  })

  it('falls back to the map for a document that names none', async () => {
    await syncLibrary([seed('blk_season_ramadan')])
    expect(block.upsert.mock.calls[0]?.[0].create.occasion).toBe('ramadan')
  })

  it('writes null for a block in neither', async () => {
    await syncLibrary([seed('blk_e2e_plain')])
    expect(block.upsert.mock.calls[0]?.[0].create.occasion).toBeNull()
  })
})

