/**
 * When a seasonal block is in season. E7-03.
 *
 * **The columns existed and nothing read them, and the reason was real**: the
 * three occasions that matter most in this market — Ramadan and both Eids —
 * move about eleven days earlier against the Gregorian calendar every year, so
 * a `activeFrom`/`activeTo` pair written into a seeded row is wrong within a
 * year of shipping and silently wrong for as long as nobody re-seeds. That is
 * why `docs/STATUS.md` recorded the blocks as "marked `isSeasonal` and carrying
 * no dates".
 *
 * So the dates are **computed rather than stored**. A seeded block names an
 * occasion; the occasion knows whether it is fixed to a Gregorian date, fixed
 * to a Hijri one, or a property of the shop's country — and the window is
 * derived for whatever "now" it is asked about. Nothing to re-seed, and a
 * library shipped today is still correct in 2032.
 *
 * `blocks.activeFrom` and `activeTo` keep their meaning for a block the *shop*
 * authored, where a date really is a fact about the row: a shop's own
 * anniversary band has no occasion anybody else could compute.
 *
 * Here rather than in the web app because the export worker will want the same
 * answer — a book generated on a schedule has to agree with the picker about
 * what is in season, and two implementations of a moving calendar is the worst
 * possible thing to own two of.
 */

/**
 * The occasions a seeded block can name.
 *
 * `anniversary` is deliberately in the list and deliberately has no window: it
 * is the one occasion that belongs to the shop rather than the calendar, and
 * saying so here is better than leaving it out and having the caller guess what
 * an unmapped block means.
 */
export type Occasion =
  | 'ramadan'
  | 'eid-al-fitr'
  | 'eid-al-adha'
  | 'national-day'
  | 'back-to-school'
  | 'summer'
  | 'shopping-festival'
  | 'new-year'
  | 'mothers-day'
  | 'anniversary'

export interface SeasonWindow {
  /** When the block starts being offered — the occasion, less its lead. */
  from: Date
  /** The last moment it is in season. */
  to: Date
  /** The occasion itself, without the lead. What a label should say. */
  starts: Date
}

/**
 * Which seeded block belongs to which occasion.
 *
 * A map rather than a column on `blocks`, for the same reason
 * `BlockImportDialog` reads categories from the library: it is a property of the
 * design we shipped, not a fact about a database record, and a column would be
 * one only the seed ever writes.
 */
export const BLOCK_OCCASION: Record<string, Occasion> = {
  blk_season_ramadan: 'ramadan',
  blk_season_ramadan_cover: 'ramadan',
  blk_season_eid_fitr: 'eid-al-fitr',
  blk_season_eid_adha: 'eid-al-adha',
  blk_season_national_day: 'national-day',
  blk_season_back_to_school: 'back-to-school',
  blk_season_summer: 'summer',
  blk_season_shopping_festival: 'shopping-festival',
  blk_season_new_year: 'new-year',
  blk_season_mothers_day: 'mothers-day',
  blk_season_anniversary: 'anniversary',
}

/**
 * How long before an occasion its block starts being offered.
 *
 * **A greeting band is useless on the day.** A weekly book goes to print days
 * ahead, so a Ramadan band that appears on the first of Ramadan appears after
 * the issue it belonged in. Three weeks for the occasions people plan a whole
 * campaign around, one for the rest.
 */
const LEAD_DAYS: Record<Occasion, number> = {
  ramadan: 21,
  'eid-al-fitr': 21,
  'eid-al-adha': 21,
  'national-day': 14,
  'back-to-school': 14,
  summer: 7,
  'shopping-festival': 14,
  'new-year': 7,
  'mothers-day': 14,
  anniversary: 0,
}

/**
 * National days, by the country on the organization.
 *
 * `[month, day, length]`, month 1-based. **Not a guess from the locale**: the
 * Gulf national days fall on six different dates and a band that greets a Saudi
 * shop on the second of December is worse than no band at all.
 */
