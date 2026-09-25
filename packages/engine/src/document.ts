import { z } from 'zod'
import {
  MARK_CURRENCY_GAP,
  MARK_CURRENCY_SCALE,
  MARK_MINOR_SCALE,
  MARK_NUDGE,
  MARK_SATELLITE_SCALE,
  PRICE_MARK_PRESETS,
  TYPE_LEVELS,
  type Arrangement,
  type TextSource,
  type TypeLevel,
} from '@souqstudio/types'
import { POLYGON_SIDES, SHAPE_BOUNDS } from './shapes'

/**
 * The block document, validated wherever it enters. E7.
 *
 * **In the engine rather than in the web app, and that move was forced.** It
 * guarded one boundary while an API request was the only way a document could
 * arrive: `PATCH /api/v1/blocks/:id`, with `apps/web` on both sides of it. There
 * are three ways in now — that route, a file in `packages/engine/blocks`, and an
 * object fetched from R2 by `library-source.ts` — and the last is the one that
 * settles where this lives. A document loaded from a bucket is written into
 * every shop by the next sync, with no diff, no review and no compiler between
 * it and them. The loader is the only thing standing there, so the loader needs
 * the real schema and not a skeleton of one.
 *
 * `apps/web/lib/block-document.ts` re-exports every symbol here, so nothing that
 * imported it before had to change.
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

/**
 * A cast shadow. E14 §2.4.
 *
 * **Bounded like every other size here, and for a sharper reason.** The ring
 * count is derived from the blur and the output scale — roughly
 * `blur × 2.5 × s × dpi/72` — so an unbounded blur is an unbounded number of
 * paths on a page, decided by a document that came out of a bucket. A page of
 * 24 ringed bursts at 300 dpi measured 1,992 paths and 274 kB, and this bound
 * is what keeps a hostile or mistaken document from being the thing that finds
 * the ceiling.
 *
 * The offsets may be negative: a shadow above and to the start of its element
 * is unusual and not wrong.
 */
const shadowSchema = z.object({
  x: z.number().min(-0.5).max(0.5),
  y: z.number().min(-0.5).max(0.5),
  blur: z.number().min(0).max(0.25),
  color: flatColorSchema,
  /**
   * Peak darkness, 0–1. Absent is `SHADOW_PEAK`.
   *
   * **Bounded below 1 because the rings would stop reading as a shadow.** At
   * full opacity a soft shadow is a solid silhouette with a fringe, which is
   * the thing an owner is trying to avoid when they reach for softness.
   */
  opacity: z.number().min(0).max(0.9).optional(),
})

/**
 * What a glyph is filled with: a flat colour, or an **opaque** gradient.
 *
 * **Measured before it was allowed, and the measurement is the whole story.**
 * `export-check.ts` bans gradients carrying alpha stops because Chromium emits
 * a page-sized soft mask to carry the alpha, at a resolution nothing in the
 * document can set — E14 §0.3 recorded 54 dpi. What had never been tested was an
 * *opaque* gradient, and it behaves completely differently: a PDF shading
 * pattern, no mask, no raster, and the price is still real text. One price with
 * an opaque gradient measured 5.1 kB against 4.7 kB flat.
 *
 * So the alpha ban survives exactly where the reasoning does. A stop here is
 * `{ at, color }` and nothing else, and it is a `strictObject` on purpose: a
 * plain `z.object` would *strip* an `opacity` an authoring tool sent, storing a
 * gradient that renders differently from the one somebody built. Refused at the
 * boundary is the rule the text shadow below already follows.
 *
 * A gradient down the glyphs — light at the top, dark at the foot — is the
 * cheapest three-dimensional cue there is, and the one every retail price ticket
 * already uses.
 */
const textFillSchema = z.union([
  flatColorSchema,
  z.object({
    from: z.literal('gradient'),
    angle: z.number().min(0).max(360),
    stops: z.array(z.strictObject({ at: z.number().min(0).max(1), color: flatColorSchema }))
      .min(2)
      .max(MAX_GRADIENT_STOPS),
  }),
])

