/**
 * Magic block — what a model may decide when it reads a picture of a card.
 *
 * **It chooses a structure and a skin. It does not draw.** `library-cards.ts`
 * holds twenty-five structures, each a function from a `Skin` to a full set of
 * arrangements, and `docs/E7-pending.md` §8 records why: the library is
 * structure times skin because thirty hand-drawn cards drifted apart inside a
 * month. A model handed a blank document would drift the same way, and faster —
 * so it picks from the same vocabulary the library is written in, and the
 * arrangements come out of the same functions that produced the shipped blocks.
 *
 * Three properties fall out of that, and each of them is the reason this is not
 * a free-form generator:
 *
 * - **It cannot emit an illegal document.** The output is an enum and six
 *   bounded fields. `arrangementsFromChoice` is what turns it into elements, and
 *   it is the same call the seeded library makes.
 * - **It reflows.** A photograph shows one shape. A structure carries every
 *   shape it claims — usually four — so the block a shop gets works in a merged
 *   region rather than only in the one the picture happened to be.
 * - **It looks like the shop.** Every colour here is a `TokenRef`, so the card
 *   is drawn in whichever brand kit loads it. A literal sampled off somebody
 *   else's flyer would be a card that looks like *them*, permanently.
 *
 * `docs/composition-model.md` §3.2, and `usesOnlyRoles` in `roles.ts` is the
 * check that holds the shipped library to it.
 */

/**
 * **`zod/v4`, and it is not interchangeable with the `zod` this package imports
 * elsewhere.** `document.ts` is written against v3 and stays there; this schema
 * is handed to `zodOutputFormat` in the Anthropic SDK, which reads the v4
 * internals and throws on a v3 object. The two never meet — a choice is not a
 * document — so the seam costs nothing beyond this note.
 */
import * as z from 'zod/v4'
import type { Arrangement, PriceMarkStyle, Stroke, TokenRef } from '@souqstudio/types'
import {
  type Skin,
  brandLed,
  burst,
  compact,
  cornerFlag,
  editorial,
  feature,
  framed,
  fullBleed,
  halo,
  inlinePrice,
  listRow,
  nameBand,
  overlay,
  photoLed,
  platedPhoto,
  priceBand,
  priceBomb,
  priceFirst,
  sideRail,
  specLed,
  splitTint,
  splitVertical,
  stacked,
  ticket,
  wordsOnly,
} from './library-cards'

/**
 * Every structure, addressable by name.
 *
 * **Two of them do not take a bare skin, and they are adapted here rather than
 * excluded.** `overlay` takes a scrim and a text colour because it draws over a
 * full-bleed photograph, and `listRow` takes a rule flag. Leaving them out would
 * lose the two designs a model is most likely to be shown — a photo-led social
 * post and a supermarket line item — so each gets a one-line adapter and the
 * registry stays one uniform shape.
 */
const STRUCTURE: Readonly<Record<string, (skin: Skin) => Arrangement[]>> = {
  stacked,
  photoLed,
  priceBand,
  burst,
  framed,
  ticket,
  priceFirst,
  compact,
  feature,
  halo,
  brandLed,
  specLed,
  sideRail,
  splitTint,
  wordsOnly,
  fullBleed,
  cornerFlag,
  priceBomb,
  editorial,
  platedPhoto,
  inlinePrice,
  nameBand,
  splitVertical,
  // The scrim is the accent when one was chosen, and ink otherwise: a
  // photograph needs something dark behind the type or nothing on it reads.
  overlay: (skin) => overlay(skin.accent ?? 'ink', 'surface'),
  // Ruled, always. The unruled variant is a list of rows with nothing between
  // them, which reads as one block of text at the sizes a line item is used at.
  listRow: (skin) => listRow(skin, true),
}

export const MAGIC_STRUCTURES = Object.keys(STRUCTURE) as [string, ...string[]]

