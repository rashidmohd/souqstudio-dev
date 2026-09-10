/**
 * What kind of thing a block is.
 *
 * **A vocabulary, in a file of its own, and the separation is load-bearing.**
 * These six words used to live in `library.ts` beside `SEED_BLOCKS`, which
 * meant that anything wanting the *names of the groups* imported the fifty-nine
 * *designs* — every element, every box, every string of the shipped library.
 * `BlockImportDialog` is `'use client'` and wanted exactly that, so the whole
 * library was downloaded by anyone who opened the designer. Measured before the
 * split: 72 KB of blocks in a browser chunk, to render six segment labels.
 *
 * A taxonomy is small, stable and safe for a client to hold. The designs are
 * neither, and one day will not even be in the bundle — see
 * `docs/block-library-from-r2.md`. Keeping them in separate modules is what
 * lets a bundler tell them apart.
 */
export type BlockCategory =
  | 'offer-card'
  | 'header'
  | 'panel'
  | 'footer'
  | 'social-post'
  | 'seasonal'

/**
 * The order the picker shows them in, which is roughly the order a shop needs
 * them: the card that repeats, then the things around it on a page, then the
 * things that *are* a page, then the occasions.
 */
export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  'offer-card',
  'header',
  'panel',
  'footer',
  'social-post',
  'seasonal',
]

/**
 * The kinds a picture can be matched to. E8-07.
 *
 * **Here rather than in `magic.ts`, and that is the same bundle argument the
 * file opens with.** The dialog offering the choice and the route validating it
 * both run where the fifty-nine designs must not go — one is a client component
 * and the other is a Next server bundle — and both need nothing more than the
 * words. `magic.ts` holds what each kind can actually be matched *to*, which is
 * the part that costs 72 KB.
 *
 * **`seasonal` is absent, deliberately.** A seasonal block is not a design so
 * much as a design plus an occasion: `library-seasonal.ts` carries Ramadan, both
 * Eids and National Day, and `seasonal.ts` computes each window from the
 * calendar rather than storing a date. A match from a photograph would have to
 * pick the occasion too — and a wrong one is a shop wishing its customers Eid
 * Mubarak in March. An owner who wants a seasonal block imports one, where the
 * occasion is named on the tile they are pointing at.
 */
export type MagicCategory = Exclude<BlockCategory, 'seasonal'>

export const MAGIC_CATEGORIES: readonly MagicCategory[] = [
  'offer-card',
  'header',
  'panel',
  'footer',
  'social-post',
]

/**
 * Whether a block of this kind renders once per offer or once, full stop.
 *
 * The one distinction the binding vocabulary turns on — `validateBlock` refuses
 * a product field on a static block rather than drawing it empty — so the job
 * that writes a matched block reads it from here instead of restating it.
 */
export function categoryRepeats(category: BlockCategory): boolean {
  return category === 'offer-card'
}
