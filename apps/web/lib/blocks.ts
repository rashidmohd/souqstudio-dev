import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Arrangement } from '@souqstudio/types'
import { BLOCK_CATEGORIES, type BlockCategory } from '@souqstudio/engine'
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
  /**
   * Which group of the shipped library this is, or null for a block the shop
   * authored.
   *
   * **Attached here, on the server, rather than looked up in the picker.**
   * `BlockImportDialog` needs an id → category map to filter by, and it used to
   * get one by importing `SEED_BLOCKS` — a `'use client'` module importing the
   * whole library, which put every element of every seeded block into the
   * browser bundle to answer a question about five strings. The category is a
   * property of the design we shipped, this is the module that knows the
   * shipped designs, and a summary is already crossing the boundary.
   *
   * Still not a column on `blocks`: it is a fact about the library, not about
   * the row, and a column would be one only the seed ever writes.
   */
  category: BlockCategory | null
  isSeasonal: boolean
  /** Which occasion, for a block whose window is computed. */
  occasion: string | null
  /** A window the owner set by hand. Null on everything seeded. */
  activeFrom: Date | null
  activeTo: Date | null
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

/**
 * The category as the picker will read it.
 *
 * A block with an organization is theirs and has none: the picker never lists
 * those, and a default would be a claim about a design we did not draw.
 */
function toCategory(value: string | null, organizationId: string | null): BlockCategory | null {
  if (organizationId !== null) return null
  return CATEGORIES.has(value as BlockCategory) ? (value as BlockCategory) : 'panel'
}

const CATEGORIES = new Set<BlockCategory>(BLOCK_CATEGORIES)

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
  // Carried so an import can copy them, and so the composer can promote a
  // seasonal block in the week it matters. See `packages/engine/src/seasonal.ts`.
  isSeasonal: true,
  occasion: true,
  activeFrom: true,
  activeTo: true,
  arrangements: true,
  organizationId: true,
  status: true,
  planTier: true,
  category: true,
  updatedAt: true,
} as const

type Row = {
  id: string
  name: string
  description: string | null
  repeats: boolean
  isSeasonal: boolean
  occasion: string | null
  activeFrom: Date | null
  activeTo: Date | null
  arrangements: unknown
  organizationId: string | null
  status: string
  planTier: string
  category: string | null
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
    isSeasonal: row.isSeasonal,
    occasion: row.occasion,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
    description: row.description,
    repeats: row.repeats,
    arrangements,
    organizationId: row.organizationId,
    // Read off the row rather than looked up in the library — see the field's
    // note above. A seeded row written before the column existed and not yet
    // re-seeded falls back to `panel`, which is what the old lookup did for an
    // unrecognised id; the next deploy corrects it.
    category: toCategory(row.category, row.organizationId),
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
 * What a new block starts from — and it is **`loadBlock`**, for everything.
 *
 * **Always seed** — §3.6. A blank artboard produces something worse than the
 * default and the owner blames the product, so "new block" is "a copy of one
 * that works".
 *
 * There used to be a second reader here, `starterFor`, which found a seeded
 * block in `SEED_BLOCKS` so that a copy was of "the library that was checked"
 * rather than of a row. Two things retired it.
 *
 * **It cannot survive the library becoming a loaded document.** A loader is
 * async by construction — `library-source.ts` — and `starterFor` was called
 * synchronously from a route. Reading the row is the version of "the library
 * that was checked" that still works when the library is a file, or a bucket:
 * `pnpm db:seed` runs on every deploy from Railway's `preDeployCommand`, so the
 * seeded row *is* what the deploy shipped.
 *
 * **And it took the plan gate with it.** A `SeedBlock` has no `locked` field,
 * so `'locked' in source` — the guard in `POST /api/v1/blocks` — was false for
 * every seeded block, which is the only kind of block the gate exists to gate.
 * Nothing was reachable today because every seeded row takes the `planTier`
 * default of `starter`; marking one block `pro` would have shown a padlock in
 * the picker and imported it anyway. One path through `loadBlock` makes the
 * gate structural rather than a branch that has to be remembered.
 */

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
 * How many blocks one import may carry.
 *
 * **Set above the whole seeded library on purpose.** It is a bound on what one
 * request may ask the server to do, not a rule an owner should ever meet — if
 * somebody selects every block there is, that is a strange thing to want and not
 * a thing to refuse. Keeping it out of reach is also what lets the dialog stay
 * ignorant of it: no cap to explain, no counter to police, and `lib/blocks.ts`
 * is `server-only`, so a client could not read the number anyway.
 */
export const MAX_IMPORT = 100

/**
 * The name an **imported** block keeps.
 *
 * Not `copyName`, and the difference matters on the screen. Duplicating a block
 * you already have produces a second one beside the first, so "Ramadan band
 * copy" is exactly right — it says which is which. Importing one from the
 * library is not a copy of anything the shop can see: it is *getting* the
 * Ramadan band, and calling it "Ramadan band copy" describes a relationship to
 * something the owner has never had.
 *
 * It falls back to `copyName` only on a collision, which is the case where the
 * owner really does have two.
 */
export function importName(base: string, existing: readonly string[]): string {
  return existing.includes(base) ? copyName(base, existing) : base
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
