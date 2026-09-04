import { describe, it, expect } from 'vitest'
import { RAIL_COOKIE, parseRailState, railCookie } from './rail-preference'

/**
 * The cookie is client-controlled, so what is worth testing is that a hostile
 * or absent value still produces a rail, and that the written cookie survives a
 * browser restart.
 */
describe('parseRailState', () => {
  it('reads the collapsed state', () => {
    expect(parseRailState('collapsed')).toBe('collapsed')
  })

  it('falls back to expanded for anything else', () => {
    for (const value of [undefined, '', 'expanded', 'COLLAPSED', 'true', '1', '{}']) {
      expect(parseRailState(value)).toBe('expanded')
    }
  })
})

describe('railCookie', () => {
  it('writes a year-long, lax, path-wide preference', () => {
    const cookie = railCookie('collapsed', false)
    expect(cookie).toContain(`${RAIL_COOKIE}=collapsed`)
    expect(cookie).toContain('max-age=31536000')
    expect(cookie).toContain('samesite=lax')
    expect(cookie).toContain('path=/')
  })

  it('omits secure off https and adds it on', () => {
    expect(railCookie('expanded', false)).not.toContain('secure')
    expect(railCookie('expanded', true)).toContain('secure')
  })
})
