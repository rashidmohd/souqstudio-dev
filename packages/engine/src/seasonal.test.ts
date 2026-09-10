import { describe, expect, it } from 'vitest'
import { BLOCK_OCCASION, blockWindow, inSeason, occasionWindow } from './seasonal'

/**
 * The Hijri occasions are checked by *reading the answer back through the same
 * calendar* rather than against dates typed into this file. A hardcoded
 * "Ramadan 1447 begins on 18 February 2026" is a fact about one year that has to
 * be maintained, and a test nobody can maintain is a test that gets deleted.
 * Asserting that the computed start really is the first of the ninth month is
 * the property that has to hold in every year.
 */

const DAY = 86_400_000

const hijriOf = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  return { month: read('month'), day: read('day') }
}

describe('the Hijri occasions', () => {
  // Four points spread across the Gregorian year, so the roll-forward is
  // exercised from either side of each occasion.
  const NOWS = [
    new Date(Date.UTC(2026, 0, 15)),
    new Date(Date.UTC(2026, 5, 1)),
    new Date(Date.UTC(2027, 8, 30)),
    new Date(Date.UTC(2031, 2, 3)),
  ]

  it('starts Ramadan on the first of the ninth month, every year it is asked', () => {
    for (const now of NOWS) {
      const window = occasionWindow('ramadan', now)
      expect(window).not.toBeNull()
      expect(hijriOf(window!.starts)).toEqual({ month: 9, day: 1 })
    }
  })

  it('runs Ramadan to the day before Shawwal, so 29 and 30 day months both work', () => {
    for (const now of NOWS) {
      const window = occasionWindow('ramadan', now)!
      const last = hijriOf(window.to)
      expect(last.month).toBe(9)
      expect([29, 30]).toContain(last.day)
    }
  })

  it('opens Eid Al Fitr on the first of Shawwal', () => {
    for (const now of NOWS) {
      const window = occasionWindow('eid-al-fitr', now)!
      expect(hijriOf(window.starts)).toEqual({ month: 10, day: 1 })
    }
  })

  it('opens Eid Al Adha on the tenth of Dhu al-Hijjah', () => {
    for (const now of NOWS) {
      const window = occasionWindow('eid-al-adha', now)!
      expect(hijriOf(window.starts)).toEqual({ month: 12, day: 10 })
    }
  })

  /**
   * The eleven-day drift is the whole reason these are computed. If a stored
   * date had crept in, two consecutive years would land in the same place.
   */
  it('moves earlier against the Gregorian calendar year on year', () => {
    const first = occasionWindow('ramadan', new Date(Date.UTC(2026, 0, 1)))!.starts
    const second = occasionWindow('ramadan', new Date(Date.UTC(2027, 0, 1)))!.starts
    const drift = (second.getTime() - first.getTime()) / DAY
    expect(drift).toBeGreaterThan(340)
    expect(drift).toBeLessThan(360)
  })
})

describe('the window an owner actually sees', () => {
  it('opens three weeks before Ramadan, because a weekly book prints ahead', () => {
    const window = occasionWindow('ramadan', new Date(Date.UTC(2026, 0, 1)))!
    expect((window.starts.getTime() - window.from.getTime()) / DAY).toBe(21)
  })

  it('is in season inside the lead, and not the day before it opens', () => {
    const window = occasionWindow('ramadan', new Date(Date.UTC(2026, 0, 1)))!
    expect(inSeason('ramadan', new Date(window.from.getTime() + DAY))).toBe(true)
    expect(inSeason('ramadan', new Date(window.from.getTime() - DAY))).toBe(false)
  })

  it('rolls to next year once this year has finished', () => {
    // The day after Eid Al Adha ends, the window on offer is the next one.
    const window = occasionWindow('eid-al-adha', new Date(Date.UTC(2026, 0, 1)))!
    const after = occasionWindow('eid-al-adha', new Date(window.to.getTime() + DAY))!
    expect(after.starts.getTime()).toBeGreaterThan(window.starts.getTime())
  })
})

