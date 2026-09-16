import {
  MAX_PROPOSED,
  MIN_PROPOSED,
  TYPE_MOODS,
  TYPE_MOOD_NOTE,
  brandDirectionSchema,
  type BrandDirection,
} from '@souqstudio/engine'

/**
 * What a model is asked for a brand direction, and what its answer has to be.
 * E8-08.
 *
 * **Provider-independent, for the reason `magic-prompt.ts` gives.** The question
 * and the vocabulary live here so that swapping providers cannot quietly change
 * what is being asked, and so the two stay comparable. Only the transport
 * differs, and the transports are the same two files E8-07 already has.
 *
 * **The model is asked for colours and a mood. It is not asked whether they
 * work.** Whether a price colour can carry white type is arithmetic over two
 * colours — `directionProblems` in the engine computes it, and a proposal that
 * fails is regenerated once and then declined. This is the lesson the first live
 * magic block run produced, applied before it could produce the same defect
 * twice: asked a question it could answer plausibly and wrongly, a model will.
 */

/** Nothing here is a brand — a blurred photo, an empty shelf, an empty sentence. */
export class UnreadableShopError extends Error {
  constructor(readonly notes: readonly string[]) {
    super('unreadable_shop')
    this.name = 'UnreadableShopError'
  }
}

/** The model answered, but not in a shape the schema accepts. */
export class UnusableDirectionError extends Error {
  constructor() {
    super('unusable_direction')
    this.name = 'UnusableDirectionError'
  }
}

/** The picture, ready to send. Absent when the owner described the shop instead. */
export interface DirectionImage {
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}

/** What the owner gave us to work from. Exactly one of the two is set. */
export interface DirectionInput {
  image?: DirectionImage
  described?: string
  /** The shop's name, always available. It is what the colours are *for*. */
  shopName: string
}

/** What every provider module implements. */
export type DirectionReader = (input: DirectionInput) => Promise<BrandDirection>

const MOODS = TYPE_MOODS.map((mood) => `- ${mood}: ${TYPE_MOOD_NOTE[mood]}`).join('\n')

export const SYSTEM = `You propose a colour palette and a type mood for a small retail shop.

The shop is in the Gulf — a grocery, a pharmacy, an electronics shop, a bakery.
The owner is setting the shop up on a platform that prints their offer books, and
they have no brand guideline and usually no designer. What you propose becomes
the colours every price, every header and every offer card in their flyers is
drawn in, for as long as they keep it.

You are proposing. The owner sees what you produce and accepts or discards it,
so this is a starting point they can live with rather than a finished identity.

## The palette

Between ${MIN_PROPOSED} and ${MAX_PROPOSED} colours.

**Name each one the way the shopkeeper would**, in plain words about the thing it
came from or the job it does — "signage green", "crate orange", "price red". Do
not name them primary, secondary or accent: those are positions, the platform
does not store colours by position, and where a colour goes is the block's
decision rather than yours.

A usable palette for this product has, somewhere in it: a colour strong enough to
lead a header, a second that sits beside it without fighting, something that can
carry a price, and at least one quiet neutral that a dense page of products can
be set against. You do not have to label them that way — just do not propose six
loud colours and no neutral, or six versions of the same colour.

\`priceIndex\` is the position in your own list of the colour a price should be
set in. Prices are printed in **white type on that colour**, at speed, on paper,
in a shop. Choose one that is dark enough for that to be legible. It is checked
after you answer, and a palette that fails the check is thrown away — so this is
the field to be conservative on.

## The type mood

One of these, and nothing else:

${MOODS}

You are not choosing typefaces. The platform holds a curated list of families
that all cover Arabic and Latin, and it picks from that list for each slot once
it knows the mood. Naming a font here would overrule a decision that has already
been made more carefully than you can make it from a photograph.

## When there is nothing to read

Set \`isReadable: false\` when what you were given says nothing about the shop —
a blurred or dark photograph, a close-up of one product, an empty shelf, a
sentence that names no trade. Say why in \`notes\`. Declining costs the owner
nothing and they can try again with something better; a palette invented out of
nothing is one they will wonder about every time they open their flyer.

## notes

At most four short sentences, written for the shop owner rather than for an
engineer. They are shown beside the swatches so the person can tell whether you
understood their shop. Say what you read off the picture or the description, and
anything you were unsure about.`

export function questionFor(input: DirectionInput): string {
  const named = `The shop is called "${input.shopName}".`

  if (input.described !== undefined) {
    return `${named} The owner describes it like this:\n\n"${input.described}"\n\nWhat palette and type mood would you propose?`
  }

  return `${named} This is a photograph of it. What palette and type mood would you propose?`
}

/**
 * The answer, checked against the schema.
 *
 * Every provider comes through here, including the one whose API enforced the
 * schema on the way out — `magic-prompt.ts` → `interpret` makes the argument in
 * full, and it holds here for the same reason: nothing downstream should have to
 * know which provider answered.
 */
export function interpretDirection(raw: unknown): BrandDirection {
  return interpretFirstDirection([raw])
}

/** The first candidate that validates, out of several readings of one reply. */
export function interpretFirstDirection(candidates: readonly unknown[]): BrandDirection {
  for (const candidate of candidates) {
    const parsed = brandDirectionSchema.safeParse(candidate)
    if (!parsed.success) continue

    if (!parsed.data.isReadable) throw new UnreadableShopError(parsed.data.notes)

    return parsed.data
  }

  throw new UnusableDirectionError()
}
