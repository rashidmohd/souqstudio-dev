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

const textSourceSchema = z.discriminatedUnion('from', [
  z.object({
    from: z.literal('product'),
    field: z.enum(['name', 'spec', 'brand', 'origin', 'packSize']),
  }),
  z.object({ from: z.literal('shop'), field: z.enum(['name', 'phone', 'address']) }),
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

const elementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    box: boxSchema,
    source: z.discriminatedUnion('from', [
      z.object({ from: z.literal('product') }),
      z.object({ from: z.literal('asset'), assetId: z.string().min(1).max(64) }),
    ]),
  }),
  z.object({
    kind: z.literal('text'),
    box: boxSchema,
    source: textSourceSchema,
    level: typeLevelSchema,
    align: alignSchema,
    overflow: overflowSchema.optional(),
  }),
  z.object({ kind: z.literal('priceMark'), box: boxSchema }),
  z.object({
    kind: z.literal('chip'),
    box: boxSchema,
    anchor: z.enum(['TOP_START', 'TOP_END', 'INLINE']),
  }),
  z.object({ kind: z.literal('logo'), box: boxSchema }),
  z.object({
    kind: z.literal('shape'),
    box: boxSchema,
    surface: tokenRefSchema,
    radius: z.number().min(0).max(64),
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

/** The parsed document, or null if it is not a block. */
export function toArrangements(value: unknown): Arrangement[] | null {
  const parsed = arrangementsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

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