describe('national day', () => {
  const now = new Date(Date.UTC(2026, 0, 10))

  it('is a different date in each country, not one guessed from the language', () => {
    const ae = occasionWindow('national-day', now, 'AE')!
    const sa = occasionWindow('national-day', now, 'SA')!
    const kw = occasionWindow('national-day', now, 'KW')!

    expect([ae.starts.getUTCMonth() + 1, ae.starts.getUTCDate()]).toEqual([12, 2])
    expect([sa.starts.getUTCMonth() + 1, sa.starts.getUTCDate()]).toEqual([9, 23])
    expect([kw.starts.getUTCMonth() + 1, kw.starts.getUTCDate()]).toEqual([2, 25])
  })

  it('has none for a country outside the list, rather than a wrong one', () => {
    expect(occasionWindow('national-day', now, 'FR')).toBeNull()
  })
})

describe('the fixed occasions', () => {
  it('keeps the new year window open across the year boundary', () => {
    // 3 January is inside a window that started on 26 December of the year
    // before. Building this year's candidate alone would report it as over.
    expect(inSeason('new-year', new Date(Date.UTC(2027, 0, 3)))).toBe(true)
  })

  it('runs back to school through the middle of August', () => {
    expect(inSeason('back-to-school', new Date(Date.UTC(2026, 7, 20)))).toBe(true)
    expect(inSeason('back-to-school', new Date(Date.UTC(2026, 3, 20)))).toBe(false)
  })
})

describe('blockWindow', () => {
  const now = new Date(Date.UTC(2026, 0, 10))

  it('reads the calendar for a seeded block', () => {
    const window = blockWindow({ id: 'blk_season_ramadan', organizationId: null }, now)
    expect(window).not.toBeNull()
  })

  /** A shop's own anniversary is the one occasion nothing can compute. */
  it('has no window for the anniversary band', () => {
    expect(BLOCK_OCCASION['blk_season_anniversary']).toBe('anniversary')
    expect(blockWindow({ id: 'blk_season_anniversary', organizationId: null }, now)).toBeNull()
  })

  it("reads the row's own dates for a block the shop authored", () => {
    const from = new Date(Date.UTC(2026, 0, 5))
    const to = new Date(Date.UTC(2026, 0, 20))
    const window = blockWindow(
      { id: 'blk_owner_1', organizationId: 'org_1', activeFrom: from, activeTo: to },
      now
    )
    expect(window).toEqual({ from, starts: from, to })
  })

  it('has no window for an owner block that never set one', () => {
    expect(blockWindow({ id: 'blk_owner_2', organizationId: 'org_1' }, now)).toBeNull()
  })
})

describe('a copy carries its occasion', () => {
  const now = new Date(Date.UTC(2026, 0, 10))

  /**
   * The whole reason `occasion` is a column. `importBlocks` copies a seeded
   * block into a new row with a new cuid, so the id → occasion map has never
   * heard of the copy — and before this the copy silently stopped being
   * seasonal, which the composer could not have shown.
   */
  it('reads the row before the id map, so an imported block still works', () => {
    const copy = { id: 'ckq1imported', organizationId: 'org_1', occasion: 'ramadan' }
    const window = blockWindow(copy, now)
    expect(window).not.toBeNull()
    expect(window!.starts.getTime()).toBe(occasionWindow('ramadan', now)!.starts.getTime())
  })

  it('still reads the id map for a seeded block that has no column set', () => {
    expect(blockWindow({ id: 'blk_season_ramadan', organizationId: null }, now)).not.toBeNull()
  })

  /** A column is a string from a database, so it is checked rather than trusted. */
  it('gives no window for an occasion it does not recognise', () => {
    expect(blockWindow({ id: 'x', occasion: 'talk-like-a-pirate-day' }, now)).toBeNull()
  })

  it('leaves an owner’s own dates working when there is no occasion', () => {
    const from = new Date(Date.UTC(2026, 0, 5))
    const to = new Date(Date.UTC(2026, 0, 20))
    expect(blockWindow({ id: 'x', occasion: null, activeFrom: from, activeTo: to }, now)).toEqual({
      from,
      starts: from,
      to,
    })
  })
})