/**
 * What each structure looks like, in the words a model reads.
 *
 * **Written for the model, not for the picker.** `CARD_BLOCKS` already carries a
 * description per shipped block, but those describe a block *plus its skin*
 * ("the price reversed out of a coloured band") and name the shop's use ("the
 * weekly-flyer default"). What a match needs is the arrangement of the parts,
 * because that is the only thing visible in a photograph — so these say where
 * the photo, the name and the price sit, and nothing about who it is for.
 */
export const STRUCTURE_NOTE: Readonly<Record<string, string>> = {
  stacked: 'Packshot on top, name and spec under it, price at the foot. The default flyer card.',
  photoLed: 'Photograph takes most of the card; name and price sit in a short strip beneath it.',
  priceBand: 'Photo and name above a solid coloured band across the foot holding the price.',
  burst: 'Price inside a circle or disc laid over the corner of the packshot. Loud.',
  framed: 'A hairline border around the whole card, centred type, a rule above the price.',
  ticket: 'A dark tab across the top of the card carrying the badge, like a shelf ticket.',
  priceFirst: 'Price on the first line, above the photograph. Everything else follows it.',
  compact: 'Name and price only, no spec line and little else. Built for a dense grid.',
  feature: 'Brand line, oversized name, oversized price. Designed to fill a large cell.',
  halo: 'A soft disc or ring behind the packshot, name and price stacked below.',
  brandLed: 'The brand name set largest, above the product name and the price.',
  specLed: 'The spec or size line given prominence — a weight, a volume, a pack count.',
  sideRail: 'A coloured vertical rail down one edge, the badge turned into it.',
  splitTint: 'The card divided into two grounds, one tinted, with the price on the tinted half.',
  wordsOnly: 'No photograph at all. Name, spec and price set as type.',
  fullBleed: 'The photograph runs to every edge with type laid directly over it.',
  cornerFlag: 'A triangular or angled flag in one corner carrying the badge or the price.',
  priceBomb: 'The price is the largest thing on the card by a wide margin.',
  editorial: 'Magazine-like: generous margins, a rule, restrained type, small price.',
  platedPhoto: 'The photograph sits on an inset panel with a margin of ground around it.',
  inlinePrice: 'Name and price on the same line, reading across rather than stacked.',
  nameBand: 'A band across the card carrying the product name rather than the price.',
  splitVertical: 'Photo on one side, all the type on the other, split top to bottom.',
  overlay: 'Full-bleed photograph with the type over a dark scrim at one end.',
  listRow: 'A line item: small thumbnail at the start, name in the middle, price at the end.',
}

/**
 * The choice, and every field in it is closed.
 *
 * **Six colours and twenty-five structures is the whole output space**, which is
 * what makes this reliable where "emit a block document" is not. There is no
 * free string that reaches a renderer: `name` and `description` are shown to the
 * owner in the library and nowhere else, and `notes` is shown beside the result
 * so the person can see what was read off their picture and disagree with it.
 */
const tokenRef = z.enum(['primary', 'secondary', 'accent', 'surface', 'ink', 'inkMuted'])

