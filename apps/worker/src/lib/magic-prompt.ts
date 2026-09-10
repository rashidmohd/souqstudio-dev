import type { MagicCategory } from '@souqstudio/engine'
import {
  type MagicChoice,
  magicOptions,
  magicSchemaFor,
} from '@souqstudio/engine/src/magic'

/**
 * What a model is asked, and what its answer has to be. E8-07.
 *
 * **Provider-independent, deliberately.** `vision-anthropic.ts` and
 * `vision-qwen.ts` differ only in how they carry an image and a system prompt
 * over HTTP; the question, the vocabulary and the contract are here so that
 * swapping providers cannot quietly change what is being asked. A second copy
 * of this prompt is how two providers stop being comparable — and comparing
 * them is the whole reason there are two.
 *
 * **One question per kind, and the model is shown one kind's vocabulary.** The
 * owner has already said whether the picture is an offer card, a header, a
 * panel, a footer or a square post, so the prompt names that kind and lists only
 * what it can be matched to. It is the same argument the whole feature rests on,
 * applied once more: a closed set beats an open one, and a smaller closed set
 * beats a larger one.
 *
 * **Deep import from the engine.** `src/magic.ts` is not on the package barrel
 * because it pulls in `library-cards.ts` and `library.ts` — the whole shipped
 * library, which `block-category.ts` was split out to keep away from a browser
 * bundle. This is a Node process and may follow it; a component may not, which
 * is why `MagicCategory` comes off the barrel and everything else does not.
 */

/** What a picture can turn out not to be. */
export class NoMatchError extends Error {
  constructor(readonly notes: readonly string[]) {
    super('no_match')
    this.name = 'NoMatchError'
  }
}

/** The model answered, but not in a shape the schema accepts. */
export class UnreadableDesignError extends Error {
  constructor() {
    super('unreadable_design')
    this.name = 'UnreadableDesignError'
  }
}

/** The picture, ready to send. */
export interface VisionImage {
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}

/** What every provider module implements. */
export type VisionReader = (
  image: VisionImage,
  category: MagicCategory
) => Promise<MagicChoice>

/**
 * How each kind is described to a model looking at a photograph.
 *
 * **Written for the model, and every field earns its place.** `one` is what the
 * picture is supposed to be, in the words a person would use. `where` is where
 * that thing lives, so a model can tell a footer from a divider by its job
 * rather than by its proportions. `notOne` is the list of near misses, and it is
 * the field that does the most work — the failure to design against is a
 * masthead matched to the nearest footer, which draws fine and is not what
 * anybody uploaded.
 */
const KIND: Readonly<
  Record<Exclude<MagicCategory, 'offer-card'>, { one: string; where: string; notOne: string }>
> = {
  header: {
    one: 'header',
    where:
      'the band across the top of a page, the front cover of a leaflet, or the strip that separates one section of offers from the next. It carries a headline, usually the shop’s logo, and often the dates the prices hold.',
    notOne:
      'a single offer card, a whole page of offers, a footer, or the small print at the bottom of a page',
  },
  panel: {
    one: 'panel',
    where:
      'a message placed among the offers rather than around them — a note to customers, a brand panel, an opening announcement, a delivery or ordering message. It is pinned into a page and the products route around it.',
    notOne:
      'an offer card with a product and a price on it, a masthead across the top of a page, or a footer',
  },
  footer: {
    one: 'footer',
    where:
      'the last row of a page: the shop’s name, the terms, the contact line, the small print that has to be somewhere.',
    notOne: 'a header or masthead, an offer card, or a message panel',
  },
  'social-post': {
    one: 'square social post',
    where:
      'one square post from a shop’s feed — an announcement, the opening hours, where to find the shop, a thank-you at the end of a carousel. It is a whole post with nothing else on the page.',
    notOne:
      'a post advertising one product with its price — that is an offer card, and the owner should choose “offer card” for it — or a photograph of a shelf, a storefront or a whole flyer page',
  },
}

export function questionFor(category: MagicCategory): string {
  if (category === 'offer-card') return 'Which layout is this card, and how is it coloured?'
  return `Which of these designs is this ${KIND[category].one}?`
}

export function systemFor(category: MagicCategory): string {
  return category === 'offer-card' ? CARD_SYSTEM : stillSystem(category)
}

/** The list the model chooses from, and the schema enumerates. One source. */
const options = (category: MagicCategory): string =>
  magicOptions(category)
    .map((option) => `- ${option.name}: ${option.note}`)
    .join('\n')

/** The three free-text fields, which mean the same thing whatever was matched. */
const TAIL = `## name, description and notes

\`name\` is what the owner will see in their block library — short, plain, and
about the design rather than the specific words in the picture. "Red band header",
not "Ramadan Kareem". \`description\` is one line under it.

\`notes\` is what you read off the picture, one short sentence each, at most
four. Write them for a shop owner, not for an engineer — they are shown beside
the result so the person can tell whether you understood their picture. Say what
you matched and anything you were unsure about.`

