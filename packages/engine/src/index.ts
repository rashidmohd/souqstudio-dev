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
export { validateGrid, type GridProblem, type GridProblemCode } from './validate'
export {
  flowBook,
  pageCountFor,
  type FlowInput,
  type FlowResult,
  type FlowPage,
  type Placement,
} from './flow'
