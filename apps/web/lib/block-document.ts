import { z } from 'zod'
import { TYPE_LEVELS, type Arrangement, type TypeLevel } from '@souqstudio/types'

/**
 * The block document, validated at the edge. E7.
 *
 * `blocks.arrangements` is JSONB, so Prisma will store whatever it is handed and
 * TypeScript stops caring the moment the value crosses the wire. A block is
 * *read by the export worker and printed*, which makes this the boundary where
 * a malformed document has to be refused rather than the screen where it first
 * draws wrong.
 *
 * **It is a mirror of `BlockElement` in `@souqstudio/types` and has to stay
 * one.** The compile-time check at the bottom is what makes that a build error
 * rather than a discovery: add a kind to the union and this file stops
 * typechecking until it knows about it.
 *
 * Two rules from the composition model are enforced here, not merely described:
 *
 * - **No hex, ever.** A colour is a `TokenRef` the shop's palette resolves. A
 *   block carrying a literal colour is a block that stops looking like the shop
 *   that loaded it, and the library becomes a set of unrelated pictures.
 * - **No pixels, ever.** A box is a fraction of the block, so the same design is
 *   1080 square in a carousel post and a third of a column in a booklet.
 */

const fraction = z.number().finite()

/**
 * How many stops a gradient may carry. A ceiling in the same spirit as
 * `MAX_ELEMENTS` below — a product judgement, not architecture. Declared up here
 * only because the schema that reads it is built at module load.
 */
export const MAX_GRADIENT_STOPS = 8

/**
 * Boxes are bounded well outside 0–1 rather than clamped to it, deliberately.
 * A chip anchored `TOP_START` overhangs its block by design — E6 §7 — so the
 * schema's job is to reject nonsense, and `validateBlock` in the engine is what
 * reports an element that has wandered off the card.
 */
const boxSchema = z.object({
  start: fraction.min(-1).max(2),
  top: fraction.min(-1).max(2),
  width: fraction.min(0).max(2),
  height: fraction.min(0).max(2),
})

const tokenRefSchema = z.enum(['primary', 'secondary', 'accent', 'surface', 'ink', 'inkMuted'])
// The tuple cast is the only way to hand zod a readonly array as an enum;
// the values are `TYPE_LEVELS` itself, so the two cannot drift.
const typeLevelSchema = z.enum(TYPE_LEVELS as unknown as [TypeLevel, ...TypeLevel[]])
const alignSchema = z.enum(['start', 'center', 'end'])
const familySchema = z.enum(['headline', 'display', 'price', 'body'])

/**
 * A colour, in one of the three ways a block may name one.
 *
 * **Six hex digits, not three, and not eight.** Shorthand is a convenience for
 * people typing CSS and this value is written by a colour picker; alpha belongs
 * to the element's `opacity`, where it is one control an owner can find rather
 * than two ways of saying the same thing that disagree.
 *
 * **One exception, and it is on the gradient stop rather than here** — a stop
 * carries its own `opacity`. The rule above holds because a flat colour at half
 * alpha and an element at half opacity are the same picture. That stops being
 * true across a run: a ground that fades out is opaque at one end and gone at
 * the other, and no element-wide opacity can say it. The exception is granted
 * exactly where the reasoning runs out and nowhere else.
 */
const flatColorSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('role'), ref: tokenRefSchema }),
  z.object({ from: z.literal('palette'), id: z.string().min(1).max(64) }),
  z.object({ from: z.literal('hex'), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
])

/**
 * A gradient, and the bounds are the usual kind of product judgement.
 *
 * **Two stops minimum, because one stop is a flat colour written the expensive
 * way** — and a document that can say the same thing two ways is a document
 * where the properties panel and the renderer eventually disagree about which
 * one it is holding. Eight is far past any card that reads; the ceiling exists
 * so a generated document cannot hand the export worker four hundred.
 *
 * `at` is not required to be sorted or distinct. Sorting belongs to
 * `resolvePaint`, which every renderer goes through, rather than to the edge —
 * refusing an out-of-order document would reject work an owner can produce by
 * dragging one stop past another.
 */
const gradientStopSchema = z.object({
  at: z.number().min(0).max(1),
  color: flatColorSchema,
  /**
   * The one place alpha is accepted. See `GradientStop` for why it is a field
   * rather than an eight-digit hex, and why the six-digit rule still holds
   * everywhere else.
   */
  opacity: z.number().min(0).max(1).optional(),
})

