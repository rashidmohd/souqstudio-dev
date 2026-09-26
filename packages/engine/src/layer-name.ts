import type { BlockElement } from '@souqstudio/types'

/**
 * Layer names, in the owner's words.
 *
 * **Here rather than in the designer's layer list, because two places name a
 * layer and they must agree.** The layer list shows these, and the refusal to
 * publish a block names the layer whose colour it will not take. When the
 * refusal kept its own shorter copy, every bound text came out as "Text", and
 * "the text colour on Text and the text colour on Text" was two different
 * layers nobody could find.
 */

/**
 * What each offer binding is called in the layer list.
 *
 * The same words the "Shows" control uses. Two names for one binding is how an
 * owner loses track of which layer is which in a stack of five.
 */
const OFFER_LAYER_NAME: Record<
  Extract<Extract<BlockElement, { kind: 'text' }>['source'], { from: 'offer' }>['field'],
  string
> = {
  price: 'Price',
  tier: 'Offer tier',
  currency: 'Currency',
  compare: 'Was-price',
  prefix: 'From / each / per kg',
  unitPrice: 'Unit price',
  saveAmount: 'Amount saved',
  savePercent: 'Percent saved',
}

/**
 * What an image layer is called, by what it is bound to.
 *
 * Its own function rather than a nested switch: exhaustiveness is what makes
 * adding a binding safe, and a `switch` inside a `switch` satisfies the
 * compiler while reading to ESLint as a fallthrough. The same note `draw.tsx`
 * makes about `offerText`.
 */
function imageLayerName(
  source: Extract<BlockElement, { kind: 'image' }>['source']
): string {
  switch (source.from) {
    case 'product':
      return 'Product image'
    // Folded in from the `logo` kind — E14 §3.1. It keeps the owner's word for
    // it, because nothing changed about what they are looking at.
    case 'brand':
      return 'Logo'
    case 'asset':
      return 'Artwork'
  }
}

/** The book's own facts, as an owner names them. */
const BOOK_LAYER_NAME: Record<'title' | 'validFrom' | 'validTo', string> = {
  title: 'Book title',
  validFrom: 'Offers valid from',
  validTo: 'Offers valid to',
}

/**
 * What an element is called, in the owner's words.
 *
 * A bound element is named by what it *shows* — "Product name", not "Text" —
 * because the field is the whole reason it is there, and a list of six rows all
 * called "Text" is a list nobody can navigate.
 */
export function layerName(element: BlockElement): string {
  switch (element.kind) {
    case 'text':
      if (element.source.from === 'product') return `Product ${element.source.field}`
      if (element.source.from === 'shop') return `Shop ${element.source.field}`
      // Named for what an owner calls it. These match the labels on the
      // binding control exactly, because a layer list that says something else
      // is a second vocabulary for one thing.
      if (element.source.from === 'offer') return OFFER_LAYER_NAME[element.source.field]
      // One identity source, so one word for it — E14 §3.2. An owner never
      // sees "organization" here because they never choose it.
      if (element.source.from === 'brand') return 'Brand name'
      if (element.source.from === 'book') return BOOK_LAYER_NAME[element.source.field]
      return element.source.textEn === '' ? 'Fixed text' : `“${element.source.textEn}”`
    case 'image':
      return imageLayerName(element.source)
    case 'priceMark':
      return 'Price'
    case 'chip':
      return 'Offer badge'
    case 'logo':
      return 'Logo'
    case 'shape':
      if (element.variant === 'line') return 'Line'
      if (element.variant === 'ellipse') return 'Circle'
      return element.box.width === 1 && element.box.height === 1 ? 'Background' : 'Shape'
  }
}
