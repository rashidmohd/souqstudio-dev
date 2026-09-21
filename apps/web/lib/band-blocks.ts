import type { BlockCategory } from '@souqstudio/engine'

/**
 * Which blocks can run along the top or the bottom of every page.
 *
 * **One rule, in one place, because it was in two.** The editor page filtered
 * the shop's blocks on the server to build the two dropdowns, and the picker
 * dialog had no idea bands existed — so when the bands became a library browse
 * like every other block choice, the filter had to be somewhere both could
 * reach. Two copies of "what counts as a footer" is two answers the week
 * somebody adds a category.
 *
 * **`repeats` is what actually decides eligibility.** A repeating card is
 * written to read an offer; put in a band, which is handed none, it draws an
 * empty card across every page of the book. The category is the *helpful* half
 * and the `repeats` test is the correct one.
 *
 * **A block the shop authored has no category, and is offered as both.** That is
 * a fact about the library we shipped rather than about their row: we tag ours,
 * nothing tags theirs, and refusing a shop's own strip as a footer because we
 * never labelled it would be our taxonomy standing in their way.
 */
export type Band = 'header' | 'footer'

type Candidate = { repeats: boolean; category: BlockCategory | null }

export function isBandBlock(block: Candidate, band: Band): boolean {
  return !block.repeats && (block.category === band || block.category === null)
}

/** The same test over a list, which is what every caller actually wants. */
export function bandBlocks<T extends Candidate>(blocks: readonly T[], band: Band): T[] {
  return blocks.filter((block) => isBandBlock(block, band))
}
