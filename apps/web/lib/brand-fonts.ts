import type { BrandKit } from '@souqstudio/types'

/**
 * The typefaces a shop can choose from. E4, and
 * `souqstudio-design → references/brand-kit-fonts.md`.
 *
 * **A curated list, never the Google Fonts library.** Every family here is a
 * Google font and every one is OFL, but the library itself must not be exposed:
 * most of it has no Arabic, and an owner who picks a Latin-only display face and
 * then switches an offer book to Arabic gets tofu or a silent fallback that
 * destroys their grid. Every entry below covers Arabic and Latin, so any choice
 * survives a language toggle.
 *
 * **Roles, not fonts.** A kit holds three slots — display, price, body — and a
 * family is offered for the slots it actually suits. Changa is here because it
 * is narrow enough for a price in a tight cell; Lalezar is heavy enough for a
 * promo burst and wrong for body copy. Filtering by role is what keeps the
 * picker from being a list of forty names.
 *
 * **This module is the picker's catalog, not the render path.** Chrome loads
 * these from Google's CDN to draw a specimen. The export pipeline must not:
 * Playwright cannot depend on an external network on a critical path, PDF
 * embedding needs the real file, and subsetting is what keeps a bilingual book
 * from shipping every Arabic glyph twice. Mirroring the files into R2 is still
 * required before export ships — see the known gap in CLAUDE.md.
 */

export type FontRole = 'display' | 'price' | 'body'

export interface BrandFont {
  /** The Google Fonts family name, used verbatim in the CSS API and in CSS. */
  family: string
  roles: FontRole[]
  /** Weights loaded for this family. Kept to what its roles actually use. */
  weights: number[]
  /** Shown under the name in the picker. Says what it is for, not what it is. */
  note: string
}

/**
 * Every family covers Arabic and Latin. That is the entry requirement, not a
 * property worth a column.
 */
export const BRAND_FONTS: readonly BrandFont[] = [
  {
    family: 'Cairo',
    roles: ['display', 'body'],
    weights: [400, 600, 700, 800],
    note: 'Neutral and legible at any size. A safe default.',
  },
  {
    family: 'Tajawal',
    roles: ['body', 'display'],
    weights: [400, 500, 700],
    note: 'Open and even. Reads well at small sizes.',
  },
  {
    family: 'Almarai',
    roles: ['body'],
    weights: [400, 700, 800],
    note: 'Holds up on a dense page with many products.',
  },
  {
    family: 'Readex Pro',
    roles: ['display', 'body'],
    weights: [400, 600, 700],
    note: 'Modern and calm. Good for product names.',
  },
  {
    family: 'Rubik',
    roles: ['display', 'body'],
    weights: [400, 500, 700, 800],
    note: 'Slightly rounded. Friendly without being soft.',
  },
  {
    family: 'Changa',
    roles: ['price', 'display'],
    weights: [500, 700, 800],
    note: 'Narrow enough for a long price in a tight cell.',
  },
  {
    family: 'Lalezar',
    roles: ['price', 'display'],
    weights: [400],
    note: 'Heavy and loud. Built for promo bursts.',
  },
  {
    family: 'Reem Kufi',
    roles: ['display'],
    weights: [400, 600, 700],
    note: 'Traditional shapes. Distinctive on a cover.',
  },
  {
    family: 'Baloo Bhaijaan 2',
    roles: ['display', 'price'],
    weights: [400, 600, 800],
    note: 'Rounded and warm. Reads as approachable.',
  },
  {
    family: 'Noto Sans Arabic',
    roles: ['body', 'display', 'price'],
    weights: [400, 500, 700, 800],
    note: 'The universal fallback. Covers everything.',
  },
]

/**
 * What a shop gets before it chooses.
 *
 * Cairo and Almarai are the two most neutral families here, and Changa is the
 * only one narrow enough that a three-decimal Kuwaiti price fits a dense cell
 * without the fit ladder having to intervene on the first render.
 */
export const DEFAULT_FONTS: Record<FontRole, string> = {
  display: 'Cairo',
  price: 'Changa',
  body: 'Almarai',
}

export const ROLE_SLOT: Record<FontRole, keyof BrandKit & `font${string}`> = {
  display: 'fontDisplay',
  price: 'fontPrice',
  body: 'fontBody',
}

export const ROLE_COPY: Record<FontRole, { label: string; hint: string }> = {
  display: { label: 'Display', hint: 'Product names and headings' },
  price: { label: 'Price', hint: 'Price marks and offer badges' },
  body: { label: 'Body', hint: 'Pack sizes, specs and small print' },
}

export const FONT_ROLES: readonly FontRole[] = ['display', 'price', 'body']

export function fontsForRole(role: FontRole): BrandFont[] {
  return BRAND_FONTS.filter((font) => font.roles.includes(role))
}

export function findFont(family: string | null | undefined): BrandFont | undefined {
  return BRAND_FONTS.find((font) => font.family === family)
}

/**
 * The family a role resolves to, with the default standing in.
 *
 * A stored family that is no longer in the catalog falls back rather than being
 * honoured: a name we do not load is a name that renders as something else, and
 * an owner should see the fallback in the picker rather than discover it in
 * print.
 */
export function resolveFont(kit: BrandKit, role: FontRole): string {
  const stored = kit[ROLE_SLOT[role]]
  return findFont(stored) ? (stored as string) : DEFAULT_FONTS[role]
}

export function resolveFonts(kit: BrandKit): Record<FontRole, string> {
  return {
    display: resolveFont(kit, 'display'),
    price: resolveFont(kit, 'price'),
    body: resolveFont(kit, 'body'),
  }
}

/**
 * A Google Fonts CSS URL for the given families, deduplicated and ordered.
 *
 * `display=swap` so a slow font never blanks the specimen — the shop owner sees
 * the layout in a fallback and the real face swaps in. That is the right trade
 * in chrome and the wrong one on the artboard, where Fabric caches text metrics
 * at object creation and a late swap leaves every bounding box wrong.
 */
export function googleFontsHref(families: readonly string[]): string {
  const unique = [...new Set(families)].filter((family) => findFont(family) !== undefined)
  if (unique.length === 0) return ''

  const params = unique
    .sort()
    .map((family) => {
      const weights = findFont(family)?.weights ?? [400]
      return `family=${family.replace(/ /g, '+')}:wght@${weights.join(';')}`
    })
    .join('&')

  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/** A CSS font stack. The fallback is what shows while the face is loading. */
export function fontStack(family: string): string {
  return `'${family}', 'IBM Plex Sans Arabic', system-ui, sans-serif`
}
