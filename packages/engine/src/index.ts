// The layout engine. See `docs/composition-model.md`.
//
// Runs unchanged in the browser for the editor and in the worker for export.
// One implementation, always — two would drift, and drift here means the PDF
// does not match the screen.

export { resolveTracks, type Track } from './tracks'
export {
  spanRect,
  spansIntersect,
  spanArea,
  aspectOf,
  type Rect,
  type CellSpan,
  type Direction,
} from './geometry'
export { arrangementCovers, pickArrangement } from './arrangement'
export {
  fitText,
  fitStyle,
  fitPolicy,
  wrapText,
  MIN_LINE_HEIGHT,
  type FitRequest,
  type FitResult,
  type TextMeasurer,
} from './fit'
export {
  layoutPriceMark,
  toPriceMark,
  splitAmount,
  minorDigits,
  // How wide a currency string is, by script. Exported so a renderer holding
  // real font metrics can compare against it before deciding to override.
  currencyAdvance,
  PREFIX_TEXT,
  CAP_RATIO,
  MAX_ROTATION,
  // The interior arrangement. `markRecipe` is what a renderer calls; the record
  // is what the designer's gallery draws from, so the thumbnails are laid out by
  // the same function that lays out the card.
  markRecipe,
  PRICE_MARK_RECIPES,
  type ResolvedRecipe,
  // One part's resolved placement. The designer's panel renders three of these
  // from one component, which needs the shape the solver settled on rather than
  // the partial a document carries.
  type ResolvedSatellite,
  type PriceMarkLayout,
  type PriceMarkOptions,
  type MarkPiece,
} from './price-mark'
// Reclaiming the space a card's content did not use. Real catalog rows are
// mostly sparse; the boxes are designed for the worst case. See the file.
export {
  compactBlock,
  type CompactionPolicy,
  type Occupancy,
} from './compact'
// Which way a *string* reorders, which is not which way the page lays out.
// Every renderer needs it; see the file for what happens when one does not.
export { placeText, textDirection, type TextPlacement } from './direction'
export {
  resolveColor,
  resolvePaint,
  gradientVector,
  flatten,
  roleColor,
  type Paint,
} from './color'
export { resolveBlock, type ResolvedBlock, type ResolvedElement } from './render'
// The one place an owner may disagree with the engine, and it is bounded by
// construction — E6 §1. See the file.
export {
  applyOverride,
  clampOverride,
  findOverride,
  isEmptyOverride,
} from './override'
export { validateGrid, type GridProblem, type GridProblemCode } from './validate'
// The shapes an offer card is made of. Paths, computed here so the screen and
// the export cannot draw a different burst. See the file.
export {
  CHIP_FIT,
  CHIP_SHAPES,
  HOLDS_PROPORTION,
  PATH_SHAPES,
  chipPathShape,
  drawsGround,
  needsEvenOdd,
  shapePath,
  type ChipShape,
  type PathShape,
} from './shapes'
// `logo` stops being an element kind — it is a picture, and making it a kind of
// its own meant every image property had to be added to it separately. The
// converter runs over the seeded generators and over stored documents alike,
// because one that ran differently over the two would render two ways. E14 §3.1.
export { countLogoElements, foldLogoElement, foldLogoElements } from './convert-logo'
// The binding vocabulary, and the one place it is resolved. Two painters each
// had their own switch and they agreed with each other and with nothing else —
// which is why `shop.phone` drew nothing for as long as it existed. E14 §3.5.
export {
  BINDING_LABEL,
  BOOK_FIELDS,
  BRAND_TEXT_FIELDS,
  IMAGE_BINDINGS,
  OFFER_FIELDS,
  PRODUCT_FIELDS,
  SHOP_FIELDS,
  TEXT_BINDINGS,
  bindingInScope,
  bindingKey,
  labelFor,
  resolveImageBinding,
  resolveTextBinding,
  type BindingSubjects,
  type BookField,
  type BrandTextField,
  type ImageSubjects,
  type OfferField,
  type ProductField,
  type ShopField,
} from './bindings'
// Soft shadows as concentric vector rings, because every filter Chromium offers
// rasterizes at a resolution nothing in the document can set. Measured, not
// reasoned about — `harness/export-check.ts` is the measurement. E14 §2.4.
export {
  SHADOW_PEAK,
  SHADOW_SPREAD,
  ringAlpha,
  ringCount,
  shadowRings,
  type Shadow,
  type ShadowRing,
} from './shadow'
// When a seasonal block is in season — computed rather than stored, because
// Ramadan and both Eids move against the Gregorian calendar. E7-03.
export {
  BLOCK_OCCASION,
  blockWindow,
  isOccasion,
  inSeason,
  occasionWindow,
  type Occasion,
  type SeasonWindow,
} from './seasonal'
// Editing a block, which is arithmetic over fractions and therefore the engine's
// rather than a component's — E7. See the file.
// Snapping and alignment — the arithmetic that turns "close enough" into "the
// same", and it is the engine's for the same reason every other rectangle is.
export {
  SNAP_RANGE,
  snapBox,
  alignBoxes,
  type Guides,
  type Alignment,
} from './snap'
export {
  MIN_ELEMENT,
  SNAP,
  snap,
  moveBox,
  resizeBox,
  addElement,
  removeElement,
  replaceElement,
  reorderElement,
  isBound,
  validateBlock,
  type Handle,
  type BlockProblem,
  type BlockProblemCode,
} from './block-edit'
export {
  flowBook,
  masterCells,
  pageCountFor,
  resolveGridTracks,
  type FlowInput,
  type FlowResult,
  type FlowPage,
  type MasterCell,
  type Placement,
  type RegionBlock,
} from './flow'
// Merging cells, which is span algebra and nothing else. Composition model §4:
// rectangular only, same as a spreadsheet. See the file.
export {
  expandSpan,
  hasMergeIn,
  mergeAt,
  mergeRegions,
  mergeSpan,
  normalizeMerges,
  unionSpan,
  unmergeSpan,
  type MergeBounds,
} from './merge'

