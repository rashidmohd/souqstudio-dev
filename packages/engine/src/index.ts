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
export { resolveBlock, type ResolvedBlock, type ResolvedElement } from './render'
export { validateGrid, type GridProblem, type GridProblemCode } from './validate'
export {
  flowBook,
  pageCountFor,
  type FlowInput,
  type FlowResult,
  type FlowPage,
  type Placement,
} from './flow'

export { SEED_BLOCKS, type SeedBlock } from './library'