const colorSchema = z.union([
  flatColorSchema,
  z.object({
    from: z.literal('gradient'),
    angle: z.number().min(0).max(360),
    stops: z.array(gradientStopSchema).min(2).max(MAX_GRADIENT_STOPS),
  }),
])

const strokeSchema = z.object({
  color: flatColorSchema,
  /** A fraction of the block's geometric mean, like every other size here. */
  width: z.number().min(0).max(0.2),
})

const textSourceSchema = z.discriminatedUnion('from', [
  z.object({
    from: z.literal('product'),
    field: z.enum(['name', 'spec', 'brand', 'origin', 'packSize']),
  }),
  z.object({ from: z.literal('shop'), field: z.enum(['name', 'phone', 'address']) }),
  // The offer's own words. A separate source from `product` because a product
  // has no tier until it is put in a book at one.
  z.object({ from: z.literal('offer'), field: z.literal('tier') }),
  z.object({
    from: z.literal('static'),
    // Both languages, always. A static line with only an English value is a
    // block that renders a hole in an Arabic edition, and the owner who typed
    // it will never see that edition.
    textEn: z.string().max(280),
    textAr: z.string().max(280),
  }),
])

const overflowSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('shrink'), floor: typeLevelSchema }),
  // A clamp above six lines is not a clamp; below one it is a hidden element.
  z.object({ mode: z.literal('clamp'), lines: z.number().int().min(1).max(6) }),
  z.object({ mode: z.literal('truncate') }),
])

/**
 * What every element carries.
 *
 * `id` is **required here and filled in before parsing** — see `withIds`.
 * Documents written before the designer could select more than one element at a
 * time do not carry one, and refusing to read them would be losing a shop's
 * work over a field they never saw. Doing the repair before the schema rather
 * than making the field optional keeps this file an exact mirror of the type,
 * which is the thing that stops the two drifting.
 */
const baseSchema = {
  id: z.string().min(1).max(64),
  box: boxSchema,
  rotation: z.number().min(-180).max(180).optional(),
  opacity: z.number().min(0).max(1).optional(),
  groupId: z.string().min(1).max(64).optional(),
  locked: z.boolean().optional(),
}

/**
 * **Strict, so an unknown field is refused rather than dropped.**
 *
 * Zod strips what it does not recognise, which is the safe default for a form
 * body and the wrong one for a design document: an owner's work silently
 * disappearing on save is worse than a save that says no. It is also the check
 * that catches a client running ahead of the deploy it is talking to.
 */
const priceMarkStyleSchema = z.strictObject({
  tint: flatColorSchema.optional(),
  ink: flatColorSchema.optional(),
  surface: flatColorSchema.optional(),
  frame: z.enum(['tag', 'plain']).optional(),
  tab: z.enum(['attached', 'none']).optional(),
})

const elementSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...baseSchema,
    kind: z.literal('image'),
    source: z.discriminatedUnion('from', [
      z.object({ from: z.literal('product') }),
      z.object({ from: z.literal('asset'), assetId: z.string().min(1).max(64) }),
    ]),
    fit: z.enum(['contain', 'cover']).optional(),
    radius: z.number().min(0).max(64).optional(),
    stroke: strokeSchema.optional(),
  }),
  z.strictObject({
    ...baseSchema,
    kind: z.literal('text'),
    source: textSourceSchema,
    level: typeLevelSchema,
    align: alignSchema,
    overflow: overflowSchema.optional(),
    /**
     * A fraction of the block's geometric mean. Bounded well above anything
     * legible and well below the whole block: a "size" of 2 is not a headline,
     * it is a document that will render one glyph across a page.
     */
    size: z.number().min(0.005).max(1).optional(),
    weight: z.number().int().min(100).max(900).optional(),
    italic: z.boolean().optional(),
    letterSpacing: z.number().min(-0.2).max(1).optional(),
    transform: z.enum(['none', 'uppercase']).optional(),
    family: familySchema.optional(),
    color: flatColorSchema.optional(),
  }),
  z.strictObject({
    ...baseSchema,
    kind: z.literal('priceMark'),
    style: priceMarkStyleSchema.optional(),
  }),
  z.strictObject({
    ...baseSchema,
    kind: z.literal('chip'),
    anchor: z.enum(['TOP_START', 'TOP_END', 'INLINE']),
    fill: flatColorSchema.optional(),
    // Four of the nine shapes — see `BlockElement`. A badge holds a word.
    shape: z.enum(['none', 'pill', 'burst', 'ribbon', 'tag']).optional(),
    ink: flatColorSchema.optional(),
  }),
  z.strictObject({ ...baseSchema, kind: z.literal('logo') }),
  z.strictObject({
    ...baseSchema,
    kind: z.literal('shape'),
    fill: colorSchema,
    // The three primitives, then the six an offer card is actually made of.
    // `radius` applies to the rectangle alone; the paths compute their own
    // corners, and a document that sets both is not wrong, just ignored.
    variant: z
      .enum(['rect', 'ellipse', 'line', 'burst', 'ribbon', 'tag', 'flash', 'star', 'arrow'])
      .optional(),
    radius: z.number().min(0).max(64),
    stroke: strokeSchema.optional(),
  }),
])

