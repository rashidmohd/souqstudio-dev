import { describe, expect, it } from 'vitest'
import { autoTitle, baseTitle, isoWeek } from '@/lib/book-title'

const at = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)

describe('isoWeek', () => {
  /**
   * The year boundary, which is the whole reason this is not a division.
   *
   * ISO week 1 is the week holding the first Thursday of January, so the last
   * days of December belong to week 1 of the *next* year and the first days of
   * January can belong to week 52 or 53 of the last one. A naive count restarts
   * at 1 on 1 January and produces two "Week 1 offers" eleven months apart.
   */
  it.each([
    // 2026-01-01 is a Thursday, so it is genuinely week 1 of 2026.
    ['2026-01-01', 1, 2026],
    // 2025-12-29 is the Monday of that same week 1.
    ['2025-12-29', 1, 2026],
    // 2025-12-28 is the Sunday before it: still week 52 of 2025.
    ['2025-12-28', 52, 2025],
    // 2021-01-01 was a Friday, in the week of 2020's last Thursday: week 53.
    ['2021-01-01', 53, 2020],
    ['2026-09-10', 37, 2026],
    ['2026-12-31', 53, 2026],
  ])('reads %s as week %i of %i', (iso, week, year) => {
    expect(isoWeek(at(iso))).toEqual({ week, year })
  })

  it('gives every day of one ISO week the same number', () => {
    // Monday 7 September 2026 through Sunday the 13th.
    const week = ['07', '08', '09', '10', '11', '12', '13'].map(
      (day) => isoWeek(at(`2026-09-${day}`)).week
    )
    expect(new Set(week)).toEqual(new Set([37]))
  })

  it('starts a new number on the Monday', () => {
    expect(isoWeek(at('2026-09-13')).week).toBe(37)
    expect(isoWeek(at('2026-09-14')).week).toBe(38)
  })
})

describe('baseTitle', () => {
  /* A weekly promotion is called "week 37" out loud. A post is not. */
  it('counts a booklet in weeks', () => {
    expect(baseTitle('booklet', at('2026-09-10'))).toBe('Week 37 offers')
  })

  it.each([
    ['post', 'Post 10 September'],
    ['status', 'Status 10 September'],
    ['poster', 'Poster 10 September'],
  ] as const)('counts a %s in days', (kind, expected) => {
    expect(baseTitle(kind, at('2026-09-10'))).toBe(expected)
  })

  /* Sentence case everywhere, and no em dash in anything that reaches a screen. */
  it('writes a name with no dash in it', () => {
    for (const iso of ['2026-01-05', '2026-09-10', '2026-12-31']) {
      for (const kind of ['booklet', 'post', 'status', 'poster'] as const) {
        expect(baseTitle(kind, at(iso))).not.toMatch(/[—–-]/)
      }
    }
  })
})

describe('autoTitle', () => {
  it('uses the plain name when it is free', () => {
    expect(autoTitle('booklet', [], at('2026-09-10'))).toBe('Week 37 offers')
  })

  /**
   * The case this exists for. This is the one flow in the product that reliably
   * produces the same string twice: two posts on one afternoon, or a booklet
   * reissued inside a week.
   */
  it('numbers a name the shop already has', () => {
    expect(autoTitle('booklet', ['Week 37 offers'], at('2026-09-10'))).toBe('Week 37 offers 2')
  })

  it('keeps counting past the second', () => {
    const existing = ['Week 37 offers', 'Week 37 offers 2', 'Week 37 offers 3']
    expect(autoTitle('booklet', existing, at('2026-09-10'))).toBe('Week 37 offers 4')
  })

  it('fills a gap rather than always taking the next number', () => {
    const existing = ['Week 37 offers', 'Week 37 offers 3']
    expect(autoTitle('booklet', existing, at('2026-09-10'))).toBe('Week 37 offers 2')
  })

  it('is not confused by a book from another week', () => {
    expect(autoTitle('booklet', ['Week 36 offers'], at('2026-09-10'))).toBe('Week 37 offers')
  })

  /* A second post made the same day is not a copy of the first. */
  it('does not call it a copy', () => {
    expect(autoTitle('post', ['Post 10 September'], at('2026-09-10'))).not.toContain('copy')
  })

  it('never returns something a shop already has, even at the ceiling', () => {
    const existing = [
      'Week 37 offers',
      ...Array.from({ length: 200 }, (_, n) => `Week 37 offers ${n + 2}`),
    ]
    expect(existing).not.toContain(autoTitle('booklet', existing, at('2026-09-10')))
  })

  it('stays inside the 160 character bound the column and the route both set', () => {
    for (const kind of ['booklet', 'post', 'status', 'poster'] as const) {
      expect(autoTitle(kind, [], at('2026-09-10')).length).toBeLessThanOrEqual(160)
    }
  })
})