/**
 * An extrusion: the glyphs repeated behind themselves, making a solid side.
 *
 * **Copies of the string, which is why this is affordable.** A ring on text is
 * the string again under a *stroke*, and Chromium outlines stroked text into
 * explicit path geometry — which is why a soft text shadow costs 24 kB a ring
 * and is refused below. An extrusion needs no stroke: each copy is another text
 * run, the font stays in the PDF, and the cost is about a fifth of a kilobyte a
 * copy. Rendered through headless Chromium and the PDFs counted:
 *
 *   copies   0      4      8     16
 *   PDF     4.7kB  5.6kB  6.4kB  8.1kB      all vector, all still text
 *
 * With a gradient face and an outline on top, the whole effect is 17.3 kB for
 * one price — against 274 kB for a page of twenty-four ringed bursts, which is
 * the page this product already prints.
 *
 * **How many copies is derived at paint, never stored** — the same rule the
 * shadow's ring count follows. How many it takes to read as solid depends on the
 * output scale, and a document that stored the count would be a document that
 * looks right on screen and striped at 300 dpi.
 *
 * **The offsets are bounded much tighter than a shadow's.** An extrusion hangs
 * outside the element's box and nothing in the fit ladder knows about it, so a
 * deep one on a tight cell would overhang its neighbour. Until the fit accounts
 * for it, the bound is what keeps that from being anybody's problem.
 *
 * **A bevel is not here and should not be added.** `feSpecularLighting` over
 * text rasterises the element and takes the font out of the PDF entirely —
 * measured at 762×203 px with zero text-drawing operators, the one disqualifying
 * class of result in `export-check.ts`. A price that has become a picture is
 * unselectable, unsearchable and resampled by any printer that reprocesses it.
 */
const extrudeSchema = z.object({
  x: z.number().min(-0.08).max(0.08),
  y: z.number().min(-0.08).max(0.08),
  /** The side of the letters. Usually a darker cousin of the face colour. */
  color: flatColorSchema,
})

const textSourceSchema = z.discriminatedUnion('from', [
  z.object({
    from: z.literal('product'),
    field: z.enum(['name', 'spec', 'brand', 'origin', 'packSize']),
  }),
  z.object({ from: z.literal('shop'), field: z.enum(['name', 'phone', 'address']) }),
  // The offer's own words. A separate source from `product` because a product
  // has no tier until it is put in a book at one.
  // The offer's own words, and now the parts of the price that sit beside the
  // number rather than inside it. Not the price and not the fils — see the note
  // on `TextSource` in @souqstudio/types for why those two cannot leave.
  z.object({
    from: z.literal('offer'),
    field: z.enum([
      'tier',
      'currency',
      'compare',
      'prefix',
      'unitPrice',
      // The number itself, because a frame can hold it — E14 §4. The fils stays
      // inside this one run; it is kerning, not layout.
      'price',
      // Conditional content without a predicate in the engine: empty when there
      // is no was-price, and collapsed by the frame. E14 §3.7.
      'saveAmount',
      'savePercent',
    ]),
  }),
  // One identity source, resolved through `brandOverride`. There is no
  // `organization` entry and there must not be one — E14 §3.2.
  z.object({ from: z.literal('brand'), field: z.literal('name') }),
  // The dates are strings the composer resolved, never dates the engine
  // formats. Same rule as `comparePrice`.
  z.object({ from: z.literal('book'), field: z.enum(['title', 'validFrom', 'validTo']) }),
  z.object({
    from: z.literal('static'),
    // Both languages, always. A static line with only an English value is a
    // block that renders a hole in an Arabic edition, and the owner who typed
    // it will never see that edition.
    textEn: z.string().max(280),
    textAr: z.string().max(280),
    // Written by generative fill and not edited since. Declared here or the
    // save strips it, and the mark disappears on the next reload.
    machine: z.boolean().optional(),
  }),
])

