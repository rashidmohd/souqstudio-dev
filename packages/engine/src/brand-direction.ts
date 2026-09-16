import * as z from 'zod/v4'
import { fromHex, whiteTextPasses } from './contrast'

/**
 * Brand direction — a palette and a type mood proposed for a shop. E8-08.
 *
 * **The vocabulary and the schema, in the engine, because two processes need
 * them.** The worker turns this into a prompt and validates a reply against it;
 * the web app turns an accepted proposal into a brand kit patch. Same argument
 * `magic.ts` makes for block matching: the set of legal answers is one
 * definition or the two sides drift, and a drifted enum is a proposal the worker
 * produced and the web app cannot apply.
 *
 * **The model proposes; it never writes.** Nothing here reaches `shops.brandKit`
 * without an owner accepting it — which is why the contrast gate below can be a
 * refusal rather than the warning E4-02 shows. We are not overruling anybody's
 * brand. We are declining to suggest a bad one.
 */

// ─── Type mood ────────────────────────────────────────────────────────────────

/**
 * How the shop's words should sound, not which fonts to use.
 *
 * **The model never names a typeface.** The catalog in
 * `apps/web/lib/brand-fonts.ts` is per-slot — Changa is narrow enough for a
 * price and Lalezar is wrong for body copy — so a model naming four families is
 * a model making four decisions the catalog already encodes, badly, and one bad
 * one is a kit that renders in a fallback nobody chose. It names a mood; the
 * web app resolves the mood into real families for the four slots, at
 * acceptance, from the list that is already filtered by role.
 *
 * This is the same rule the live run produced for magic block: do not ask a
 * model anything the code already knows.
 */
export const TYPE_MOODS = ['plain', 'bold-retail', 'warm', 'premium'] as const
export type TypeMood = (typeof TYPE_MOODS)[number]

export const TYPE_MOOD_NOTE: Readonly<Record<TypeMood, string>> = {
  plain: 'Neutral and unfussy. A shop that wants to be read, not admired.',
  'bold-retail': 'Loud and price-forward. Hypermarkets, weekly deals, big numbers.',
  warm: 'Rounded and friendly. Groceries, bakeries, neighbourhood shops.',
  premium: 'Quiet and spaced. Delicatessens, gifting, anything sold on quality.',
}

// ─── The proposal ─────────────────────────────────────────────────────────────

/**
 * How many colours a proposal carries.
 *
 * Four is the floor because a kit needs a colour to lead with, one to answer it,
 * one for a price and a neutral to set the rest against. Six is the ceiling
 * because `MAX_PALETTE` is eight and a proposal should leave an owner room to
 * add their own rather than filling the kit to its limit.
 */
export const MIN_PROPOSED = 4
export const MAX_PROPOSED = 6

const HEX = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'a six-digit hex colour')

const proposedColor = z.object({
  /**
   * What the shop would call it — "signage green", "price red".
   *
   * Named by the model on purpose. `BrandKit.palette` stopped being three fixed
   * slots because a guideline defines colours and blocks decide placement; a
   * proposal that came back as primary/secondary/accent would put that back.
   */
  name: z.string().trim().min(2).max(24),
  hex: HEX,
  /** One line, shown beside the swatch. Why this colour, for this shop. */
  why: z.string().trim().min(3).max(120),
})

export type ProposedColor = z.infer<typeof proposedColor>

export const brandDirectionSchema = z.object({
  /**
   * False when there is nothing here to read a brand off — a blurred photograph,
   * a picture of an empty shelf, a description that says nothing about what the
   * shop sells. Declining is an answer, as it is for magic block, and it costs
   * the owner nothing.
   */
  isReadable: z.boolean(),
  palette: z.array(proposedColor).min(MIN_PROPOSED).max(MAX_PROPOSED),
  /**
   * Which colour of the palette a price should be set in.
   *
   * An index rather than a hex, so it cannot name a colour that is not in the
   * palette it just proposed. This is the field the contrast gate is about:
   * prices are set in white on it.
   */
  priceIndex: z.number().int().min(0).max(MAX_PROPOSED - 1),
  mood: z.enum(TYPE_MOODS),
  /** Written for the owner, not for us. At most four short sentences. */
  notes: z.array(z.string().trim().min(1).max(200)).max(4),
})

