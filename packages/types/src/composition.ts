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
 * **Only `shape.fill` takes one.** Text, strokes, chips and the price mark are
 * `FlatColor`, and that is a design decision rather than an unfinished edge:
 * gradient text and gradient hairlines are how a card stops being legible at
 * the size a booklet actually prints, and neither has been asked for. Widening
 * one of those fields later is a one-word change here plus whatever the
 * renderers then owe — the type is what will tell you which ones.
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

// ─── Blocks ───────────────────────────────────────────────────────────────────

/**
 * A rectangle inside a block, as fractions of block width and height — never
 * pixels. That is what lets one offer card render at 1080×1080 for a carousel
 * post and at a third of an A4 column in a booklet with no redesign.
 *
 * `start` rather than `left`: logical, so RTL mirrors for free.
 */
export interface Box {
  start: number
  top: number
  width: number
  height: number
}

export type ImageSource = { from: 'product' } | { from: 'asset'; assetId: string }

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
 * `priceMark` is one element the owner drags, places and sizes — never one they
 * open. The was-price and the offer price are inside it, together, and are not
 * two text levels to be assembled: raised minor digits, the tier tab, the
 * three-decimal KWD/OMR/BHD branch and LTR-in-Arabic are all internal. E6 §3.
 *
 * This is the one place the designer's drag-and-drop stops being free-form, and
 * it is deliberate. Owners given text boxes for a price produce hundreds of
 * inconsistent price treatments inside a month, and the price mark is the single
 * element that decides whether output reads as a real offer book. The owner's
 * one control is the tier, which lives on the offer.
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
      /** Overrides the face the level binds to. */
      family?: TypeFamily | undefined
      /** Overrides the automatic ink. */
      color?: FlatColor | undefined
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
       */
      shape?: 'pill' | 'burst' | 'ribbon' | 'tag' | undefined
    })
  | (ElementBase & { kind: 'logo' })
  | (ElementBase & {
      kind: 'shape'
      fill: ColorValue
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
        | undefined
      radius: number
      stroke?: Stroke | undefined
    })

/**
 * What an owner may change about a price mark, and it is deliberately not its
 * composition.
 *
 * E6 §3 and composition model §3.5 stand: raised minor digits, the tier tab
 * overlapping the mark, the three-decimal KWD/OMR/BHD branch and LTR-in-Arabic
 * are internal, and the digits are never separate text boxes. Owners given text
 * boxes for a price produce hundreds of inconsistent treatments inside a month,
 * and the price mark is the single element that decides whether output reads as
 * a real offer book.
 *
 * **What was over-locked was the styling.** Colour, ground, outline and whether
 * there is a tab at all are the shop's brand rather than our typography, and
 * refusing them is what made the mark feel like somebody else's component
 * sitting in the middle of their card.
 */
export interface PriceMarkStyle {
  /** The tier tab and the outline. Defaults to the tier's own colour. */
  tint?: FlatColor | undefined
  /** The digits. */
  ink?: FlatColor | undefined
  /** The ground the mark sits on. */
  surface?: FlatColor | undefined
  /** `plain` drops the ground and the outline: digits alone on the card. */
  frame?: 'tag' | 'plain' | undefined
  /** `none` hides the tier tab. The chip element is the other place it shows. */
  tab?: 'attached' | 'none' | undefined
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
}

/**
 * A page as a spreadsheet: tracks, merged regions, one block per region.
 *
 * Track sizes are `fr` units, draggable exactly like column widths. Density is
 * not a field — it is the consequence of track count at a given page size, and
 * two controls that can disagree is one too many.
 */
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