/**
 * A shadow on text, and it must be a hard one.
 *
 * **Measured, and it is the one place the ring model does not pay.** A shape's
 * ring is one path; a glyph has no box to expand, so its ring is the string
 * again under a wider stroke — and Chromium *outlines* stroked text into
 * explicit path geometry on the way to a PDF. Rendered through headless Chrome
 * and the objects counted:
 *
 *   rings   1      2      4      8     16     27
 *   PDF    34kB   61kB  108kB  205kB  396kB  663kB      (26,385 curve ops)
 *
 * Linear, at roughly 24 kB a ring, for **one element**. A soft shadow on a
 * price is 663 kB; a page of twenty-four of them is not a file anybody can
 * send on WhatsApp. The same twenty-four ringed *bursts* come to 274 kB
 * together, which is why the bound is here and not on `shadowSchema`.
 *
 * So `blur` must be 0 on text. A hard shadow is one copy, it is what a retail
 * "SAVE 20%" actually wears, and it costs about 24 kB. A soft one cannot be
 * drawn at an acceptable size by any vector means, and the non-vector means —
 * `filter: drop-shadow()` — is the single disqualifying result in
 * `harness/export-check.ts`: the font leaves the PDF and the price becomes a
 * picture.
 *
 * **Refused rather than clamped**, because a block that asked for something it
 * cannot have should say so at the boundary rather than render differently from
 * what it stored. Widening this later is safe; no published block carries a
 * text shadow, because the field did not exist until now.
 */
const textShadowSchema = shadowSchema.extend({ blur: z.literal(0) })

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
/**
 * One orbiting part of the mark. The compass is closed and the scale is bounded
 * — which together are what keep an opened-up mark a price rather than a
 * collage. `MARK_SATELLITE_SCALE`'s ceiling is the rule that stops a was-price
 * growing to the size of the price.
 */
const satelliteSchema = z.strictObject({
  place: z
    .enum([
      'above-start',
      'above',
      'above-end',
      'start',
      'end',
      'below-start',
      'below',
      'below-end',
      'hidden',
    ])
    .optional(),
  scale: z.number().min(MARK_SATELLITE_SCALE.min).max(MARK_SATELLITE_SCALE.max).optional(),
  /**
   * The nudge off the compass point, in major sizes.
   *
   * Bounded here as well as in `markRecipe`, for the reason the comment on
   * `recipe` gives: the solver's clamp keeps a card readable, and this one keeps
   * the out-of-range value from being written into every shop by the next sync.
   */
  dx: z.number().min(MARK_NUDGE.min).max(MARK_NUDGE.max).optional(),
  dy: z.number().min(MARK_NUDGE.min).max(MARK_NUDGE.max).optional(),
})

/**
 * Where the currency code sits, and now also how big it is, how far off the
 * digits, and how it sits against them.
 *
 * **A union, because the bare string is what documents already carry.** Every
 * seeded block and every organization block written before the code had a size
 * spells this as `'before'`, and this object is strict — narrowing it to the
 * object form would refuse a shop's saved work and every block in the library.
 * The string means that placement with everything else defaulted, which is
 * exactly what it meant when it was the only thing that could be said.
 */
const currencyPlaceSchema = z.enum([
  'hidden',
  'before',
  'after',
  'super-before',
  'super-after',
  'above',
  'below',
])

const currencySchema = z.union([
  currencyPlaceSchema,
  z.strictObject({
    place: currencyPlaceSchema.optional(),
    scale: z.number().min(MARK_CURRENCY_SCALE.min).max(MARK_CURRENCY_SCALE.max).optional(),
    gap: z.number().min(MARK_CURRENCY_GAP.min).max(MARK_CURRENCY_GAP.max).optional(),
    align: z.enum(['top', 'middle', 'baseline']).optional(),
  }),
])

