import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  MAGIC_STRUCTURES,
  STRUCTURE_NOTE,
  type MagicChoice,
  magicChoiceSchema,
} from '@souqstudio/engine/src/magic'
import { env } from './env'

/**
 * Reading a picture of a card. E8-07.
 *
 * **This is extraction, not generation.** Nothing here draws a pixel — the model
 * looks at a photograph and answers a multiple-choice question about it, and
 * `arrangementsFromChoice` in the engine turns that answer into the same
 * arrangements the shipped library is built from. The distinction is the whole
 * reason the feature is tractable: the output space is an enum and six bounded
 * fields, so a wrong answer is a card that is not quite the picture rather than
 * a document that does not render.
 *
 * **Deep import from the engine, deliberately.** `src/magic.ts` is not on the
 * package barrel because it pulls in `library-cards.ts` — fifty-nine designs
 * that `block-category.ts` was split out to keep away from a browser bundle.
 * This is a Node process and may follow it; a component may not.
 */

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

/**
 * Opus, and not a cheaper model — a note for whoever tunes this later.
 *
 * The saving from a smaller model is a few cents on a call an owner makes a
 * handful of times a month, and this is the reasoning-heavy end of the product:
 * read a photograph, infer which of twenty-five arrangements it is, judge
 * whether the ground is dark enough to invert the type on. A cheaper model that
 * picks the wrong structure costs the owner's trust in the feature, which is
 * worth more than the model is.
 */
const MODEL = 'claude-opus-5'

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

const SYSTEM = `You read a picture of a retail offer card and say which layout it is.

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
A white card is \`ground: surface\`. A card that is entirely one strong colour is
\`ground: primary\` with \`onTint: true\`, because text on it has to invert.

Set \`onTint\` when the ground is dark or saturated enough that dark text on it
would not read. Set \`outlined\` only when there is a visible border around the
whole card. Set \`priceFrame\` to "tag" when the price sits in a shape — a tag, a
box, a roundel — and "plain" when it is just digits on the card.

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
 * Ask the model what it is looking at.
 *
 * **Structured output rather than a prompt asking for JSON.** The schema is
 * `magicChoiceSchema` from the engine, handed to the API as a JSON schema, so
 * the response is constrained to the same twenty-five structures and six colour
 * roles that the assembler can actually build — there is one definition and the
 * model is held to it, rather than a second one written in prose that drifts.
 */
export async function readCardDesign(image: {
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}): Promise<MagicChoice> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    // Adaptive thinking, at the default effort. Matching a layout is a judgement
    // — which of four stacked arrangements, is that ground dark enough to invert
    // — and it is the part that decides whether the owner keeps the result.
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(magicChoiceSchema) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.bytes.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Which layout is this card, and how is it coloured?',
          },
        ],
      },
    ],
  })

  // `parsed_output` is null when the model produced something the schema
  // refused. Treated as a failed read rather than retried here: the retry is
  // BullMQ's, and a second identical call is what it is for.
  const choice = response.parsed_output
  if (choice === null) throw new UnreadableDesignError()

  if (!choice.isOfferCard) throw new NotAnOfferCardError(choice.notes)

  return choice
}
