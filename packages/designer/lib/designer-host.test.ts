import { describe, expect, it } from 'vitest'
import { SHOP_HOST } from './designer-host'

/**
 * The shop app mounts the designer with no provider, so these defaults are its
 * routes. A change here is a change to every shop's designer, which is why the
 * URLs are pinned rather than derived.
 */
describe('SHOP_HOST', () => {
  it('keeps the shop app routes the designer called before it was shared', () => {
    expect(SHOP_HOST.blockUrl('b1')).toBe('/api/v1/blocks/b1')
    expect(SHOP_HOST.createUrl).toBe('/api/v1/blocks')
    expect(SHOP_HOST.designerHref('b1')).toBe('/card-designer/b1')
    expect(SHOP_HOST.exit).toEqual({ href: '/blocks', label: 'Blocks' })
    expect(SHOP_HOST.shapeUrl).toBe('/api/v1/blocks/shape')
    expect(SHOP_HOST.assetsUrl).toBe('/api/v1/blocks/assets')
    expect(SHOP_HOST.artworkUrl).toBe('/api/v1/blocks/artwork')
    expect(SHOP_HOST.artworkVectorUrl).toBe('/api/v1/blocks/artwork/vector')
    expect(SHOP_HOST.generatedUrl).toBe('/api/v1/brand/generated')
  })

  it('lets a shop set availability from inside the designer', () => {
    expect(SHOP_HOST.availability).toBe(true)
  })
})
