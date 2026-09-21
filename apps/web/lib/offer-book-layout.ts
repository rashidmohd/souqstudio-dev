/**
 * The two page measurements an owner can choose: the margin around the page and
 * the gap between the cards on it.
 *
 * **A margin is a fraction of the page's shorter edge**, which is how
 * `flowBook` reads it — `(master.margin ?? 0) * shorterEdge` — and that is what
 * makes one number work on a 1080 square and on A3. It is also not a number any
 * shop owner has an opinion about. Nobody wants 0.043.
 *
 * So the control is five named steps and the fraction stays an implementation
 * detail. Named steps also make the two ends sayable: "None" is full bleed,
 * which is a real thing to want on a social post and reads as a bug if it is
 * only ever "0".
 *
 * **No `server-only`.** The panel needs the labels and the route needs the
 * bound, which is the same argument `book-kind.ts` makes.
 */

export interface MarginStep {
  value: number
  label: string
}

/**
 * The five, and the two defaults sit on steps rather than between them: a
 * booklet is 0.04 and a post is 0.05, so both are exactly "Standard" and
 * "Wide" and neither shows up as an odd value the owner never chose.
 */
export const MARGIN_STEPS: readonly MarginStep[] = [
  { value: 0, label: 'None, edge to edge' },
  { value: 0.02, label: 'Narrow' },
  { value: 0.04, label: 'Standard' },
  { value: 0.05, label: 'Wide' },
  { value: 0.08, label: 'Extra wide' },
]

/** The bound the route validates against. A margin over this leaves no page. */
export const MAX_MARGIN = 0.2

/**
 * The step a stored value belongs to.
 *
 * **Nearest rather than exact.** A book created before these steps existed, or
 * by a caller passing its own number, still has to render the select with
 * something selected — and a select whose value matches no option silently shows
 * its first entry, which would tell the owner their margin is None when it is
 * not.
 */
function nearest(steps: readonly MarginStep[], value: number): MarginStep {
  return steps.reduce((best, step) =>
    Math.abs(step.value - value) < Math.abs(best.value - value) ? step : best
  )
}

export function nearestMarginStep(margin: number): MarginStep {
  return nearest(MARGIN_STEPS, margin)
}

/**
 * The gap between cards, in the same units and for the same reason.
 *
 * **It is a fraction of the shorter edge exactly as the margin is**, because
 * `resolveTracks` is handed `gap * shorterEdge` the same way the inset is, and
 * a gutter that did not scale with the page would be a hairline on A3 and a
 * chasm on a story.
 *
 * **This is the control the page background was waiting for.** Until it existed
 * the gap was whatever preset made the book — `0.022` for a booklet, `0.028`
 * for a post — and neither the owner nor anything else could change it. A shop
 * that set its paper to a deep navy therefore got navy in a hairline between
 * cards and nowhere else, which is not the design they were making. Widening
 * the gutter is what makes a page ground visible at all.
 */
export type GapStep = MarginStep

/**
 * Six, and **both engine defaults are on the list** rather than near it — same
 * rule the margin steps follow. `bookletGrid` writes `0.022` and `postGrid`
 * writes `0.028`, so a book that has never had its gap touched shows the step
 * it is actually on instead of the nearest one. The two sit close together
 * because they *are* close together; the alternative is a select that reads
 * "Standard" over a book which is not.
 */
export const GAP_STEPS: readonly GapStep[] = [
  { value: 0, label: 'None, cards touch' },
  { value: 0.012, label: 'Tight' },
  { value: 0.022, label: 'Standard' },
  { value: 0.028, label: 'Roomy' },
  { value: 0.04, label: 'Wide' },
  { value: 0.05, label: 'Extra wide' },
]

/**
 * The bound the route validates against, and it is **not** a round number
 * picked for looking like one.
 *
 * `resolveTracks` throws rather than clamping when the gaps do not fit —
 * "10 tracks with a gap of x do not fit in y" — and a throw here is a book that
 * will not render at all. The worst page this product can be asked for is eight
 * rows of cards between two bands, ten tracks and nine gaps, on a page whose
 * height *is* its shorter edge (a square post, or anything landscape), inset by
 * `MAX_MARGIN` top and bottom:
 *
 *     1 − 2(0.2) − 9(0.06) = 0.06
 *
 * Still positive, so the extreme renders. At `0.07` it does not.
 */
export const MAX_GAP = 0.06

/** The step a stored gap belongs to. Nearest, for the reason `nearest` gives. */
export function nearestGapStep(gap: number): GapStep {
  return nearest(GAP_STEPS, gap)
}

/**
 * How tall a header or footer band is, as a fraction of one body row, and how
 * much of the page's width it fills.
 *
 * **A fraction of a row rather than of the page**, which is what keeps a band
 * looking like a band at every page size: a footer pinned to the page grows into
 * a stripe on A3, while one that scales with the cards above it stays a footer.
 * That was the reasoning behind the constant these replace, and it is why the
 * control is in these units rather than in millimetres — a shop owner has no
 * opinion about 0.34, but they can see a band get taller.
 *
 * **Here rather than imported from the engine**, for the reason
 * `offer-book-grid.ts` sets out at length: every value in `library.ts` drags the
 * sixty-five seeded blocks into whatever bundle imports it, and this file is
 * read by a client component. The engine clamps to its own slightly wider range
 * for data that reached it by another route; these are the bounds the slider
 * offers and the API validates, which is a different question from what the
 * renderer will tolerate.
 */
export const MIN_BAND_HEIGHT = 0.1
export const MAX_BAND_HEIGHT = 2
export const MIN_BAND_WIDTH = 0.2

/** What a band is when nothing has said otherwise. `composeGrid`'s own default,
 *  repeated here so a slider with no stored value starts where the book is. */
export const DEFAULT_BAND_HEIGHT = 0.34
