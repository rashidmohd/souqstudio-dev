/**
 * Resolving a colour on an artboard.
 *
 * Three sources, and the order they are tried in is the order of how tied each
 * one is to the shop — a role the kit fills, a colour from the shop's own
 * palette, or a literal the owner picked. See `ColorValue` for why the last one
 * exists at all: a designer that can only offer six slots is a designer an owner
 * cannot express their own brand in.
 *
 * Here rather than in either renderer for the reason everything else is here:
 * the browser and the export worker must resolve a colour the same way, and a
 * card whose ground is one colour on screen and another in the PDF is the exact
 * failure `packages/engine` exists to prevent.
 *
 * The role lookup is **injected**, because what `primary` means is a property of
 * the shop's kit and the engine does not read kits.
 */

import type { BrandColor, ColorValue, TokenRef } from '@souqstudio/types'

export function resolveColor(
  value: ColorValue,
  token: (ref: TokenRef) => string,
  palette: readonly BrandColor[] = []
): string {
  if (value.from === 'role') return token(value.ref)
  if (value.from === 'hex') return value.hex

  // **A palette entry that has been deleted falls back to the ink**, not to
  // nothing and not to a guess. A block referencing a colour the shop removed is
  // a block that should still draw — an element that disappears is harder to
  // find than one that came out the wrong colour, and the owner is one click
  // from fixing it either way.
  return palette.find((entry) => entry.id === value.id)?.hex ?? token('ink')
}

/** The role form, which is all a seeded block may use. */
export const roleColor = (ref: TokenRef): ColorValue => ({ from: 'role', ref })
