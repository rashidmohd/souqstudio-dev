import { describe, it, expect } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes the first and last word of a name', () => {
    expect(initials('Rashid Mohammed', 'r@example.com')).toBe('RM')
    expect(initials('Ahmed bin Salem', 'a@example.com')).toBe('AS')
  })

  it('takes one letter from a single-word name', () => {
    expect(initials('Rashid', 'r@example.com')).toBe('R')
  })

  it('tolerates the whitespace a paste leaves behind', () => {
    expect(initials('  Rashid   Mohammed  ', 'r@example.com')).toBe('RM')
  })

  it('falls back to the email local part when there is no name', () => {
    expect(initials(null, 'rashid@example.com')).toBe('R')
    expect(initials('', 'rashid@example.com')).toBe('R')
    expect(initials('   ', 'rashid@example.com')).toBe('R')
  })

  it('never takes initials from the domain', () => {
    expect(initials(null, 'zaid@souqstudio.com')).toBe('Z')
  })

  it('handles Arabic, which has no case', () => {
    expect(initials('راشد محمد', 'r@example.com')).toBe('رم')
  })

  it('does not split a surrogate pair', () => {
    // A mathematical-bold A: one code point, two UTF-16 units.
    expect(initials('\u{1D400}ida', 'a@example.com')).toBe('\u{1D400}')
  })

  it('always renders something', () => {
    expect(initials(null, '')).toBe('?')
  })
})
