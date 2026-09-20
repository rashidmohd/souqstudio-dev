/**
 * `logo` stops being an element kind. E14 §3.1.
 *
 * **It is the price mark's mistake, one size down.** `{ kind: 'logo' }` carried
 * no source and no options: it drew *the* logo. So it could not be cropped,
 * could not take a stroke or a radius, could not be the child a frame hugs, and
 * every property ever added to images had to be added to it separately or
 * silently not exist. A logo is a picture.
 *
 * As `{ kind: 'image', source: { from: 'brand', field: 'logo' } }` every image
 * property applies to it because it *is* an image — `aspect` most of all, which
 * a logo needs more than a packshot does.
 *
 * **The old kind stays renderable through one release.** A block published to
 * R2 is read by every shop, and the loader refuses a shipped block that draws a
 * warning — `docs/block-library-from-r2.md` §12, which took the dev deploy down
 * on 10 September. The kind is deleted in the release *after* the one that
 * converts, which is E14 Phase 8.
 *
 * **This runs over both halves of the library.** The 66 seeded blocks are
 * generated TypeScript and convert at the source; the 17 owner-authored ones
 * are JSONB and convert through `scripts/convert-logo-elements.ts`. One
 * function, because a converter that ran differently over the two would produce
 * a library that renders two ways.
 */

import type { Arrangement, BlockElement } from '@souqstudio/types'

/**
 * One element, converted. Anything that is not a `logo` comes back untouched
 * and identical — not a copy, so a caller can tell whether anything changed.
 */
export function foldLogoElement(element: BlockElement): BlockElement {
  if (element.kind !== 'logo') return element
  // Every field on the old kind is on `ElementBase`, so nothing is dropped and
  // nothing has to be invented. That is the whole reason this conversion is
  // exact rather than approximate.
  const { kind: _logo, ...base } = element
  return {
    ...base,
    kind: 'image',
    source: { from: 'brand', field: 'logo' },
    // **`contain`, explicitly.** The painter's default for an image is to inset
    // and letterbox, which is what a logo wants and what the `logo` kind did —
    // but leaving it unsaid would make the conversion depend on a default that
    // could move. A mark cropped to fill its box is a mark with its edges cut
    // off, and nobody would read that as a regression in a converter.
    fit: 'contain',
  }
}

/** Every element in every arrangement. */
export function foldLogoElements(arrangements: Arrangement[]): Arrangement[] {
  return arrangements.map((arrangement) => ({
    ...arrangement,
    elements: arrangement.elements.map(foldLogoElement),
  }))
}

/** How many `logo` elements a document still holds. What a migration reports. */
export function countLogoElements(arrangements: Arrangement[]): number {
  return arrangements.reduce(
    (total, arrangement) =>
      total + arrangement.elements.filter((element) => element.kind === 'logo').length,
    0,
  )
}
