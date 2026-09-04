import type { BrandColor, BrandKit, TokenRef } from '@souqstudio/types'
import { ARTBOARD_NEUTRALS } from '@/lib/color'
import { DEFAULT_COLORS } from '@/stores/brand-store'

/**
 * The shop's palette — reading it, growing it, and keeping the legacy three in
 * step.
 *
 * **A palette is a definition, not a usage map.** The same thing a printed brand
 * guideline is: these are our colours. It does not say the second one is for
 * headers. Where a colour lands is the block's decision, and the same colour is
 * a hero ground in one block and a price chip in another.
 *
 * This replaced three fixed slots named primary, secondary and accent. Those
 * both capped a brand at three colours and told the owner where each one goes —
 * two limitations wearing one coat. A shop with a fourth and a fifth colour now
 * simply has them.
 */

/**
 * A soft ceiling, and a product judgement rather than an architectural one:
 * nothing here breaks at twenty, but a palette of twenty is not an identity.
 * One constant, easy to raise if a chain argues for it.
 */
export const MAX_PALETTE = 8

/**
 * The floor is three because `isBrandSetupComplete` needs three to call setup
 * done, and because the seeded blocks bind three slots. Below that a page has
 * nothing to be drawn with.
 */
export const MIN_PALETTE = 3

/** Names for the first three when a kit predates the palette. */
const LEGACY_NAMES = ['Primary', 'Secondary', 'Accent'] as const

/**
 * The palette a kit resolves to.
 *
 * `palette` wins when present. Otherwise it is built from the three legacy
 * fields, so a kit written before this existed reads as a three-colour palette
 * rather than as an empty one.
 */
export function resolvePalette(kit: BrandKit): BrandColor[] {
  if (kit.palette && kit.palette.length > 0) return kit.palette

  const legacy = [
    kit.primaryColor ?? DEFAULT_COLORS.primaryColor,
    kit.secondaryColor ?? DEFAULT_COLORS.secondaryColor,
    kit.accentColor ?? DEFAULT_COLORS.accentColor,
  ]

  return legacy.map((hex, index) => ({
    id: `legacy-${index}`,
    name: LEGACY_NAMES[index] ?? `Colour ${index + 1}`,
    hex,
  }))
}

/**
 * What a save sends: the palette, plus the first three mirrored back into the
 * old fields.
 *
 * The mirror is not legacy debt to be paid off later — it is what lets the logo
 * colour suggestions, the contrast checks and every existing read keep working
 * while the palette becomes the real store. Dropping it would mean changing all
 * of them in the same breath as changing the shape.
 */
export function palettePatch(palette: readonly BrandColor[]): Partial<BrandKit> {
  return {
    palette: [...palette],
    primaryColor: palette[0]?.hex,
    secondaryColor: palette[1]?.hex,
    accentColor: palette[2]?.hex,
  }
}

/**
 * Which palette entry a block's slot resolves to.
 *
 * Position, not name: a seeded block names a slot because it has never met this
 * shop, and the first three entries are what those slots point at until explicit
 * bindings exist. The fourth and fifth colours have no slot and need none — a
 * block the owner authors references them by id.
 */
export function resolveToken(palette: readonly BrandColor[], token: TokenRef): string {
  switch (token) {
    case 'primary':
      return palette[0]?.hex ?? DEFAULT_COLORS.primaryColor
    case 'secondary':
      return palette[1]?.hex ?? DEFAULT_COLORS.secondaryColor
    case 'accent':
      return palette[2]?.hex ?? DEFAULT_COLORS.accentColor
    // Page mechanics rather than brand colours: something has to be the ground,
    // and something has to be readable on it. Not the shop's to choose, so not
    // in its palette — see `ARTBOARD_NEUTRALS`.
    case 'surface':
      return ARTBOARD_NEUTRALS.surface
    case 'ink':
      return ARTBOARD_NEUTRALS.ink
    case 'inkMuted':
      return ARTBOARD_NEUTRALS.inkMuted
  }
}

/** A default for a colour the owner has just added, so no row starts blank. */
export function nextColorName(palette: readonly BrandColor[]): string {
  return `Colour ${palette.length + 1}`
}

export function canAdd(palette: readonly BrandColor[]): boolean {
  return palette.length < MAX_PALETTE
}

export function canRemove(palette: readonly BrandColor[]): boolean {
  return palette.length > MIN_PALETTE
}
