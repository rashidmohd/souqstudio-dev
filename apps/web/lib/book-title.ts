import { KIND_SPEC, type BookKind } from '@/lib/book-kind'

/**
 * The name a new book is given, because nobody is asked for one.
 * E6 — `docs/E6-create-flow.md` §4 and §6.
 *
 * **The creation screen used to open with a title field and refuse to submit
 * without it.** A name is the least consequential and most reversible decision
 * on that screen — every other field changes what gets made, this one changes
 * what it is called in a list — and it was asked first, about a thing that did
 * not exist yet. So it is generated, and renamed in the editor once the owner
 * has seen what they made and knows what to call it.
 *
 * **That rename is not optional scope.** Without it every book a shop owns is
 * called "Week 37 offers" forever, which is a worse screen than the one this
 * replaces. `PATCH /api/v1/offer-books/[id]`.
 *
 * Pure and no `server-only`: `createBook` calls it, and it has a test.
 */

/**
 * The ISO-8601 week number.
 *
 * **ISO rather than "how many Mondays have there been", and the difference is
 * three days a year.** ISO week 1 is the week containing the first Thursday of
 * January, so 1 January can fall in week 52 or 53 of the *previous* year. A
 * naive count restarts at 1 on 1 January and produces two week 1s eleven months
 * apart, which is exactly the collision an owner would find in a list sorted by
 * name in the first week of a new year.
 *
 * The algorithm is the standard one: move to the Thursday of this week, then
 * count weeks from 1 January of *that* Thursday's year.
 */
export function isoWeek(date: Date): { week: number; year: number } {
  // UTC throughout. A book created at 01:00 Gulf time on a Monday is in that
  // Monday's week, and a local-time reading in a server's timezone would put it
  // in the one before.
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  // getUTCDay is 0 for Sunday; ISO counts Monday as 1 and Sunday as 7.
  const isoDay = thursday.getUTCDay() === 0 ? 7 : thursday.getUTCDay()
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay)

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const days = (thursday.getTime() - yearStart.getTime()) / 86_400_000

  return { week: Math.floor(days / 7) + 1, year: thursday.getUTCFullYear() }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The name, before any collision is resolved.
 *
 * **A booklet counts in weeks and the other three count in days**, because that
 * is how the shop thinks about each. A weekly promotion runs Monday to Sunday
 * and "week 37" is what the owner calls it out loud; a post is a thing they made
 * on a Tuesday and might make three more of on Wednesday.
 *
 * **English only, and that is a known shortfall rather than an oversight.**
 * `offer_books.title` is one column and has nowhere to put a second language. An
 * owner working in an Arabic interface gets an English default they can rename
 * immediately, which is worse than a localised default and better than blocking
 * this flow on a migration. `docs/E6-create-flow.md` §8.2.
 */
export function baseTitle(kind: BookKind, now: Date): string {
  if (kind === 'booklet') {
    return `Week ${isoWeek(now).week} offers`
  }

  const day = now.getUTCDate()
  const month = MONTHS[now.getUTCMonth()]
  return `${KIND_SPEC[kind].label} ${day} ${month}`
}

/**
 * The name a book is actually created with, clear of the shop's existing ones.
 *
 * **The suffix is not a nicety here.** This is the one flow in the product that
 * reliably produces the same string twice: a shop making two posts on the same
 * afternoon, or reissuing a booklet inside one week, gets two identical rows in
 * a list whose whole job is telling them apart. `copyName` in `lib/blocks.ts`
 * makes the same argument for the block library and resolves it the same way.
 *
 * Not "copy", though. A second post made on the same day is not a copy of the
 * first, and `duplicateBook` is the path that genuinely is one.
 */
export function autoTitle(kind: BookKind, existing: readonly string[], now: Date): string {
  const base = baseTitle(kind, now)
  const taken = new Set(existing)
  if (!taken.has(base)) return base

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }

  // A shop with ninety-nine books named the same thing has a different problem,
  // and a create that fails is worse than a name with a timestamp in it.
  return `${base} ${now.getTime()}`
}
