import {
  MAGIC_STRUCTURES,
  STRUCTURE_NOTE,
  type MagicChoice,
  magicChoiceSchema,
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
 * **Deep import from the engine.** `src/magic.ts` is not on the package barrel
 * because it pulls in `library-cards.ts` — fifty-nine designs that
 * `block-category.ts` was split out to keep away from a browser bundle. This is
 * a Node process and may follow it; a component may not.
 */

/** What a picture of a card can turn out not to be. */
export class NotAnOfferCardError extends Error {
  constructor(readonly notes: readonly string[]) {
    super('not_an_offer_card')
    this.name = 'NotAnOfferCardError'
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
export type VisionReader = (image: VisionImage) => Promise<MagicChoice>

export const QUESTION = 'Which layout is this card, and how is it coloured?'

export const SYSTEM = `You read a picture of a retail offer card and say which layout it is.

You are looking at one card from a supermarket flyer, a price list, a shelf
ticket or a social post — usually photographed or screenshotted by a shop owner
in the Gulf who wants a card like it. Your job is to match what you see against
a fixed set of layouts and describe how it is coloured. You never invent a
layout and you never describe one that is not on the list.

## The layouts

${MAGIC_STRUCTURES.map((name) => `- ${name}: ${STRUCTURE_NOTE[name]}`).join('\n')}

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

Set \`isOfferCard: false\` when the picture is a page header, a footer, a logo
lockup, a whole flyer page, a store photograph, or anything else with no single
product and price in it. Say why in \`notes\`. A wrong match is worse than no
match: these layouts all repeat once per product, and one with nothing to repeat
over produces a card full of empty bindings.

## name, description and notes

\`name\` is what the owner will see in their block library — short, plain, and
about the design rather than the products in the picture. "Red price band card",
not "Nescafé offer". \`description\` is one line under it.

\`notes\` is what you read off the picture, one short sentence each, at most
four. Write them for a shop owner, not for an engineer — they are shown beside
the result so the person can tell whether you understood their picture. Say what
you matched and anything you were unsure about.`

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
 */
export function interpret(raw: unknown): MagicChoice {
  return interpretFirst([raw])
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
export function interpretFirst(candidates: readonly unknown[]): MagicChoice {
  for (const candidate of candidates) {
    const parsed = magicChoiceSchema.safeParse(candidate)
    if (!parsed.success) continue

    if (!parsed.data.isOfferCard) throw new NotAnOfferCardError(parsed.data.notes)

    return parsed.data
  }

  throw new UnreadableDesignError()
}
