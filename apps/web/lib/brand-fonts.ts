import type { BrandKit, TypeFamily, TypeLevel, TypeScale, TypeStep } from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'

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
 * **Slots, not fonts.** A kit holds four face slots — headline, display, price,
 * body — and a family is offered for the slots it actually suits. Changa is
 * here because it is narrow enough for a price in a tight cell; Lalezar is
 * heavy enough for a hero band and wrong for body copy. Filtering by slot is
 * what keeps the picker from being a list of forty names.
 *
 * `headline` is separate from `display` on purpose. They were one slot, and
 * that made a hero band, a cover masthead and a campaign headline share a face
 * with product names — larger, never different. A flyer's "RAMADAN KAREEM" and
 * its product names are not the same voice.
 *
 * **This module is the picker's catalog, not the render path.** Chrome loads
 * these from Google's CDN to draw a specimen. The export pipeline must not:
 * Playwright cannot depend on an external network on a critical path, PDF
 * embedding needs the real file, and subsetting is what keeps a bilingual book
 * from shipping every Arabic glyph twice. Mirroring the files into R2 is still
 * required before export ships — see the known gap in CLAUDE.md.
 */

/** The face slots, as `TypeFamily` in `@souqstudio/types`. */
export type FontRole = TypeFamily

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
    roles: ['display', 'body', 'headline'],
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
    roles: ['display', 'body', 'headline'],
    weights: [400, 600, 700],
    note: 'Modern and calm. Good for product names.',
  },
  {
    family: 'Rubik',
    roles: ['display', 'body', 'headline'],
    weights: [400, 500, 700, 800],
    note: 'Slightly rounded. Friendly without being soft.',
  },
  {
    family: 'Changa',
    roles: ['price', 'display', 'headline'],
    weights: [500, 700, 800],
    note: 'Narrow enough for a long price in a tight cell.',
  },
  {
    family: 'Lalezar',
    roles: ['headline', 'price', 'display'],
    weights: [400],
    note: 'Heavy and loud. Built for hero bands and promo bursts.',
  },
  {
    family: 'Reem Kufi',
    roles: ['headline', 'display'],
    weights: [400, 600, 700],
    note: 'Traditional shapes. Distinctive on a cover.',
  },
  {
    family: 'Baloo Bhaijaan 2',
    roles: ['headline', 'display', 'price'],
    weights: [400, 600, 800],
    note: 'Rounded and warm. Reads as approachable.',
  },
  {
    family: 'Noto Sans Arabic',
    roles: ['body', 'display', 'price', 'headline'],
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
  headline: 'Lalezar',
  display: 'Cairo',
  price: 'Changa',
  body: 'Almarai',
}

/**
 * Which slot each level draws from before anyone changes it.
 *
 * h1 and h2 are the hero range and land on `headline`; h3 and h4 are the
 * workaday product-name range and land on `display`. Any binding here can be
 * overridden per level — this is the default, not the ceiling.
 */
export const DEFAULT_LEVEL_FAMILY: Record<TypeLevel, FontRole> = {
  h1: 'headline',
  h2: 'headline',
  h3: 'display',
  h4: 'display',
  h5: 'body',
  h6: 'body',
  body: 'body',
  caption: 'body',
}

/** Size multipliers and weights per level. The kit may override either. */
const DEFAULT_STEPS: Record<TypeLevel, Omit<TypeStep, 'family'>> = {
  h1: { size: 2.2, weight: 400, lineHeight: 1.02 },
  h2: { size: 1.7, weight: 400, lineHeight: 1.06 },
  h3: { size: 1.25, weight: 700, lineHeight: 1.15 },
  h4: { size: 1, weight: 700, lineHeight: 1.2 },
  h5: { size: 0.85, weight: 600, lineHeight: 1.25 },
  h6: { size: 0.72, weight: 600, lineHeight: 1.3, transform: 'uppercase' },
  body: { size: 0.72, weight: 400, lineHeight: 1.35 },
  caption: { size: 0.58, weight: 400, lineHeight: 1.3 },
}

/** Fraction of a block's sqrt(w × h) that `size: 1` resolves to. */
export const DEFAULT_TYPE_BASE = 0.055

export const ROLE_SLOT: Record<FontRole, keyof BrandKit & `font${string}`> = {
  headline: 'fontHeadline',
  display: 'fontDisplay',
  price: 'fontPrice',
  body: 'fontBody',
}

export const ROLE_COPY: Record<FontRole, { label: string; hint: string }> = {
  headline: { label: 'Headline', hint: 'Hero bands, covers and campaign headlines' },
  display: { label: 'Display', hint: 'Product names and section headings' },
  price: { label: 'Price', hint: 'Price marks and offer badges' },
  body: { label: 'Body', hint: 'Pack sizes, specs and small print' },
}

export const FONT_ROLES: readonly FontRole[] = ['headline', 'display', 'price', 'body']

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
    headline: resolveFont(kit, 'headline'),
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

/**
 * The full type scale a kit resolves to.
 *
 * Built from the four face slots plus the defaults, then overlaid with anything
 * the kit has actually changed. **Any level may be re-bound to any slot** — that
 * is what stops the scale being card-shaped: an owner who wants h5 set in the
 * headline face for a ticker band can have it, and one who never opens the
 * bindings gets a sensible page for free.
 */
export function resolveScale(kit: BrandKit): TypeScale {
  const families = resolveFonts(kit)
  const stored = kit.typeScale

  const levels = Object.fromEntries(
    TYPE_LEVELS.map((level) => {
      const base = DEFAULT_STEPS[level]
      const override = stored?.levels?.[level]
      const family = override?.family ?? DEFAULT_LEVEL_FAMILY[level]
      return [level, { ...base, ...override, family }]
    })
  ) as Record<TypeLevel, TypeStep>

  return {
    families,
    base: stored?.base ?? DEFAULT_TYPE_BASE,
    levels,
  }
}

/** The family a level actually renders in, following its binding. */
export function familyForLevel(kit: BrandKit, level: TypeLevel): string {
  const scale = resolveScale(kit)
  return scale.families[scale.levels[level].family]
}
