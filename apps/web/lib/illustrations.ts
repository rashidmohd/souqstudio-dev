/**
 * Which illustration fills which slot.
 *
 * **Call sites name the slot, never the artwork.** `empty-offer-books` is a
 * place in the product; `fill-the-blanks` is a drawing that currently sits
 * there. Keeping the indirection means swapping the drawing is one edit here
 * rather than a hunt through components — which is the whole reason
 * `souqstudio-design → references/illustration-manifest.md` keys the inventory
 * by slot.
 *
 * Files are served from `public/illustrations/`, not from
 * `assets.souqstudio.com`. Same reasoning as the fonts: an empty state must not
 * depend on a third-party round trip to paint, and the shop owner this product
 * is built for is on a mid-range Android over 4G. The CDN copies are the
 * source; these are checked in.
 *
 * Every file here has been audited against the manifest's compliance checklist
 * — charcoal line, sand ground, one accent, no gold, no gradients, no raster.
 * Three carried strays that were remapped on the way in; see the manifest.
 *
 * Slots that exist in the manifest but are absent below are either waiting on
 * their epic or cannot be filled at all — `empty-catalog-search` is a
 * zero-results state, and the design system permits an illustration only on
 * `empty`.
 */
export const ILLUSTRATIONS = {
  'empty-offer-books': 'fill-the-blanks.svg',
  'empty-team': 'meet-the-team.svg',
  'error-not-found': 'lost.svg',
  'error-generic': 'problem-solving.svg',
  // E5-06. A prompt before anything exists — not a zero-result and not a
  // failure — which is the one place the system permits artwork. Object-led
  // rather than figure-led, and the import flow carries no other illustration,
  // so there is nothing for it to sit inconsistently beside.
  'import-upload': 'add-file.svg',
} as const

export type IllustrationKey = keyof typeof ILLUSTRATIONS

export function illustrationSrc(key: IllustrationKey): string {
  return `/illustrations/${ILLUSTRATIONS[key]}`
}
