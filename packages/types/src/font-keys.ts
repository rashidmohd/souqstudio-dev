/**
 * Where a mirrored typeface lives in R2.
 *
 * **Here, with no dependencies, because four processes derive these keys.** The
 * web app builds a stylesheet from them, the mirror writes them, the export
 * worker reads them and E14's measurer opens them as bytes. A second copy of the
 * derivation is how those four come to disagree about where a file is, and the
 * failure is silent: a shop picks a face, the specimen draws it from one key and
 * the PDF looks for another, and what comes back is the fallback with no error
 * anywhere. Same reasoning as `catalog-image-keys.ts`, which sits beside this.
 *
 * **Not org-scoped, unlike a shop's assets.** A mirrored family is platform
 * data — one copy of Cairo for every shop that ever picks it — so the prefix is
 * a literal. The erasure-by-prefix property the tenant keys exist for is exactly
 * what must not apply: deleting an organization cannot take Cairo with it.
 *
 * `docs/fonts-from-google.md` §2.
 */

/** Everything mirrored sits under this. */
export const FONT_PREFIX = 'fonts'

/**
 * The stylesheet every browser surface links, holding every mirrored family.
 *
 * One file rather than one per shop, because `@font-face` costs nothing until
 * something references the family — a shop still downloads only the four faces
 * its kit names. That is what lets `googleFontsHref()` and its stale-link
 * bookkeeping go away instead of being ported to R2.
 */
export const BRAND_CSS_KEY = `${FONT_PREFIX}/brand.css`

/**
 * `Noto Sans Arabic` → `noto-sans-arabic`.
 *
 * The slug is *stored* on the row and this is what computes it, once, at mirror
 * time. Read it from the row everywhere else — a call site that recomputes it is
 * a second derivation, which is the thing this file exists to prevent.
 */
export function fontSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * `google/fonts` names its directories with the separators removed —
 * `ofl/notosansarabic`, `ofl/baloobhaijaan2`. That repo is where the licence
 * text comes from, and which of `ofl`, `apache` or `ufl` holds a family is what
 * the licence *is*.
 */
export function googleFontsDir(family: string): string {
  return fontSlug(family).replace(/-/g, '')
}

/**
 * The TrueType file for one face — what the shaper and the PDF read.
 *
 * TTF rather than the woff2 a browser gets: a shaper cannot read woff2 without a
 * brotli decompressor, and PDF embedding needs the real file. Static instances
 * rather than a variable face, because E14 Phase 0.1's parity was measured
 * against statics and there is no reason to reopen a settled number.
 *
 * The `i` suffix is the italic of the same weight. Most families have none.
 */
export function fontFileKey(slug: string, weight: number, italic = false): string {
  return `${FONT_PREFIX}/${slug}/${weight}${italic ? 'i' : ''}.ttf`
}

/**
 * One woff2 subset for one face — what the browser and Fabric get.
 *
 * Split by script, as Google serves it. Cairo 400 is 36 kB of woff2 against
 * 91 kB of TTF, and a four-slot kit served as TTF would be ~1.1 MB on a
 * mid-range Android — the user the type scale is otherwise rationed for.
 */
export function fontWoff2Key(
  slug: string,
  weight: number,
  subset: string,
  italic = false
): string {
  return `${FONT_PREFIX}/${slug}/${weight}${italic ? 'i' : ''}-${subset}.woff2`
}

/**
 * The licence, mirrored beside the files it covers.
 *
 * OFL requires the licence travel with redistributed files; Apache and UFL ask
 * the same. The filename differs by licence, which is why it is passed rather
 * than assumed — the previous script hardcoded `OFL.txt`, correct for ten
 * families and wrong for the library.
 */
export function fontLicenseKey(slug: string, filename: string): string {
  return `${FONT_PREFIX}/${slug}/${filename}`
}
