import type { BrandKit, TextStyle, TypeLevel } from '@souqstudio/types'
import { nanoid } from 'nanoid'
import { DEFAULT_FONTS, DEFAULT_TYPE_BASE, resolveFonts, supportsItalic } from '@/lib/brand-fonts'

/**
 * The shop's text styles — reading them, growing them, and keeping the four
 * font slots in step.
 *
 * **A definition, not a ladder.** The same thing the palette is for colour: a
 * brand guideline states its text styles by name — "Product name", "Price",
 * "Headline" — and each one carries its own family, size, weight, italic and
 * colour. It does not hand you six numbered headings and ask you to work out
 * which is which.
 *
 * A fixed h1–h6 scale did exactly that, and capped a brand at eight styles on
 * the way. `slot` is all that survives of it, and only because a seeded block
 * has to name something before it has ever met this shop.
 */

/** A soft ceiling. A product judgement — nothing breaks above it. */
export const MAX_STYLES = 12

/**
 * Five, because that is the smallest set that can render a page: a headline, a
 * product name, a price, supporting text and small print. Below it a block has
 * no style to reach for.
 */
export const MIN_STYLES = 5

export const WEIGHTS = [300, 400, 500, 600, 700, 800, 900] as const

/** The size multipliers offered, as a scale rather than a free number. */
export const SIZE_STEPS = [0.58, 0.72, 0.85, 1, 1.25, 1.5, 1.7, 2.2, 2.8] as const

/**
 * What a shop starts with. Eight styles, each bound to the slot a seeded block
 * reaches it through, and named for what they are rather than how big they are.
 */
export function defaultTextStyles(kit: BrandKit): TextStyle[] {
  const fonts = resolveFonts(kit)

  const style = (
    slot: TypeLevel,
    name: string,
    family: string,
    size: number,
    weight: number,
    lineHeight: number,
    extra: Partial<TextStyle> = {}
  ): TextStyle => ({
    id: `slot-${slot}`,
    name,
    family,
    size,
    weight,
    italic: false,
    colorId: null,
    lineHeight,
    slot,
    ...extra,
  })

  return [
    style('h1', 'Headline', fonts.headline, 2.2, 400, 1.02),
    style('h2', 'Subheadline', fonts.headline, 1.7, 400, 1.06),
    style('h3', 'Product name', fonts.display, 1.25, 700, 1.15),
    style('h4', 'Section heading', fonts.display, 1, 700, 1.2),
    style('h5', 'Emphasis', fonts.body, 0.85, 600, 1.25),
    style('h6', 'Label', fonts.body, 0.72, 600, 1.3, { transform: 'uppercase' }),
    style('body', 'Body', fonts.body, 0.72, 400, 1.35),
    style('caption', 'Small print', fonts.body, 0.58, 400, 1.3),
  ]
}

/** The styles a kit resolves to. Stored wins; otherwise the defaults. */
export function resolveTextStyles(kit: BrandKit): TextStyle[] {
  if (kit.textStyles && kit.textStyles.length > 0) return kit.textStyles
  return defaultTextStyles(kit)
}

/**
 * The style a seeded block reaches through a slot.
 *
 * Falls back to the default set rather than returning nothing: an owner who
 * deletes the style bound to `h3` has not deleted every block that uses it, and
 * a card with no product name is worse than one in a fallback face.
 */
export function styleForSlot(kit: BrandKit, slot: TypeLevel): TextStyle {
  const found = resolveTextStyles(kit).find((style) => style.slot === slot)
  if (found) return found

  const fallback = defaultTextStyles(kit).find((style) => style.slot === slot)
  // Every slot has a default, so this is unreachable; the throw is what keeps
  // the return type honest rather than optional.
  if (!fallback) throw new Error(`No default text style for slot "${slot}"`)
  return fallback
}

/**
 * What a save sends: the styles, plus the four font slots mirrored back.
 *
 * Same reasoning as `palettePatch` — the mirror is what lets everything already
 * reading `fontDisplay` keep working while the style list becomes the real
 * store.
 */
export function typographyPatch(styles: readonly TextStyle[]): Partial<BrandKit> {
  const bySlot = (slot: TypeLevel) => styles.find((style) => style.slot === slot)?.family

  return {
    textStyles: [...styles],
    fontHeadline: bySlot('h1') ?? DEFAULT_FONTS.headline,
    fontDisplay: bySlot('h3') ?? DEFAULT_FONTS.display,
    fontBody: bySlot('body') ?? DEFAULT_FONTS.body,
    // No text style is set in the price face — a price mark is a component, not
    // a text layer (E6 §3) — so this slot is carried straight through.
    fontPrice: DEFAULT_FONTS.price,
  }
}

export function newTextStyle(kit: BrandKit, styles: readonly TextStyle[]): TextStyle {
  return {
    id: nanoid(8),
    name: `Style ${styles.length + 1}`,
    family: resolveFonts(kit).body,
    size: 1,
    weight: 400,
    italic: false,
    colorId: null,
    lineHeight: 1.3,
  }
}

export function canAddStyle(styles: readonly TextStyle[]): boolean {
  return styles.length < MAX_STYLES
}

/**
 * A style bound to a slot cannot be removed — a seeded block reaches it, and
 * deleting it would leave that block with nothing to render its product name in.
 */
export function canRemoveStyle(styles: readonly TextStyle[], style: TextStyle): boolean {
  return style.slot === undefined && styles.length > MIN_STYLES
}

/** Whether italic on this style will be real or synthesised. */
export function italicIsSynthetic(style: TextStyle): boolean {
  return style.italic && !supportsItalic(style.family)
}

export const TYPE_BASE = DEFAULT_TYPE_BASE
