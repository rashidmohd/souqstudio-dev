import { describe, expect, it } from 'vitest'
import { clientIp, isAllowed, parseAllowlist } from './ip-allowlist'

describe('parseAllowlist', () => {
  it('is empty when the variable is unset', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
  })

  it('trims and drops blanks, so a trailing comma is harmless', () => {
    expect(parseAllowlist(' 10.0.0.1 , , 10.0.0.2,')).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('clientIp', () => {
  it('reads the first entry of x-forwarded-for, not the last', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })
    expect(clientIp(headers)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('is null when neither header is present', () => {
    expect(clientIp(new Headers())).toBeNull()
  })

  it('folds an IPv4-mapped IPv6 address to its IPv4 form', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '::ffff:127.0.0.1' }))).toBe('127.0.0.1')
  })
})

describe('isAllowed', () => {
  it('allows everything when the list is empty, which is development', () => {
    expect(isAllowed('203.0.113.7', [])).toBe(true)
    expect(isAllowed(null, [])).toBe(true)
  })

  it('refuses an unresolvable address once a list is set', () => {
    expect(isAllowed(null, ['10.0.0.1'])).toBe(false)
  })

  it('matches a bare address', () => {
    expect(isAllowed('10.0.0.1', ['10.0.0.1'])).toBe(true)
    expect(isAllowed('10.0.0.2', ['10.0.0.1'])).toBe(false)
  })

  it('matches an IPv4 CIDR block', () => {
    expect(isAllowed('10.0.3.200', ['10.0.0.0/16'])).toBe(true)
    expect(isAllowed('10.1.3.200', ['10.0.0.0/16'])).toBe(false)
  })

  it('handles a /24 boundary without sign overflow', () => {
    expect(isAllowed('192.168.1.255', ['192.168.1.0/24'])).toBe(true)
    expect(isAllowed('192.168.2.0', ['192.168.1.0/24'])).toBe(false)
  })

  it('handles the high half of the address space, where a signed shift would break', () => {
    expect(isAllowed('200.0.0.5', ['200.0.0.0/8'])).toBe(true)
    expect(isAllowed('201.0.0.5', ['200.0.0.0/8'])).toBe(false)
  })

  it('treats /0 as everything, since somebody will write it', () => {
    expect(isAllowed('8.8.8.8', ['10.0.0.0/0'])).toBe(true)
  })

  it('folds IPv4-mapped IPv6 on both sides', () => {
    expect(isAllowed('::ffff:127.0.0.1', ['127.0.0.1'])).toBe(true)
    expect(isAllowed('127.0.0.1', ['::ffff:127.0.0.1'])).toBe(true)
  })

  it('matches IPv6 literally and never by range', () => {
    expect(isAllowed('::1', ['::1'])).toBe(true)
    expect(isAllowed('2001:db8::1', ['::1'])).toBe(false)
  })

  it('rejects a malformed CIDR rather than matching it', () => {
    expect(isAllowed('10.0.0.1', ['10.0.0.0/33'])).toBe(false)
    expect(isAllowed('10.0.0.1', ['10.0.0.0/abc'])).toBe(false)
  })
})
