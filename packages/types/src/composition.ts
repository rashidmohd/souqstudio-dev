// Composition model — blocks, page grids, flow and pins.
//
// See `docs/composition-model.md`. This supersedes the E6 §2 template grammar
// (`OfferTemplate`, `PageType`, `TemplateGrid`, `Slot`) and the E4 grid/template
// presets (`GridConfig`, `TemplateConfig`), both of which still live in
// `index.ts` until the E4 brand flow is migrated off them.
//
// Three levels, each ignorant of the one below it:
//
//   Brand kit  identity — logo, colours, fonts. No layout.
//   Block      the design of one repeatable unit. Not where it sits.
//   Page grid  regions filled with blocks. Not what a block looks like inside.

// ─── Design-system references ─────────────────────────────────────────────────
//
// Every colour and font inside a block is a role, never a value. This is the
// rule that earns everything else: it is why one brand kit carries many blocks,
// why blocks from different sources sit on a page without collapsing into
// noise, and why a seeded block looks like the shop that loaded it. Break it and
// the library becomes a set of unrelated pictures.

/**
 * One colour in a shop's palette.
 *
 * A palette is a **definition, not a usage map** — the same thing a printed
 * brand guideline is. It says "these are our colours"; it does not say the
 * second one is for headers. Where a colour lands is decided by the block that
 * references it, and the same colour is a hero ground in one block and a price
 * chip in another.
 *
 * `name` is the shop's own word for it — "Ramadan gold", not "accent". `id` is
 * what a block stores, so renaming a colour never breaks a block.
 */
export interface BrandColor {
  id: string
  name: string
  hex: string
}

/**
 * A slot a block can reference without knowing a particular shop's palette.
 *
 * These are **binding points, not prescriptions**. A seeded block has to name a
 * colour before it has ever met a shop, so it names a slot; the kit says which
 * palette entry each slot resolves to. A shop's fourth and fifth colours have no
 * slot and do not need one — a block the owner authors references them by id.
 *
 * `surface`, `ink` and `inkMuted` are page mechanics rather than brand colours:
 * something has to be the ground and something has to be readable on it.
 */
export type TokenRef = 'primary' | 'secondary' | 'accent' | 'surface' | 'ink' | 'inkMuted'

/**
 * A face slot in the brand kit. A level binds to one of these; the kit says
 * which actual family each resolves to.
 *
 * `headline` exists because it was missing and the omission was load-bearing.
 * With three slots named after parts of an offer card, h1 and h3 both resolved
 * to `display` — a hero band could be larger than a product name but never a
 * different voice, and "RAMADAN KAREEM" across a cover is not the typeface a
 * product name is set in. The slots are named for what they *do* on a page, not
 * for where they sit on a card.
 *
 * Four, not eight: a level *binds* to a slot and any level may be re-bound, so
 * the ceiling on expression is the binding, not the count. Four is what the
 * picker asks for by default.
 */
export type TypeFamily = 'headline' | 'display' | 'price' | 'body'

/**
 * A named step on the brand kit's type scale. What an owner picks when they drop
 * a text element onto a block.
 *
 * Numbered rather than semantic, and that turns out to matter beyond naming:
 * E6 §4's fit ladder says an overlong string should "drop to the next type step,
 * bounded by the design system's scale, never an arbitrary size". With four
 * semantic roles there is no next step to drop to. With an ordered scale there
 * is, and the ladder becomes well defined — h2 falls to h3, and stops at the
 * floor the block declares.
 *
 * A level is not tied to a block kind. h1 in a hero band and h1 in a cover
 * masthead are the same level resolving against different block sizes — the
 * scale is a property of the brand, never of the card.
 *
 * There is no price level, deliberately. A price is not text; see `priceMark`
 * in `BlockElement`.
 */
export type TypeLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption'

export const TYPE_LEVELS: readonly TypeLevel[] = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'body',
  'caption',
]

/**
 * A named text style, the way a brand guideline states one: "Product name",
 * "Price", "Headline". The typography half of what `BrandColor` is for colour.
 *
 * Open-ended and named by the shop, for the same reason the palette is. A fixed
 * h1–h6 ladder both capped a brand at eight styles and named them after nothing
 * the owner recognises.
 *
 * `slot` is what a seeded block binds to, and is the only part of this the shop
 * does not invent — a block shipped before it ever met this shop has to name
 * something. A style the owner adds has no slot and needs none; a block they
 * author references it by `id`.
 */
export interface TextStyle {
  id: string
  name: string
  /** A family from the catalog. Not a stack — the catalog owns fallbacks. */
  family: string
  /** Multiplier on the scale's `base`. Never a pixel size. */
  size: number
  weight: number
  /**
   * Synthesised on most Arabic-capable families, which ship no true italic —
   * and Arabic has no italic convention to synthesise toward. Offered, warned
   * about, never blocked: it is the shop's brand.
   */
  italic: boolean
  /** A `BrandColor.id`. Null means the block's default ink. */
  colorId: string | null
  lineHeight: number
  letterSpacing?: number | undefined
  transform?: 'none' | 'uppercase' | undefined
  /** Which `TypeLevel` a seeded block reaches this style through, if any. */
  slot?: TypeLevel | undefined
}

export interface TypeStep {
  /** Which face slot this level draws from. Re-bindable per level. */
  family: TypeFamily
  /**
   * Multiplier on the scale's `base`. **Never a pixel size** — the same block
   * renders at 1080 square for a carousel post and at a third of an A4 column in
   * a booklet, and a px value would be right in exactly one of them.
   */
  size: number
  weight: number
  lineHeight: number
  letterSpacing?: number | undefined
  /** Casing is a type decision, not content. The catalog stores the real name. */
  transform?: 'none' | 'uppercase' | undefined
}

/**
 * The typography half of a brand kit: three families and an ordered scale.
 *
 * `base` is a fraction of the block's **geometric mean** — `sqrt(w × h)` — and
 * every level multiplies it, so the hierarchy inside a block holds at any size:
 * h1 is larger than h2 in a carousel post and in a booklet cell alike.
 *
 * The shorter edge was the obvious anchor and it is wrong. A footer band is
 * wide and short, so its shorter edge is tiny and every string in it collapsed
 * to a few pixels while the cards above it read correctly. The geometric mean
 * tracks the area a block actually has, which is what type should scale with.
 */
export interface TypeScale {
  families: Record<TypeFamily, string>
  /** Base size as a fraction of `sqrt(width × height)`. Levels multiply it. */
  base: number
  levels: Record<TypeLevel, TypeStep>
}

/** Logical, so an AR edition mirrors without a second layout. */
export type LogicalAlign = 'start' | 'center' | 'end'

/**
 * A colour on an artboard, and the one place this codebase lets a literal
 * colour through.
 *
 * **The rule changed, and it changed for a reason.** Everything a block
 * referenced used to be a `TokenRef` — a slot the shop's kit resolves — which is
 * what makes a *seeded* block look like whichever shop loaded it. That rule
 * still holds for seeded blocks and always will: a block shipped before it has
 * met a shop cannot name a colour that shop has not chosen.
 *
 * It does not hold for a block the shop authored. Their block has met them. A
 * designer that can only offer six slots is a designer an owner cannot express
 * a Ramadan gold in, and "pick from our six" is exactly the boxed-in feeling
 * that made owners ask for a real design tool rather than a form.
 *
 * So three sources, in order of how tied they are to the shop:
 *
 *   role     a binding slot — `primary`, `surface`, `ink`. What a seeded block
 *            uses, and the only kind it may use.
 *   palette  a `BrandColor.id` from the shop's own palette. Renaming or
 *            re-picking that colour updates every block that references it,
 *            which is the point of a palette.
 *   hex      a literal. The escape hatch, and it does not follow the brand.
 *
 * The zod mirror in the web app is what enforces "seeded blocks are roles
 * only"; the type cannot, because the same interface describes both.
 */
export type FlatColor =
  | { from: 'role'; ref: TokenRef }
  | { from: 'palette'; id: string }
  | { from: 'hex'; hex: string }

