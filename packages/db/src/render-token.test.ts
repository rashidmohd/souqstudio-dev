import { describe, expect, it } from 'vitest'
import { renderQuery, signRender, verifyRender, type RenderClaim } from './render-token'

const SECRET = 'test-secret'
const claim: RenderClaim = {
  blockId: 'blk_1',
  kit: { shopId: 'shop_1' },
  direction: 'ltr',
  expires: 2_000,
}

describe('render tokens', () => {
  it('verifies the claim it signed', () => {
    expect(verifyRender(claim, signRender(claim, SECRET), SECRET, 1_000)).toBe(true)
  })

  it('refuses a token for a different block, kit or direction', () => {
    const sig = signRender(claim, SECRET)
    expect(verifyRender({ ...claim, blockId: 'blk_2' }, sig, SECRET, 1_000)).toBe(false)
    expect(verifyRender({ ...claim, kit: { library: true } }, sig, SECRET, 1_000)).toBe(false)
    expect(verifyRender({ ...claim, direction: 'rtl' }, sig, SECRET, 1_000)).toBe(false)
  })

  it('refuses an expired token and a malformed signature', () => {
    expect(verifyRender(claim, signRender(claim, SECRET), SECRET, 2_001)).toBe(false)
    expect(verifyRender(claim, 'not-hex', SECRET, 1_000)).toBe(false)
  })

  it('puts the kit source in the query', () => {
    expect(new URLSearchParams(renderQuery(claim, SECRET)).get('shop')).toBe('shop_1')
    const library = renderQuery({ ...claim, kit: { library: true } }, SECRET)
    expect(new URLSearchParams(library).get('library')).toBe('1')
  })
})