const priceMarkStyleSchema = z.strictObject({
  tint: flatColorSchema.optional(),
  ink: flatColorSchema.optional(),
  surface: flatColorSchema.optional(),
  /**
   * The seven parts, coloured one at a time.
   *
   * Every one is optional and every one falls back to a broad slot above or to
   * what the painter already hard-coded, so a document written before these
   * existed draws identically — which is the same compatibility bargain `frame`
   * and `tab` make, and the reason this strict object can grow at all.
   */
  majorInk: flatColorSchema.optional(),
  minorInk: flatColorSchema.optional(),
  currencyInk: flatColorSchema.optional(),
  compareInk: flatColorSchema.optional(),
  prefixInk: flatColorSchema.optional(),
  groundFill: flatColorSchema.optional(),
  groundStroke: flatColorSchema.optional(),
  tabFill: flatColorSchema.optional(),
  tabInk: flatColorSchema.optional(),
  /**
   * The shape behind the digits — the same kit a badge draws from.
   *
   * `box` is the rounded rectangle and the default, so a document written
   * before this existed is unchanged. `frame` below is the older spelling and
   * is still accepted, because organization blocks already carry it and this
   * object is strict: refusing the field would refuse a shop's saved work.
   */
  ground: z
    .enum(['none', 'box', 'burst', 'ribbon', 'tag', 'flash', 'star', 'arrow'])
    .optional(),
  frame: z.enum(['tag', 'plain']).optional(),
  tab: z.enum(['attached', 'none']).optional(),
  /**
   * The interior arrangement — see `PriceMarkStyle` in `@souqstudio/types`.
   *
   * **The bounds are here as well as in `markRecipe`, and that is not
   * belt-and-braces.** A document arriving from R2 is written into every shop by
   * the next sync with no diff and no compiler between it and them; the solver
   * clamping a scale at render time keeps the card readable, and this keeps the
   * out-of-range value from being stored in the first place. The one that has to
   * refuse is the one at the boundary.
   */
  preset: z.enum(PRICE_MARK_PRESETS).optional(),
  recipe: z
    .strictObject({
      currency: currencySchema.optional(),
      minor: z.enum(['raised', 'baseline', 'hidden']).optional(),
      minorScale: z.number().min(MARK_MINOR_SCALE.min).max(MARK_MINOR_SCALE.max).optional(),
      compare: satelliteSchema.optional(),
      prefix: satelliteSchema.optional(),
      tier: satelliteSchema.optional(),
      align: z
        .object({
          inline: alignSchema,
          block: z.enum(['top', 'middle', 'bottom']),
        })
        .optional(),
    })
    .optional(),
})

/**
 * An uploaded outline, validated as geometry and nothing else.
 *
 * **These patterns are the security boundary, not a tidiness check.** Nothing
 * upstream sanitises an SVG, because nothing upstream keeps one — the parser
 * reads a file and returns numbers. What lands here is therefore the only thing
 * that has to be true: a `d` that is path commands and digits, and a transform
 * that is one of six named functions taking numbers. Neither alphabet can spell
 * a URL, an entity, an element or a script, so a stored document cannot carry
 * one however it was written, by our own parser or by an import.
 */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/
const TRANSFORM = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+0-9eE.,\s]+\)\s*)+$/

/** Past this a drawing is a file rather than a shape, and the page carries it every read. */
const MAX_ART_BYTES = 16_384

export const shapeArtSchema = z
  .strictObject({
    // A viewBox of zero scales to nothing; one in the millions is a file that
    // was authored in the wrong units and will land as a smear.
    width: z.number().finite().gt(0).max(100_000),
    height: z.number().finite().gt(0).max(100_000),
    paths: z
      .array(
        z.strictObject({
          d: z.string().min(2).max(MAX_ART_BYTES).regex(PATH_DATA),
          transform: z.string().max(512).regex(TRANSFORM).optional(),
          evenOdd: z.boolean().optional(),
        })
      )
      .min(1)
      .max(64),
  })
  .refine(
    (art) => art.paths.reduce((total, path) => total + path.d.length, 0) <= MAX_ART_BYTES,
    { message: 'That drawing has too much detail to carry on a card' }
  )

const elementSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...baseSchema,
    kind: z.literal('image'),
    source: z.discriminatedUnion('from', [
      /*
       * **The two bound sources are strict, and that is what makes "uploads
       * only" true rather than merely intended.** A plain `z.object` *strips*
       * an unknown key instead of refusing it, so `blur` on a product image
       * parsed cleanly and disappeared — the owner sets something, the document
       * stores nothing, and nobody is told. Refused at the boundary, the same
       * rule the text shadow above follows: a block cannot store one thing and
       * render another.
       *
       * The `asset` member stays open, because it is the one that legitimately
       * gains fields.
       */
      z.strictObject({ from: z.literal('product') }),
      z.object({
        from: z.literal('asset'),
        /**
         * An R2 object key.
         *
         * **200, because 64 was the length of an upload and not the length of a
         * key.** `POST /blocks/artwork` mints `{org}/blocks/{random}`, which is
         * comfortably inside 64 — so the limit held for as long as an upload was
         * the only picture a block could name. A generated cover is
         * `{org}/{shop}/covers/{jobId}-{index}.jpg` and a character
         * `{org}/{shop}/characters/…`: around ninety characters, both of them,
         * and both silently refused at the boundary. The same 200 the page
         * background's own schema uses, so the two ways a picture reaches a page
         * agree about what a key is.
         *
         * Raising a maximum cannot invalidate a document that already parsed.
         */
        assetId: z.string().min(1).max(200),
        /**
         * Where a blurred upload came from — **provenance, never paint.**
         *
         * `assetId` always names the picture as drawn, so no painter learns
         * what a blur is and nothing reaches the export path as a filter. §2.4
         * measured `feGaussianBlur` rasterising its own element at a resolution
         * Chromium picks, so blur is produced as pixels and stored.
         *
         * **Only on an upload, and the union is what enforces it.** A product
         * image is chosen from the catalog at render time and a brand logo
         * belongs to whichever shop draws the block — neither is one file that
         * could have been blurred in advance, so neither member carries this.
         *
         * `radius` is a fraction of the image's shorter edge.
         */
        blur: z
          // 200 for the same reason `assetId` is: this is the same kind of key.
          .object({ from: z.string().min(1).max(200), radius: z.number().min(0).max(0.06) })
          .optional(),
      }),
      // `logo` stopped being an element kind — E14 §3.1. It is a picture, so
      // every image property applies to it, `aspect` most of all.
      z.strictObject({ from: z.literal('brand'), field: z.literal('logo') }),
    ]),
    fit: z.enum(['contain', 'cover']).optional(),
    /**
     * Padding inside the box, a fraction of its shorter edge. Absent keeps the
     * painter's default (0.12 for a product photo, 0 otherwise), so every
     * document written before this field existed draws exactly as it did.
     * Capped at 0.3: past that the picture is a speck in a frame.
     */
    padding: z.number().min(0).max(0.3).optional(),
    radius: z.number().min(0).max(64).optional(),
    stroke: strokeSchema.optional(),
    shadow: shadowSchema.optional(),
    /**
     * A shadow traced from the picture's own alpha, rather than grown from its
     * box. E14 §2.4.
     *
     * **Why this is a second field and not `shadow` with more options.** The
     * two are different mechanisms with different limits. `shadow` above is
     * painted as concentric vector rings around the element's *rectangle* — so
     * on a cutout of a bottle it draws the shadow of a rounded rect, which is
     * the defect this exists to fix. A traced shadow needs the alpha channel,
     * which means reading pixels, which means it is rendered ahead of time and
     * stored: `shadowKey(r2Key, preset)` in `packages/types`.
     *
     * **Presets rather than parameters**, because each distinct value is a
     * rendered object per product. A free-form radius would re-render every
     * product in a book on every nudge of a slider.
     *
     * **It applies to a product image**, the one source whose pixels are
     * rendered ahead of time by the pipeline that produced the cutout. An
     * upload has no such pass, so the ring shadow remains its answer — and
     * when both are set on the same element, the preset wins and the rings are
     * not drawn.
     */
    shadowPreset: z.enum(['soft-drop', 'hard-drop', 'contact', 'grounded']).optional(),
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
    // A rule through the text. Absent means the source decides — struck for a
    // was-price, plain for everything else.
    decoration: z.enum(['none', 'line-through']).optional(),
    family: familySchema.optional(),
    /**
     * The face of the glyphs. Widened from a flat colour to accept an opaque
     * gradient — see `textFillSchema`. Every stored document still parses: a
     * flat colour is the first member of the union.
     */
    color: textFillSchema.optional(),
    // An outline on the glyphs — "SAVE 20%" in white over red. The painter
    // doubles this and orders the paint `stroke fill`, so the number here is
    // the outline you see. E14 §2.4.
    stroke: strokeSchema.optional(),
    shadow: textShadowSchema.optional(),
    /** The side of the letters, drawn behind the face. See `extrudeSchema`. */
    extrude: extrudeSchema.optional(),
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
    // **Optional, so an outline-only shape can be expressed.** It was required,
    // and a hairline rule box around a price — the commonest piece of furniture
    // on a printed ticket — had to be faked with one filled rectangle on
    // another. E14 §2.4.
    fill: colorSchema.optional(),
    // Present exactly when `variant` is `art`; the arrangement refuses the pair
    // separately, because a member of a discriminated union cannot carry its
    // own refinement.
    art: shapeArtSchema.optional(),
    // The three primitives, then the six an offer card is actually made of,
    // then the one whose geometry the owner sets rather than picks.
    // `radius` applies to the rectangle and the polygon; the other paths
    // compute their own corners, and a document that sets one on a burst is
    // not wrong, just ignored.
    variant: z
      .enum([
        'rect',
        'ellipse',
        'line',
        'burst',
        'ribbon',
        'tag',
        'flash',
        'star',
        'arrow',
        'polygon',
        'arch',
        'wave',
        'bubble',
        'art',
      ])
      .optional(),
    // **The bounds are the schema's, not the control's.** A block arrives here
    // from an import, a seed and an AI reply as well as from the designer, and
    // a two-sided polygon is an element nobody can see. `POLYGON_SIDES` is the
    // one statement of the range; the picker reads the same constant.
    sides: z
      .number()
      .int()
      .min(POLYGON_SIDES.min)
      .max(POLYGON_SIDES.max)
      .optional(),
    // The parametric shapes' own numbers, each bounded by the same constant the
    // geometry and the picker read. A curve deeper than the element is a shape
    // drawn outside the box its owner dragged.
    curve: z.number().min(SHAPE_BOUNDS.curve.min).max(SHAPE_BOUNDS.curve.max).optional(),
    waves: z
      .number()
      .int()
      .min(SHAPE_BOUNDS.waves.min)
      .max(SHAPE_BOUNDS.waves.max)
      .optional(),
    tail: z.number().min(SHAPE_BOUNDS.tail.min).max(SHAPE_BOUNDS.tail.max).optional(),
    radius: z.number().min(0).max(64),
    stroke: strokeSchema.optional(),
    shadow: shadowSchema.optional(),
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
  /**
   * **`art` and the variant that names it arrive together or not at all.**
   * Either half alone is an element that draws nothing: a variant with no
   * outline falls through every branch of the painter, and an outline the
   * variant does not name is bytes nobody reads. It is checked here rather than
   * on the element because `z.discriminatedUnion` takes objects, and an object
   * carrying a refinement is no longer one.
   */
  .refine(
    (value) =>
      value.elements.every(
        (element) =>
          element.kind !== 'shape' || (element.variant === 'art') === (element.art !== undefined)
      ),
    { message: 'An uploaded shape needs its outline, and an outline needs to be named' }
  )

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

// `usesOnlyRoles` is the other half of "what a seeded block may hold" and lives
// in `roles.ts` — it needs no schema, only the parsed type.
export { usesOnlyRoles } from './roles'

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

/**
 * The same check over the binding vocabulary, and it is the compiler's half of
 * E14 §3.5.
 *
 * A binding is *declared* in `@souqstudio/types` and *resolved* in a painter,
 * and until now nothing checked that the two lists matched — which is why
 * `shop.phone` was in the vocabulary and absent from every renderer for as long
 * as both existed. This line catches a schema that has fallen behind the type.
 * `bindings.test.ts` catches a painter that has, which is the half a type system
 * cannot see.
 */
const _textSourceMatchesType: Extends<z.infer<typeof textSourceSchema>, TextSource> = true
const _textSourceCoversType: Extends<TextSource, z.infer<typeof textSourceSchema>> = true
void _textSourceMatchesType
void _textSourceCoversType
