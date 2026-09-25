import { describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
vi.mock('./client', () => ({ prisma: { libraryShape: { findMany } } }))

const { listGalleryShapes } = await import('./shape-gallery')

const good = {
  id: 's1',
  name: 'Crescent',
  group: 'seasonal',
  occasion: 'ramadan',
  status: 'published',
  art: { width: 100, height: 100, paths: [{ d: 'M0 0 L100 0 L100 100 Z' }] },
  updatedAt: new Date(),
}

describe('listGalleryShapes', () => {
  it('reads only the statuses asked for', async () => {
    findMany.mockResolvedValue([])
    await listGalleryShapes(['published'])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['published'] } } })
    )
  })

  it('skips a row whose outline no longer validates, and serves the rest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    findMany.mockResolvedValue([
      good,
      { ...good, id: 's2', art: { width: 100, height: 100, paths: [{ d: '<script>' }] } },
    ])
    const shapes = await listGalleryShapes()
    expect(shapes.map((s) => s.id)).toEqual(['s1'])
  })
})