// What a block document may contain, and the rule a *seeded* one is held to.
// Three writers meet these: `PATCH /api/v1/blocks/:id`, a committed file, and an
// object fetched from R2. See `document.ts` for why they live here and not in
// the web app. `library-source.ts` is deliberately NOT exported — it reaches a
// filesystem and a network, and nothing in a browser build may follow it there.
export {
  MAX_ARRANGEMENTS,
  MAX_ELEMENTS,
  MAX_GRADIENT_STOPS,
  arrangementsSchema,
  toArrangements,
} from './document'
export { usesOnlyRoles } from './roles'
export { markGround, type MarkGround } from './price-mark'
// The vocabulary, exported from its own module rather than through `library`.
// Re-exporting it from there would put the designs back in the graph of anyone
// importing it — which is the bundle problem it was split up to fix.
export {
  BLOCK_CATEGORIES,
  MAGIC_CATEGORIES,
  categoryRepeats,
  type BlockCategory,
  type MagicCategory,
} from './block-category'
export {
  SEED_BLOCKS,
  bookletGrid,
  composeGrid,
  postGrid,
  type ComposeGridOptions,
  type SeedBlock,
} from './library'

// Colour maths. Pure, and shared with the worker — `contrast.ts` says why it is
// here rather than in `apps/web/lib/color.ts`, which re-exports all of it.
export {
  contrastHex,
  contrastRatio,
  fromHex,
  isDarkBackground,
  isValidHex,
  readableInkOn,
  relativeLuminance,
  toHex,
  whiteTextPasses,
  WCAG_AA_LARGE,
  WCAG_AA_NORMAL,
  type Rgb,
} from './contrast'
// Brand direction — the palette and type mood a model proposes. E8-08. On the
// barrel because both the worker and the web app hold a reply to this schema.
export {
  MAX_PROPOSED,
  MIN_PROPOSED,
  TYPE_MOODS,
  TYPE_MOOD_NOTE,
  brandDirectionJsonSchema,
  brandDirectionSchema,
  directionProblems,
  isOfferable,
  type BrandDirection,
  type DirectionProblem,
  type ProposedColor,
  type TypeMood,
} from './brand-direction'
// Logo marks — a closed set of structures skinned from the shop's palette.
// E8-09. Both the worker (which assembles) and the web app (which previews and
// re-colours) hold the same vocabulary.
export {
  LOGO_STRUCTURES,
  LOGO_STRUCTURE_NOTE,
  LOGO_SYMBOLS,
  LOGO_SYMBOL_NOTE,
  MARKS_PER_RUN,
  MARK_SIZE,
  drawMark,
  logoChoiceSchema,
  logoSetJsonSchema,
  logoSetSchema,
  namesTheShop,
  skinFrom,
  type LogoChoice,
  type LogoSet,
  type LogoStructure,
  type LogoSymbol,
  type MarkSkin,
} from './logo-mark'
// Characters, poses and covers — the closed sets E8-01 to E8-04 may ask for.
// On the barrel because the worker builds prompts from them and the web app
// renders pickers from them.
export {
  CAMPAIGNS,
  CAMPAIGN_COPY,
  CHARACTER_GENDERS,
  CHARACTER_LOOKS,
  CHARACTER_LOOK_NOTE,
  CHARACTER_STYLES,
  CHARACTER_STYLE_NOTE,
  CHARACTER_VARIATIONS,
  INVENTED_PERSON_STYLES,
  MAX_GOAL,
  MAX_UNIFORM_ANGLES,
  COVER_SHAPES,
  COVER_SHAPE_NOTE,
  COVER_SHAPE_RATIO,
  COVER_STYLES,
  COVER_STYLE_COPY,
  COVER_VARIATIONS,
  POSES,
  POSE_COPY,
  POSE_VARIATIONS,
  uniformJsonSchema,
  uniformSchema,
  type Campaign,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
  type CoverShape,
  type CoverStyle,
  type Pose,
  type Uniform,
} from './character'
// What a shop is, beyond its name — E8-01's prerequisite. Both the settings
// screen and the character prompt read it.
export {
  MAX_BIO,
  MAX_STORE_PHOTOS,
  MAX_TRADES,
  MIN_BIO,
  SHOP_TRADES,
  TRADE_COPY,
  isShopProfileComplete,
  isShopTrade,
  profileGaps,
  storePhotoKeysOf,
  tradesOf,
  tradesPhrase,
  validTrades,
  type ShopProfile,
  type ShopTrade,
} from './shop-profile'
