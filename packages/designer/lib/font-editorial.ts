import type { TypeFamily } from '@souqstudio/types'

/**
 * Our opinion about a typeface — which slots it suits and what to say about it.
 *
 * **Deliberately not in the `fonts` table.** That table holds facts read from
 * Google: which scripts a family covers, which weights exist, what version we
 * took, what licence it is under. None of it is a judgement. *"Narrow enough for
 * a long price in a tight cell"* is a judgement, it is ours, and it changes when
 * we change our minds rather than when Google ships a release. Mixing the two
 * would mean a re-mirror could silently overwrite an editorial decision, and it
 * would make an opinion look like a measurement.
 *
 * `docs/fonts-from-google.md` §3 — the curated ten survive the library opening
 * as the *Recommended* group, and this is what survives of them.
 */

export type FontRole = TypeFamily

export interface FontEditorial {
  roles: FontRole[]
  /** Shown under the name in the picker. Says what it is for, not what it is. */
  note: string
}

/**
 * The ten that were the whole catalog until the registry landed.
 *
 * `headline` is separate from `display` on purpose. They were one slot, and that
 * made a hero band, a cover masthead and a campaign headline share a face with
 * product names — larger, never different. A flyer's "RAMADAN KAREEM" and its
 * product names are not the same voice.
 */
export const EDITORIAL: Readonly<Record<string, FontEditorial>> = {
  Cairo: {
    roles: ['display', 'body', 'headline'],
    note: 'Neutral and legible at any size. A safe default.',
  },
  Tajawal: {
    roles: ['body', 'display'],
    note: 'Open and even. Reads well at small sizes.',
  },
  Almarai: {
    roles: ['body'],
    note: 'Holds up on a dense page with many products.',
  },
  'Readex Pro': {
    roles: ['display', 'body', 'headline'],
    note: 'Modern and calm. Good for product names.',
  },
  Rubik: {
    roles: ['display', 'body', 'headline'],
    note: 'Slightly rounded. Friendly without being soft.',
  },
  Changa: {
    roles: ['price', 'display', 'headline'],
    note: 'Narrow enough for a long price in a tight cell.',
  },
  Lalezar: {
    roles: ['headline', 'price', 'display'],
    note: 'Heavy and loud. Built for hero bands and promo bursts.',
  },
  'Reem Kufi': {
    roles: ['headline', 'display'],
    note: 'Traditional shapes. Distinctive on a cover.',
  },
  'Baloo Bhaijaan 2': {
    roles: ['headline', 'display', 'price'],
    note: 'Rounded and warm. Reads as approachable.',
  },
  'Noto Sans Arabic': {
    roles: ['body', 'display', 'price', 'headline'],
    note: 'The universal fallback. Covers everything.',
  },
}

/** Whether a family is one we have an opinion about. Drives *Recommended*. */
export function isRecommended(family: string): boolean {
  return family in EDITORIAL
}

export const RECOMMENDED_FAMILIES: readonly string[] = Object.keys(EDITORIAL)

/**
 * What slots an unreviewed family may fill, from Google's `category` alone.
 *
 * **Coarse, and honest about it.** Nobody is going to write a note for fifteen
 * hundred families, so the open library needs an answer that is derivable. A
 * category can say that a handwriting face is never a price and that a monospace
 * face is never a headline; it cannot say that Changa is narrow. That is the
 * difference between this and `EDITORIAL`, and it is why the ten stay pinned in
 * front of the library rather than being dissolved into it.
 *
 * `body` is withheld from `display` and `handwriting` on purpose: a page of
 * small print set in a display face is the single most common way an owner can
 * make their own book unreadable, and it is worth not offering.
 */
export function rolesForCategory(category: string): FontRole[] {
  switch (category) {
    case 'serif':
    case 'sans-serif':
      return ['headline', 'display', 'price', 'body']
    case 'display':
      return ['headline', 'display']
    case 'handwriting':
      // A headline and nothing else. A price in a script face is unreadable at
      // a glance, which is the one thing a price has to be.
      return ['headline']
    case 'monospace':
      // Figures line up, which is exactly what a price wants and exactly what a
      // headline does not.
      return ['price', 'body']
    default:
      return ['display']
  }
}

/** The slots a family may fill: our opinion where we have one, else the category. */
export function rolesFor(family: string, category: string): FontRole[] {
  return EDITORIAL[family]?.roles ?? rolesForCategory(category)
}

export function noteFor(family: string, category: string): string {
  return EDITORIAL[family]?.note ?? `${category.replace('-', ' ')}.`
}