const CARD_SYSTEM = `You read a picture of a retail offer card and say which layout it is.

You are looking at one card from a supermarket flyer, a price list, a shelf
ticket or a social post — usually photographed or screenshotted by a shop owner
in the Gulf who wants a card like it. Your job is to match what you see against
a fixed set of layouts and describe how it is coloured. You never invent a
layout and you never describe one that is not on the list.

## The layouts

${options('offer-card')}

Pick the one whose *arrangement of parts* matches — where the photograph sits,
where the price sits, where the name sits. Ignore the specific products, the
specific prices, the language of the text and the brand. Those change every
week; the layout is what is being reused.

## Colour

Do not report the colours you can see. Report the *role* each colour plays, from
this list, because the card will be drawn in whichever shop's brand palette
loads it — never in the colours of the card you were shown:

- primary, secondary, accent — the shop's own brand colours
- surface — the ground a card sits on, usually white
- ink — the darkest neutral, what text is normally set in
- inkMuted — a softer neutral for secondary text

So a card with a red band across the foot is \`accent\` or \`primary\`, not red.

\`ground\` is the **card's own ground** — the colour behind the product name, not
the colour of a band or a badge sitting on top of it. A white card with a red
price band across the foot is \`ground: surface\` and \`accent: accent\`; get this
one wrong and the card is drawn with white type on a white ground. A card that is
entirely one strong colour edge to edge is \`ground: primary\`.

Set \`outlined\` only when there is a visible border around the whole card. Set
\`priceFrame\` to "tag" when the price sits in a shape — a tag, a box, a roundel —
and "plain" when it is just digits on the card.

## When it is not an offer card

Set \`isMatch: false\` when the picture is a page header, a footer, a logo
lockup, a whole flyer page, a store photograph, or anything else with no single
product and price in it. Say why in \`notes\`. A wrong match is worse than no
match: these layouts all repeat once per product, and one with nothing to repeat
over produces a card full of empty bindings.

${TAIL}`

function stillSystem(category: Exclude<MagicCategory, 'offer-card'>): string {
  const kind = KIND[category]

  return `You read a picture of a ${kind.one} and say which of our designs it is.

A ${kind.one} is ${kind.where}

The picture was uploaded by a shop owner in the Gulf who wants one like it —
usually photographed or screenshotted out of a leaflet, a price list or a feed.
Your job is to match what you see against a fixed set of designs. You never
invent one and you never name one that is not on the list.

## The designs

${options(category)}

Pick the one whose *arrangement of parts* matches — where the logo sits, where
the headline sits, what is set largest, whether the type is centred or ranged to
one edge, whether there is a plate or a band behind any of it.

**Ignore colour entirely.** Every one of these designs names its colours as roles
rather than values, and is drawn in whichever shop's palette loads it. A design
you saw in red and the same design in green are the same design, and there is
nothing for you to report about it. Ignore the specific words and the language
too: every line of copy on these is a placeholder the owner replaces.

## When it is not a ${kind.one}

Set \`isMatch: false\` when the picture is ${kind.notOne}, or anything else that
is not a ${kind.one}. Say why in \`notes\`. A wrong match is worse than no match —
the nearest ${kind.one} to a picture that is not one is still a ${kind.one}, and
the owner paid for it.

${TAIL}`
}

/**
 * The answer, checked.
 *
 * **Every provider comes through here, including the one whose API enforced the
 * schema on the way out.** Anthropic constrains generation to the schema and
 * Qwen is asked for JSON and takes its chances, so the two arrive with very
 * different odds of being well-formed — but the *code downstream* must not have
 * to know which. Validating both means a provider swap cannot widen what
 * reaches `arrangementsFromChoice`, and the enumeration in `magic.test.ts`
 * keeps meaning what it says.
 *
 * **The category picks the schema**, so an answer naming a real block of the
 * wrong kind fails here rather than being drawn. That is what makes the owner's
 * choice binding rather than a suggestion.
 */
export function interpret(raw: unknown, category: MagicCategory): MagicChoice {
  return interpretFirst([raw], category)
}

/**
 * The first candidate that validates, out of several readings of one reply.
 *
 * **The schema is the discriminator, and it has to be.** A model that corrects
 * itself mid-reply leaves more than one object in the response, and *parsing* is
 * not enough to tell them apart — the first live failure produced wreckage that
 * was still syntactically valid JSON, an object carrying half a sentence as a
 * key. It parsed. It was not the answer. Only the schema knows the difference,
 * so the candidates are tried against it in order rather than JSON.parse being
 * trusted to have found the right one.
 *
 * Order is the caller's: `vision-qwen.ts` offers the whole reply first and then
 * each balanced object latest-first, because a correction comes after the thing
 * it corrects.
 */
export function interpretFirst(
  candidates: readonly unknown[],
  category: MagicCategory
): MagicChoice {
  const schema = magicSchemaFor(category)

  for (const candidate of candidates) {
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) continue

    if (!parsed.data.isMatch) throw new NoMatchError(parsed.data.notes)

    return parsed.data
  }

  throw new UnreadableDesignError()
}
