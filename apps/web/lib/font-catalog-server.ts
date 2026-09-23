import 'server-only'

import { fetchGoogleCatalog, listFonts, REQUIRED_SUBSETS, type Font } from '@souqstudio/db'
import { fontWoff2Key } from '@souqstudio/types'
import { toCatalogFont, fontsForKit } from '@souqstudio/designer/lib/font-registry'
import { env } from '@/lib/env'
import type { BrandKit } from '@souqstudio/types'
import type { FontCatalog } from '@souqstudio/designer/lib/font-catalog'

/**
 * Loading the font registry for a request, and turning it into the small thing
 * the client needs.
 *
 * **The split matters.** A registry row carries the family's `@font-face` rules,
 * which are ~14 kB each; the client needs a name, some weights and a note. Ship
 * the row and ten families become 145 kB of serialized props in every page. So
 * `toCatalog()` drops the CSS and `fontFaceCss()` returns it separately, for the
 * server to put in a stylesheet where it belongs.
 *
 * `docs/fonts-from-google.md` §4 and §6 A2.
 */

// Moved to the designer package so `apps/admin` builds the same catalog for the
// same designer. Re-exported because every caller here imports it from this file.
export { toCatalogFont }

/**
 * Every mirrored family.
 *
 * **An empty registry is a valid answer, not an error.** A fresh environment has
 * mirrored nothing, and the resolvers fall back to a chrome face so that the
 * page renders visibly unstyled rather than plausibly wrong. Throwing here would
 * take down every dashboard page over a font table.
 */
export async function loadFontCatalog(): Promise<FontCatalog> {
  return (await listFonts()).map(toCatalogFont)
}

/**
 * The `@font-face` rules for a set of families, ready to put in a `<style>`.
 *
 * **Only the families asked for.** Emitting every mirrored family is the
 * `fonts/brand.css` mistake in a different place: it is 145 kB at ten families
 * and unbounded once the library opens. A page draws four faces, so it declares
 * four. The typography screen is the exception and says so at its call site —
 * it is a browse surface and genuinely needs specimens for everything it lists.
 *
 * The rules are Google's own, `unicode-range` included, with the URLs pointed at
 * R2. That range is what keeps an English page from downloading Arabic, so the
 * size of this string is not the size of the download.
 */
export async function fontFaceCss(families: readonly string[]): Promise<string> {
  const wanted = new Set(families)
  if (wanted.size === 0) return ''

  const fonts = await listFonts()
  return fonts
    .filter((font) => wanted.has(font.family))
    .map((font) => font.css.trim())
    .join('\n')
}

/**
 * The catalog to hand down, plus the rules for the families this kit actually
 * draws in — one pass over the table.
 *
 * **The kit rather than a list of families, because of an ordering trap.**
 * Resolving a kit's four slots needs the catalog (a stored family we hold no
 * files for must fall back), and choosing which rules to emit needs the resolved
 * families. A caller passing families in has to load the catalog first and query
 * twice. Taking the kit keeps both on one read.
 */
export async function loadFontsForKit(
  kit: BrandKit | null | undefined
): Promise<{ catalog: FontCatalog; css: string }> {
  return fontsForKit(await listFonts(), kit)
}

/**
 * The `@font-face` rules for **every** mirrored family.
 *
 * For the typography screen alone — it lists every family and draws each row in
 * its own face, so every face has to be declared. Nowhere else should call this:
 * a page that needs four faces declares four. See the note at its call site.
 */
export async function allFontFaceCss(): Promise<string> {
  return (await listFonts()).map((font) => font.css.trim()).join('\n')
}

/** Where a face's woff2 lives, for a `<link rel="preload">`. */
export function woff2Url(font: Font, weight: number, subset: string, publicUrl: (key: string) => string): string {
  return publicUrl(fontWoff2Key(font.slug, weight, subset))
}

/* ── The library, beyond what is mirrored ───────────────────────────────── */

/**
 * Google's catalog, filtered to what a shop here could actually use, cached.
 *
 * **57 families, out of 1,955.** Every offer book carries Arabic and Latin —
 * the block document schema refuses a static string with `textEn` and no
 * `textAr` — so a family that cannot draw both was never offerable. That single
 * requirement takes the library from unusable-without-search to a list that fits
 * in an ordinary control: 28 sans-serif, 15 serif, 13 display, 1 handwriting.
 *
 * **Cached for an hour, in the module.** The reply is ~1 MB and takes seconds;
 * the answer changes when Google adds a family, which is not hourly. The web app
 * is a long-lived Node process, so a module-level cache actually hits.
 *
 * An empty array is a valid answer — no key configured, or Google unreachable —
 * and the picker falls back to what is mirrored. That is the same graceful
 * narrowing an unset `GOOGLE_FONTS_API_KEY` produces, rather than a broken page.
 */
const CATALOG_TTL_MS = 60 * 60 * 1000
let cached: { at: number; families: OfferableFont[] } | null = null

export interface OfferableFont {
  family: string
  category: string
  subsets: string[]
  /** Whether its files are already in R2 — decides if choosing it is instant. */
  mirrored: boolean
}

export async function offerableFamilies(): Promise<OfferableFont[]> {
  const mirrored = new Set((await listFonts()).map((font) => font.family))

  if (cached === null || Date.now() - cached.at > CATALOG_TTL_MS) {
    if (env.GOOGLE_FONTS_API_KEY === undefined) {
      // No key: the library cannot be widened, so what is mirrored is the offer.
      return [...mirrored].sort().map((family) => ({
        family,
        category: 'sans-serif',
        subsets: [...REQUIRED_SUBSETS],
        mirrored: true,
      }))
    }

    try {
      const all = await fetchGoogleCatalog(env.GOOGLE_FONTS_API_KEY)
      cached = {
        at: Date.now(),
        families: all
          .filter(
            (item) => item.subsets.includes('arabic') && item.subsets.includes('latin')
          )
          .map((item) => ({
            family: item.family,
            category: item.category,
            subsets: item.subsets,
            mirrored: false,
          }))
          .sort((a, b) => a.family.localeCompare(b.family)),
      }
    } catch {
      // Google unreachable. Offering only what is mirrored is a narrower picker,
      // not a broken one — and every mirrored family is instantly choosable.
      cached = { at: Date.now(), families: [] }
    }
  }

  const fromGoogle = cached.families.map((font) => ({
    ...font,
    mirrored: mirrored.has(font.family),
  }))

  // A family we hold but Google no longer lists still has files and must stay
  // choosable — §2a keeps those bytes deliberately.
  const listed = new Set(fromGoogle.map((font) => font.family))
  const orphans = [...mirrored]
    .filter((family) => !listed.has(family))
    .map((family) => ({
      family,
      category: 'sans-serif',
      subsets: [...REQUIRED_SUBSETS],
      mirrored: true,
    }))

  return [...fromGoogle, ...orphans].sort((a, b) => a.family.localeCompare(b.family))
}
