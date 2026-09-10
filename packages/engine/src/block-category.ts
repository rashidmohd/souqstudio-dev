/**
 * What kind of thing a block is.
 *
 * **A vocabulary, in a file of its own, and the separation is load-bearing.**
 * These five words used to live in `library.ts` beside `SEED_BLOCKS`, which
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
export type BlockCategory = 'offer-card' | 'header' | 'panel' | 'footer' | 'seasonal'

/**
 * The order the picker shows them in, which is roughly the order a shop needs
 * them: the card that repeats, then the things around it, then the occasions.
 */
export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  'offer-card',
  'header',
  'panel',
  'footer',
  'seasonal',
]