const NATIONAL_DAY: Record<string, [number, number, number]> = {
  AE: [12, 2, 2],
  SA: [9, 23, 1],
  KW: [2, 25, 2],
  BH: [12, 16, 2],
  OM: [11, 18, 2],
  QA: [12, 18, 1],
}

const DAY = 86_400_000

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day))

/** The last moment of a day, so a window that ends on a date includes it. */
const endOf = (date: Date) => new Date(date.getTime() + DAY - 1)

/**
 * A Gregorian date read as a Hijri one, through the Umm al-Qura calendar.
 *
 * `islamic-umalqura` is the civil calendar Saudi Arabia and the Gulf states
 * publish, which is the one shops print against. The purely astronomical
 * variants and the tabular ones disagree with it by a day either way, and a day
 * is the whole difference between a band appearing on Eid and after it.
 */
function hijri(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  // The year part comes through as "1447 AH" in some ICU builds, so it is parsed
  // rather than cast — `Number('1447 AH')` is NaN and would silently poison the
  // search below.
  const year = parseInt(parts.find((part) => part.type === 'year')?.value ?? '0', 10)

  return { year, month: read('month'), day: read('day') }
}

const asNumber = (h: { year: number; month: number; day: number }) =>
  h.year * 10_000 + h.month * 100 + h.day

/**
 * The Gregorian date a Hijri one falls on.
 *
 * Estimated from the mean Hijri year and then walked a day at a time. The
 * estimate lands within a few days in either direction, so the walk is short —
 * and it is bounded, because an unbounded loop over a calendar conversion is
 * how a picker hangs the browser on a date nobody tested.
 */
function fromHijri(year: number, month: number, day: number): Date {
  const target = asNumber({ year, month, day })
  const epoch = Date.UTC(622, 6, 16)
  // **Whole days, rounded before they are multiplied.** Rounding the
  // milliseconds instead leaves the estimate at some time in the afternoon, the
  // day-at-a-time walk preserves it, and every date this returns is then
  // 11:03 rather than midnight — which is invisible until `endOf` adds a day
  // less a millisecond to one and lands in the next Hijri month.
  const days = Math.round((year - 1) * 354.367 + (month - 1) * 29.531 + (day - 1))

  let cursor = new Date(epoch + days * DAY)
  for (let step = 0; step < 90; step += 1) {
    const current = asNumber(hijri(cursor))
    if (current === target) return cursor
    cursor = new Date(cursor.getTime() + (current < target ? DAY : -DAY))
  }
  return cursor
}

/**
 * The window an occasion is offered in, for the year `now` sits in — or the
 * next one, once this year's has passed.
 *
 * **Looking forward rather than back is the whole point.** An owner opening the
 * picker two days after Eid is not making an Eid book; an owner opening it three
 * weeks before Ramadan is. So a window that has ended rolls to the next
 * occurrence, and the caller can show "in 18 days" against it.
 *
 * `null` means the occasion has no calendar of its own — a shop's anniversary,
 * or a country this does not have a national day for. Those blocks stay in the
 * library and are simply never promoted.
 */