/**
 * One stop on a gradient. `at` is a fraction of the run, 0 to 1.
 *
 * **A stop names a colour the same three ways everything else does**, so a
 * gradient built from the shop's palette follows the shop when they re-pick
 * that colour — which is the whole reason `palette` exists as a source. It is
 * `FlatColor` rather than `ColorValue` because a stop of a gradient cannot
 * itself be a gradient, and saying so in the type is cheaper than a runtime
 * depth check.
 */
export interface GradientStop {
  at: number
  color: FlatColor
  /**
   * 0 to 1, opaque when omitted.
   *
   * **This is the one place alpha exists, and the six-digit hex rule still
   * stands everywhere else.** That rule's reason — alpha belongs to the
   * element's `opacity`, where it is one control an owner can find rather than
   * two that disagree — is true of a flat fill, where a colour at half alpha
   * and an element at half opacity are the same picture. It is false here: a
   * ground that fades *out* across the card is opaque at one end and gone at
   * the other, and no element-wide opacity can say that.
   *
   * A field rather than an eight-digit hex, because a stop names its colour the
   * same three ways everything else does. `#RRGGBBAA` would carry alpha only on
   * a literal, so "fade my brand's primary to nothing" — the thing owners
   * actually reach for — would be the one gradient the palette could not
   * express, and the escape hatch would become the only way to build a common
   * design. It maps to SVG's own `stop-opacity`.
   */
  opacity?: number | undefined
}

/**
 * A colour, or a run between several.
 *
 * **Gradients are a fourth source rather than a property of an element**, which
 * is what keeps them out of every renderer's element switch: a ground that is a
 * gradient is still a rectangle with a fill, and only the resolving of that
 * fill changed. `resolveColor` was the seam and stayed one.
 *
 * **`shape.fill` takes one, and text now takes an opaque one.** Strokes, chips
 * and the price mark are still `FlatColor`, for the reason this note has always
 * given: gradient hairlines are how a card stops being legible at the size a
 * booklet actually prints.
 *
 * **Text was refused on the same grounds and has been widened deliberately** —
 * it was asked for, as the face of a three-dimensional price, which is the one
 * place the legibility argument runs the other way: a run from a lighter to a
 * darker shade of one hue is *what makes* a big price read as solid, and it is
 * what every retail ticket already wears. The legibility risk is a
 * low-contrast run rather than a run as such, and it is the same risk an owner
 * already takes with a flat colour nobody can read. So text takes `TextFill`,
 * which is this type minus the alpha — see it for the measurement that made the
 * export path allow it and the one that keeps alpha out.
 *
 * **No seeded block may hold one.** `usesOnlyRoles` in the web app refuses a
 * gradient outright, so the shipped library stays flat; the design system's "no
 * gradients in chrome" is about our surfaces, and an owner's own card is not
 * one of ours.
 *
 * `angle` is degrees clockwise from a left-to-right run, so 0 runs along the
 * start-to-end axis and 90 runs top to bottom. It does **not** mirror in an
 * Arabic edition: an owner who angled a ground did so against the artwork they
 * were looking at, and flipping it would be the renderer overruling them.
 */
export type ColorValue =
  | FlatColor
  | { from: 'gradient'; angle: number; stops: GradientStop[] }

/** An outline. Width is a fraction of the block's geometric mean, never px. */
export interface Stroke {
  color: FlatColor
  width: number
}

/**
 * A cast shadow. E14 §2.4.
 *
 * **Paint, never layout.** It happens after the solver has finished, it does
 * not affect measurement, and it bleeds outside the element's box — which on a
 * grid means into the gutter, or over a neighbouring card. The block's own
 * boundary clips it; inside the block it is the author's problem.
 *
 * **One shadow per element, not a list.** Stacked shadows are a design-tool
 * feature with no retail case behind them, and a list can arrive later.
 *
 * `x`, `y` and `blur` are fractions of the block's geometric mean, the same
 * unit `Stroke.width` and `text.size` use, so a shadow means the same thing on
 * a 1080px post and in an A4 column. (E14 §2.2 puts these in *design units*
 * once frames land and a block stops being normalized; that is the same
 * decision one coordinate system later, and the converter's problem.)
 *
 * `blur: 0` is a hard shadow, and it is the same code path with one ring.
 *
 * **There is no alpha here.** `FlatColor` carries none, and `opacity` on the
 * element is the wrong control because it fades the element along with its
 * shadow. `SHADOW_PEAK` in the engine stands in until somebody decides whether
 * a shop may set it.
 *
 * **How it is drawn is not stored.** A soft shadow is n concentric copies of
 * the shape at a constant alpha, and n is derived at paint from the blur and
 * the output scale — about 16 on screen and about 48 at 300 dpi. Every filter
 * Chromium offers instead rasterizes at a resolution nothing in the document
 * can set, and `filter: drop-shadow()` over text takes the font out of the PDF
 * entirely. `shadowRings` in `@souqstudio/engine` is the expansion and
 * `harness/export-check.ts` is the measurement.
 */
export interface Shadow {
  x: number
  y: number
  /** 0 is a hard shadow. */
  blur: number
  color: FlatColor
  /**
   * How dark the shadow reaches at its centre, 0–1. Absent is `SHADOW_PEAK`.
   *
   * **It was a gap rather than a decision**, and `ShadowControl` said so: the
   * rings accumulate to a constant the engine picked, so the only way to soften
   * a shadow was to lighten its colour — which is the move that produces a pale
   * *glow* instead of a shadow, because a light shadow on a light ground reads
   * as light coming out of the shape rather than falling behind it.
   *
   * `FlatColor` carries no alpha and the element's own `opacity` is the wrong
   * control, since it fades the element along with its shadow. So it lives
   * here, and `shadowRings` already took a `peak` for it.
   */
  opacity?: number | undefined
}

/**
 * A shadow with no blur — the only kind text may carry, and it is measured.
 *
 * **A glyph has no box to expand.** A shape's ring is one path; text's ring is
 * the string again under a wider stroke, and Chromium outlines stroked text
 * into explicit path geometry on the way to a PDF. That is roughly 24 kB a
 * ring, for one element: a soft shadow on a single price came to 663 kB and
 * 26,385 curve operators, where twenty-four ringed *bursts* together came to
 * 274 kB.
 *
 * So a price wears a hard shadow — which is what a retail "SAVE 20%" actually
 * wears — and a soft one is not available on text at any price. The
 * alternative, `filter: drop-shadow()`, is the one disqualifying result in
 * `harness/export-check.ts`: the font leaves the PDF and the price becomes a
 * picture.
 */
export type HardShadow = Shadow & { blur: 0 }

/**
 * What the face of a glyph is filled with: a flat colour, or an opaque gradient.
 *
 * **The alpha ban survives exactly where its reasoning does.** A gradient
 * carrying alpha stops makes Chromium emit a page-sized soft mask to carry the
 * alpha, at a resolution nothing in the document can set — `export-check.ts`
 * bans it and E14 §0.3 measured the mask at 54 dpi. An *opaque* gradient had
 * never been tested, and it behaves nothing like that: a PDF shading pattern,
 * no mask, no raster, and the price is still real text. 5.1 kB against 4.7 kB
 * flat, for one price.
 *
 * So a stop here carries `at` and `color`, and no `opacity`. The engine's schema
 * refuses one rather than stripping it, because a gradient that silently loses a
 * stop's alpha is a document that renders differently from the one somebody
 * built.
 */
export type TextFill =
  | FlatColor
  | { from: 'gradient'; angle: number; stops: { at: number; color: FlatColor }[] }

/**
 * An extrusion: the glyphs repeated behind themselves, making a solid side.
 *
 * **Copies of the string, which is the only reason it is affordable.** A ring on
 * text is the string again under a *stroke*, and Chromium outlines stroked text
 * into path geometry — which is why a soft text shadow costs 24 kB a ring and
 * `HardShadow` refuses one. An extrusion needs no stroke: each copy is another
 * text run, the font stays in the PDF, and a copy costs about a fifth of a
 * kilobyte. Measured through headless Chromium at 0/4/8/16 copies: 4.7, 5.6, 6.4
 * and 8.1 kB, every one vector and still text.
 *
 * **How many copies is decided at paint, never stored.** How many it takes to
 * read as solid depends on the output scale, exactly as a shadow's ring count
 * does, and a stored count is a document that looks right on screen and striped
 * at 300 dpi.
 *
 * **The offsets are bounded far tighter than a shadow's**, because an extrusion
 * hangs outside the element's box and nothing in the fit ladder knows that yet.
 *
 * **There is no bevel and there should not be one.** `feSpecularLighting` over
 * text rasterises the element and takes the font out of the PDF — zero
 * text-drawing operators, measured — which is the one disqualifying class of
 * result the export harness exists to catch.
 */
