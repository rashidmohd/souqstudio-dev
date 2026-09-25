import 'server-only'

import type { Prisma } from '@souqstudio/db'
import type { MagicCategory } from '@souqstudio/engine'

/**
 * SouqStudio's library drafts: the blocks the admin designer writes.
 *
 * **A draft is a `blocks` row with no organization and status `draft`.** No
 * organization is what makes a block SouqStudio's; `draft` is what keeps it
 * away from every shop until it is published. Three readers depend on that
 * status and each says so: the shop picker lists only published platform rows,
 * `loadBlock` in `apps/web` refuses a platform draft, and the library sync never
 * prunes one.
 *
 * **Publishing does not change the draft.** `apps/web`'s publish route copies
 * the document into the library under a permanent `blk_` id, and the sync
 * writes that as its own published row. The draft stays the working copy, so
 * the next version of the same block is an edit and a publish to the same id.
 */
export const DRAFT_WHERE = {
  organizationId: null,
  status: 'draft',
} as const satisfies Prisma.BlockWhereInput

/**
 * The kinds a draft can start as, with nothing drawn yet. The same list the
 * shop app's "new block" offers. `seasonal` is absent for the reason
 * `MagicCategory` gives: a seasonal block is a design plus an occasion, so it
 * starts from an existing seasonal block instead.
 */
export const STARTER_KINDS = [
  'offer-card',
  'header',
  'panel',
  'footer',
  'social-post',
] as const satisfies readonly MagicCategory[]

export const STARTER_LABELS: Readonly<Record<(typeof STARTER_KINDS)[number], string>> = {
  'offer-card': 'Offer card',
  header: 'Header',
  panel: 'Panel',
  footer: 'Footer',
  'social-post': 'Square post',
}

// Shared with apps/web, which hides library artwork from shops until a
// published block uses it. See `packages/designer/lib/block-assets.ts`.
export { LIBRARY_ASSET_PREFIX } from '@souqstudio/designer/lib/block-assets'