export const magicChoiceSchema = z.object({
  /**
   * Whether this is a repeating offer card at all.
   *
   * **False is a real answer and must stay one.** Every structure here repeats
   * over the product list; a header, a footer or a whole page has no product in
   * scope and would come back as a card with product bindings it cannot fill.
   * Refusing is better than matching a masthead to the nearest offer card, so
   * the model is told to say so and the job reports it.
   */
  isOfferCard: z.boolean(),
  structure: z.enum(MAGIC_STRUCTURES),
  /** The card's ground. `surface` is a white card; a brand role is a tinted one. */
  ground: tokenRef,
  /** The band, disc, rail or tab the structure paints, when it paints one. */
  accent: tokenRef.optional(),
  /** A hairline border around the card. */
  outlined: z.boolean(),
  /**
   * Whether the price mark keeps its tag frame or is stripped to digits.
   *
   * The *only* control offered over the price mark, and deliberately: E6 §3 and
   * `docs/E7-pending.md` §3 both say the mark is placed and sized, never opened.
   * A model given a text box would produce a different price treatment per card
   * inside a week.
   */
  priceFrame: z.enum(['tag', 'plain']),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200),
  /** What was read off the picture, in the owner's language, one line each. */
  notes: z.array(z.string().max(200)).max(6),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type MagicChoice = z.infer<typeof magicChoiceSchema>

/**
 * The same contract as JSON Schema, for a provider that cannot be handed a zod
 * object.
 *
 * **Derived, never written out by hand.** Anthropic takes the schema itself and
 * constrains generation to it; an OpenAI-compatible endpoint has to be *told*
 * the shape in the prompt. Those are two ways of saying the same thing, and the
 * moment the second one is typed out separately it starts drifting from the
 * first — a structure added here would be offered to one provider and not the
 * other, and the symptom would be one model quietly never choosing it.
 */
export const magicChoiceJsonSchema = z.toJSONSchema(magicChoiceSchema)

/**
 * The choice, drawn.
 *
 * Every branch here is a `TokenRef` or a bounded number, so what comes back has
 * already cleared `usesOnlyRoles` by construction — there is no path through
 * this function that produces a literal colour.
 */
export function arrangementsFromChoice(choice: MagicChoice): Arrangement[] {
  const build = STRUCTURE[choice.structure]
  if (build === undefined) {
    // Unreachable through the schema, which is an enum over this same registry.
    // Named rather than assumed so that adding a structure to one and not the
    // other fails loudly instead of drawing the first card in the list.
    throw new Error(`magic: no structure "${choice.structure}"`)
  }

  return build(skinFromChoice(choice))
}

/**
 * The skin, assembled.
 *
 * **`onTint` is derived from the ground, and that is a fix for a defect a real
 * model produced on its first run.** Asked whether the card inverts its type, it
 * looked at a white card with a red price band, saw white type *on the band*,
 * and said yes — which is a fair reading of the picture and the wrong answer to
 * this question. `onTint` inverts every bound string on the card at once, so on
 * a `surface` ground it paints white text on a white card. The ground already
 * decides it: every tinted card in `library-cards.ts` sets it and no white one
 * does. So it is not asked for.
 *
 * **`chipFill` is derived rather than chosen, and that is a fix for a defect the
 * gallery found.** A promo-tier pill draws in one of the shop's brand colours,
 * so on a brand-grounded card the pill and the ground can be the same colour —
 * `docs/E7-pending.md` §8 records a "Half price" chip that vanished into its own
 * card. Every tinted card in the shipped library therefore names a neutral, and
 * a generated one must too. Asking the model for it would be asking it to
 * rediscover that, per card, from a photograph.
 */
function skinFromChoice(choice: MagicChoice): Skin {
  const tinted = choice.ground !== 'surface'

  const price: PriceMarkStyle | undefined =
    choice.priceFrame === 'plain' ? { frame: 'plain' } : undefined

  // On a tinted ground the mark needs its own surface behind it, the same as
  // every tinted card in `library-cards.ts` does.
  const priceOnTint: PriceMarkStyle | undefined = tinted
    ? { ...price, surface: { from: 'role', ref: 'surface' } }
    : price

  const stroke: Stroke | undefined = choice.outlined
    ? { color: { from: 'role', ref: tinted ? 'surface' : 'primary' }, width: 0.005 }
    : undefined

  return {
    ground: choice.ground,
    onTint: tinted,
    ...(choice.accent === undefined ? {} : { accent: choice.accent }),
    ...(priceOnTint === undefined ? {} : { price: priceOnTint }),
    ...(stroke === undefined ? {} : { stroke }),
    // A neutral pill on any card that grounds itself in a brand colour.
    ...(tinted ? { chipFill: neutralPill(choice.ground) } : {}),
  }
}

/** A pill colour that cannot collide with the ground it sits on. */
function neutralPill(ground: TokenRef): TokenRef {
  return ground === 'ink' || ground === 'inkMuted' ? 'surface' : 'ink'
}