export interface Extrude {
  /** Fractions of the block's geometric mean, like every other offset here. */
  x: number
  y: number
  /** The side of the letters. Usually a darker cousin of the face. */
  color: FlatColor
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

/**
 * A rectangle inside a block, as fractions of block width and height — never
 * pixels. That is what lets one offer card render at 1080×1080 for a carousel
 * post and at a third of an A4 column in a booklet with no redesign.
 *
 * `start` rather than `left`: logical, so RTL mirrors for free.
 */
/**
 * A drawing the owner uploaded, as geometry and nothing else.
 *
 * **The file is not kept, and that is the security design rather than an
 * economy.** `lib/artwork.ts` rasterises uploaded SVG because an SVG served
 * from our own domain is script-bearing content. A *shape* does not need the
 * file served — it needs the outline — so the parser takes the path data and
 * discards the document. Nothing SVG reaches the bucket, nothing SVG is served,
 * and there is no sanitiser to keep current against the next `<foreignObject>`
 * trick, because there is no document left to sanitise. The fields below are
 * the entire surface: coordinates, and a transform made of numbers.
 *
 * **Inline on the element rather than an asset.** Geometry is a few hundred
 * bytes and it is what the element *is*, not something the element points at.
 * An asset row would buy a second fetch, a second failure mode and an orphan to
 * collect, for a payload smaller than the id naming it.
 *
 * The owner's own fill is thrown away on the way in. `fill` on the element is
 * what colours this, which is the whole reason an upload becomes a shape rather
 * than a picture: a drawing that arrives white stays white forever, and a shape
 * follows the shop.
 */
export interface ShapeArt {
  /** The source viewBox, so the outline can be scaled into whatever box the owner drags. */
  width: number
  height: number
  /**
   * The outlines, in the source's own coordinates.
   *
   * A list rather than one concatenated `d`, because a `transform` belongs to
   * the element that carried it and concatenating two paths under different
   * transforms draws neither. It is also the seam a per-outline fill would use
   * if "recolour each part separately" is ever built; today every outline takes
   * the element's one fill.
   */
  paths: {
    d: string
    /**
     * The source's own transform, with every ancestor's composed in front of
     * it. Kept verbatim rather than applied, because applying one means
     * rewriting every coordinate of every command including arcs — a second
     * path implementation, to avoid carrying a string of numbers.
     */
    transform?: string | undefined
    /** The source's `fill-rule`. Absent is SVG's own default, which is non-zero. */
    evenOdd?: boolean | undefined
  }[]
}

export interface Box {
  start: number
  top: number
  width: number
  height: number
}

/**
 * Where an image element's picture comes from.
 *
 * **`brand.logo` is here rather than being its own element kind**, and folding
 * it in is E14 §3.1. `{ kind: 'logo' }` carried no source and no options: it
 * drew *the* logo, so it could not be cropped, could not take a stroke or a
 * radius, could not be the child a frame hugs, and every property ever added to
 * images had to be added to it separately or silently not exist. A logo is a
 * picture. Making it a kind of its own was the price mark's mistake, one size
 * down.
 *
 * **There is one identity source and the owner does not pick between two**
 * — §3.2. `brand` means *the identity this book should carry*, resolved through
 * `brandOverride` exactly as the artboard's colours already are. A group footer
 * that must always show the parent mark says so with an identity pin on the
 * block, not by binding to a second source that half its branches would get
 * wrong.
 */
import type { ShadowPreset } from './shadow-presets'

export type ImageSource =
  | { from: 'product' }
  | {
      from: 'asset'
      assetId: string
      /**
       * Where a blurred upload came from — authoring provenance, never paint.
       * `assetId` is always the picture as drawn; `from` is the unblurred
       * original the designer re-renders from, and `radius` is a fraction of
       * the image's shorter edge. Absent means the picture is the original.
       *
       * **Only an upload can carry it.** A product image comes from the catalog
       * at render time and a logo belongs to whichever shop draws the block;
       * neither is a single file that could have been blurred in advance.
       */
      blur?: { from: string; radius: number } | undefined
    }
  | { from: 'brand'; field: 'logo' }

/**
 * Where a text element's content comes from.
 *
 * Owners never type a product name onto a page. Product text is bound, always —
 * a typed-in name cannot reflow, cannot translate, and is wrong the moment the
 * catalog corrects itself. `static` exists for headlines and legal lines, not
 * for data that lives in the catalog.
 */
export type TextSource =
  | { from: 'product'; field: 'name' | 'spec' | 'brand' | 'origin' | 'packSize' }
  | { from: 'shop'; field: 'name' | 'phone' | 'address' }
  /**
   * The offer's own words, as opposed to the product's.
   *
   * **This is what lets a badge be anything.** The tier — "Save 20%" — used to
   * exist only inside the `chip` element, which draws its own background, so an
   * owner who uploaded their own badge artwork could put nothing live on it: a
   * static line would say the same thing on every product in the book and go
   * stale the week the offer changed.
   *
   * As a text binding it is an ordinary element. It sits on uploaded artwork, on
   * a burst, on nothing at all; it takes the type scale, the fit ladder, a
   * colour and an alignment like every other line. `chip` stays as the
   * convenient prebuilt badge rather than as the only way to say the tier.
   *
   * A separate source from `product` because it is a fact about the *offer* — a
   * product has no tier until it is put in a book at one — and the vocabulary
   * should not blur that.
   */
  | {
      from: 'offer'
      /**
       * **The parts of the price that are not the price.**
       *
       * `tier` came first and made the argument: a badge is an ordinary line of
       * text, and welding it inside `chip` meant an owner with their own artwork
       * could put nothing live on it. The currency, the was-price and the
       * FROM/EACH line were in exactly that position inside `priceMark` — an
       * owner could move them around a compass and nothing more.
       *
       * **What is deliberately absent is the price itself, and the fils.** The
       * fraction is positioned *against the digits*: it is the one part whose
       * place depends on how many of them there are, and a block is drawn once
       * per offer. Pin it to a fraction of the block and it is correct for the
       * price it was designed against, overlapping a longer one and adrift from
       * a shorter one. Everything here is a short run that sits beside the
       * number rather than inside it, which is why it can leave and the fils
       * cannot.
       *
       * `priceMark` stays, and stays able to draw all of these itself. The same
       * bargain `chip` struck: the prebuilt assembly is the default, and it can
       * stand aside. `recipe.currency.place: 'hidden'` and the satellites'
       * `'hidden'` are how it stands aside, so nothing is ever drawn twice.
       */
      field:
        | 'tier'
        | 'currency'
        | 'compare'
        | 'prefix'
        | 'unitPrice'
        /**
         * The number itself, and it is here because a frame can hold it.
         *
         * The note above says what is "deliberately absent", and that argument
         * was about *placement*: pinned to a fraction of the block, a price is
         * correct only for the price it was designed against. A frame removes
         * the premise — a hugging row measures the digits and grows — so the
         * price becomes an ordinary bound line and `priceMark` stops being the
         * only way to draw one. E14 §4.
         *
         * **The fils still cannot leave.** It is positioned against the glyphs,
         * on the major's cap line, which is kerning rather than layout. It is a
         * formatting option on this text, in the same class as bold, and never
         * a second element.
         */
        | 'price'
        /**
         * What the shop saved, as words — `4.50` and `20%`.
         *
         * **This is what makes conditional content work without a predicate in
         * the engine.** "SAVE 20%" is not a rule a block evaluates; it is a
         * field the composer resolves, empty when there is no was-price, and
         * collapsed by the frame that holds it. E14 §3.3 and §3.7.
         */
        | 'saveAmount'
        | 'savePercent'
    }
  /**
   * The identity this book carries — §3.2, and the *only* identity entry.
   *
   * Resolved through `readEffectiveBrand` and `brandOverride`, so a shop that
   * inherits its organization's mark gets the organization's name here without
   * anyone choosing. `organization` is deliberately not a parallel source: an
   * owner designing a header must not be asked to pick between two names,
   * because whichever they pick is wrong for half their branches.
   */
  | { from: 'brand'; field: 'name' }
  /**
   * Facts about the book rather than about what is in it.
   *
   * **The dates are strings, resolved by the composer**, never dates the engine
   * formats — the same rule `comparePrice` already follows. A flyer header
   * almost always reads "Offers valid 1–7 October", and `OfferBook.expiresAt`
   * is when the *share link* stops working, which is a different fact that
   * would print a wrong date if borrowed.
   */
  | { from: 'book'; field: 'title' | 'validFrom' | 'validTo' }
  | { from: 'static'; textEn: string; textAr: string }

/**
 * What an overlong string is allowed to suffer.
 *
 * **Declared, not discovered.** The design system makes this a first-class
 * control in the designer's properties panel for one reason: it is the setting
 * that decides whether a block survives contact with the catalog, and a shop
 * that finds out by looking at a printed flyer has found out too late. The fit
 * ladder still runs — this says where it is allowed to stop.
 *
 *   shrink    fall down the scale to `floor`, then escalate. The default for a
 *             product name, which is never cut and never shrunk to illegibility.
 *   clamp     wrap to at most `lines`, then truncate the last one.
 *   truncate  one line, cut with an ellipsis.
 *
 * Omitting it keeps `fitPolicy`'s answer for the source, which is what every
 * seeded block relies on. A price mark has no entry here at all: it is not text
 * and it fits on both axes by construction.
 */
export type TextOverflow =
  | { mode: 'shrink'; floor: TypeLevel }
  | { mode: 'clamp'; lines: number }
  | { mode: 'truncate' }

/**
 * `priceMark` is one element the owner drags, places and sizes — and now one
 * they arrange, though never one they assemble.
 *
 * The was-price, the offer price and the currency stay inside it together,
 * because the fit ladder has to shrink them as one thing and `compact.ts` has to
 * see one participant in the card's vertical flow. What they are *not* is welded
 * into a single arrangement: `PriceMarkStyle.preset` and `.recipe` decide where
 * each part sits, out of a fixed vocabulary of parts and positions.
 *
 * The anatomy is still ours — cap-aligned minors, the three-decimal branch,
 * LTR-in-Arabic, the attached tab, the ratio ceilings — and it is enforced by
 * `layoutPriceMark` rather than by refusing the owner a control. E6 §3 as
 * amended; see `PriceMarkStyle`.
 */
/**
 * What every element carries, whatever it draws.
 *
 * `id` is stable for the life of the element and is what multi-select, grouping
 * and z-order operate on. It was an index until owners could select more than
 * one thing at a time, at which point an index stops identifying anything: two
 * elements swap places and every selection, group and override points at the
 * wrong one.
 *
 * `rotation` and `opacity` are here rather than per kind because an owner does
 * not think of them as belonging to a rectangle — they belong to *the thing*,
 * and a control that appears for a shape and vanishes for a photo reads as a
 * bug.
 */
export interface ElementBase {
  id: string
  box: Box
  /** Degrees, clockwise, about the element's own centre. */
  rotation?: number | undefined
  /** 0..1. */
  opacity?: number | undefined
  /**
   * Elements dragged, aligned and moved together. A flat id rather than a tree:
   * a group in an offer card is "these four move as one", never a nested
   * coordinate space, and a tree would make every rectangle depend on its
   * ancestors' transforms for no expressive gain.
   */
  groupId?: string | undefined
  /** Kept out of the way of a stray click. Still exports. */
  locked?: boolean | undefined
}

export type BlockElement =
  | (ElementBase & {
      kind: 'image'
      source: ImageSource
      /** `contain` letterboxes, `cover` crops. A packshot is `contain`; a
       *  background photograph is `cover`. */
      fit?: 'contain' | 'cover' | undefined
      radius?: number | undefined
      stroke?: Stroke | undefined
      shadow?: Shadow | undefined
      /**
       * A shadow traced from the picture's own alpha instead of grown from its
       * box, rendered ahead of time and stored. E14 §2.4.
       *
       * `shadow` above is vector rings around the element's *rectangle*, which
       * is right for a shape and wrong for a cutout — a bottle casts a rounded
       * rect. Tracing needs pixels, so this names a preset whose rendition
       * lives at `shadowKey(r2Key, preset)`. Product images only; when both are
       * set the preset wins and no rings are drawn.
       */
      shadowPreset?: ShadowPreset | undefined
    })
  | (ElementBase & {
      kind: 'text'
      source: TextSource
      /**
       * The step on the brand's scale this text starts from — and the ladder
       * it steps down. Still required, because a block that names no level has
       * nothing to fall back to when the string is long.
       */
      level: TypeLevel
      align: LogicalAlign
      /** Declared rather than discovered. Omitted means the source's default. */
      overflow?: TextOverflow | undefined
      /**
       * A size the owner set by hand, as a fraction of the block's geometric
       * mean — the same unit `TypeScale.base` uses, so it means the same thing
       * at 1080 square and in an A4 column.
       *
       * **Set it and the level stops deciding the size**, though it still
       * decides where the fit ladder stops. "Snap to the brand scale" is the
       * default rather than the law: an owner sizing a headline by eye against
       * their own artwork is doing design, not breaking a system.
       */
      size?: number | undefined
      weight?: number | undefined
      italic?: boolean | undefined
      letterSpacing?: number | undefined
      transform?: 'none' | 'uppercase' | undefined
      /**
       * A rule through the text. Absent is plain.
       *
       * **A formatting option, in the same class as `italic` and `transform`,
       * and deliberately not clever.** It exists because the was-price can now
       * be its own layer, and inside `priceMark` the strike was drawn by a
       * painter that knew which piece it was holding. The obvious next move was
       * to have the layer strike itself when bound to the was-price — which was
       * built, and was wrong: it decided a design question the owner is looking
       * straight at on the canvas, and gave them no control to reverse it.
       *
       * So it is a button, like bold. A layer is struck because somebody struck
       * it.
       */
      decoration?: 'none' | 'line-through' | undefined
      /** Overrides the face the level binds to. */
      family?: TypeFamily | undefined
      /**
       * Overrides the automatic ink — a flat colour, or an opaque gradient down
       * the glyphs, which is the cheapest three-dimensional cue there is and
       * what a retail price ticket already wears. `TextFill` carries the
       * measurement that made the gradient admissible.
       */
      color?: TextFill | undefined
      /**
       * An outline on the glyphs. E14 §2.4.
       *
       * **Retail typography, not decoration.** "SAVE 20%" in white with a red
       * outline, or price digits outlined over a photograph, is how a flyer is
       * set — and neither could be drawn at any setting, because a stroke lived
       * only on shapes and images.
       *
       * **`width` is the outline you see**, and the painter is what makes that
       * true. SVG centres a stroke on the path, so half of it falls *inside*
       * the glyph and is painted over by the fill; the renderer therefore
       * doubles this and orders the paint `stroke fill`. Without that ordering
       * the stroke eats the counters and the digits come out thin and muddy at
       * exactly the size a price is read — a defect that is invisible until it
       * is wrong, at which point it reads as "the bold prices look thin in the
       * PDF".
       *
       * Same unit as every other size here: a fraction of the block's
       * geometric mean.
       */
      stroke?: Stroke | undefined
      /** Hard only, and `HardShadow` says why. */
      shadow?: HardShadow | undefined
      /** The side of the letters, drawn behind the face. `Extrude` says why it
       *  is copies rather than a filter, and what a filter would cost. */
      extrude?: Extrude | undefined
    })
  | (ElementBase & { kind: 'priceMark'; style?: PriceMarkStyle | undefined })
  | (ElementBase & {
      kind: 'chip'
      anchor: ChipAnchorRef
      fill?: FlatColor | undefined
      /**
       * The badge's outline. A pill unless it says otherwise.
       *
       * **Four of the nine shapes, because a badge holds a word.** A corner
       * flash has no interior, an arrow's is a shaft, and a star's usable area
       * is a third of its box. `CHIP_FIT` in the engine carries how much of each
       * one the label may use.
       *
       * **`none` is the fifth option and draws no badge**, leaving the tier as
       * words on the card — the same choice the price mark has had since E6,
       * where `frame: 'plain'` drops the ground and leaves the digits alone. An
       * owner who has drawn their own ground does not want ours on top of it.
       */
      shape?: 'none' | 'pill' | 'burst' | 'ribbon' | 'tag' | undefined
      /**
       * The label's colour. Worked out from the badge when omitted.
       *
       * **The badge used to draw its label in the surface colour, always.** That
       * is right for a saturated tier tint and wrong the moment an owner picks a
       * pale one — white on pale sand is a badge with nothing written on it, and
       * nothing anywhere said so. A text element has had both halves of this
       * since E6: an override, and a rule for when there is none.
       */
      ink?: FlatColor | undefined
    })
  | (ElementBase & { kind: 'logo' })
  | (ElementBase & {
      kind: 'shape'
      /**
       * Absent draws no fill, and the stroke is what draws. E14 §2.4.
       *
       * **It was required, so an outline-only shape could not be expressed at
       * any setting** — and a hairline rule box around a price is the commonest
       * piece of furniture on a printed ticket. It had to be faked with one
       * filled rectangle sitting on another.
       *
       * `opacity` is not the answer to this: it fades the stroke along with the
       * fill, so a "transparent" box loses its own outline.
       */
      fill?: ColorValue | undefined
      /**
       * Rectangle unless it says otherwise. A line draws its stroke only.
       *
       * **The first three are primitives and the rest are offer furniture.** A
       * rectangle, an ellipse and a line are drawn as their own SVG elements —
       * turning a rectangle into a path would lose `radius` for nothing. The six
       * after them are paths computed by `shapePath` in the engine, because a
       * burst drawn by the screen and a burst drawn by the export worker have to
       * be the same burst.
       */
      /**
       * The uploaded outline, present exactly when `variant` is `art`.
       *
       * **A shape rather than an image, which is the entire point.** The same
       * drawing uploaded through `Upload artwork` is rasterised to a PNG and
       * lands as a picture with a frozen colour; here it keeps its geometry and
       * takes `fill`, `stroke`, `shadow` and the rest of the shape vocabulary.
       */
      art?: ShapeArt | undefined
      variant?:
        | 'rect'
        | 'ellipse'
        | 'line'
        | 'burst'
        | 'ribbon'
        | 'tag'
        | 'flash'
        | 'star'
        | 'arrow'
        | 'polygon'
        | 'arch'
        | 'wave'
        | 'bubble'
        // **Not a shape anybody picks from the grid** — it is the one that
        // arrives with its own outline, and `art` is where that outline is.
        // A document naming it without one draws nothing, which is why the
        // schema refuses the pair separately.
        | 'art'
        | undefined
      /**
       * How many sides a `polygon` has. Ignored by every other variant.
       *
       * **One control instead of eight shapes.** A triangle, a pentagon and a
       * hexagon are the same construction with a different count, and shipping
       * them as separate variants would be eight more pictures in the shape
       * picker for one idea — and still no heptagon for the owner who wanted
       * one. Three is the floor because two sides is a line, and twelve is the
       * ceiling because above it a polygon is a circle drawn expensively: the
       * ellipse is one element and this would be twenty-six path points.
       *
       * Absent is a hexagon, which is the one most people picture when they are
       * shown this control and the one that survives being small.
       */
      sides?: number | undefined
      /**
       * How deep an `arch`'s or a `wave`'s curve runs, as a fraction of the
       * element's height. Negative turns it inside out — an arch that bulges
       * becomes one that dips. Ignored by every other variant.
       *
       * **A fraction rather than a length, like every other geometry here.**
       * The same design is a third of an A4 column and 1080 square in a
       * carousel post, and a curve set in artboard units would be a gentle
       * sweep in one and a fold in the other.
       */
      curve?: number | undefined
      /** How many full waves a `wave` runs along its edge. */
      waves?: number | undefined
      /**
       * Where a `bubble`'s tail sits along its edge, as a fraction from the
       * **reading** start — so it mirrors in an Arabic edition, because a
       * bubble points at whoever is speaking and that person has moved.
       */
      tail?: number | undefined
      radius: number
      stroke?: Stroke | undefined
      shadow?: Shadow | undefined
    })

// ─── The price mark's interior ────────────────────────────────────────────────
//
// **Consistency comes from bounded ratios and enforced relations, never from a
// single frozen arrangement.** That sentence is the whole of what changed here,
// and it is worth stating before the types because the types are unreadable
// without it.
//
// E6 §3 refused to let owners assemble a price from text layers, and it was
// right: a price built from free boxes loses cap alignment, loses the
// three-decimal branch, loses LTR-in-Arabic and cannot shrink as one thing when
// the string is long. But that argument only ever defended the *anatomy*. It was
// being used to defend the *arrangement* too — where the currency sits, where
// the was-price sits, where the tab attaches, how the cluster aligns in its box
// — and the arrangement is design, not craft.
//
// The evidence that the lock was too tight is in this repository. Forty of the
// hundred shipped arrangements switched the ground off and hand-placed a disc
// behind the digits. `currencyPlacement` has been on `PriceMark` since E6,
// written by every producer and read by nothing. Six of the eight grounds had no
// control in the designer. And `TextSource` gave the tier badge an escape hatch
// — `{ from: 'offer', field: 'tier' }` — while the price got none at all, so an
// owner who wanted a different treatment had nowhere to go.
//
// So the mark stays **one element, one box, one drag handle** — it has to, for
// the fit ladder to shrink it as a unit and for `compact.ts` to keep treating it
// as a single flow participant. What opens is its interior, and it opens into a
// *fixed vocabulary*: seven named parts, a compass, a bounded scale. An owner
// cannot add a part, cannot type into one, and cannot set a pixel.

/**
 * Where the currency code sits relative to the digits.
 *
 * `before` is what every mark has drawn since E6 and stays the default.
 *
 * The other five are not decoration. `super-after` is how a Gulf shelf ticket
 * sets a riyal; `above` is the hypermarket stack; `after` is the e-commerce
 * convention. Each is a real retail idiom the product could not express.
 *
 * **`hidden` is what lets the currency leave.** A shop that wants the code set
 * as its own layer — its own size, its own colour, its own place on the card,
 * grouped with whatever else it likes — binds a text element to
 * `{ from: 'offer', field: 'currency' }` and switches this off. Without it the
 * code would be drawn twice, which is the same bargain `chip` and the `tier`
 * text binding already strike: the prebuilt assembly stays, and it can stand
 * aside for an owner who would rather place the part themselves.
 */
export type MarkCurrencyPlace =
  | 'hidden'
  | 'before'
  | 'after'
  | 'super-before'
  | 'super-after'
  | 'above'
  | 'below'

/**
 * How the fils attach to the major.
 *
 * **`raised` is the default and the cap alignment stays computed.** That is the
 * distinction this whole model rests on: the owner chooses the *treatment*, and
 * never the offset. A raised minor whose cap top does not meet the major's is
 * not a design choice, it is a defect, and no recipe can ask for one.
 *
 * `baseline` sets the fils on the major's baseline with a decimal separator —
 * what an electronics price does.
 *
 * **`hidden` drops the fils only when there are none to drop.** "AED 25" on a
 * card whose every price ends in a double zero is a design, and ".00" there is
 * noise with a decimal point in it. What it must never mean is "AED 12" for a
 * price of 12.75 — that is not a quieter price, it is a lower one, printed on a
 * flyer a customer takes to a till. So the recipe says what to do with zero
 * fils and the *price* decides whether it applies; a non-zero minor falls back
 * to `raised`. A shop that wants every price rounded is asking for a pricing
 * change, and that belongs on the offer rather than in a layout.
 */
export type MarkMinorTreatment = 'raised' | 'baseline' | 'hidden'

/**
 * Where a satellite sits relative to the amount cluster.
 *
 * A compass rather than coordinates, and that is the bound: nine positions an
 * owner picks between, not two numbers they tune until the card looks wrong at
 * the next aspect. `hidden` is a position too — an owner who has drawn their own
 * was-price treatment elsewhere on the card wants this one gone.
 */
export type MarkPlace =
  | 'above-start'
  | 'above'
  | 'above-end'
  | 'start'
  | 'end'
  | 'below-start'
  | 'below'
  | 'below-end'
  | 'hidden'

/**
 * One part orbiting the amount: the was-price, the FROM/EACH line, the tier tab.
 *
 * `scale` is a fraction of the major's size and is **clamped by the engine**, not
 * by the control that sets it. `MARK_SATELLITE_SCALE` is the range, and its
 * ceiling is the thing that actually prevents "hundreds of inconsistent price
 * treatments": no part may approach the major, so the hierarchy
 * major > minor > currency > satellite cannot invert however the recipe is
 * assembled.
 */
export interface MarkSatellite {
  place?: MarkPlace | undefined
  /** Fraction of the major's size. Clamped to `MARK_SATELLITE_SCALE`. */
  scale?: number | undefined
  /**
   * A nudge off the compass point, along the inline axis, as a fraction of the
   * major's size. Clamped to `MARK_NUDGE`.
   *
   * **The compass decides the band and the nudge decides the position in it.**
   * Nine positions turned out to be enough to say *which corner* and not enough
   * to say *how far in* — the gap an owner hits the moment their ground is a
   * burst rather than a box, because the point that reads as "above-end" on a
   * rectangle is a spike on a circle.
   *
   * **Bounded rather than free, and this is the bound that matters.** The piece
   * still belongs to the band the compass put it in: `layoutPriceMark` reserves
   * that band whether or not anything fills it, which is what stops the price
   * changing size between two neighbouring cards on one page. A nudge moves the
   * piece inside the room already reserved for it. An unbounded offset would
   * move it into another band's room, and the first page where one offer
   * carries a was-price and its neighbour does not is where that shows.
   *
   * Positive is toward the inline end — which does not mirror, because the mark
   * does not mirror. A nudge authored against an English edition sits in the
   * same place in an Arabic one.
   */
  dx?: number | undefined
  /** The same, along the block axis. Positive is downward. */
  dy?: number | undefined
}

/**
 * The interior arrangement of a price mark.
 *
 * **Bands are reserved by the recipe, not by the content**, and that is not an
 * implementation shortcut — it is the rule that keeps a page coherent. A row of
 * cards where some offers carry a was-price and some do not must set every price
 * at the same size; reserving the band only when something fills it makes the
 * price jump between neighbouring cards, which is exactly the inconsistency the
 * component exists to prevent. `layoutPriceMark` asserts it.
 */
/**
 * The currency code, as a part rather than only a position.
 *
 * **Placement was the only thing about it an owner could change**, and it was
 * the least of what they asked for. Its size was `CURRENCY_RATIO`, its gap to
 * the digits was `GAP_RATIO`, and how it sat against them was implied by whether
 * the place had `super-` in front of it — three constants in the engine, none of
 * them reachable, and no way at all to centre a code against the number it
 * belongs to.
 *
 * Every field is optional and every one defaults to the constant it replaced, so
 * a recipe that names only a place lays out exactly as it did.
 */
export interface MarkCurrency {
  place?: MarkCurrencyPlace | undefined
  /** Fraction of the major's size. Clamped to `MARK_CURRENCY_SCALE`. */
  scale?: number | undefined
  /**
   * Air between the code and the nearest digit, as a fraction of the major's
   * size. Clamped to `MARK_CURRENCY_GAP`, whose floor is zero — a code set
   * tight against the digits is a real treatment, and the pair are different
   * sizes and usually different colours, so they do not read as one word.
   *
   * Ignored when the code has its own line: `above` and `below` are separated
   * by the strip they sit in, not by this.
   */
  gap?: number | undefined
  /**
   * How the code sits against the digits, on the block axis.
   *
   * **The thing `super-` was standing in for, said properly.** That prefix
   * meant "ride the cap line" and nothing else — the size was the same either
   * way — so the vocabulary had two of the three alignments a shop actually
   * wants and no name for either of them. `middle` is the one that was missing
   * altogether, and it is the commonest treatment on a Gulf shelf ticket after
   * the raised one.
   *
   * Absent means what the place implies, so nothing already drawn moves:
   * `super-before` and `super-after` are `top`, everything else is `baseline`.
   */
  align?: 'top' | 'middle' | 'baseline' | undefined
}

export interface PriceMarkRecipe {
  /**
   * The currency code. A bare `MarkCurrencyPlace` is still accepted and means
   * that placement with every other field defaulted — organization blocks carry
   * documents written that way and this object is strict.
   */
  currency?: MarkCurrencyPlace | MarkCurrency | undefined
  minor?: MarkMinorTreatment | undefined
  /** Fraction of the major's size. Clamped to `MARK_MINOR_SCALE`. */
  minorScale?: number | undefined
  /** The struck-through was-price. */
  compare?: MarkSatellite | undefined
  /** FROM / EACH / PER KG. */
  prefix?: MarkSatellite | undefined
  /**
   * The tier tab.
   *
   * **It may go anywhere and it may never detach.** E6 §3's "tab and mark never
   * separate" survives as a *constraint the solver satisfies* rather than as a
   * fixed corner: wherever the tab is placed, its rect overlaps the mark's edge,
   * and `price-mark.test.ts` asserts that at every size for every place.
   */
  tier?: MarkSatellite | undefined
  /**
   * How the whole assembly sits in the element's box.
   *
   * Absent means centred, which is what every mark did before this existed —
   * and being unable to say otherwise is why a price could not be set flush to
   * the start of a wide band.
   */
  align?: { inline: LogicalAlign; block: 'top' | 'middle' | 'bottom' } | undefined
}

/**
 * A mark we drew, that an owner picks from a gallery.
 *
 * **Presets are the front door and the knobs are the back one.** The same
 * argument as `docs/composition-model.md` §3.6 makes for seeding sixty-five
 * blocks: a blank artboard produces something worse than our default and the
 * owner blames the product. Most owners will pick one of these and never open
 * `recipe` at all.
 *
 * `classic-tag` is the default and renders **identically** to every mark drawn
 * before recipes existed. That is asserted, not intended — see the byte-identity
 * test in `price-mark.test.ts`.
 */
/**
 * The tuple is the declaration and the union is derived from it, rather than the
 * other way round. That is what lets the document schema build its enum straight
 * from this list with no assertion — adding a preset is one edit, and the
 * validator cannot fall behind the type.
 */
export const PRICE_MARK_PRESETS = [
  'classic-tag',
  'shelf-ticket',
  'price-bomb',
  'was-now-stack',
  'super-riyal',
  'wide-band',
  'stacked-currency',
  'whole-number',
] as const

export type PriceMarkPreset = (typeof PRICE_MARK_PRESETS)[number]

/** The satellite size range, as a fraction of the major. The ceiling is what
 *  keeps the hierarchy from inverting; the floor is what keeps it legible. */
export const MARK_SATELLITE_SCALE = { min: 0.14, max: 0.5 } as const

/** The minor's size range, as a fraction of the major. One is a price set as a
 *  single number — "24.50" all one size — which is a real treatment, not a bug. */
export const MARK_MINOR_SCALE = { min: 0.3, max: 1 } as const

/**
 * The currency code's size range, as a fraction of the major.
 *
 * Wider than the satellite range at both ends and deliberately so. The floor is
 * lower because a code is two or three glyphs rather than a number to be read
 * off a shelf, and a shop setting a discreet riyal is doing something ordinary.
 * The ceiling is higher because the currency is *above* the satellites in the
 * hierarchy — `major > minor > currency > satellite` — and pinning it to the
 * same ceiling as the FROM line said the opposite. It stays below the major,
 * which is the part that matters.
 */
export const MARK_CURRENCY_SCALE = { min: 0.12, max: 0.6 } as const

/**
 * The gap between the code and the digits, as a fraction of the major.
 *
 * **The floor is zero, not the old constant.** `GAP_RATIO` existed because at
 * `0` a Latin code touches the first digit — but that was a statement about
 * `AED 24`, and a small riyal set tight against a large number is a treatment
 * every hypermarket in the Gulf prints. The two are different sizes and usually
 * different colours; they do not read as one word.
 */
export const MARK_CURRENCY_GAP = { min: 0, max: 0.6 } as const

/**
 * How far a part may be nudged off its compass point, as a fraction of the
 * major's size, on each axis.
 *
 * **Half the major, and the number is the whole argument.** A band is a fifth
 * of the digit box (`BAND` in the engine) and a side band a quarter of its
 * width, so half a major size is comfortably more than enough to cross the room
 * a band actually has — an owner can put a part anywhere within its band and
 * against either edge. What it will not do is carry a piece into the *next*
 * band, which is the reservation that keeps two neighbouring cards setting
 * their prices at the same size.
 *
 * Symmetric, so the clamp is one number rather than a range per axis.
 */
export const MARK_NUDGE = { min: -0.5, max: 0.5 } as const

/**
 * What an owner may change about a price mark.
 *
 * **The anatomy is ours and the arrangement is theirs.** That line replaces
 * "the price mark is not lego", which was doing the work of both and defending
 * only one. What stays internal, permanently, and is enforced by
 * `layoutPriceMark` rather than by the absence of a control:
 *
 *   - the raised minor's cap alignment, whenever `raised` is chosen
 *   - tabular figures, and the three-decimal KWD/OMR/BHD branch
 *   - LTR cluster order with Western numerals, in an Arabic edition too
 *   - the tab overlapping the mark, wherever it is placed
 *   - the ratio ceilings, so no part may approach the major
 *   - fitting on both axes; the price never truncates (E6 §4)
 *
 * What is the shop's: colour, ground, outline, and now the interior arrangement
 * — `preset` and `recipe` below.
 */
export interface PriceMarkStyle {
  /**
   * The tier tab and the outline. Defaults to the tier's own colour.
   *
   * One of the three broad slots the mark shipped with. They are still the
   * controls most owners touch, and every narrow slot below falls back to one
   * of them — see the note on `majorInk`.
   */
  tint?: FlatColor | undefined
  /** The digits. */
  ink?: FlatColor | undefined
  /** The ground the mark sits on. */
  surface?: FlatColor | undefined