export type BrandDirection = z.infer<typeof brandDirectionSchema>

// ─── The gate ─────────────────────────────────────────────────────────────────

export type DirectionProblem =
  | 'price_unreadable'
  | 'price_index_out_of_range'
  | 'colors_indistinct'
  | 'bad_hex'

/**
 * What is wrong with a proposal, computed rather than asked.
 *
 * **The whole reason this function exists** is the defect the first live magic
 * block run found: asked whether a card inverts its type, the model read a red
 * band on a white card, answered yes, and would have produced an invisible
 * product name. It was a fair reading of the picture and the wrong answer to the
 * question. Legibility is arithmetic over two colours, so nothing asks.
 *
 * A proposal with problems is regenerated once and then declined. It is never
 * shown — an owner approving a direction is not auditing it.
 */
export function directionProblems(direction: BrandDirection): DirectionProblem[] {
  const problems: DirectionProblem[] = []

  if (direction.palette.some((color) => fromHex(color.hex) === null)) {
    problems.push('bad_hex')
    // Every check below reads a hex. Nothing more can be said about this one.
    return problems
  }

  const price = direction.palette[direction.priceIndex]
  if (price === undefined) {
    problems.push('price_index_out_of_range')
  } else {
    const rgb = fromHex(price.hex)
    // `bad_hex` above already returned, so this is total.
    if (rgb !== null && !whiteTextPasses(rgb)) problems.push('price_unreadable')
  }

  /**
   * Colours that are all but the same colour.
   *
   * A model asked for five colours will produce five, and a photograph of a
   * green shopfront is a fair way to end up with five greens — a palette that is
   * technically five entries and practically one.
   *
   * **Distance, not contrast ratio.** This was written as a contrast check
   * first, and a test caught it: a dark green and a dark red have nearly the
   * same luminance, so their ratio is about 1: to WCAG they are
   * indistinguishable, and to a person they are green and red. Contrast answers
   * "can I read this on that", which is the `price_unreadable` question above
   * and not this one.
   */
  const tooClose = direction.palette.some((color, index) =>
    direction.palette.slice(index + 1).some((other) => sameSwatch(color.hex, other.hex))
  )
  if (tooClose) problems.push('colors_indistinct')

  return problems
}

/**
 * Whether two colours are, for practical purposes, one colour.
 *
 * Euclidean distance in sRGB. It is not perceptually uniform and does not need
 * to be: the question is "did the model propose the same swatch twice", not
 * "how far apart should a palette be spread", and at this end of the scale the
 * cheap measure and the expensive one agree. The threshold is a fortieth of the
 * longest distance in the cube, which separates #1B5E20 from #1B5E21 and leaves
 * every palette a person would call varied alone.
 */
const SAME_SWATCH = 24

function sameSwatch(a: string, b: string): boolean {
  const left = fromHex(a)
  const right = fromHex(b)
  if (left === null || right === null) return false

  return (
    Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b) < SAME_SWATCH
  )
}

/** Whether a proposal may be shown to an owner at all. */
export function isOfferable(direction: BrandDirection): boolean {
  return direction.isReadable && directionProblems(direction).length === 0
}

/**
 * The same contract as JSON Schema, for a provider that cannot be handed a zod
 * object. Derived, never written out by hand — `magicJsonSchemaFor` in
 * `magic.ts` makes the argument, and it is the same one.
 */
export function brandDirectionJsonSchema(): unknown {
  return z.toJSONSchema(brandDirectionSchema)
}
