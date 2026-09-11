/**
 * The page margin, as something an owner can choose.
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
 * The step a stored margin belongs to.
 *
 * **Nearest rather than exact.** A book created before these steps existed, or
 * by a caller passing its own number, still has to render the select with
 * something selected — and a select whose value matches no option silently shows
 * its first entry, which would tell the owner their margin is None when it is
 * not.
 */
export function nearestMarginStep(margin: number): MarginStep {
  return MARGIN_STEPS.reduce((best, step) =>
    Math.abs(step.value - margin) < Math.abs(best.value - margin) ? step : best
  )
}
