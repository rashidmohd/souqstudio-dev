import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Arrangement } from '@souqstudio/types'
import { SEED_BLOCKS } from '@souqstudio/engine'
import { toArrangements } from '@/lib/block-document'

/**
 * The block library, read. E7.
 *
 * **Two collections, one schema** — `docs/composition-model.md` §3.6. A block
 * with a null `organizationId` is one SouqStudio seeded and every shop has; a
 * block with one is the shop's own, authored in the designer. Nothing else
 * distinguishes them, which is what lets the designer edit either shape and the
 * engine compose both without knowing where a block came from.
 *
 * Seeded blocks are **read-only to a shop**. An owner who wants to change one
 * duplicates it — the copy is theirs, the original stays the thing every other
 * account is still using, and the seed can be corrected later without walking
 * over somebody's edit.
 */

export interface BlockSummary {
  id: string
  name: string
  description: string | null
  repeats: boolean
  arrangements: Arrangement[]
  /** Null means seeded: SouqStudio's, shared by every account. */
  organizationId: string | null
  status: string
  updatedAt: Date
  /**
   * Whether this shop's plan reaches it. A locked block is still listed — with
   * a padlock and the plan that opens it — because a library that hides what an
   * upgrade would buy is a library that never sells one. E7-01.
   */
  locked: boolean
  planTier: string
}

/** Plan ids are the tier names, so a gate is an index comparison. See seed.ts. */
const PLAN_ORDER = ['starter', 'pro', 'business', 'enterprise'] as const

export function planReaches(planId: string | null, required: string): boolean {
  const have = PLAN_ORDER.indexOf((planId ?? 'starter') as (typeof PLAN_ORDER)[number])
  const need = PLAN_ORDER.indexOf(required as (typeof PLAN_ORDER)[number])
  // An unrecognised requirement opens rather than locks: a block nobody can
  // reach because of a typo in a seed is worse than one everybody can.
  if (need < 0) return true
  return have >= need
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  repeats: true,
  arrangements: true,
  organizationId: true,
  status: true,
  planTier: true,
  updatedAt: true,
} as const

type Row = {
  id: string
  name: string
  description: string | null
  repeats: boolean
  arrangements: unknown
  organizationId: string | null
  status: string
  planTier: string
  updatedAt: Date
}

/**
 * A row in the shape the designer and the previews want.
 *
 * **A document that does not parse is dropped, not repaired.** The only writers
 * are the seed and this epic's PATCH, both of which validate first, so a row
 * that fails here is corrupt — and a half-parsed block would render a card with
 * elements silently missing, which is exactly the failure that reaches print.
 */
function toSummary(row: Row, planId: string | null): BlockSummary | null {
  const arrangements = toArrangements(row.arrangements)
  if (arrangements === null) return null

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    repeats: row.repeats,
    arrangements,
    organizationId: row.organizationId,
    status: row.status,
    planTier: row.planTier,
    updatedAt: row.updatedAt,
    // A shop's own block is never locked. They authored it; a plan change must
    // not take away work they did.
    locked: row.organizationId === null && !planReaches(planId, row.planTier),
  }
}

/**
 * Every block this organization can compose with: the published seeded library
 * plus its own, drafts included.
 *
 * One query rather than two, because the union is what the screen shows and two
 * round trips to render one list is two chances for them to disagree about
 * ordering. Their own blocks sort first — the library is a place an owner comes
 * back to their own work, not a catalog they browse.
 */
export async function listBlocks(organizationId: string, planId: string | null) {
  const rows = await prisma.block.findMany({
    where: {
      OR: [
        { organizationId: null, status: 'published' },
        { organizationId },
      ],
    },
    select: SELECT,
    orderBy: [{ organizationId: 'desc' }, { name: 'asc' }],
  })

  return rows
    .map((row) => toSummary(row, planId))
    .filter((block): block is BlockSummary => block !== null)
}

/**
 * One block, if this organization may see it.
 *
 * A seeded block and a block belonging to another organization are the same
 * answer — null — on purpose. A different message for the second confirms the
 * id exists, which is a tenancy leak of exactly one bit.
 */
export async function loadBlock(id: string, organizationId: string, planId: string | null) {
  const row = await prisma.block.findFirst({
    where: {
      id,
      OR: [{ organizationId: null }, { organizationId }],
    },
    select: SELECT,
  })

  return row === null ? null : toSummary(row, planId)
}

/**
 * What a new block starts from.
 *
 * **Always seed** — §3.6. A blank artboard produces something worse than the
 * default and the owner blames the product, so "new block" is "a copy of one
 * that works", and the starter list is the seeded library itself rather than a
 * second set of shapes that would have to be maintained beside it.
 */
export function starterFor(id: string) {
  return SEED_BLOCKS.find((block) => block.id === id) ?? null
}

export const STARTERS = SEED_BLOCKS.map((block) => ({
  id: block.id,
  name: block.name,
  description: block.description,
  repeats: block.repeats,
}))

/**
 * A name for a copy that does not collide with one already in the library.
 *
 * "Offer card copy", then "Offer card copy 2". Silently reusing the name is how
 * an owner ends up with four rows they cannot tell apart, and refusing the
 * duplicate is a dialog in the way of the most common action in the screen.
 */
export function copyName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing)
  const first = `${base} copy`
  if (!taken.has(first)) return first

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${first} ${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${first} ${Date.now()}`
}

/**
 * Whether any of this organization's page grids or pins still name this block.
 *
 * **A JSON scan, and it is the right shape rather than a compromise.**
 * `page_grids.regions` names its block by id *inside* the document precisely
 * because Prisma cannot enforce a key through JSON (see the schema comment), so
 * there is no foreign key to ask and no cascade to rely on. Deleting a block a
 * live book draws would leave that book unrenderable, which is worse than a
 * scan over the handful of grids an organization has.
 */
export async function blockIsInUse(blockId: string, organizationId: string): Promise<boolean> {
  const [pins, grids] = await Promise.all([
    prisma.bookPin.count({
      where: { blockId, book: { shop: { organizationId } } },
    }),
    prisma.pageGrid.findMany({
      where: { book: { shop: { organizationId } } },
      select: { regions: true },
    }),
  ])

  if (pins > 0) return true

  return grids.some((grid) => {
    const regions = grid.regions
    if (!Array.isArray(regions)) return false
    return regions.some(
      (region) =>
        typeof region === 'object' &&
        region !== null &&
        'blockId' in region &&
        (region as { blockId?: unknown }).blockId === blockId
    )
  })
}
