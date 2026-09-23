import type { ArtboardOffer } from '../components/blocks/draw'
import type { BlockElement, FlatColor } from '@souqstudio/types'
import {
  layoutPriceMark,
  markGround,
  markRecipe,
  type MarkPiece,
  type Rect,
} from '@souqstudio/engine'
import { newElementId } from './block-elements'

/**
 * Taking a price mark apart into the layers it was drawing.
 *
 * **The action that makes the parts usable.** The bindings to place a currency
 * or a was-price by hand landed first, and on their own they asked an owner to
 * add a text element, find the right source in a dropdown, switch the matching
 * part off inside the mark, and then position it back where it already was.
 * Nobody does that. The owner's request was to drag the price, the was-price and
 * the currency; this is the one click that hands them over.
 *
 * **What comes out is exactly what was on the screen.** The pieces are placed
 * from `layoutPriceMark` itself — the same solver that drew them a moment ago —
 * so splitting changes nothing about the card until something is moved. A split
 * that nudged everything by a few percent would make the feature feel like it
 * had done damage.
 *
 * **The digits do not split.** Major and fils travel together, because the fils
 * is positioned against the digits and a block is drawn once per offer: pinned
 * to a fraction of the block it would be right for the price it was designed
 * against, overlapping a longer one and adrift from a shorter one. Everything
 * here is a short run that sits *beside* the number, which is why it can leave.
 *
 * **They come out grouped**, so the first drag moves the whole price as one
 * piece and nothing appears to have come loose. Ungrouping is what an owner does
 * when they actually want to move a part on its own.
 */

/** Which parts a split can hand over. The digits are not among them. */
const PARTS = ['currency', 'compare', 'prefix'] as const
type Part = (typeof PARTS)[number]

/** Where each part's own ink lives on the mark, so a split keeps its colour. */
const INK_SLOT: Record<Part, 'currencyInk' | 'compareInk' | 'prefixInk'> = {
  currency: 'currencyInk',
  compare: 'compareInk',
  prefix: 'prefixInk',
}

/**
 * The text a split part binds to. `prefix` is the FROM/EACH/PER KG line.
 */
const BINDING: Record<Part, 'currency' | 'compare' | 'prefix'> = {
  currency: 'currency',
  compare: 'compare',
  prefix: 'prefix',
}

export interface SplitResult {
  /** The mark, with the parts that left switched off. */
  mark: BlockElement
  /** One text layer per part that was actually drawn. */
  parts: BlockElement[]
}

/**
 * Split one price mark. Returns null when there is nothing to hand over —
 * a mark drawing only its digits is already as split as it gets.
 *
 * `width` and `height` are the artboard's, in the units the canvas draws in.
 * Everything comes back as fractions of the block, which is what a `Box` is.
 */
export function splitPriceMark(
  element: Extract<BlockElement, { kind: 'priceMark' }>,
  offer: ArtboardOffer,
  width: number,
  height: number
): SplitResult | null {
  const style = element.style ?? {}
  const rect: Rect = {
    x: element.box.start * width,
    y: element.box.top * height,
    width: element.box.width * width,
    height: element.box.height * height,
  }

  const l = layoutPriceMark(offer.priceMark, rect, {
    tierLabel: offer.tierLabel.toUpperCase(),
    ground: markGround(style),
    recipe: markRecipe(style),
  })

  // The same `sqrt(w × h)` a text element's `size` resolves against — see
  // `fit.ts`. Converting through it is what makes a split piece render at the
  // size it was already being drawn at.
  const blockSize = Math.sqrt(width * height)

  const drawn: { part: Part; piece: MarkPiece }[] = []
  for (const part of PARTS) {
    const piece = part === 'currency' ? l.currency : part === 'compare' ? l.compare : l.prefix
    if (piece !== null && piece.text !== '') drawn.push({ part, piece })
  }

  if (drawn.length === 0) return null

  const groupId = newElementId()

  const parts = drawn.map(({ part, piece }): BlockElement => {
    const ink = style[INK_SLOT[part]]
    return {
      id: newElementId(),
      kind: 'text',
      /**
       * **From the baseline back to a top edge**, because the painter draws a
       * line at `box.top + fontSize * 0.85` and this has to be its inverse — a
       * piece placed from its baseline sits a whole cap height too low.
       *
       * The box is given a little more width than the glyphs need. A text
       * element is fitted into its box and a box measured exactly to the string
       * it holds today is a box the next product's longer was-price cannot use.
       */
      box: {
        start: piece.x / width,
        top: (piece.baseline - piece.fontSize * 0.85) / height,
        width: Math.min(1 - piece.x / width, (piece.width * 1.6) / width),
        height: (piece.fontSize * 1.3) / height,
      },
      source: { from: 'offer', field: BINDING[part] },
      // `caption` is the floor the fit ladder steps down to rather than the size
      // it starts at — `size` below is what decides that, taken from the piece.
      level: 'caption',
      align: 'start',
      size: piece.fontSize / blockSize,
      ...(ink === undefined ? {} : { color: ink as FlatColor }),
      /**
       * **Struck if it was struck, and only then.** The was-price came out of
       * the mark with a rule through it, so the layer keeps one — but as an
       * ordinary formatting value the owner can now switch off, not as a rule
       * the renderer re-derives from the binding.
       */
      ...(part === 'compare' ? { decoration: 'line-through' as const } : {}),
      groupId,
    }
  })

  /**
   * The mark, with every part that left switched off.
   *
   * **Hidden rather than deleted**, and the difference matters: the recipe is
   * how the mark says what it draws, so an owner who ungroups, deletes the
   * currency layer and wants it back sets one control. It also means the mark
   * reclaims the room the part took, so the digits do not sit in a space with a
   * hole in it.
   */
  const recipe = { ...(style.recipe ?? {}) }
  const held = recipe.currency
  for (const { part } of drawn) {
    if (part === 'currency') {
      const base = typeof held === 'string' ? { place: held } : (held ?? {})
      recipe.currency = { ...base, place: 'hidden' }
    } else {
      const own = recipe[part] ?? {}
      recipe[part] = { ...own, place: 'hidden' }
    }
  }

  return {
    mark: { ...element, style: { ...style, recipe }, groupId },
    parts,
  }
}