export function occasionWindow(
  occasion: Occasion,
  now: Date,
  country = 'AE'
): SeasonWindow | null {
  const lead = LEAD_DAYS[occasion] * DAY
  const wrap = (starts: Date, ends: Date): SeasonWindow => ({
    from: new Date(starts.getTime() - lead),
    starts,
    to: endOf(ends),
  })

  const pick = (candidates: [Date, Date][]): SeasonWindow | null => {
    // The first window that has not finished yet. Candidates are built for this
    // year and the next, so there is always one.
    for (const [starts, ends] of candidates) {
      const window = wrap(starts, ends)
      if (now.getTime() <= window.to.getTime()) return window
    }
    return null
  }

  const year = now.getUTCFullYear()

  if (occasion === 'anniversary') return null

  if (occasion === 'ramadan' || occasion === 'eid-al-fitr' || occasion === 'eid-al-adha') {
    const thisYear = hijri(now).year
    const candidates: [Date, Date][] = []

    for (const hy of [thisYear, thisYear + 1]) {
      if (occasion === 'ramadan') {
        // Ends the day before Shawwal opens, which is what makes this correct in
        // both a 29-day and a 30-day Ramadan without knowing which it is.
        const starts = fromHijri(hy, 9, 1)
        candidates.push([starts, new Date(fromHijri(hy, 10, 1).getTime() - DAY)])
      } else if (occasion === 'eid-al-fitr') {
        const starts = fromHijri(hy, 10, 1)
        candidates.push([starts, new Date(starts.getTime() + 2 * DAY)])
      } else {
        const starts = fromHijri(hy, 12, 10)
        candidates.push([starts, new Date(starts.getTime() + 3 * DAY)])
      }
    }
    return pick(candidates)
  }

  if (occasion === 'national-day') {
    const entry = NATIONAL_DAY[country.toUpperCase()]
    if (entry === undefined) return null
    const [month, day, length] = entry
    return pick(
      [year, year + 1].map((y) => {
        const starts = utc(y, month, day)
        return [starts, new Date(starts.getTime() + (length - 1) * DAY)] as [Date, Date]
      })
    )
  }

  const FIXED: Record<string, [[number, number], [number, number]]> = {
    'back-to-school': [
      [8, 15],
      [9, 15],
    ],
    summer: [
      [6, 1],
      [8, 31],
    ],
    'shopping-festival': [
      [12, 15],
      [1, 29],
    ],
    'new-year': [
      [12, 26],
      [1, 7],
    ],
    'mothers-day': [
      [3, 21],
      [3, 21],
    ],
  }

  const fixed = FIXED[occasion]
  if (fixed === undefined) return null
  const [[fromMonth, fromDay], [toMonth, toDay]] = fixed

  return pick(
    // The year before is a candidate too, because a window that crosses the new
    // year — the shopping festival, the new year band — is still running in
    // January for a start date in the previous December.
    [year - 1, year, year + 1].map((y) => {
      const starts = utc(y, fromMonth, fromDay)
      const ends = utc(toMonth < fromMonth ? y + 1 : y, toMonth, toDay)
      return [starts, ends] as [Date, Date]
    })
  )
}

/** Whether a string names an occasion this knows. */
export const isOccasion = (value: string): value is Occasion =>
  Object.prototype.hasOwnProperty.call(LEAD_DAYS, value)

/** Whether an occasion's block should be promoted right now. */
export function inSeason(occasion: Occasion, now: Date, country = 'AE'): boolean {
  const window = occasionWindow(occasion, now, country)
  if (window === null) return false
  return now.getTime() >= window.from.getTime() && now.getTime() <= window.to.getTime()
}

/**
 * The window for a block, whoever authored it.
 *
 * A seeded block names an occasion and the calendar decides; a block the shop
 * authored carries its own dates on the row, because a shop's own anniversary is
 * a fact about that shop and nothing can compute it. The two are the same
 * question — "should this be at the top today" — asked of different sources.
 */
export function blockWindow(
  block: {
    id: string
    /**
     * From the row. **Read before the id map**, because an import makes a copy
     * with a new cuid — the map knows `blk_season_ramadan` and has never heard
     * of the copy an owner took of it. The column is what carries the fact
     * across the copy, and carries it correctly next year too, because the
     * window is still derived rather than frozen.
     */
    occasion?: string | null
    organizationId?: string | null
    activeFrom?: Date | null
    activeTo?: Date | null
  },
  now: Date,
  country = 'AE'
): SeasonWindow | null {
  const named = block.occasion ?? BLOCK_OCCASION[block.id]
  // A string from a database column, so it is checked rather than trusted: a
  // value nothing recognises means no window, not a crash in a picker.
  if (named !== undefined && named !== null && isOccasion(named)) {
    return occasionWindow(named, now, country)
  }

  const from = block.activeFrom ?? null
  const to = block.activeTo ?? null
  if (from === null && to === null) return null

  // An open end means "from here on" and an open start means "until then".
  // Half a window is still a window, and refusing it would drop a date the owner
  // deliberately set.
  const starts = from ?? now
  return { from: starts, starts, to: to ?? new Date(now.getTime() + 365 * DAY) }
}
