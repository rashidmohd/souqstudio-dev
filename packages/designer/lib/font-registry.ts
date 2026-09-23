import type { BrandKit } from '@souqstudio/types'
import type { Font } from '@souqstudio/db'
import { noteFor, rolesFor, isRecommended } from './font-editorial'
import { resolveFonts, type CatalogFont, type FontCatalog } from './font-catalog'

/**
 * Turning font registry rows into what the designer needs. Pure: the caller
 * reads the table, so this package holds no database code, and `apps/web` and
 * `apps/admin` build the same catalog from the same rows.
 *
 * **The split matters.** A registry row carries the family's `@font-face` rules,
 * which are ~14 kB each; the client needs a name, some weights and a note. Ship
 * the row and ten families become 145 kB of serialized props in every page. So
 * the catalog drops the CSS and the rules come back separately, for the server
 * to put in a stylesheet where it belongs. `docs/fonts-from-google.md` §4 and
 * §6 A2.
 */

export function toCatalogFont(font: Font): CatalogFont {
  return {
    family: font.family,
    slug: font.slug,
    // Our opinion where we have one, Google's category where we do not. Read
    // here rather than stored on the row: a re-mirror must never be able to
    // overwrite an editorial decision. See lib/font-editorial.ts.
    roles: rolesFor(font.family, font.category),
    weights: font.weights,
    italicWeights: font.italicWeights,
    subsets: font.subsets,
    category: font.category,
    note: noteFor(font.family, font.category),
    // A fact from Google, not a boolean typed by hand — which is what it was,
    // and what could therefore be wrong.
    hasItalic: font.italicWeights.length > 0,
    recommended: isRecommended(font.family),
  }
}

/**
 * The catalog to hand down, plus the rules for the families this kit actually
 * draws in, from one read of the table.
 *
 * **The kit rather than a list of families, because of an ordering trap.**
 * Resolving a kit's four slots needs the catalog (a stored family we hold no
 * files for must fall back), and choosing which rules to emit needs the resolved
 * families.
 */
export function fontsForKit(
  rows: readonly Font[],
  kit: BrandKit | null | undefined
): { catalog: FontCatalog; css: string } {
  const catalog = rows.map(toCatalogFont)
  if (!kit) return { catalog, css: '' }

  const wanted = new Set(Object.values(resolveFonts(kit, catalog)))
  const css = rows
    .filter((font) => wanted.has(font.family))
    .map((font) => font.css.trim())
    .join('\n')

  return { catalog, css }
}
