/**
 * A block to start from, when the owner is not copying one.
 *
 * **"Always seed" is the rule this bends and it is worth saying which half.**
 * `docs/composition-model.md` §3.6: *a blank artboard produces something worse
 * than your default, and the owner blames the product* — so `POST
 * /api/v1/blocks` had no branch that made an empty block, and the library
 * screen had no "new block" button. The rule was structural on purpose.
 *
 * What it was protecting is the *blank* part, not the *new* part. An owner who
 * wants a footer of their own should not have to pick somebody else's footer,
 * rename it, and delete its contents to get there — that is a worse first
 * minute than a starting point, and it is what the absence of this forced.
 *
 * So a starter is **not an empty artboard**. It is the smallest thing of its
 * kind that already reads as one: a card has a picture, a name and a price; a
 * footer has the shop's name and how to reach it. Nothing decorative, nothing
 * the owner has to undo, and every element bound rather than typed.
 *
 * **The same shape as a matched block.** E8-07 already turns "what kind is
 * this?" plus a photograph into a block of that kind; this is the same move
 * without the photograph, and `categoryRepeats` is the same answer to the one
 * question that decides the vocabulary. `seasonal` is absent for the reason
 * `MagicCategory` gives: a seasonal block is a design *plus an occasion*, and
 * nothing here can pick the occasion.
 */

import type { Arrangement } from '@souqstudio/types'
import { categoryRepeats, type MagicCategory } from './block-category'
import {
  OPEN,
  PLAIN_PRICE,
  STRIP,
  at,
  bound,
  box,
  ground,
  photo,
  price,
  shopField,
  still,
  words,
} from './library-kit'

export interface StarterBlock {
  repeats: boolean
  arrangements: Arrangement[]
}

/**
 * A repeating card, at the two shapes a merge actually produces.
 *
 * **Two arrangements rather than one**, because a block that declines to design
 * a shape does not avoid that shape — `pickArrangement` falls back to the
 * nearest range and the layout gets crushed into it, which is a defect the
 * gallery found in a shipped block and the tests could not. Upright is the
 * common cell; wide is what a two-cell merge gives.
 */
const offerCard = (): Arrangement[] => [
  at({ aspectMin: 0.1, aspectMax: 1.35 }, [
    ground('surface'),
    photo(box(0.1, 0.06, 0.8, 0.42)),
    bound('name', box(0.08, 0.53, 0.84, 0.16), 'h4'),
    bound('spec', box(0.08, 0.69, 0.84, 0.08), 'caption'),
    price(box(0.08, 0.78, 0.84, 0.16), PLAIN_PRICE),
  ]),
  at({ aspectMin: 1.35, aspectMax: 30 }, [
    ground('surface'),
    photo(box(0.04, 0.1, 0.34, 0.8)),
    bound('name', box(0.42, 0.18, 0.54, 0.26), 'h4'),
    bound('spec', box(0.42, 0.46, 0.54, 0.14), 'caption'),
    price(box(0.42, 0.62, 0.54, 0.24), PLAIN_PRICE),
  ]),
]

/**
 * The static kinds.
 *
 * One arrangement each, which is `still`'s rule rather than an economy: a panel
 * is drawn at one aspect and crops into anything close, and four would be four
 * designs to keep in step for a gain no owner would see.
 */
const STATIC: Record<Exclude<MagicCategory, 'offer-card'>, () => Arrangement[]> = {
  // A band across the head of a page: the shop, then what the book is.
  header: () =>
    still(STRIP, [
      ground('primary'),
      shopField('name', box(0.06, 0.2, 0.5, 0.34), 'h2', { color: 'surface' }),
      words(
        'tagline',
        box(0.06, 0.56, 0.5, 0.22),
        'This week’s offers',
        'عروض هذا الأسبوع',
        'body'
      ),
    ]),
  // How to reach the shop, which is the whole job of a footer.
  footer: () =>
    still(STRIP, [
      ground('ink'),
      shopField('name', box(0.06, 0.16, 0.44, 0.3), 'h4', { color: 'surface' }),
      shopField('address', box(0.06, 0.5, 0.44, 0.34), 'caption', { color: 'surface' }),
      shopField('phone', box(0.54, 0.16, 0.4, 0.3), 'h4', {
        align: 'end',
        color: 'surface',
      }),
    ]),
  // A block of words, placed once. `OPEN` because a panel fills whatever
  // region it is given and there is nothing in it that a shape would break.
  panel: () =>
    still(OPEN, [
      ground('surface'),
      // **`color: 'ink'` is not decoration here, it is a workaround.** A static
      // line is still assumed to sit on a tinted ground and painted in the
      // surface colour — the `onTint` heuristic in both painters, which `shop`
      // has been taken out of and `static` has not, because eighty-one seeded
      // lines depend on it. On this panel's white ground that is white on
      // white, and the gallery render of this starter is what showed it.
      words('headline', box(0.08, 0.24, 0.84, 0.3), 'Your headline', 'العنوان الرئيسي', 'h2', {
        color: 'ink',
      }),
      words(
        'support',
        box(0.08, 0.56, 0.84, 0.2),
        'A supporting line',
        'سطر داعم',
        'body',
        { color: 'inkMuted' }
      ),
    ]),
  // A square post. The identity carries it, so the mark is the first element.
  'social-post': () =>
    still({ aspectMin: 0.86, aspectMax: 1.2 }, [
      ground('primary'),
      {
        id: 'logo',
        kind: 'image',
        source: { from: 'brand', field: 'logo' },
        fit: 'contain',
        box: box(0.08, 0.08, 0.3, 0.16),
      },
      words('headline', box(0.08, 0.34, 0.84, 0.3), 'Your headline', 'العنوان الرئيسي', 'h1', {
        color: 'surface',
      }),
      shopField('name', box(0.08, 0.8, 0.84, 0.1), 'body', { color: 'surface' }),
    ]),
}

/**
 * The smallest block of this kind that already reads as one.
 *
 * Every element is bound rather than typed wherever a binding exists, because
 * that is the rule an owner should meet first: product text follows the
 * catalog, and a shop's name follows the shop. The two `words` lines are the
 * exception and they are the two a shop genuinely writes.
 */
export function starterBlock(category: MagicCategory): StarterBlock {
  return {
    repeats: categoryRepeats(category),
    arrangements: category === 'offer-card' ? offerCard() : STATIC[category](),
  }
}
