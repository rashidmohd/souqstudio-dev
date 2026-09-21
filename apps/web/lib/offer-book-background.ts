import type { PageBackground } from '@souqstudio/types'
import { z } from 'zod'

/**
 * What may sit behind the cards, validated once for the two routes that write it.
 *
 * **Two writers, one schema.** `PATCH .../grid` sets the book's default and
 * `PATCH .../pages/:index/background` sets one page's own. A second copy of this
 * union is how the two start disagreeing about what a gradient may contain, and
 * the disagreement would surface as a background an owner set and cannot see.
 *
 * **Validated to the depth the union actually has**, unlike a block's
 * `arrangements`, which are the designer's contract and too deep to re-check per
 * write. This is four shapes and a handful of fields; a malformed one would be
 * stored, read back and silently fall back to paper.
 */

/**
 * A colour, named the same three ways everything else in the model names one.
 *
 * `role` binds a brand-kit slot, `palette` an entry the shop picked, `hex` a
 * literal. A gradient stop is a `FlatColor` and cannot itself be a gradient,
 * which the type already says and this mirrors.
 */
export const flatColorSchema = z.union([
  // `TokenRef` is six words, not any string — the brand-kit slots a block binds
  // to. An enum rather than `z.string()` so the parsed type *is* `TokenRef` and
  // the compiler checks the hand-off, instead of an assertion doing it.
  z.object({
    from: z.literal('role'),
    ref: z.enum(['primary', 'secondary', 'accent', 'surface', 'ink', 'inkMuted']),
  }),
  z.object({ from: z.literal('palette'), id: z.string().min(1).max(64) }),
  // Six digits. Alpha belongs to the element's opacity, where it is one control
  // an owner can find rather than two that disagree — the rule `ColorValue`
  // states, with gradient stops as the one documented exception.
  z.object({ from: z.literal('hex'), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
])

export const backgroundSchema = z.union([
  flatColorSchema,
  z.object({
    from: z.literal('gradient'),
    // Degrees clockwise from a left-to-right run. Not normalised: `composeGrid`
    // does not mirror it in an Arabic edition either, because an owner who
    // angled a ground did so against the artwork they were looking at.
    angle: z.number().min(0).max(360),
    stops: z
      .array(
        z.object({
          at: z.number().min(0).max(1),
          color: flatColorSchema,
          opacity: z.number().min(0).max(1).optional(),
        })
      )
      // One stop is a flat colour with extra steps and `resolvePaint` collapses
      // it to one anyway; eight is past the point a gradient reads as a run.
      .min(2)
      .max(8),
  }),
  z.object({
    from: z.literal('asset'),
    assetId: z.string().min(1).max(200),
    fit: z.enum(['cover', 'contain']).optional(),
    opacity: z.number().min(0).max(1).optional(),
    /**
     * Provenance for a blurred background — the original and the radius, never
     * a filter. `assetId` above is already the blurred picture; this is what
     * the editor reads to put the slider back and what it re-blurs from.
     *
     * **`radius` is bounded here as well as in the control**, because the
     * control is not the writer — this schema is. It is a fraction of the
     * image's shorter edge, and the ceiling is the point past which a
     * background stops being a photograph and becomes a wash an owner could
     * have got from the colour picker for free.
     */
    blur: z
      .object({ from: z.string().min(1).max(200), radius: z.number().min(0).max(0.06) })
      .optional(),
  }),
])

/**
 * A page's stored override, read back.
 *
 * **Three answers, and the wrapper is what keeps them three.** The column being
 * absent means the page inherits the book's background; `{ background: null }`
 * means this page is deliberately plain paper even though the book has a ground;
 * an object is the page's own. Prisma's two JSON nulls both read back as `null`,
 * so without the wrapper "inherit" and "none" would be the same value and an
 * owner could never take a background off one page.
 *
 * **Never throws.** A page whose override cannot be read is a page that draws the
 * book's background, which is a layout rather than a crash — the same call
 * `readBackground` makes for the book's own.
 */
export function readPageBackground(value: unknown): PageBackground | null | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (!('background' in value)) return undefined

  const inner = (value as { background: unknown }).background
  if (inner === null) return null
  if (typeof inner !== 'object') return undefined

  // One level deep, the same as the book's: `from` has to be one of the five
  // sources the union allows. Validating a gradient's stops per render would
  // cost a parse on every page, and the routes are the only writers.
  const from = (inner as { from?: unknown }).from
  if (from !== 'role' && from !== 'palette' && from !== 'hex' && from !== 'gradient' && from !== 'asset') {
    return undefined
  }
  return inner as PageBackground
}
