import { describe, it, expect } from 'vitest'
import {
  generateBackupCodes,
  formatBackupCode,
  normalizeBackupCode,
  hashBackupCode,
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LENGTH,
} from '@/lib/backup-codes'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

describe('generateBackupCodes', () => {
  const codes = generateBackupCodes()

  it('produces the specified number of codes', () => {
    expect(codes).toHaveLength(BACKUP_CODE_COUNT)
  })

  it('uses only the Crockford alphabet, so nothing is misread off a printout', () => {
    for (const code of codes) {
      const bare = code.replace(/-/g, '')
      expect(bare).toHaveLength(BACKUP_CODE_LENGTH)
      for (const character of bare) expect(ALPHABET).toContain(character)
    }
    // The four excluded letters must never appear, or the transcription rules
    // in normalizeBackupCode would silently rewrite a real code.
    expect(codes.join('')).not.toMatch(/[ILOU]/)
  })

  it('groups in fours for reading', () => {
    for (const code of codes) expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  it('does not repeat within a set or across sets', () => {
    const many = Array.from({ length: 200 }, generateBackupCodes).flat()
    expect(new Set(many).size).toBe(many.length)
  })

  it('spreads across the alphabet rather than favouring low symbols', () => {
    // The masking in generateBackupCodes is unbiased only because the alphabet
    // is exactly 32 symbols. If someone widens it and forgets rejection
    // sampling, the low end of the alphabet starts winning; this notices.
    const sample = Array.from({ length: 400 }, generateBackupCodes)
      .flat()
      .join('')
      .replace(/-/g, '')
    const counts = new Map<string, number>()
    for (const character of sample) counts.set(character, (counts.get(character) ?? 0) + 1)

    expect(counts.size).toBe(ALPHABET.length)
    const expected = sample.length / ALPHABET.length
    for (const [, count] of counts) {
      expect(count).toBeGreaterThan(expected * 0.7)
      expect(count).toBeLessThan(expected * 1.3)
    }
  })
})

describe('normalizeBackupCode', () => {
  it('accepts the code exactly as it is displayed', () => {
    expect(normalizeBackupCode('A7K2-M9PQ-R4XT')).toBe('A7K2M9PQR4XT')
  })

  it('accepts lowercase and stray whitespace', () => {
    expect(normalizeBackupCode('  a7k2 m9pq r4xt ')).toBe('A7K2M9PQR4XT')
  })

  it('applies Crockford transcription rather than blaming the reader', () => {
    // I, l and O do not exist in the alphabet, so someone reading a printout
    // and typing them means 1, 1 and 0.
    expect(normalizeBackupCode('IL0O')).toBe('1100')
  })

  it('drops anything else instead of erroring', () => {
    expect(normalizeBackupCode('A7K2_M9PQ.R4XT!')).toBe('A7K2M9PQR4XT')
  })

  it('round-trips a generated code through its display form', () => {
    for (const code of generateBackupCodes()) {
      expect(normalizeBackupCode(code)).toBe(code.replace(/-/g, ''))
      expect(formatBackupCode(normalizeBackupCode(code))).toBe(code)
    }
  })
})

describe('hashBackupCode', () => {
  it('is stable across the display and typed forms of the same code', () => {
    expect(hashBackupCode('user_1', 'A7K2-M9PQ-R4XT')).toBe(
      hashBackupCode('user_1', 'a7k2m9pqr4xt')
    )
  })

  it('binds the hash to the user, so a stolen table cannot be attacked in bulk', () => {
    expect(hashBackupCode('user_1', 'A7K2-M9PQ-R4XT')).not.toBe(
      hashBackupCode('user_2', 'A7K2-M9PQ-R4XT')
    )
  })

  it('does not leak the code', () => {
    const hash = hashBackupCode('user_1', 'A7K2-M9PQ-R4XT')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('A7K2')
  })
})
