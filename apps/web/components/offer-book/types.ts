import type { Arrangement } from '@souqstudio/types'

/**
 * A block as the creation flow's design step needs it.
 *
 * **A narrowing of `BlockSummary`, not a second shape.** `lib/blocks.ts` is
 * `server-only`, so a client component cannot import the type from where it is
 * produced; the page reads the summaries on the server and passes this subset
 * across. Everything here is already on a `BlockSummary` under the same name.
 *
 * `arrangements` has to travel because `BlockPreview` draws the design rather
 * than an image of it — there is one painter in this product and a thumbnail
 * would be a second thing that could disagree with the page.
 */
export type PickableBlock = {
  id: string
  name: string
  arrangements: Arrangement[]
  /** Null means seeded: ours, and the same for every account. */
  organizationId: string | null
  /** Behind a higher plan. Shown, never selectable. */
  locked: boolean
  planTier: string
}
