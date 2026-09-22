import type { BrandKit, TypeFamily, TypeLevel, TypeScale, TypeStep } from '@souqstudio/types'
import { TYPE_LEVELS } from '@souqstudio/types'
import { isRecommended } from '@/lib/font-editorial'

/**
 * The typefaces a shop can choose from, and the scale a brand kit resolves to.
 *
 * **The catalog is passed in, never imported.** It used to be a literal array in
 * this file, which worked only while the answer was ten hand-picked names. It is
 * now the `fonts` table — every family mirrored into R2 — and a table cannot be
 * read synchronously from a client component, which is where every one of these
 * resolvers is called. So the server loads it once and hands it down; these
 * functions stay pure and synchronous, and nothing here knows about a database.
 *
 * `lib/font-catalog-server.ts` is what loads it. `FontCatalogProvider` is what
 * carries it to the components. `docs/fonts-from-google.md` §6 A2.
 */

export type FontRole = TypeFamily

/**
 * One family, as the client needs it.
 *
 * **`css` is deliberately absent.** The `@font-face` rules live on the registry
 * row and are ~14 kB a family; sending them to the browser as props would put
 * 145 kB of JSON in the page for ten families and megabytes once the library
 * opens. The server emits the rules it needs as a stylesheet instead. What
 * crosses to the client is the small part: what to offer and what to call it.
 */
export interface CatalogFont {
  family: string
  slug: string
  roles: FontRole[]
  /** Upright weights mirrored. A picker may not offer a weight we do not hold. */
  weights: number[]
  italicWeights: number[]
  subsets: string[]
  category: string
  note: string
  /** Whether choosing italic gets a real one or a browser-synthesised slant. */
  hasItalic: boolean
  /** One of the ten we have an opinion about — pinned above the library. */
  recommended: boolean
}

export type FontCatalog = readonly CatalogFont[]

export const FONT_ROLES: readonly FontRole[] = ['headline', 'display', 'price', 'body']

/**
 * What a shop gets before it chooses.
 *
 * **Names, not rows.** These four are expected to be in the catalog — the
 * pre-warm run mirrors them — but nothing here guarantees it, so every resolver
 * below treats a default it cannot find as absent rather than assuming it.
 */
export const DEFAULT_FONTS: Record<FontRole, string> = {
  headline: 'Lalezar',
  display: 'Cairo',
  price: 'Changa',
  body: 'Almarai',
}

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

/**
 * The last thing a family name can fall back to.
 *
 * Reached only when the registry is empty — a fresh environment where nothing
 * has been mirrored yet. It is a chrome face rather than a brand one, and that
 * is the point: a page drawn in it looks unstyled, which is the correct signal.
 * Silently drawing in something plausible would hide an unmirrored registry
 * until a PDF came back wrong.
 */
const LAST_RESORT = 'IBM Plex Sans Arabic'

export function findFont(family: string | null | undefined, catalog: FontCatalog): CatalogFont | undefined {
  if (!family) return undefined
  return catalog.find((font) => font.family === family)
}

export function fontsForRole(role: FontRole, catalog: FontCatalog): CatalogFont[] {
  return catalog.filter((font) => font.roles.includes(role))
}

export function supportsItalic(family: string, catalog: FontCatalog): boolean {
  return findFont(family, catalog)?.hasItalic ?? false
}

/**
 * The family a role resolves to.
 *
 * **A stored family we hold no files for falls back rather than being honoured.**
 * That test used to be "is it in the hand-written array"; it is now "is it in the
 * registry", which is the condition that actually matters — a family in the
 * registry is a family whose bytes are in R2, so a name that survives this is a
 * name every downstream surface can actually draw. A name that does not survive
 * would otherwise render as something else without saying so, and the owner
 * would discover it in print.
 *
 * Three steps, each one narrowing: what the kit asked for, the default for the
 * role, then anything in the catalog that offers the role. The last exists
 * because a default is only a name and a sparse registry may not hold it.
 */
export function resolveFont(kit: BrandKit, role: FontRole, catalog: FontCatalog): string {
  const stored = kit[ROLE_SLOT[role]]
  if (findFont(stored, catalog)) return stored as string

  const fallback = DEFAULT_FONTS[role]
  if (findFont(fallback, catalog)) return fallback

  return fontsForRole(role, catalog)[0]?.family ?? LAST_RESORT
}

export function resolveFonts(kit: BrandKit, catalog: FontCatalog): Record<FontRole, string> {
  return {
    headline: resolveFont(kit, 'headline', catalog),
    display: resolveFont(kit, 'display', catalog),
    price: resolveFont(kit, 'price', catalog),
    body: resolveFont(kit, 'body', catalog),
  }
}

/** A CSS font stack. The fallback is what shows while the face is loading. */
export function fontStack(family: string): string {
  return `'${family}', '${LAST_RESORT}', system-ui, sans-serif`
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
export function resolveScale(kit: BrandKit, catalog: FontCatalog): TypeScale {
  const families = resolveFonts(kit, catalog)
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
export function familyForLevel(kit: BrandKit, level: TypeLevel, catalog: FontCatalog): string {
  const scale = resolveScale(kit, catalog)
  return scale.families[scale.levels[level].family]
}

/**
 * The picker's order: the ten we have an opinion about, then everything else.
 *
 * A picker that opens on fifteen hundred names with no opinion serves a shop
 * owner worse than one that opens on nine good ones with a search box under
 * them. Alphabetical within each group, so the second group is scannable.
 */
export function orderForPicker(fonts: readonly CatalogFont[]): CatalogFont[] {
  return [...fonts].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    return a.family.localeCompare(b.family)
  })
}

export { isRecommended }
