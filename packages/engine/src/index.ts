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
export { pickArrangement } from './arrangement'
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
  CAP_RATIO,
  MAX_ROTATION,
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
  needsEvenOdd,
  shapePath,
  type ChipShape,
  type PathShape,
} from './shapes'
// When a seasonal block is in season — computed rather than stored, because
// Ramadan and both Eids move against the Gregorian calendar. E7-03.
export {
  BLOCK_OCCASION,
  blockWindow,
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
  pageCountFor,
  type FlowInput,
  type FlowResult,
  type FlowPage,
  type Placement,
} from './flow'

export {
  BLOCK_CATEGORIES,
  SEED_BLOCKS,
  bookletGrid,
  type BlockCategory,
  type SeedBlock,
} from './library'
