import { describe, expect, it, vi } from 'vitest'
import type { Arrangement, BrandKit } from '@souqstudio/types'

// The module queues renders and reads rows; neither is under test here, and
// importing the real package would open a Redis connection at load.
vi.mock('@souqstudio/db', () => ({ prisma: {}, enqueueBlockThumbnail: vi.fn() }))

const { renderKey, thumbnailBox } = await import('./block-thumbnail')

/**
 * A thumbnail's key is what decides whether a list shows the PNG or draws
 * live, so it must change with anything that changes the drawing and with
 * nothing that does not.
 */

const arrangement = (aspectMin: number, aspectMax: number) =>
  ({ aspectMin, aspectMax, elements: [] }) as unknown as Arrangement // only the aspect is read here

const kit: BrandKit = {
  palette: [{ id: 'primary', name: 'Primary', hex: '#112233' }],
  primaryColor: '#112233',
}

describe('renderKey', () => {
  const base = { arrangements: [arrangement(0.6, 0.9)], kit, direction: 'ltr' as const }

  it('is the same for the same drawing, whatever order the kit was built in', () => {
    const reordered = { primaryColor: kit.primaryColor, palette: kit.palette } as BrandKit
    expect(renderKey({ ...base, kit: reordered })).toBe(renderKey(base))
  })

  it('changes with the document, the kit and the direction', () => {
    const key = renderKey(base)
    expect(renderKey({ ...base, arrangements: [arrangement(0.5, 0.9)] })).not.toBe(key)
    expect(renderKey({ ...base, kit: { ...kit, primaryColor: '#000000' } })).not.toBe(key)
    expect(renderKey({ ...base, direction: 'rtl' })).not.toBe(key)
  })
})

describe('thumbnailBox', () => {
  it('draws a repeating card at the booklet cell every list shows it in', () => {
    const box = thumbnailBox({ repeats: true, arrangements: [arrangement(0.4, 2)] })
    expect(box.height).toBe(640)
    expect(box.width / box.height).toBeCloseTo(0.72, 2)
  })

  it('draws a band wide, at its own shape', () => {
    const box = thumbnailBox({ repeats: false, arrangements: [arrangement(3, 3)] })
    expect(box).toEqual({ width: 640, height: 213 })
  })
})
