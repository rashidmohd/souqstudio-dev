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

/** A brand-kit colour role. Resolved against the shop's kit at render time. */
export type TokenRef = 'primary' | 'secondary' | 'accent' | 'surface' | 'ink' | 'inkMuted'

/** A brand-kit type role. Maps to `fontDisplay` / `fontPrice` / `fontBody`. */
export type TypeRole = 'display' | 'price' | 'body' | 'caption'

/** Logical, so an AR edition mirrors without a second layout. */
export type LogicalAlign = 'start' | 'center' | 'end'

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
 * `priceMark` is placed and sized, never opened. Raised minor digits, the tier
 * tab, the three-decimal KWD/OMR/BHD branch and LTR-in-Arabic are all internal —
 * E6 §3. The owner's one control is the tier, which lives on the offer.
 */
export type BlockElement =
  | { kind: 'image'; box: Box; source: ImageSource }
  | { kind: 'text'; box: Box; source: TextSource; style: TypeRole; align: LogicalAlign }
  | { kind: 'priceMark'; box: Box }
  | { kind: 'chip'; box: Box; anchor: ChipAnchorRef }
  | { kind: 'logo'; box: Box }
  | { kind: 'shape'; box: Box; surface: TokenRef; radius: number }

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