  // ── The parts, coloured one at a time ───────────────────────────────────────
  //
  // **Three slots were painting seven parts, and three of those seven had no
  // control at all.** `tint`, `ink` and `surface` covered the badge, the digits
  // and the ground; the currency code, the was-price and the FROM line were
  // welded to `--sq-ui-ink-muted` in the painter, so a shop could not colour
  // them at any price, and the tab's *text* was welded to the ground colour,
  // which is how a tinted badge on a tinted ground produces a tab with nothing
  // legible on it.
  //
  // **Each of these falls back to what the painter already did**, which is why
  // adding them changes nothing already drawn: an absent slot resolves through
  // the broad one it used to read, and `price-mark.test.ts` pins that. A shop
  // that wants a red was-price sets one field; a shop that wants what it had
  // sets none.
  //
  // **This is arrangement, not anatomy.** E6 §3's rule is about how the number
  // is *set* — cap alignment, the three-decimal branch, LTR in Arabic, shrinking
  // as one thing. It was never about which colour the fils are, and using it to
  // withhold that was the panel borrowing an argument that did not cover it.

  /** The integer part. Falls back to `ink`. */
  majorInk?: FlatColor | undefined
  /**
   * The fils. Falls back to `ink`, which is what welded it to the major.
   *
   * Worth its own slot rather than following the major: setting the fils back a
   * step is one of the oldest tricks in shelf pricing, and it was unreachable.
   */
  minorInk?: FlatColor | undefined
  /** The currency code or symbol. Falls back to the muted ink the painter used. */
  currencyInk?: FlatColor | undefined
  /** The struck-through was-price. Falls back to the same muted ink. */
  compareInk?: FlatColor | undefined
  /** FROM / EACH / PER KG. Falls back to the same muted ink. */
  prefixInk?: FlatColor | undefined
  /** The ground's fill. Falls back to `surface`. */
  groundFill?: FlatColor | undefined
  /** The ground's outline. Falls back to `tint`, and so to the tier's colour. */
  groundStroke?: FlatColor | undefined
  /** The tier tab's fill. Falls back to `tint`, and so to the tier's colour. */
  tabFill?: FlatColor | undefined
  /**
   * The tier tab's label.
   *
   * Falls back to the resolved ground fill, which is what the painter did and
   * is right for a saturated tab on a pale ground — and invisible when both are
   * the same colour. That case is the reason this field exists; the default is
   * unchanged because changing it would redraw every block already published.
   */
  tabInk?: FlatColor | undefined
  /**
   * The shape behind the digits.
   *
   * **The mark was the one element denied the shape kit, and it was denied by
   * omission rather than by argument.** `shape` carries nine variants and a
   * badge may draw four of them; the price — the loudest thing on a retail card
   * and the element a flyer is actually built around — drew a rounded rectangle
   * or nothing. Forty of the hundred arrangements in the shipped library
   * answered that by switching the ground off and hand-placing a `disc` behind
   * the digits, which decouples the shape from what it contains: a longer price,
   * a three-decimal currency or a compare line relayouts the digits inside their
   * box while the hand-placed disc stays where it was put.
   *
   * Drawn by `layoutPriceMark` now, so it tracks its contents.
   *
   * `box` is the rounded rectangle and stays the default — nothing already
   * drawn changes. `none` is digits alone. The rest are the path shapes from
   * `shapes.ts`, the same ones a badge draws.
   *
   * **What this does *not* open is the anatomy.** The raised minor at the
   * major's cap height, the three-decimal branch, tabular figures, LTR in an
   * Arabic edition and the tier deriving from the offer are what make output
   * read as a real offer book, and E6 §3 is still right about them. The
   * rectangle behind the digits was never one of them.
   */
  ground?: 'none' | 'box' | 'burst' | 'ribbon' | 'tag' | 'flash' | 'star' | 'arrow' | undefined
  /**
   * The older spelling of the same idea, still read.
   *
   * `plain` is `ground: 'none'` and `tag` is `ground: 'box'` — note that `tag`
   * here meant the rounded rectangle, while `ground: 'tag'` is the tag-shaped
   * path. Kept because organization blocks already hold documents carrying it
   * and the schema is strict: dropping the field would refuse a shop's own
   * saved work. `ground` wins where both are present.
   */
  frame?: 'tag' | 'plain' | undefined
  /**
   * `none` hides the tier tab. The chip element is the other place it shows.
   *
   * Superseded by `recipe.tier.place`, and still read: `none` is
   * `place: 'hidden'`. Same compatibility bargain as `frame` above, for the same
   * reason — organization blocks already carry it and the schema is strict.
   */
  tab?: 'attached' | 'none' | undefined
  /**
   * The interior arrangement, by name. Absent means `classic-tag`, which is what
   * every mark drew before this field existed.
   */
  preset?: PriceMarkPreset | undefined
  /**
   * Bounded refinements on top of the preset, field by field.
   *
   * **A partial, deliberately.** An owner who moved the was-price has not
   * thereby chosen a currency placement, and a preset that stopped applying the
   * moment one knob was touched would make every adjustment a full re-authoring.
   * Same rule the text element already follows for `size`, `weight` and
   * `family`.
   */
  recipe?: PriceMarkRecipe | undefined
}

/** Mirrors `ChipAnchor` in `index.ts`; restated so this module stands alone. */
export type ChipAnchorRef = 'TOP_START' | 'TOP_END' | 'INLINE'

/**
 * One layout of a block, valid over a range of container aspects.
 *
 * Regions merge, so a region can be 1:2, 1:1, 2:1 or a wide band, and a block
 * must fit *that*. Fit cannot mean stretch — a stretched card is a distorted
 * card — so it means reflow, and the engine picks the arrangement whose range
 * contains the region's aspect.
 *
 * Repeating blocks need several. Static blocks mostly need one with an open
 * range: a brand ad is designed at one aspect and crops into anything close.
 */
export interface Arrangement {
  /** Inclusive bounds on width ÷ height. */
  aspectMin: number
  aspectMax: number
  elements: BlockElement[]
}

/**
 * A designed building block.
 *
 * `repeats` is the one distinction that matters: a repeating block is rendered
 * once per offer, a static block is placed once. Same schema, same designer,
 * same library.
 */
export interface Block {
  id: string
  /** Null for seeded blocks. Set for owner-authored ones. */
  organizationId: string | null
  name: string
  repeats: boolean
  /** Ordered; the first whose range contains the aspect wins. Never empty. */
  arrangements: Arrangement[]
  thumbnailUrl: string | null
}

// ─── Page grid ────────────────────────────────────────────────────────────────

/**
 * Whether a region draws from the product list or holds fixed content.
 *
 * A `flow` region binds to a *position* in the list, not to a product. Swapping
 * week 32's offers for week 33's therefore re-fills the same layout with no
 * work — merges, footers and heroes all survive. That is the mechanism behind
 * the whole weekly-reissue promise, and what E6 §1 was protecting.
 */
export type RegionFill = 'flow' | 'static'

/**
 * A rectangular span of cells holding one block.
 *
 * Coordinates are logical and inclusive: `colStart` is the reading-order start,
 * not the left edge, so an AR edition mirrors the whole grid — merges included —
 * with no second layout to author.
 */
export interface Region {
  id: string
  colStart: number
  colEnd: number
  rowStart: number
  rowEnd: number
  blockId: string
  fill: RegionFill
  /**
   * How much of its own span the region actually fills, across. Absent is all
   * of it, which is what every region was before this existed.
   *
   * **A fraction rather than a column count, because a band is not on the
   * column grid.** A header spans every column by construction, so narrowing it
   * by columns gives thirds on a three-across page and nothing at all on a
   * one-across post — and a masthead that is 70% of the page is an ordinary
   * design. The rect is narrowed after the tracks are resolved and the region
   * stays centred in its span, so nothing about the grid, the merges or the
   * pins has to know.
   *
   * **It is geometry, not overlap.** `spansIntersect` compares integer spans
   * and does not read this: a narrowed header still *occupies* its whole row, so
   * a pin on that row still collides with it and a product cannot creep into the
   * space beside it. Anything else would be a layout where two blocks share a
   * track and only the renderer knows.
   */
  width?: number
}

/**
 * A page as a spreadsheet: tracks, merged regions, one block per region.
 *
 * Track sizes are `fr` units, draggable exactly like column widths. Density is
 * not a field — it is the consequence of track count at a given page size, and
 * two controls that can disagree is one too many.
 */
/**
 * What sits behind every card on a page: the paper itself.
 *
 * **The page ground was a constant until this existed.** Every renderer painted
 * `var(--sq-tpl-paper)` — white, always — and a `PageGrid` had no way to say
 * otherwise. A shop whose brand is a deep navy could put navy on every *card*
 * and still print them on white paper with white gutters between them, which is
 * a different design from the one they were making.
 *
 * **It reuses `ColorValue` rather than inventing a second colour type**, so a
 * page ground is flat or a gradient by exactly the machinery a shape fill
 * already uses: the same three sources, the same palette binding that follows
 * the shop when they re-pick a colour, the same `resolvePaint` and the same
 * `<linearGradient>` emitted by the same painter. Only `from: 'asset'` is new
 * here, and it is new because a *page* is the one surface large enough for a
 * photograph to be a background rather than a picture of something.
 *
 * **Absent means paper**, and that is not the same as white. A renderer without
 * a background falls back to `--sq-tpl-paper`, which is the token, which is what
 * the product has always drawn. Adding this took nothing away.
 *
 * **It belongs to the grid, not to the book.** A `page_grids` row is already
 * per-role — `master`, `cover`, `back` — so a cover that wants a photograph and
 * body pages that want a tint is expressible the day covers are authored,
 * without a second field or a per-page table. One master means one background
 * on every body page, which is what "the background of my offer book" means.
 */
export type PageBackground =
  | ColorValue
  | {
      from: 'asset'
      /** The R2 object key, as `ImageSource` means it. */
      assetId: string
      /**
       * `cover` crops to fill the page and `contain` letterboxes it. A
       * background photograph is `cover`; the other is here for a pattern tile
       * or a bordered texture an owner wants whole.
       */
      fit?: 'cover' | 'contain' | undefined
      /**
       * 0 to 1, opaque when omitted.
       *
       * **The one control that keeps a page readable**, and the reason it is on
       * the background rather than left to the owner's image editor. Two of the
       * seeded offer cards have no ground element at all — they are designs, not
       * fallbacks — so their product text sits straight on whatever is behind
       * them. A photograph at full strength under those is an unreadable flyer,
       * and the fix a designer reaches for is to knock the image back.
       */
      opacity?: number | undefined
      /**
       * Where a blurred background came from — **authoring provenance, never
       * paint.**
       *
       * `assetId` above always names the picture as it is drawn, blurred or
       * not, so no renderer learns what a blur is and nothing reaches the
       * export path as a filter. That is the whole design: E14 §2.4 measured
       * `feGaussianBlur` rasterising its own element at a resolution Chromium
       * picks — about 220dpi, under the 300dpi target and not reachable from
       * anything in the document — so blur is banned as paint and produced as
       * pixels instead.
       *
       * This exists because the *editor* still has to answer two questions a
       * flattened image cannot: what the slider should read when the page is
       * reopened, and what to blur from when it moves. Re-blurring an already
       * blurred picture compounds, so `from` keeps the original.
       *
       * Absent means the picture is the original and the slider is at zero.
       */
      blur?:
        | {
            /** The unblurred original's R2 key. Same org prefix as `assetId`. */
            from: string
            /**
             * Blur radius as a fraction of the image's **shorter edge**, so it
             * survives being scaled to whatever page it covers — the same
             * reasoning that makes `gap` and `margin` fractions of the page.
             */
            radius: number
          }
        | undefined
    }

export interface PageGrid {
  /** Column track sizes in fr, in reading order. */
  cols: number[]
  /** Row track sizes in fr, top to bottom. Rows never mirror. */
  rows: number[]
  /** Gap between tracks, as a fraction of the shorter page edge. */
  gap: number
  /**
   * Inset from the page edge on all four sides, as a fraction of the shorter
   * page edge. Omitted means zero — correct for a full-bleed social post, wrong
   * for anything that gets trimmed: a card running to the edge of an A4 sheet
   * loses a few millimetres to the guillotine.
   */
  margin?: number | undefined
  /** The paper. Absent means `--sq-tpl-paper`, which is what every book drew
   *  before this field existed. */
  background?: PageBackground | undefined
  regions: Region[]
}

/** Which page a grid is. Only `master` repeats. */
export type PageGridRole = 'master' | 'cover' | 'back'

// ─── Pins ─────────────────────────────────────────────────────────────────────

/**
 * A static block parked at a position in the flow. Products route around it.
 *
 *   booklet   pin a brand ad at page 2, cells 5–6  → 2 products displaced
 *   carousel  pin a message at post 5              → 1 product displaced
 *
 * In a 1×1 carousel grid a whole-post pin *is* a cell pin. Same mechanic, no
 * special case for social.
 *
 * A pin targets a position, not a card — which is the point. A replacement
 * targets a card, and next week that card holds a different product, so the
 * edit is meaningless or lost. A pin survives the reflow: fifteen more products
 * next week and the brand ad is still on page 2 in the same two cells.
 *
 * Displacement grows the book. It never consumes the product that would have
 * sat there — silently dropping a product from an offer book is the class of
 * bug that reaches print.
 */
export interface Pin {
  id: string
  /** Zero-based page this pin sits on. Absolute; category anchoring is v2. */
  pageIndex: number
  blockId: string
  /** Logical, inclusive — same convention as `Region`. */
  colStart: number
  colEnd: number
  rowStart: number
  rowEnd: number
}