/**
 * Ceilings, and they are product judgements rather than architecture — the same
 * kind of number as `MAX_PALETTE`. Forty elements is far past any card that
 * reads; six arrangements covers the four shapes a merge can produce with room
 * to spare. Nothing breaks at a hundred; a hundred is not a design.
 */
export const MAX_ELEMENTS = 40
export const MAX_ARRANGEMENTS = 6

const arrangementSchema = z
  .object({
    aspectMin: z.number().min(0.05).max(40),
    aspectMax: z.number().min(0.05).max(40),
    elements: z.array(elementSchema).max(MAX_ELEMENTS),
  })
  .refine((value) => value.aspectMin <= value.aspectMax, {
    message: 'An arrangement cannot end at a narrower shape than it starts',
  })

export const arrangementsSchema = z.array(arrangementSchema).min(1).max(MAX_ARRANGEMENTS)

/**
 * Ids for elements written before elements had ids.
 *
 * Deterministic — position within its arrangement — so the same stored document
 * always yields the same ids and a nudge or a selection keyed to one does not
 * move between reads. Nothing else is repaired: a document that is wrong in any
 * other way is refused, because every other field was written by something that
 * knew the schema.
 */
function withIds(value: unknown): unknown {
  if (!Array.isArray(value)) return value

  return value.map((arrangement) => {
    if (typeof arrangement !== 'object' || arrangement === null) return arrangement
    const row = arrangement as { elements?: unknown }
    if (!Array.isArray(row.elements)) return arrangement

    return {
      ...row,
      elements: row.elements.map((element, index) => {
        if (typeof element !== 'object' || element === null) return element
        const entry = element as { id?: unknown }
        return typeof entry.id === 'string' && entry.id !== ''
          ? element
          : { ...entry, id: `e${index}` }
      }),
    }
  })
}

/** The parsed document, or null if it is not a block. */
export function toArrangements(value: unknown): Arrangement[] | null {
  const parsed = arrangementsSchema.safeParse(withIds(value))
  return parsed.success ? parsed.data : null
}

/**
 * Whether a document is one a **seeded** block may hold: every colour a role the
 * shop's kit fills, never a palette entry and never a literal.
 *
 * **Re-exported from the engine, where it now lives.** It was defined here while
 * an API request was the only thing that carried a document. There are three
 * callers now — this route, the shipped library's own test, and a document
 * loaded from a file by `library-source.ts` — and the rule belongs in the one
 * package all three can reach. Importing it from here still works and should:
 * this is the module that says what a block document may contain.
 */
export { usesOnlyRoles } from '@souqstudio/engine'

/**
 * The mirror check.
 *
 * Asserting the inferred type against the declared one in both directions turns
 * "keep these in sync" from a comment into a build error: a new element kind, a
 * new text source or a renamed field fails this line before it fails a render.
 * A one-way check would let the schema quietly accept less than the type allows.
 */
type Extends<A, B> = A extends B ? true : false
const _schemaMatchesTypes: Extends<z.infer<typeof arrangementsSchema>, Arrangement[]> = true
const _typesMatchSchema: Extends<Arrangement[], z.infer<typeof arrangementsSchema>> = true
void _schemaMatchesTypes
void _typesMatchSchema
